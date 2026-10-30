"""PDF 양식을 분석하여 고충실도 .vdoc 블록 및 슬롯으로 조립하는 스캐폴딩 에이전트.

pdf-vdoc-engine의 결정적 기하 추출과 규칙/의미론적 조항 위계 파티셔너를 결합하여,
여백(content_width) 내에 정규화된 프레임과 고충실도 Tiptap HTML을 생성한다.
"""
from __future__ import annotations

import html
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pymupdf
from agent_core.llm.adapters.agy_cli import AgyCliHarness
from agent_core.react import LoopConfig, ReActLoop, RunTrace, load_skill
from pdf_vdoc_engine.assemble.vdoc_assembler import _assemble_table_section
from pdf_vdoc_engine.measure import extract_page_geometry_from_pdf

from app.catalog.agents.fidelity_loop import (
    TUNABLES,
    FidelityConfig,
    FidelityWorkspace,
    apply_tune,
)
from app.core.llm.execution_policy import CLI_PROVIDER, RuntimeExecutionPolicy

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
PX = 96.0 / 72.0


def _r(v: float) -> float:
    return round(float(v), 2)


def _get_font_family(font_name: str) -> str:
    fn_lower = font_name.lower()
    if "µ¸¿ò" in font_name or "dotum" in fn_lower:
        return "Dotum"
    if "times" in fn_lower:
        return "Times New Roman"
    if "batang" in fn_lower or "바탕" in font_name:
        return "Batang"
    return "GulimChe"


def _get_f_factor(font_name: str) -> float:
    if "times" in font_name.lower():
        return 1.1074
    return 1.0


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
    """PDF 양식 의미론·기하 스캐폴더 (FormScaffoldAgentPort 구현체)."""

    def __init__(
        self,
        llm_harness: Optional[Any] = None,
        policy: Optional[RuntimeExecutionPolicy] = None,
        agent_runs_dir: Optional[Path] = None,
        fidelity_tools_dir: Optional[Path] = None,
        fidelity_skill_dir: Optional[Path] = None,
        loop_config: Optional[LoopConfig] = None,
    ) -> None:
        self._llm_harness = llm_harness
        self._policy = policy
        self._agent_runs_dir = agent_runs_dir
        self._fidelity_tools_dir = fidelity_tools_dir
        self._fidelity_skill_dir = fidelity_skill_dir
        self._loop_config = loop_config or LoopConfig(max_steps=12, max_seconds=720)

    def _agentic_loop_enabled(self) -> bool:
        if "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST"):
            return False
        if os.getenv("VIBE_SCAFFOLD_AGENT_LOOP", "1") == "0":
            return False
        return bool(
            self._policy
            and CLI_PROVIDER in (self._policy.primary_provider, self._policy.fallback_provider)
            and self._agent_runs_dir
            and self._fidelity_tools_dir
            and self._fidelity_skill_dir
        )

    def _run_fidelity_loop(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        doc_title: str,
    ) -> tuple[Optional[dict[str, Any]], dict[str, Any]]:
        """스킬 + 도구 + 판정 피드백 루프. (보정값을 입힌 최선의 문서 | None, 실행 정보)를 돌려준다."""
        assert self._policy and self._agent_runs_dir and self._fidelity_tools_dir and self._fidelity_skill_dir
        run_id = f"scaffold-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        run_dir = self._agent_runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = run_dir / "source.pdf"
        pdf_path.write_bytes(pdf_bytes)

        trace = RunTrace(run_dir, run_id)
        info: dict[str, Any] = {"runId": run_id, "runDir": str(run_dir), "status": "started"}
        model = _map_to_agy_model(self._policy.agent_cli_model)
        harness = AgyCliHarness(
            model=model,
            timeout_seconds=self._loop_config.llm_timeout_seconds,
            executable=self._policy.agent_cli_bin or "agy",
        )
        trace.event("run_start", doc_id=doc_id, title=doc_title, pdf=str(pdf_path), pdf_bytes=len(pdf_bytes),
                    harness=harness.name, model=model, executable=harness.executable)
        logger.info("[FormScaffoldAgent] 에이전틱 루프 시작 run_id=%s model=%s dir=%s", run_id, model, run_dir)

        def build_vdoc() -> dict[str, Any]:
            vdoc, _, _ = self._extract_deterministic_baseline(pdf_bytes=pdf_bytes, doc_id=doc_id, title=doc_title)
            return vdoc

        workspace = FidelityWorkspace(
            run_id=run_id,
            run_dir=run_dir,
            pdf_path=pdf_path,
            build_vdoc=build_vdoc,
            trace=trace,
            config=FidelityConfig(tools_dir=self._fidelity_tools_dir),
        )
        try:
            # 0단계: 정답 뽑기 + 보정 전 기준선 판정 (호스트가 실행, LLM 은 결과만 받는다)
            trace.set_step(0)
            truth = workspace.extract_truth()
            baseline = workspace.evaluate()
            baseline_obs = workspace._iteration_observation(baseline)
            trace.write_step_file(0, "observation.json", {"truth": truth, "baseline": baseline_obs})
            trace.event("bootstrap", truth_spans=truth.get("spans_total"), baseline=baseline_obs)
            if baseline.error:
                raise RuntimeError(f"기준선 측정 실패: {baseline.error}")

            skill = load_skill(self._fidelity_skill_dir, references=("references/lessons_learned.md",))
            task = (
                f"원본 PDF '{doc_title}' 1쪽을 VibeDocStudio .vdoc 로 옮긴 결과를 원본과 같게 만든다.\n"
                f"생성기는 고정이고, 네가 바꿀 수 있는 것은 보정값(update_tune)뿐이다. 바꾼 뒤에는 반드시 evaluate 로 다시 잰다.\n"
                f"목표: 03 판정의 글자 위치 점수(span_score = spans_within_tol/spans_total×100) {workspace.cfg.target_score} 이상, "
                f"가능하면 VERDICT PASS. 허용 오차(--tol-pos {workspace.cfg.tol_pos}px)는 바꿀 수 없다.\n"
                f"스킬 §5 Step 6 순서대로 원인 하나씩 고친다. 점수가 떨어지면 그 변경을 되돌린다.\n\n"
                f"## 정답 요약 (01)\n{json.dumps({k: v for k, v in truth.items() if k != 'tool_stdout'}, ensure_ascii=False)[:2500]}\n\n"
                f"## 보정 전 기준선 판정 (iter 0, 02→03)\n{json.dumps(baseline_obs, ensure_ascii=False)[:3500]}\n\n"
                f"## 바꿀 수 있는 보정값\n"
                + "\n".join(f"- {k}: {spec['doc']} (기본 {spec['default']}, "
                            + (f"값 {spec['values']}" if spec['type'] == 'enum' else f"범위 {spec['range']}") + ")"
                            for k, spec in TUNABLES.items())
            )
            loop = ReActLoop(harness=harness, skill=skill, tools=workspace.build_tools(), trace=trace, config=self._loop_config)
            result = loop.run(task)

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
                "tune": best.tune,
            }
            return apply_tune(build_vdoc(), best.tune), info
        except Exception as exc:
            logger.exception("[FormScaffoldAgent] 에이전틱 루프 실패 run_id=%s", run_id)
            info.update({"status": "error", "error": f"{type(exc).__name__}: {exc}", "iterations": workspace.history()})
            trace.event("run_error", error=info["error"])
            best = workspace.best()
            return (apply_tune(build_vdoc(), best.tune) if best else None), info
        finally:
            trace.write_json("summary.json", info)
            trace.event("run_end", **{k: v for k, v in info.items() if k != "iterations"})
            logger.info("[FormScaffoldAgent] 에이전틱 루프 종료 run_id=%s status=%s best=%s", run_id, info.get("status"), info.get("best"))
            trace.close()

    def _extract_deterministic_baseline(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
    ) -> tuple[dict[str, Any], int, int]:
        """PDF 바이트를 파싱하여 완전한 .vdoc Document JSON과 통계(블록 수, 슬롯 수)를 반환한다."""
        if not pdf_bytes:
            raise ValueError("PDF payload is empty")

        doc_title = (title or "").strip() or "추출된 양식 문서"
        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        geometries = extract_page_geometry_from_pdf(pdf_bytes)

        pages: list[dict[str, Any]] = []
        slots: dict[str, dict[str, Any]] = {}
        total_blocks_count = 0

        for page_idx in range(len(pdf)):
            page_num = page_idx + 1
            page = pdf[page_idx]
            page_geom = geometries[page_idx] if page_idx < len(geometries) else None

            # 1. 페이지 크기 계산 (기본 A4 794x1123 px 정규화)
            w_px = _r(page.rect.width * PX)
            h_px = _r(page.rect.height * PX)
            if abs(w_px - 794.0) < 5.0 and abs(h_px - 1123.0) < 5.0:
                w_px, h_px = 794.0, 1123.0

            page_blocks: list[dict[str, Any]] = []

            # 2. 표 격자가 존재하는 경우 먼저 추출
            table_y_ranges: list[tuple[float, float]] = []
            if page_geom and page_geom.tables:
                for tbl_idx, table in enumerate(page_geom.tables):
                    tbl_sec = _assemble_table_section(table, slots)
                    tbl_blk_id = f"p{page_num}_tbl_{tbl_idx + 1}"
                    page_blocks.append(
                        {
                            "blockId": tbl_blk_id,
                            "kind": "structured-table",
                            "title": f"표 구획 {tbl_idx + 1}",
                            "columnWidths": tbl_sec["columnWidths"],
                            "rows": tbl_sec["rows"],
                            "locked": False,
                            # PDF 에서 잰 표 상자 (쪽 좌표 px). 보정값 table_placement=frame 일 때 frame 이 된다.
                            "sourceBox": {
                                "x": _r(table.x0 * PX),
                                "y": _r(table.y0 * PX),
                                "w": _r((table.x1 - table.x0) * PX),
                                "h": _r((table.y1 - table.y0) * PX),
                            },
                        }
                    )
                    table_y_ranges.append((table.y0 * PX, table.y1 * PX))

            # 3. 텍스트 스팬 및 줄(Line) 추출
            text_dict = page.get_text("dict")
            raw_spans: list[dict[str, Any]] = []
            for b in text_dict.get("blocks", []):
                if b.get("type") != 0:
                    continue
                for line_item in b.get("lines", []):
                    for s in line_item.get("spans", []):
                        stext = s.get("text", "")
                        if not stext.strip():
                            continue
                        bbox = s.get("bbox", (0, 0, 0, 0))
                        s_x0 = _r(bbox[0] * PX)
                        s_y0 = _r(bbox[1] * PX)
                        s_x1 = _r(bbox[2] * PX)
                        s_y1 = _r(bbox[3] * PX)

                        # 표 영역 내부에 들어간 텍스트는 표 셀에 포함되므로 건너뜀
                        is_inside_table = any(
                            (ty0 - 2.0) <= s_y0 <= (ty1 + 2.0)
                            for ty0, ty1 in table_y_ranges
                        )
                        if is_inside_table:
                            continue

                        raw_spans.append(
                            {
                                "text": stext,
                                "x": s_x0,
                                "y": s_y0,
                                "x1": s_x1,
                                "y1": s_y1,
                                "pt": _r(s.get("size", 10.0)),
                                "font": s.get("font", "GulimChe"),
                                "bold": "bold" in s.get("font", "").lower(),
                                "color": f"#{s.get('color', 0):06x}",
                            }
                        )

            # 수직 Y좌표 기준으로 시각적 줄(Visual Lines) 그룹화
            raw_spans.sort(key=lambda s: (s["y"], s["x"]))
            lines: list[list[dict[str, Any]]] = []
            curr_line: list[dict[str, Any]] = []
            curr_y: Optional[float] = None

            for sp in raw_spans:
                if curr_y is None or abs(sp["y"] - curr_y) < 3.0:
                    curr_line.append(sp)
                    curr_y = sp["y"] if curr_y is None else curr_y
                else:
                    lines.append(curr_line)
                    curr_line = [sp]
                    curr_y = sp["y"]
            if curr_line:
                lines.append(curr_line)

            # 4. 매크로 레이아웃(여백 및 유효 본문 폭) 계산
            if lines:
                body_xs = [ln[0]["x"] for ln in lines if ln[0]["pt"] <= 14.0]
                body_x1s = [ln[-1]["x1"] for ln in lines if ln[0]["pt"] <= 14.0]
                margin_left = min(body_xs) if body_xs else 94.43
                margin_right = (w_px - max(body_x1s)) if body_x1s else 94.19
                # 여백 정규화 가드
                margin_left = max(20.0, min(margin_left, 150.0))
                margin_right = max(20.0, min(margin_right, 150.0))
                content_w = _r(w_px - margin_left - margin_right)
            else:
                margin_left = 94.43
                margin_right = 94.19
                content_w = _r(w_px - margin_left - margin_right)

            # 5. 조항 및 제목 위계 기준 논리적 블록 분할
            article_pattern = re.compile(r"^제\s*\d+\s*조|^부\s*칙|^\[별표|^\d+\.\s|^[①-⑳]")
            block_line_groups: list[dict[str, Any]] = []
            current_group: list[list[dict[str, Any]]] = []
            current_title = "본문 구획"
            current_kind = "text"

            for line_idx, line in enumerate(lines):
                line_text = "".join(s["text"] for s in line).strip()
                line_pt = line[0]["pt"]

                # A. 표제부(문서 제목) 판정
                is_title_line = (
                    line_idx == 0 and line_pt >= 14.0
                ) or (line_idx < 3 and line_pt >= 15.0)

                # B. 조항 시작선 판정
                is_article_start = bool(article_pattern.match(line_text))

                if is_title_line:
                    if current_group:
                        block_line_groups.append(
                            {
                                "title": current_title,
                                "kind": current_kind,
                                "lines": current_group,
                            }
                        )
                        current_group = []
                    block_line_groups.append(
                        {
                            "title": line_text[:30],
                            "kind": "form-title",
                            "lines": [line],
                        }
                    )
                    current_title = "본문 구획"
                    current_kind = "text"
                elif is_article_start:
                    if current_group:
                        block_line_groups.append(
                            {
                                "title": current_title,
                                "kind": current_kind,
                                "lines": current_group,
                            }
                        )
                    current_group = [line]
                    current_title = line_text[:30]
                    current_kind = "text"
                else:
                    current_group.append(line)

            if current_group:
                block_line_groups.append(
                    {
                        "title": current_title,
                        "kind": current_kind,
                        "lines": current_group,
                    }
                )

            # 6. 각 블록을 정규화된 프레임과 Tiptap HTML로 조립
            for b_idx, b_info in enumerate(block_line_groups):
                blk_id = f"p{page_num}_blk_{b_idx + 1}"
                slot_id = f"slot_{blk_id}"
                b_lines = b_info["lines"]
                if not b_lines:
                    continue

                first_line = b_lines[0]
                frame_x = _r(margin_left)
                frame_y = _r(first_line[0]["y"])
                frame_w = _r(content_w)

                html_parts: list[str] = []
                prev_line_bottom = frame_y

                for l_idx, line in enumerate(b_lines):
                    l_pt = line[0]["pt"]
                    l_f = _get_f_factor(line[0]["font"])
                    l_h = _r(l_f * l_pt * PX)
                    l_top = _r(line[0]["y"])
                    top_gap = 0.0 if l_idx == 0 else max(0.0, _r(l_top - prev_line_bottom))

                    # 정렬 판정: 표제부 또는 중앙 배치인 경우
                    is_center = b_info["kind"] == "form-title" or (
                        abs((line[0]["x"] + line[-1]["x1"]) / 2.0 - w_px / 2.0) < 25.0
                        and l_pt >= 12.0
                    )
                    if is_center:
                        align_css = "text-align: center; margin-left: 0; margin-right: 0;"
                    else:
                        margin_left_px = max(0.0, _r(line[0]["x"] - frame_x))
                        align_css = f"text-align: left; margin-left: {margin_left_px}px;"

                    p_style = (
                        f"font-size: {l_pt}pt; "
                        f"line-height: {l_h}px; "
                        f"font-family: 'GulimChe', 'Dotum', sans-serif; "
                        f"margin: 0; "
                        f"margin-top: {top_gap}px; "
                        f"{align_css} "
                        f"white-space: pre; "
                        f"font-kerning: none; "
                        f"font-variant-ligatures: none;"
                    )

                    inner_html = ""
                    prev_s = None
                    for sp in line:
                        font_family = _get_font_family(sp["font"])
                        color = sp.get("color") or "#000000"
                        weight = "bold" if sp.get("bold") else "normal"
                        span_styles = [
                            f"font-size: {sp['pt']}pt",
                            f"font-family: {font_family}",
                            f"color: {color}",
                            f"font-weight: {weight}",
                        ]
                        if prev_s is not None:
                            dx = max(0.0, _r(sp["x"] - prev_s["x1"]))
                            if dx > 0.4:
                                span_styles.append(f"margin-left: {dx}px")

                        escaped_text = html.escape(sp["text"])
                        inner_html += f'<span style="{"; ".join(span_styles)}">{escaped_text}</span>'
                        prev_s = sp

                    html_parts.append(f'<p style="{p_style}">{inner_html}</p>')
                    prev_line_bottom = l_top + l_h

                full_html = "".join(html_parts)
                frame_h = max(24.0, _r(prev_line_bottom - frame_y))

                # 슬롯 등록
                slots[slot_id] = {
                    "slotId": slot_id,
                    "label": b_info["title"],
                    "role": "boilerplate" if b_info["kind"] == "form-title" else "editable-slot",
                    "content": full_html,
                    "constraints": {"locked": b_info["kind"] == "form-title"},
                    "backDataRefs": [],
                }

                # 블록 등록
                page_blocks.append(
                    {
                        "blockId": blk_id,
                        "kind": b_info["kind"],
                        "title": b_info["title"],
                        "slotId": slot_id,
                        "frame": {
                            "x": frame_x,
                            "y": frame_y,
                            "w": frame_w,
                            "h": frame_h,
                        },
                        "locked": False,
                    }
                )

            total_blocks_count += len(page_blocks)

            # 7. VDocPage 구조 조립
            header_slot_id = f"p{page_num}_slot_header"
            footer_slot_id = f"p{page_num}_slot_footer"
            slots[header_slot_id] = {
                "slotId": header_slot_id,
                "label": f"{page_num}페이지 머리글",
                "role": "boilerplate",
                "content": f"<p>{html.escape(doc_title)}</p>",
                "constraints": {"locked": True},
                "backDataRefs": [],
            }
            slots[footer_slot_id] = {
                "slotId": footer_slot_id,
                "label": f"{page_num}페이지 바닥글",
                "role": "boilerplate",
                "content": f"<p>- {page_num} -</p>",
                "constraints": {"locked": True},
                "backDataRefs": [],
            }

            pages.append(
                {
                    "pageId": f"page_{page_num}",
                    "pageNumber": page_num,
                    "pageLabel": f"{doc_title} ({page_num}p)",
                    "hideHeaderFooter": True,
                    "headerSlotId": header_slot_id,
                    "footerSlotId": footer_slot_id,
                    "blocks": page_blocks,
                    "pageRect": {
                        "width": w_px,
                        "height": h_px,
                        "unit": "pt",
                    },
                    "layout": {
                        "margin": {
                            "top": 90,
                            "right": int(margin_right),
                            "bottom": 90,
                            "left": int(margin_left),
                        },
                        "exactText": True,
                    },
                }
            )

        vdoc_doc: dict[str, Any] = {
            "version": "1.0.0",
            "docId": doc_id,
            "title": doc_title,
            "status": "Draft",
            "totalValueText": "Scaffolded .vdoc",
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "variables": {},
            "pages": pages,
            "slots": slots,
            "backdata": {},
        }

        return vdoc_doc, total_blocks_count, len(slots)

    def _refine_with_agy_cli(
        self,
        *,
        pdf_bytes: bytes,
        baseline_vdoc: dict[str, Any],
        doc_id: str,
        doc_title: str,
    ) -> Optional[dict[str, Any]]:
        """패턴 A: SSE 스트리밍 없이 agy CLI 를 네이티브 속도로 헤드리스 구동하여 .vdoc 구조 정밀화."""
        if not self._policy:
            return None

        # 단위/통합 테스트 환경(pytest)에서는 불필요한 외부 LLM 대기 및 토큰 소모를 방지하고 결정적 베이스라인을 직접 검증
        if "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST"):
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

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=CREATE_NO_WINDOW,
            )
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
            try:
                proc.kill()
            except Exception:
                pass
        except Exception as exc:
            logger.warning("[FormScaffoldAgent] agy CLI 실행 중 예외 발생: %s -> 기본 추출본 사용", exc)

        return None

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]:
        """PDF 바이트를 파싱하여 (.vdoc 문서, 블록 수, 슬롯 수, 에이전트 실행 정보 | None)을 반환한다."""
        if not pdf_bytes:
            raise ValueError("PDF payload is empty")

        doc_title = (title or "").strip() or "추출된 양식 문서"

        # 1. 고정밀 결정적 기하 추출 (MuPDF + pdf_vdoc_engine)
        baseline_doc, total_blocks, total_slots = self._extract_deterministic_baseline(
            pdf_bytes=pdf_bytes,
            doc_id=doc_id,
            title=doc_title,
        )

        # 2. agy CLI ReAct 루프: 스킬 절차대로 02 측정 → 03 판정 → 보정값 수정을 반복
        agent_run: Optional[dict[str, Any]] = None
        if self._agentic_loop_enabled():
            tuned, agent_run = self._run_fidelity_loop(pdf_bytes=pdf_bytes, doc_id=doc_id, doc_title=doc_title)
            if tuned is not None:
                baseline_doc = tuned
        else:
            logger.info("[FormScaffoldAgent] 에이전틱 루프 비활성 (CLI 공급자 아님 · 경로 미주입 · 테스트 · VIBE_SCAFFOLD_AGENT_LOOP=0)")

        # 3. 블록 구획명 정리 (agy 단발 호출)
        if self._policy and (
            self._policy.primary_provider == CLI_PROVIDER
            or self._policy.fallback_provider == CLI_PROVIDER
        ):
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
