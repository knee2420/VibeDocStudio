"""Composer 세션 · 인라인 액션 실행.

에이전트 루프의 주도권은 프론트에 있다. 서버는 한 번의 요청(메시지 또는 도구 결과)에 대해
모델이 멈출 때까지(답을 끝내거나 도구 호출을 내보낼 때까지) 이벤트를 흘린다.
도구 호출이 나오면 `turn_done.stopReason == "tool_calls"` 로 끝나고, 프론트가 도구를 실행해
`submit_tool_results` 로 결과를 보내면 같은 대화가 이어진다.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator, Optional

from app.core.llm.execution_policy import RuntimeExecutionPolicy

from ..errors import AssistantSessionNotFoundError
from ..models import ContextItem, EngineChoice, ToolCall, ToolSpec
from ..ports import ConversationEngine, EngineProvider
from ..prompts import clean_inline_output, composer_message, inline_message
from ..tool_protocol import ToolCallExtractor, render_tool_results

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 16
SESSION_IDLE_SECONDS = 30 * 60
#: 이 시간 동안 쓰지 않은 세션은 agy 프로세스(개당 170MB 이상)만 내린다. 대화는 다음 턴에
#: `--conversation <id>` 로 다시 잇는다 (기동 약 5초).
PROCESS_IDLE_SECONDS = 10 * 60
#: 결과를 기다리지 않는 도구 위험도 — 프론트가 스트리밍 중 즉시 실행하고, 모델은 답변을 이어 쓴다.
ASYNC_RISKS = frozenset({"ui", "stage"})
#: 도구 블록 작성 진행 이벤트 간격 (문자 수).
PROGRESS_STEP_CHARS = 120


@dataclass
class _Session:
    session_id: str
    engine: ConversationEngine
    created_at: float = field(default_factory=time.monotonic)
    last_used: float = field(default_factory=time.monotonic)
    tools_hash: Optional[str] = None
    tool_risks: dict[str, str] = field(default_factory=dict)
    pending_calls: dict[str, ToolCall] = field(default_factory=dict)
    tool_rounds: int = 0
    mode: str = "agent"
    cancel: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)


def _tools_hash(tools: list[ToolSpec]) -> str:
    raw = json.dumps(
        [(t.name, t.description, t.risk, t.input_schema) for t in tools],
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


class AssistantService:
    def __init__(
        self,
        engines: EngineProvider,
        policy: RuntimeExecutionPolicy,
        inline_model: str,
    ) -> None:
        self._engines = engines
        self._policy = policy
        self._inline_model = inline_model
        self._sessions: dict[str, _Session] = {}
        self._lock = threading.Lock()

    # --- 엔진 선택 ---------------------------------------------------------------

    def default_choice(self) -> EngineChoice:
        snap = self._policy.snapshot()
        return self._engines.resolve(snap.primary_provider, snap.primary_model)

    def inline_choice(self, model: Optional[str] = None) -> EngineChoice:
        snap = self._policy.snapshot()
        return self._engines.resolve(snap.primary_provider, model or self._inline_model)

    def engines_status(self) -> dict[str, Any]:
        # 열린 Composer 가 주기적으로 부르는 곳이라, 유휴 정리를 여기에 얹는다 (별도 타이머 없이).
        self.release_idle()
        choice = self.default_choice()
        inline = self.inline_choice()
        with self._lock:
            session_count = len(self._sessions)
        return {
            **self._engines.status(),
            "composer": {"provider": choice.provider, "model": choice.model},
            "inline": {"provider": inline.provider, "model": inline.model},
            "models": {
                "agy_cli": self._engines.available_models("agy_cli"),
                "google_api": self._engines.available_models("google_api"),
            },
            "sessions": session_count,
        }

    def warmup(self) -> dict[str, Any]:
        self.release_idle()
        composer = self.default_choice()
        inline = self.inline_choice()
        # 같은 모델을 함께 쓰면 대기 2개 — Composer 새 대화와 인라인 연속 실행이 서로 기동을 기다리지 않게.
        # 목표는 매번 통째로 바뀌므로, 예전에 고른 모델의 대기 프로세스는 여기서 내려간다.
        targets = {composer: 2} if inline == composer else {composer: 1, inline: 1}
        self._engines.warmup(targets)
        return {"composer": composer.model, "inline": inline.model}

    # --- 세션 --------------------------------------------------------------------

    def create_session(self, provider: Optional[str] = None, model: Optional[str] = None) -> dict[str, Any]:
        self.release_idle()
        snap = self._policy.snapshot()
        choice = self._engines.resolve(provider or snap.primary_provider, model or snap.primary_model)
        engine = self._engines.open_conversation(choice, lane="composer")
        session = _Session(session_id=f"asst-{uuid.uuid4().hex[:12]}", engine=engine)
        with self._lock:
            self._sessions[session.session_id] = session
        return {"sessionId": session.session_id, "provider": choice.provider, "model": choice.model}

    def close_session(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.cancel.set()
            session.engine.close()

    def interrupt(self, session_id: str) -> None:
        self._get(session_id).cancel.set()

    def interrupt_quietly(self, session_id: str) -> None:
        """클라이언트 연결이 끊겼을 때 — 세션이 이미 닫혔어도 조용히 넘어간다."""
        with self._lock:
            session = self._sessions.get(session_id)
        if session is not None:
            session.cancel.set()

    def send_message(
        self,
        session_id: str,
        *,
        text: str,
        contexts: list[ContextItem],
        tools: list[ToolSpec],
        mode: str = "agent",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        deferred_results: Optional[list[dict[str, Any]]] = None,
    ) -> Iterator[dict[str, Any]]:
        session = self._get(session_id)
        self._maybe_switch_engine(session, provider, model)
        digest = _tools_hash(tools)
        include_tools = tools if digest != session.tools_hash else None
        session.tool_risks = {t.name: t.risk for t in tools}
        message = composer_message(text, contexts, tools=include_tools, mode=mode)
        if deferred_results:
            # 지난 답변 중 즉시 실행된 ui · stage 도구의 결과 — 모델이 실제로 일어난 일을 알게 한다.
            message = f"[지난 답변에서 실행된 도구 결과]\n{render_tool_results(deferred_results)}\n\n{message}"
        session.tools_hash = digest
        session.mode = mode
        session.tool_rounds = 0
        session.pending_calls.clear()
        return self._drive(session, message)

    def submit_tool_results(self, session_id: str, results: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
        session = self._get(session_id)
        unknown = [r["id"] for r in results if r["id"] not in session.pending_calls]
        if unknown:
            logger.info("[assistant] 알 수 없는 도구 결과 id 무시: %s", unknown)
        known = [r for r in results if r["id"] in session.pending_calls]
        session.pending_calls.clear()
        session.tool_rounds += 1
        if session.tool_rounds > MAX_TOOL_ROUNDS:
            def limited() -> Iterator[dict[str, Any]]:
                yield {"type": "error", "message": f"도구 호출이 {MAX_TOOL_ROUNDS}회를 넘어 멈췄습니다."}
                yield {"type": "turn_done", "stopReason": "tool_limit", "usage": {}, "durationMs": 0}
            return limited()
        message = render_tool_results(known) + "\n\n위 도구 결과를 바탕으로 작업을 이어가라."
        return self._drive(session, message)

    def _drive(self, session: _Session, message: str) -> Iterator[dict[str, Any]]:
        def stream() -> Iterator[dict[str, Any]]:
            # 잠금은 스트림이 실제로 시작될 때 잡는다 (시작 전에 끊긴 요청이 세션을 잠그지 않게).
            # 직전 실행이 중단 처리 중일 수 있으므로(agy 종료 · 정리) 잠깐 기다린다.
            if not session.lock.acquire(timeout=5):
                yield {"type": "error", "message": "이 세션은 이미 실행 중입니다.", "code": "busy"}
                yield {"type": "turn_done", "stopReason": "error", "usage": {}, "durationMs": 0}
                return
            session.cancel.clear()
            session.last_used = time.monotonic()
            extractor = ToolCallExtractor(id_prefix=f"c{session.tool_rounds}")
            calls: list[ToolCall] = []
            done: dict[str, Any] = {"type": "turn_done", "usage": {}, "durationMs": 0}
            errored = False
            try:
                yield {
                    "type": "turn_start",
                    "provider": session.engine.choice.provider,
                    "model": session.engine.choice.model,
                }
                reported = 0
                for event in session.engine.run_turn(message, session.cancel):
                    kind = event.get("type")
                    if kind == "text_delta":
                        visible, found = extractor.feed(event.get("text", ""))
                        if visible:
                            yield {"type": "text_delta", "text": visible}
                        for call in found:
                            reported = 0
                            is_async = session.tool_risks.get(call.name) in ASYNC_RISKS
                            if not is_async:
                                calls.append(call)
                            yield _call_event(call, is_async)
                        pending = extractor.pending_chars
                        if pending and pending - reported >= PROGRESS_STEP_CHARS:
                            reported = pending
                            yield {"type": "tool_call_progress", "name": extractor.pending_name, "chars": pending}
                    elif kind == "turn_done":
                        done = {**done, **event}
                    else:
                        if kind == "error":
                            errored = True
                        yield event
                tail, _ = extractor.flush()
                if tail:
                    yield {"type": "text_delta", "text": tail}
                if extractor.malformed:
                    yield {"type": "status", "state": "warning", "message": "형식이 잘못된 도구 호출을 무시했습니다."}
                for call in calls:
                    session.pending_calls[call.call_id] = call
                stop = "error" if errored and not calls else ("tool_calls" if calls else "end_turn")
                yield {**done, "stopReason": stop}
            finally:
                session.last_used = time.monotonic()
                session.lock.release()

        return stream()

    # --- 인라인 액션 -------------------------------------------------------------

    def run_inline(
        self,
        *,
        instruction: str,
        contexts: list[ContextItem],
        output_format: str = "html",
        model: Optional[str] = None,
        cancel: Optional[threading.Event] = None,
    ) -> Iterator[dict[str, Any]]:
        choice = self.inline_choice(model)
        engine = self._engines.open_conversation(choice, lane="inline")
        message = inline_message(instruction, contexts, output_format)
        token = cancel or threading.Event()

        def stream() -> Iterator[dict[str, Any]]:
            pieces: list[str] = []
            done: dict[str, Any] = {"type": "turn_done", "usage": {}, "durationMs": 0}
            errored = False
            try:
                yield {"type": "turn_start", "provider": choice.provider, "model": choice.model}
                for event in engine.run_turn(message, token):
                    kind = event.get("type")
                    if kind == "text_delta":
                        pieces.append(event.get("text", ""))
                        yield event
                    elif kind == "turn_done":
                        done = {**done, **event}
                    elif kind == "agent_tool":
                        continue  # 인라인은 내장 도구를 쓰지 않는다 — 보여주지 않는다
                    else:
                        if kind == "error":
                            errored = True
                        yield event
                if not errored:
                    yield {"type": "result", "text": clean_inline_output("".join(pieces)), "format": output_format}
                yield {**done, "stopReason": "error" if errored else "end_turn"}
            finally:
                engine.close()

        return stream()

    # --- 내부 --------------------------------------------------------------------

    def _get(self, session_id: str) -> _Session:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise AssistantSessionNotFoundError(f"assistant session not found: {session_id}")
        return session

    def _maybe_switch_engine(self, session: _Session, provider: Optional[str], model: Optional[str]) -> None:
        if not provider and not model:
            return
        current = session.engine.choice
        target = self._engines.resolve(provider or current.provider, model or current.model)
        if target == current:
            return
        state = session.engine.export_state() if target.provider == current.provider else None
        session.engine.close()
        session.engine = self._engines.open_conversation(target, lane="composer", resume=state)
        session.tools_hash = None  # 새 엔진에는 규칙 · 도구 목록을 다시 알려 준다

    def release_idle(self) -> None:
        """오래 안 쓴 세션을 닫고, 잠깐 쉬는 세션은 엔진 프로세스만 내린다 (사용 중인 세션은 건드리지 않는다)."""
        now = time.monotonic()
        with self._lock:
            idle = [s for s in self._sessions.values() if not s.lock.locked()]
            stale = [s for s in idle if now - s.last_used > SESSION_IDLE_SECONDS]
            for session in stale:
                self._sessions.pop(session.session_id, None)
            stale_ids = {s.session_id for s in stale}
            resting = [s for s in idle if s.session_id not in stale_ids and now - s.last_used > PROCESS_IDLE_SECONDS]
        for session in stale:
            session.engine.close()
        for session in resting:
            release = getattr(session.engine, "release_process", None)
            if release is not None:
                release()

    def shutdown(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            session.cancel.set()
            session.engine.close()
        self._engines.shutdown()


def _call_event(call: ToolCall, is_async: bool = False) -> dict[str, Any]:
    return {"type": "tool_call", "id": call.call_id, "name": call.name, "arguments": call.arguments, "async": is_async}
