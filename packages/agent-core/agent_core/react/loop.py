"""CLI 하네스로 도는 ReAct(생각 → 행동 → 관찰) 루프.

LLM 은 매 턴 `{"thought", "action", "args"}` JSON 하나만 낸다. 루프가 그 도구를 실행하고
관찰을 다음 프롬프트에 붙인다. LLM 이 파일을 직접 고치거나 스스로 결과를 판정하지 않는다.
무엇을 했는지는 전부 `RunTrace` 에 남는다.

하네스는 상태 없이 매번 전체 기록을 다시 보낸다. 대화 이어가기(`-c`)를 쓰지 않는 까닭은
"LLM 이 무엇을 보고 그 결정을 했는가"가 `steps/NN_prompt.txt` 하나로 재현돼야 하기 때문이다.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from ..llm.base import BaseLlmHarness
from .skill import Skill
from .tools import ToolRegistry, compact_json
from .trace import RunTrace

logger = logging.getLogger("agent_core.react")

CANCELLED = "cancelled"
FINISHED = "finished"
MAX_STEPS = "max_steps"
TIMED_OUT = "timeout"
LLM_FAILED = "llm_failed"


@dataclass
class LoopConfig:
    max_steps: int = 10
    max_seconds: float = 600.0
    max_consecutive_llm_failures: int = 3
    #: 최근 이 수만큼의 단계는 관찰 전문(observation_chars 까지)을, 그 이전은 요약만 보낸다.
    full_history_steps: int = 4
    observation_chars: int = 3500
    old_observation_chars: int = 400
    llm_timeout_seconds: int = 180
    #: 스킬 본문 + 참고 문서를 프롬프트에 싣는 최대 글자 수
    skill_chars: int = 14000


@dataclass
class StepRecord:
    step: int
    thought: str
    action: str
    args: dict[str, Any]
    ok: bool
    observation: dict[str, Any]


@dataclass
class LoopResult:
    status: str
    steps: list[StepRecord] = field(default_factory=list)
    final: Optional[dict[str, Any]] = None
    llm_calls: int = 0
    total_tokens: int = 0
    duration_seconds: float = 0.0


_PROTOCOL = """너는 CLI 에서 실행되는 ReAct 에이전트다. 매 턴 JSON 객체 하나만 출력한다.
형식: {"thought": "<관찰을 근거로 한 판단, 3문장 이내>", "action": "<도구 이름>", "args": {<도구 인자>}}

규칙:
- 도구는 아래 목록에 있는 것만, 한 턴에 하나만 부른다. 도구는 루프가 실행하고 결과(관찰)를 다음 턴에 준다.
- 판단 근거는 관찰에 찍힌 숫자뿐이다. 실행하지 않은 결과를 사실처럼 쓰지 않는다.
- 같은 인자로 같은 도구를 반복하지 않는다. 바꿨으면 무엇을 왜 바꿨는지 thought 에 쓴다.
- 일을 끝내려면 action 을 "finish" 로 한다."""


class ReActLoop:
    def __init__(
        self,
        *,
        harness: BaseLlmHarness,
        skill: Skill,
        tools: ToolRegistry,
        trace: RunTrace,
        config: LoopConfig | None = None,
    ) -> None:
        self._harness = harness
        self._skill = skill
        self._tools = tools
        self._trace = trace
        self._cfg = config or LoopConfig()

    # --- 프롬프트 ----------------------------------------------------------

    def _action_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "thought": {"type": "string"},
                "action": {"type": "string", "enum": self._tools.names},
                "args": {"type": "object"},
            },
            "required": ["thought", "action", "args"],
        }

    def _history_text(self, steps: list[StepRecord]) -> str:
        if not steps:
            return "(아직 없음)"
        cut = len(steps) - self._cfg.full_history_steps
        lines: list[str] = []
        for i, rec in enumerate(steps):
            limit = self._cfg.observation_chars if i >= cut else self._cfg.old_observation_chars
            lines += [
                f"### step {rec.step}",
                f"thought: {rec.thought}",
                f"action: {rec.action} args={compact_json(rec.args, max_chars=600)}",
                f"observation({'ok' if rec.ok else 'error'}): {compact_json(rec.observation, max_chars=limit)}",
            ]
        return "\n".join(lines)

    def _build_prompt(self, task: str, steps: list[StepRecord], step: int, remaining_s: float) -> str:
        return "\n\n".join(
            [
                _PROTOCOL,
                self._skill.as_prompt(max_chars=self._cfg.skill_chars),
                "# 도구\n" + self._tools.describe(),
                "# 과제\n" + task,
                "# 지금까지의 기록 (오래된 것부터)\n" + self._history_text(steps),
                f"# 이번 턴\nstep {step} / 최대 {self._cfg.max_steps}, 남은 시간 약 {int(remaining_s)}초. JSON 하나만 출력.",
            ]
        )

    # --- 실행 --------------------------------------------------------------

    def run(
        self,
        task: str,
        *,
        cancel_event: Any = None,
        on_step: Optional[Callable[[dict[str, Any]], None]] = None,
    ) -> LoopResult:
        cfg = self._cfg
        trace = self._trace
        t0 = time.monotonic()
        result = LoopResult(status=MAX_STEPS)
        llm_failures = 0
        step = 1

        trace.event(
            "loop_start",
            harness=self._harness.name,
            model=self._harness.model,
            skill=self._skill.name,
            tools=self._tools.names,
            config=cfg.__dict__,
        )
        logger.info("[react] loop start harness=%s model=%s tools=%s", self._harness.name, self._harness.model, self._tools.names)

        while step <= cfg.max_steps:
            if cancel_event is not None and cancel_event.is_set():
                result.status = CANCELLED
                break
            remaining = cfg.max_seconds - (time.monotonic() - t0)
            if remaining <= 0:
                result.status = TIMED_OUT
                break
            trace.set_step(step)

            prompt = self._build_prompt(task, result.steps, step, remaining)
            prompt_path = trace.write_step_file(step, "prompt.txt", prompt)
            trace.event("llm_request", step=step, prompt_chars=len(prompt), prompt_file=str(prompt_path))

            llm = self._harness.run_structured(
                prompt,
                json_schema=self._action_schema(),
                timeout=min(cfg.llm_timeout_seconds, max(30, int(remaining))),
            )
            result.llm_calls += 1
            result.total_tokens += llm.total_tokens or 0
            if cancel_event is not None and cancel_event.is_set():
                result.status = CANCELLED
                break
            decision = llm.structured_output or {}
            trace.write_step_file(
                step,
                "response.json",
                {
                    "status": llm.status,
                    "error": llm.error,
                    "duration_seconds": llm.duration_seconds,
                    "tokens": {"input": llm.input_tokens, "output": llm.output_tokens, "total": llm.total_tokens},
                    "structured_output": llm.structured_output,
                    "raw_response": llm.raw_response,
                    "telemetry": llm.telemetry_metadata,
                },
            )
            trace.event(
                "llm_response",
                step=step,
                status=llm.status,
                duration_s=round(llm.duration_seconds, 2),
                tokens=llm.total_tokens,
                action=decision.get("action"),
                thought=decision.get("thought"),
                error=llm.error,
            )

            if not llm.ok or not decision.get("action"):
                llm_failures += 1
                logger.warning("[react] LLM 응답 실패 (%s/%s): %s %s", llm_failures, cfg.max_consecutive_llm_failures, llm.status, (llm.error or "")[:200])
                if llm_failures >= cfg.max_consecutive_llm_failures:
                    result.status = LLM_FAILED
                    break
                continue  # 같은 step 번호로 다시 묻는다
            llm_failures = 0

            action = str(decision.get("action"))
            args = decision.get("args") if isinstance(decision.get("args"), dict) else {}
            thought = str(decision.get("thought", ""))
            logger.info("[react] step %s thought=%s | action=%s args=%s", step, thought[:300], action, compact_json(args, max_chars=300))

            t_tool = time.monotonic()
            trace.event("tool_call", step=step, tool=action, args=args)
            tool_res = self._tools.run(action, args)
            tool_dur = round(time.monotonic() - t_tool, 3)
            obs_path = trace.write_step_file(step, "observation.json", tool_res.observation)
            trace.event(
                "tool_result",
                step=step,
                tool=action,
                ok=tool_res.ok,
                duration_s=tool_dur,
                observation_file=str(obs_path),
                artifacts=tool_res.artifacts,
                observation_preview=compact_json(tool_res.observation, max_chars=800),
            )
            logger.info("[react] step %s %s -> ok=%s (%.1fs) %s", step, action, tool_res.ok, tool_dur, compact_json(tool_res.observation, max_chars=400))

            result.steps.append(StepRecord(step, thought, action, args, tool_res.ok, tool_res.observation))
            if on_step is not None:
                on_step(
                    {
                        "step": step,
                        "action": action,
                        "ok": tool_res.ok,
                        "observation": tool_res.observation,
                        "terminal": tool_res.terminal,
                    }
                )
            if tool_res.terminal:
                result.status = FINISHED
                result.final = tool_res.observation
                break
            if cancel_event is not None and cancel_event.is_set():
                result.status = CANCELLED
                break
            step += 1

        result.duration_seconds = round(time.monotonic() - t0, 2)
        trace.event(
            "loop_end",
            status=result.status,
            steps=len(result.steps),
            llm_calls=result.llm_calls,
            total_tokens=result.total_tokens,
            duration_s=result.duration_seconds,
        )
        logger.info("[react] loop end status=%s steps=%s llm_calls=%s %.1fs", result.status, len(result.steps), result.llm_calls, result.duration_seconds)
        return result
