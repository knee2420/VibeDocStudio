"""PDF 양식을 분석하여 고충실도 .vdoc 블록 및 슬롯으로 조립하는 스캐폴딩 에이전트.

pdf-vdoc-engine의 결정적 기하 추출과 규칙/의미론적 조항 위계 파티셔너를 결합하여,
여백(content_width) 내에 정규화된 프레임과 고충실도 Tiptap HTML을 생성한다.
"""
from __future__ import annotations

import copy
import json
import logging
import re
import shutil
import subprocess
import sys
import uuid
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from agent_core.llm.adapters.agy_cli import AgyCliHarness
from agent_core.react import LoopConfig, ReActLoop, RunTrace, load_skill

from app.catalog.agents.baseline_extractor import DeterministicBaselineExtractor
from app.catalog.agents.fidelity_layout import TUNABLES, text_lines
from app.catalog.agents.fidelity_loop import (
    FidelityWorkspace,
    create_fidelity_config,
)
from app.core.llm.execution_policy import CLI_PROVIDER, RuntimeExecutionPolicy
from app.core.process_tree import popen_tree

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


#: 충실도 모드별 ReAct 루프 예산.
LOOP_CONFIG_BY_MODE: dict[str, LoopConfig] = {
    "fast": LoopConfig(max_steps=6, max_seconds=300, skill_chars=20000),
    "balanced": LoopConfig(max_steps=8, max_seconds=480, skill_chars=20000),
    "strict": LoopConfig(max_steps=14, max_seconds=900, skill_chars=20000),
}


def _map_to_agy_model(model_name: Optional[str]) -> str:
    """사용자 설정 모델명을 agy CLI 가 지원하는 모델 키로 정규화."""
    if not model_name:
        return "gemini-3.8-flash-medium"
    m_lower = model_name.lower().replace(" ", "").replace("_", "-")
    if "3.8" in m_lower or "flash" in m_lower:
        if "high" in m_lower:
            return "gemini-3.8-flash-high"
        if "low" in m_lower:
            return "gemini-3.8-flash-low"
        return "gemini-3.8-flash-medium"
    if "argon" in m_lower or "pro" in m_lower:
        return "gemini-4-argon-medium"
    if "claude" in m_lower:
        return "claude-sonnet-5-5-medium"
    if "lite" in m_lower or "gemma" in m_lower:
        return "gemini-3.8-flash-low"
    return "gemini-3.8-flash-medium"


def _fidelity_task(workspace: FidelityWorkspace, doc_title: str, baseline_obs: dict[str, Any]) -> str:
    """CLI 에이전트에게 주는 과제. 쪽 모델 요약과 기준선 진단을 먼저 실어, 첫 턴부터 근거를 갖고 움직이게 한다."""
    cfg = workspace.cfg
    model = workspace.model

    def first_text(cell: dict[str, Any]) -> str:
        return next((ln["text"][:12] for ln in model["lines"] if ln["id"] in cell["lines"][:1]), "빈 칸")

    tables = "\n".join(
        f"- {t['id']}: {len(t['row_ys']) - 1}행 × {len(t['col_xs']) - 1}열, 칸 {len(t['cells'])}개 "
        f"(합친 칸 {sum(1 for c in t['cells'] if c['row_span'] > 1 or c['col_span'] > 1)}), "
        f"상자 ({t['x']},{t['y']})-({t['x1']},{t['y1']}), 첫 칸들: "
        + "; ".join(f"{c['id']}={first_text(c)}" for c in t["cells"][:6])
        for t in model["tables"]
    ) or "(표 없음)"
    if text_lines(model):
        lines = "\n".join(workspace.lines_table()[:70])
    else:
        lines = "(표 밖 글 줄 없음 — 분할안은 정할 것이 없다. table_titles 만)"
    tunables = "\n".join(
        f"- {k}: {spec['doc']} (기본 {spec['default']}, 범위 {spec['range']})" for k, spec in TUNABLES.items()
    )
    early_hint = ""
    if cfg.early_exit:
        early_hint = (
            f"- 조기 종료 정책: span_score {cfg.target_score} 이상 및 VERDICT PASS 달성 시, "
            "잔여 미세 처방이 있더라도 즉시 finish 를 호출하여 작업을 종료한다.\n"
        )
    return (
        f"원본 PDF '{doc_title}' 1쪽을 VibeDocStudio .vdoc 로 옮긴 결과를 원본과 같은 좌표로 만든다.\n"
        f"모드: {cfg.mode} (허용 오차 {cfg.tol_pos}px, 목표 점수 {cfg.target_score})\n"
        "생성기(줄 묶기 · 표 격자 · 좌표 배치 · 자간)는 결정적이다. 네가 정하는 것은 분할안(set_plan)과 보정값(update_tune)뿐이다.\n"
        f"목표: span_score {cfg.target_score} 이상, 가능하면 VERDICT PASS. 허용 오차 {cfg.tol_pos}px 는 바꿀 수 없다.\n"
        f"{early_hint}"
        "사용법은 스킬의 '참고 문서: references/cli_loop_guide.md' 를 따른다 (§3 순서, §4 관찰 읽는 법).\n\n"
        f"## 쪽 개요 (01 + 쪽 모델)\n{json.dumps(workspace.truth_summary, ensure_ascii=False)[:2000]}\n\n"
        f"## 표 격자\n{tables}\n\n"
        f"## 원본 줄 (read_lines 와 같은 형식: id | 블록 · 칸 | y | x→x1 | 크기 글꼴 | 글자)\n{lines}\n\n"
        f"## 기본 분할안 · 기본 보정값 판정 (iter 0)\n{json.dumps(baseline_obs, ensure_ascii=False)[:5000]}\n\n"
        f"## 보정값\n{tunables}"
    )


def _extract_result_envelope(stdout: str) -> Optional[dict[str, Any]]:
    """NDJSON 또는 일반 JSON 출력에서 최종 결과 엔벨로프를 회수한다."""
    envelope: Optional[dict[str, Any]] = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if not isinstance(msg, dict):
            continue
        msg_type = msg.get("type")
        if msg_type == "result" or (
            msg_type is None and ("status" in msg or "response" in msg)
        ):
            envelope = msg
    if envelope is None and stdout.strip().startswith("{"):
        try:
            parsed = json.loads(stdout.strip())
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return envelope


class FormScaffoldAgent:
    """PDF 양식 의미론·기하 스캐폴더 (FormScaffoldAgentPort 구현체).

    세 단계를 차례로 시도한다: 결정적 기준선 → (허용 시) 에이전틱 피델리티 루프 → (허용 시) 단발 구획명 정리.
    외부 LLM 호출 허용 여부(`external_llm_enabled`)와 CLI 하네스 생성(`harness_factory`)은 컨테이너가
    주입한다. 테스트는 `external_llm_enabled=False` 로 결정적 기준선만 검증한다.
    """

    def __init__(
        self,
        policy: Optional[RuntimeExecutionPolicy] = None,
        agent_runs_dir: Optional[Path] = None,
        fidelity_tools_dir: Optional[Path] = None,
        fidelity_skill_dir: Optional[Path] = None,
        *,
        external_llm_enabled: bool = True,
        agentic_loop_enabled: bool = True,
        baseline_extractor: Optional[DeterministicBaselineExtractor] = None,
        harness_factory: Callable[..., AgyCliHarness] = AgyCliHarness,
    ) -> None:
        self._policy = policy
        self._agent_runs_dir = agent_runs_dir
        self._fidelity_tools_dir = fidelity_tools_dir
        self._fidelity_skill_dir = fidelity_skill_dir
        self._external_llm_enabled = external_llm_enabled
        self._agentic_loop_enabled_flag = agentic_loop_enabled
        self._baseline = baseline_extractor or DeterministicBaselineExtractor()
        self._harness_factory = harness_factory

    def _cli_provider_selected(self) -> bool:
        return bool(
            self._policy
            and CLI_PROVIDER in (self._policy.primary_provider, self._policy.fallback_provider)
        )

    def _agentic_loop_enabled(self) -> bool:
        return bool(
            self._external_llm_enabled
            and self._agentic_loop_enabled_flag
            and self._cli_provider_selected()
            and self._agent_runs_dir
            and self._fidelity_tools_dir
            and self._fidelity_skill_dir
        )

    def _run_fidelity_loop(
        self,
        *,
        pdf_bytes: bytes,
        baseline_doc: dict[str, Any],
        doc_id: str,
        doc_title: str,
        fidelity_mode: str = "balanced",
    ) -> tuple[Optional[dict[str, Any]], dict[str, Any]]:
        """스킬 + 도구 + 판정 피드백 루프. (보정값을 입힌 최선의 문서 | None, 실행 정보)를 돌려준다."""
        assert self._policy and self._agent_runs_dir and self._fidelity_tools_dir and self._fidelity_skill_dir
        run_id = f"scaffold-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        run_dir = self._agent_runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = run_dir / "source.pdf"
        pdf_path.write_bytes(pdf_bytes)

        trace = RunTrace(run_dir, run_id)
        info: dict[str, Any] = {"runId": run_id, "runDir": str(run_dir), "status": "started", "fidelityMode": fidelity_mode}
        model = _map_to_agy_model(self._policy.agent_cli_model)

        mode_str = (fidelity_mode or "balanced").strip().lower()
        active_loop_config = LOOP_CONFIG_BY_MODE.get(mode_str, LOOP_CONFIG_BY_MODE["balanced"])

        harness = self._harness_factory(
            model=model,
            timeout_seconds=active_loop_config.llm_timeout_seconds,
            executable=self._policy.agent_cli_bin or "agy",
        )
        trace.event("run_start", doc_id=doc_id, title=doc_title, pdf=str(pdf_path), pdf_bytes=len(pdf_bytes),
                    harness=harness.name, model=model, executable=harness.executable, fidelity_mode=fidelity_mode)
        logger.info("[FormScaffoldAgent] 에이전틱 루프 시작 run_id=%s model=%s mode=%s dir=%s", run_id, model, fidelity_mode, run_dir)

        def build_vdoc() -> dict[str, Any]:
            # 여러 쪽 문서의 뼈대(제목 · 2쪽 이후)만 쓴다. 기준선은 호출자가 이미 한 번 뽑아 넘겨준다.
            return copy.deepcopy(baseline_doc)

        workspace = FidelityWorkspace(
            run_id=run_id,
            run_dir=run_dir,
            pdf_path=pdf_path,
            build_vdoc=build_vdoc,
            trace=trace,
            config=create_fidelity_config(tools_dir=self._fidelity_tools_dir, mode=mode_str),
        )
        try:
            # 0단계: 정답 뽑기 + 기본 분할안 · 기본 보정값 판정 (호스트가 실행, LLM 은 결과만 받는다)
            trace.set_step(0)
            truth = workspace.extract_truth()
            baseline = workspace.evaluate()
            baseline_obs = workspace.iteration_observation(baseline)
            trace.write_step_file(0, "observation.json", {"truth": truth, "baseline": baseline_obs})
            trace.event("bootstrap", truth_spans=truth.get("spans_total"), baseline_score=baseline.score,
                        prescriptions=len(baseline.diagnosis.get("prescriptions", [])))
            if baseline.error:
                raise RuntimeError(f"기준선 측정 실패: {baseline.error}")

            skill = load_skill(
                self._fidelity_skill_dir,
                references=("references/cli_loop_guide.md", "references/lessons_learned.md"),
            )
            loop = ReActLoop(harness=harness, skill=skill, tools=workspace.build_tools(), trace=trace, config=active_loop_config)
            result = loop.run(_fidelity_task(workspace, doc_title, baseline_obs))

            best = workspace.best()
            info.update({
                "status": result.status,
                "steps": len(result.steps),
                "llmCalls": result.llm_calls,
                "totalTokens": result.total_tokens,
                "model": model,
                "iterations": workspace.history(),
                "agentSummary": (result.final or {}).get("agent_summary"),
            })
            if best is None:
                return None, info
            info["best"] = {
                "iter": best.index, "verdict": best.verdict, "spanScore": best.score,
                "verdictLine": best.summary.get("verdict_line"), "verifyJson": str(best.out_dir / "verify.json"),
                "tune": best.tune, "plan": best.plan,
                # 보정값으로 못 고친 원인 — 생성기 · 편집기를 고칠 사람이 본다.
                "engineIssues": best.diagnosis.get("engine_issues", []),
            }
            return workspace.merge_into(build_vdoc(), best.plan, best.tune), info
        except Exception as exc:
            logger.exception("[FormScaffoldAgent] 에이전틱 루프 실패 run_id=%s", run_id)
            info.update({"status": "error", "error": f"{type(exc).__name__}: {exc}", "iterations": workspace.history()})
            trace.event("run_error", error=info["error"])
            best = workspace.best()
            return (workspace.merge_into(build_vdoc(), best.plan, best.tune) if best else None), info
        finally:
            trace.write_json("summary.json", info)
            trace.event("run_end", **{k: v for k, v in info.items() if k != "iterations"})
            logger.info("[FormScaffoldAgent] 에이전틱 루프 종료 run_id=%s status=%s best=%s", run_id, info.get("status"),
                        {k: v for k, v in (info.get("best") or {}).items() if k in ("iter", "verdict", "spanScore")})
            trace.close()

    def _refine_with_agy_cli(
        self,
        *,
        pdf_bytes: bytes,
        baseline_vdoc: dict[str, Any],
        doc_id: str,
        doc_title: str,
    ) -> Optional[dict[str, Any]]:
        """패턴 A: SSE 스트리밍 없이 agy CLI 를 네이티브 속도로 헤드리스 구동하여 .vdoc 구조 정밀화."""
        if not self._policy or not self._external_llm_enabled:
            return None

        cli_bin = self._policy.agent_cli_bin or "agy"
        resolved_bin = shutil.which(cli_bin) or shutil.which("agy")
        if not resolved_bin:
            logger.info("[FormScaffoldAgent] agy CLI 실행 파일을 찾을 수 없어 결정적 기하 추출본을 사용합니다.")
            return None

        chosen_model = _map_to_agy_model(self._policy.agent_cli_model)
        timeout_seconds = min(self._policy.agent_cli_timeout_seconds or 180, 45)

        # 1차 추출된 블록들의 핵심 레이블과 형태 요약
        page0 = baseline_vdoc.get("pages", [{}])[0]
        blocks_summary: list[str] = []
        for b in page0.get("blocks", []):
            bid = b.get("blockId", "")
            bkind = b.get("kind", "")
            if bkind == "structured-table":
                sample_texts: list[str] = []
                for r in b.get("rows", [])[:10]:
                    for c in r.get("cells", []):
                        sid = c.get("slotId", "")
                        content = baseline_vdoc.get("slots", {}).get(sid, {}).get("content", "")
                        clean = re.sub(r"<[^>]+>", "", content).strip()
                        if clean and clean not in sample_texts:
                            sample_texts.append(clean[:20])
                blocks_summary.append(f"- {bid} (표, {len(b.get('rows', []))}행): {', '.join(sample_texts[:8])}")
            else:
                sid = b.get("slotId", "")
                content = baseline_vdoc.get("slots", {}).get(sid, {}).get("content", "")
                clean = re.sub(r"<[^>]+>", "", content).strip()
                blocks_summary.append(f"- {bid} (본문): {clean[:30]}")

        prompt_content = (
            "당신은 VDoc 고충실도 문서 스캐폴딩 전문 AI 에이전트입니다.\n"
            f"문서명: {doc_title}\n"
            "발견된 구획 구조:\n"
            + "\n".join(blocks_summary)
            + "\n\n"
            "위 서식 구조를 분석하여 각 구획의 명확한 한글 비즈니스 구획명(blockTitles)과 정제된 문서 제목(title)을 JSON으로 반환하십시오.\n"
            "반드시 아래 JSON 형식으로만 응답해야 합니다:\n"
            "```json\n"
            "{\n"
            f'  "title": "{doc_title}",\n'
            '  "blockTitles": {\n'
            + ",\n".join(f'    "{b.get("blockId")}": "구획명"' for b in page0.get("blocks", []))
            + "\n  }\n"
            "}\n"
            "```"
        )

        try:
            cmd = [
                resolved_bin,
                "--dangerously-skip-permissions",
                "--output-format", "json",
                "--model", chosen_model,
                "-p", prompt_content,
            ]

            logger.info(
                "[FormScaffoldAgent] agy CLI 시맨틱 정밀화 시작: %s (model=%s, timeout=%ss)",
                resolved_bin,
                chosen_model,
                timeout_seconds,
            )

            # Job Object 로 묶어 API 가 죽거나 타임아웃이 나도 agy 트리가 고아로 남지 않게 한다.
            tree = popen_tree(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=CREATE_NO_WINDOW,
            )
            proc = tree.proc
            stdout_bytes, stderr_bytes = proc.communicate(timeout=timeout_seconds)
            stdout = stdout_bytes.decode("utf-8", errors="replace")
            stderr = stderr_bytes.decode("utf-8", errors="replace")

            if proc.returncode != 0:
                logger.warning(
                    "[FormScaffoldAgent] agy CLI 비정상 종료 (code=%s): %s",
                    proc.returncode,
                    stderr.strip()[:200],
                )

            envelope = _extract_result_envelope(stdout)
            if not envelope:
                logger.warning("[FormScaffoldAgent] agy CLI 출력에서 JSON 엔벨로프를 찾을 수 없습니다.")
                return None

            raw_response = envelope.get("response") or envelope.get("result") or ""
            candidate: Any = None
            if isinstance(raw_response, dict):
                candidate = raw_response
            elif isinstance(raw_response, str) and raw_response.strip():
                # 마크다운 코드블록 안의 JSON 추출
                code_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_response, re.DOTALL)
                if code_match:
                    raw_json = code_match.group(1).strip()
                else:
                    raw_json = raw_response.strip()
                try:
                    candidate = json.loads(raw_json)
                except Exception:
                    candidate = None
            else:
                candidate = envelope

            if isinstance(candidate, dict):
                # 1. 문서 제목 반영
                refined_title = candidate.get("title")
                if refined_title and isinstance(refined_title, str):
                    baseline_vdoc["title"] = refined_title.strip()
                    if baseline_vdoc.get("pages"):
                        p0 = baseline_vdoc["pages"][0]
                        p0["pageLabel"] = f"{refined_title.strip()} ({p0.get('pageNumber', 1)}p)"

                # 2. 블록 구획명(title) 반영
                block_titles = candidate.get("blockTitles", {})
                if isinstance(block_titles, dict) and baseline_vdoc.get("pages"):
                    for b in baseline_vdoc["pages"][0].get("blocks", []):
                        bid = b.get("blockId")
                        if bid in block_titles and block_titles[bid]:
                            b["title"] = str(block_titles[bid]).strip()

                logger.info(
                    "[FormScaffoldAgent] agy CLI 시맨틱 정밀 패치 반영 완료 (소요: %s초)",
                    envelope.get("duration_seconds", 0),
                )
                return baseline_vdoc

        except subprocess.TimeoutExpired:
            logger.warning("[FormScaffoldAgent] agy CLI 호출 타임아웃 (%ss 초과) -> 기본 추출본 사용", timeout_seconds)
            tree.kill()
        except Exception as exc:
            logger.warning("[FormScaffoldAgent] agy CLI 실행 중 예외 발생: %s -> 기본 추출본 사용", exc)

        return None

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
        fidelity_mode: str = "balanced",
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]:
        """PDF 바이트를 파싱하여 (.vdoc 문서, 블록 수, 슬롯 수, 에이전트 실행 정보 | None)을 반환한다."""
        if not pdf_bytes:
            raise ValueError("PDF payload is empty")

        doc_title = (title or "").strip() or "추출된 양식 문서"

        # 1. 고정밀 결정적 기하 추출 (MuPDF + pdf_vdoc_engine)
        baseline_doc, total_blocks, total_slots = self._baseline.extract(
            pdf_bytes=pdf_bytes,
            doc_id=doc_id,
            title=doc_title,
        )

        # 2. agy CLI ReAct 루프: truth 기반 생성기 → 디버그 크롬 → 02 측정 → 03 판정 → 진단 · 처방 → 분할안 · 보정값 수정
        agent_run: Optional[dict[str, Any]] = None
        if self._agentic_loop_enabled():
            tuned, agent_run = self._run_fidelity_loop(
                pdf_bytes=pdf_bytes,
                baseline_doc=baseline_doc,
                doc_id=doc_id,
                doc_title=doc_title,
                fidelity_mode=fidelity_mode,
            )
            if tuned is not None:
                # 1쪽 블록 · 표 이름은 루프의 분할안이 정했으므로 단발 이름 정리는 하지 않는다.
                total = sum(len(p.get("blocks", [])) for p in tuned.get("pages", []))
                return tuned, total, len(tuned.get("slots", {})), agent_run
        else:
            logger.info("[FormScaffoldAgent] 에이전틱 루프 비활성 (외부 LLM 비허용 · CLI 공급자 아님 · 경로 미주입)")

        # 3. 블록 구획명 정리 (agy 단발 호출)
        if self._cli_provider_selected():
            refined = self._refine_with_agy_cli(
                pdf_bytes=pdf_bytes,
                baseline_vdoc=baseline_doc,
                doc_id=doc_id,
                doc_title=doc_title,
            )
            if refined and "pages" in refined and "slots" in refined:
                refined_blocks = sum(len(p.get("blocks", [])) for p in refined.get("pages", []))
                return refined, refined_blocks, len(refined.get("slots", {})), agent_run

        return baseline_doc, total_blocks, total_slots, agent_run
