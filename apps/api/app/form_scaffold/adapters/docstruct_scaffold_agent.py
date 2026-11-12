"""`docstruct-engine` 기반 PDF/스캔 스캐폴딩 어댑터."""
from __future__ import annotations

import logging
import re
import shutil
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator, Optional

import pymupdf
from docstruct_engine.cache import save_page_ir
from docstruct_engine.compile.docstruct_vdoc import (
    build_doc_ir_from_pdf_bytes,
    default_ocr_port,
    doc_ir_to_vdoc,
    finalize_vdoc_envelope,
)
from docstruct_engine.config import load_thresholds
from docstruct_engine.ir.model import DocIR, PageIR, TableIR, bbox_center, point_in_bbox
from docstruct_engine.reread import RereadTask, apply_reread_patch, reread_plan
from docstruct_engine.telemetry import emit_stage_event, summarize_doc_metrics
from docstruct_engine.verify import DocVerifyBundle, verify_doc

from app.llm.adapters.agy_print import parse_json_text
from app.llm.catalog import normalize_agy_model
from app.llm.policy import CLI_PROVIDER, RuntimeExecutionPolicy
from app.llm.ports import OneShotRunner

logger = logging.getLogger(__name__)

_MODE_ROUNDS: dict[str, int] = {
    "fast": 0,
    "balanced": 1,
    "strict": 2,
}


def _emit(cb: Optional[Callable[[dict[str, Any]], None]], payload: dict[str, Any]) -> None:
    if cb is not None:
        cb(payload)


def _is_cancelled(cancel_event: Any) -> bool:
    return bool(cancel_event is not None and cancel_event.is_set())


def _is_enabled(flag: bool | Callable[[], bool]) -> bool:
    return bool(flag() if callable(flag) else flag)


def _collect_block_preview(page: PageIR, words_by_id: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for blk in page.blocks:
        if isinstance(blk, TableIR):
            continue
        txt = (getattr(blk, "text", None) or "").strip()
        if not txt and getattr(blk, "wordIds", None):
            txt = " ".join(words_by_id[w].text for w in blk.wordIds if w in words_by_id).strip()
        bbox_s = [round(v, 1) for v in blk.bbox] if getattr(blk, "bbox", None) else None
        lines.append(f"- {blk.id} ({blk.kind}, bbox={bbox_s}): {txt[:140]!r}")
    return lines


def _resolve_task_image(
    task: RereadTask,
    page_index: int,
    cache_dir: Optional[Path],
) -> tuple[str, bool]:
    """참고 이미지 경로와 실제 존재 여부를 확인한다(크롭 PNG 우선, 없으면 페이지 PNG 폴백)."""
    crop_path = Path(task.cropPngPath) if task.cropPngPath else None
    page_png = cache_dir / f"p{page_index}.png" if cache_dir is not None else None
    if crop_path is not None and crop_path.is_file():
        return str(crop_path), True
    if page_png is not None and page_png.is_file():
        return str(page_png), True
    return (task.cropPngPath or "(none)"), False


def _build_reread_prompt(
    task: RereadTask,
    page: PageIR,
    *,
    doc_title: str,
    cache_dir: Optional[Path],
) -> str:
    """RereadTask 와 PageIR 컨텍스트를 VLM 1-shot 프롬프트로 조립한다."""
    instructions = (task.prompt or "").replace("{{", "{").replace("}}", "}").strip()
    image_ref, image_exists = _resolve_task_image(task, page.pageIndex, cache_dir)
    words_by_id = {w.id: w for w in page.words}

    sections = [
        instructions,
        "",
        "## 대상 문서 컨텍스트",
        f"- 문서 제목: {doc_title}",
        f"- 페이지 번호: {page.pageIndex} (sourceKind={page.sourceKind})",
        f"- 작업 유형: {task.kind}",
        f"- 대상 블록 ID: {task.blockId or '(페이지 전체)'}",
        f"- 판독 사유: {', '.join(task.reasons) or '-'}",
        f"- 참고 이미지 경로: {image_ref}",
    ]
    if image_exists:
        sections.extend(
            [
                "",
                "## 이미지 확인 (`read_file`)",
                f"read_file: `{image_ref}`",
            ]
        )

    if task.kind in ("table_read", "table_reread"):
        embedded_wids: set[str] = set()
        if task.candidateHtml:
            embedded_wids = set(re.findall(r'data-w="([^"]+)"', task.candidateHtml))
            sections.extend(["", "## 1차 표 후보 HTML", task.candidateHtml])
        region_words = [
            w for w in page.words
            if task.bbox is None or (w.bbox is not None and point_in_bbox(bbox_center(w.bbox), task.bbox, tol=3.0))
        ]
        # candidateHtml 에 이미 data-w 로 포함된 고신뢰 단어는 중복 덤프를 생략해 프롬프트 지연과 thinking 토큰을 줄인다.
        extra_words = [
            w for w in region_words
            if w.id not in embedded_wids or w.needsReview or w.conf < 0.85
        ]
        if extra_words:
            word_lines = [f"- {w.id}: {w.text!r} (conf={w.conf:.2f})" for w in extra_words[:200]]
            sections.extend(["", "## 영역 내 미매칭·저신뢰 단어 토큰(wordId)", *word_lines])
    elif task.kind == "page_blocks":
        blk_lines = _collect_block_preview(page, words_by_id)
        order = page.readingOrder or [b.id for b in page.blocks]
        sections.extend(["", "## 현재 블록 ID 순서", f"{order}", "", "## 비표 후보 블록 목록", *blk_lines])
        suspect_words = [w for w in page.words if w.needsReview or w.conf < 0.7]
        if suspect_words:
            word_lines = [f"- {w.id}: {w.text!r} (conf={w.conf:.2f})" for w in suspect_words[:120]]
            sections.extend(["", "## 저신뢰 단어 토큰(wordId)", *word_lines])
    else:
        region_words = [
            w for w in page.words
            if w.needsReview or w.conf < 0.7
            or (task.bbox is not None and w.bbox is not None and point_in_bbox(bbox_center(w.bbox), task.bbox, tol=2.0))
        ]
        word_lines = [f"- {w.id}: {w.text!r} (conf={w.conf:.2f})" for w in region_words[:150]]
        sections.extend(["", "## 재확인 대상 단어 토큰(wordId)", *word_lines])

    sections.extend(["", "반드시 요청된 JSON 형식 하나만 출력하라."])
    return "\n".join(sections)


class DocStructScaffoldAgent:
    """`docstruct-engine` 결정적 DocIR 추출 · 검증 + 정밀도별 VLM `reread` 보정 어댑터."""

    def __init__(
        self,
        *,
        policy: Optional[RuntimeExecutionPolicy] = None,
        cache_root: Optional[Path] = None,
        work_root: Optional[Path] = None,
        external_llm_enabled: bool | Callable[[], bool] = True,
        agentic_loop_enabled: bool | Callable[[], bool] = True,
        one_shot: Optional[OneShotRunner] = None,
        ocr_port: Optional[Any] = None,
        executable: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: int = 120,
    ) -> None:
        self._policy = policy
        self._cache_root = cache_root
        self._work_root = work_root
        self._external_llm_enabled = external_llm_enabled
        self._agentic_loop_enabled = agentic_loop_enabled
        self._one_shot = one_shot
        self._ocr_port = ocr_port
        self._executable = executable
        self._model = model
        self._timeout_seconds = timeout_seconds

    @contextmanager
    def _run_workspace(self) -> Iterator[Path]:
        if self._work_root is not None:
            self._work_root.mkdir(parents=True, exist_ok=True)
            run_dir = self._work_root / f"run_{uuid.uuid4().hex[:8]}"
            run_dir.mkdir(parents=True, exist_ok=True)
            try:
                yield run_dir
            finally:
                shutil.rmtree(run_dir, ignore_errors=True)
        else:
            with tempfile.TemporaryDirectory(prefix="docstruct_scaffold_") as td:
                yield Path(td)

    def _resolve_vlm_target(
        self,
        fidelity_mode: str = "balanced",
        *,
        round_num: int = 1,
    ) -> tuple[Optional[str], Optional[str], int]:
        if not _is_enabled(self._external_llm_enabled) or not _is_enabled(self._agentic_loop_enabled):
            return None, None, self._timeout_seconds
        if self._one_shot is None:
            return None, None, self._timeout_seconds
        if self._policy is not None:
            if CLI_PROVIDER not in (self._policy.primary_provider, self._policy.fallback_provider):
                return None, None, self._timeout_seconds
            cli_bin = self._executable or self._policy.agent_cli_bin or "agy"
            resolved = shutil.which(cli_bin) or shutil.which("agy")
            if self._model:
                model = self._model
            else:
                raw_model = self._policy.agent_cli_model or ""
                norm = normalize_agy_model(raw_model)
                # Round 1 은 명시적 medium/high 지정이 없을 때 -low 로 빠른 시각 판독을 수행하고,
                # Round 2 재시도(strict 에스컬레이션) 시 -medium 으로 사고 강도를 올린다.
                if (
                    round_num <= 1
                    and norm.endswith("-medium")
                    and "medium" not in raw_model.lower()
                    and "high" not in raw_model.lower()
                ):
                    model = f"{norm[:-len('-medium')]}-low"
                else:
                    model = norm
            timeout = min(self._policy.agent_cli_timeout_seconds or 180, self._timeout_seconds)
            return resolved, model, timeout
        default_model = "gemini-3.8-flash-low" if (round_num <= 1 or fidelity_mode == "balanced") else "gemini-3.8-flash-medium"
        return self._executable or shutil.which("agy"), self._model or default_model, self._timeout_seconds

    def _apply_task_patch(
        self,
        task: RereadTask,
        page_ir: PageIR,
        parsed: dict[str, Any],
        *,
        reject_count: int,
        page_obj: Optional[pymupdf.Page],
        page_png_path: Optional[Path],
        thresholds: dict[str, Any],
    ) -> tuple[PageIR, bool, bool, int, list[str]]:
        fixes = parsed.get("fixes") if isinstance(parsed.get("fixes"), list) else None
        if task.kind in ("table_read", "table_reread"):
            raw_html = parsed.get("html")
            table_html = raw_html if isinstance(raw_html, str) and "<table" in raw_html.lower() else None
            if table_html is None and not fixes:
                return page_ir, False, False, reject_count, ["표 재판독 응답에 html/fixes가 없습니다."]
            updated, res = apply_reread_patch(
                page_ir,
                block_id=task.blockId if table_html is not None else None,
                table_html=table_html,
                fixes=fixes,
                reject_count=reject_count,
                page_obj=page_obj,
                page_png_path=page_png_path,
                thresholds=thresholds,
            )
            changed = bool(res.ok or res.fallbackToImage)
            return (updated if changed else page_ir), changed, bool(res.fallbackToImage), res.rejectCount, list(res.errors)

        if task.kind == "page_blocks":
            annotations = parsed.get("annotations") if isinstance(parsed.get("annotations"), list) else None
            reading_order = parsed.get("readingOrder") if isinstance(parsed.get("readingOrder"), list) else None
            if not annotations and not reading_order and not fixes:
                return page_ir, False, False, reject_count, ["블록 분류 응답이 비어 있습니다."]
            updated, res = apply_reread_patch(
                page_ir,
                block_annotations=annotations,
                reading_order=[str(bid) for bid in reading_order] if reading_order is not None else None,
                fixes=fixes,
                reject_count=reject_count,
                thresholds=thresholds,
            )
            return (updated if res.ok else page_ir), bool(res.ok), False, res.rejectCount, list(res.errors)

        if not fixes:
            return page_ir, False, False, reject_count, ["OCR 재판독 fixes가 비어 있습니다."]
        updated, res = apply_reread_patch(
            page_ir,
            fixes=fixes,
            reject_count=reject_count,
            thresholds=thresholds,
        )
        return (updated if res.ok else page_ir), bool(res.ok), False, res.rejectCount, list(res.errors)

    def _apply_task_response(
        self,
        task: RereadTask,
        page_ir: PageIR,
        parsed: dict[str, Any],
        *,
        reject_count: int,
        page_obj: Optional[pymupdf.Page],
        page_png_path: Optional[Path],
        thresholds: dict[str, Any],
    ) -> tuple[PageIR, bool, int, list[str]]:
        updated, changed, _fallback, next_rejects, errs = self._apply_task_patch(
            task,
            page_ir,
            parsed,
            reject_count=reject_count,
            page_obj=page_obj,
            page_png_path=page_png_path,
            thresholds=thresholds,
        )
        return updated, changed, next_rejects, errs

    def _run_reread_loop(
        self,
        *,
        doc_ir: DocIR,
        pdf_path: Path,
        doc_title: str,
        fidelity_mode: str,
        cache_dir: Optional[Path],
        bundle: DocVerifyBundle,
        thresholds: dict[str, Any],
        resolved_bin: str,
        chosen_model: str,
        timeout: int,
        on_progress: Optional[Callable[[dict[str, Any]], None]],
        cancel_event: Any,
    ) -> tuple[DocIR, DocVerifyBundle, int, int, int, list[str], dict[str, Any]]:
        total_t0 = time.perf_counter()
        candidate_count = len(bundle.pendingReads)
        max_rounds = _MODE_ROUNDS.get(fidelity_mode, 1)
        th_rounds = int(thresholds.get("maxRereadRounds", 2))
        max_rounds = min(max_rounds, th_rounds)
        empty_summary: dict[str, Any] = {
            "candidateCount": candidate_count,
            "roundsRun": 0,
            "tasksAttempted": 0,
            "appliedOps": 0,
            "rejectedOps": 0,
            "errorOps": 0,
            "fallbackOps": 0,
            "elapsedMs": 0.0,
            "model": chosen_model,
            "imageTasks": 0,
        }
        if max_rounds <= 0 or self._one_shot is None:
            return doc_ir, bundle, 0, 0, 0, [], empty_summary

        sample_tables = fidelity_mode == "strict"
        reject_counts: dict[tuple[int, str], int] = {}
        rounds_run = 0
        tasks_attempted = 0
        applied_patches = 0
        rejected_ops = 0
        error_ops = 0
        fallback_ops = 0
        image_tasks = 0
        last_model = chosen_model
        warnings: list[str] = []

        def _emit_task(
            task: RereadTask,
            *,
            round_num: int,
            task_model: str,
            image_ref: str,
            image_exists: bool,
            elapsed_s: float,
            ok: bool,
            applied: bool,
            rejected: bool,
            fallback_to_image: bool,
            reject_count: int,
            errors: list[str],
            usage: dict[str, Any],
        ) -> None:
            emit_stage_event(
                "reread_task",
                page_index=task.pageIndex,
                cache_dir=cache_dir,
                metrics={
                    "taskId": task.taskId,
                    "kind": task.kind,
                    "blockId": task.blockId,
                    "round": round_num,
                    "model": task_model,
                    "imagePath": image_ref if image_exists else None,
                    "imageExists": image_exists,
                    "elapsedMs": round(elapsed_s * 1000.0, 1),
                    "durationS": elapsed_s,
                    "ok": ok,
                    "applied": applied,
                    "rejected": rejected,
                    "fallbackToImage": fallback_to_image,
                    "rejectCount": reject_count,
                    "errors": errors,
                    "usage": usage,
                },
            )

        pdf_doc = pymupdf.open(str(pdf_path))
        try:
            for round_num in range(1, max_rounds + 1):
                if _is_cancelled(cancel_event):
                    break
                tasks = reread_plan(
                    doc_ir,
                    round_num=round_num,
                    verification=bundle,
                    cache_dir=cache_dir,
                    sample_tables=sample_tables,
                    thresholds=thresholds,
                )
                if not tasks:
                    break
                if round_num == 1 and candidate_count == 0:
                    candidate_count = len(tasks)
                rounds_run = round_num
                _, round_model_opt, _ = self._resolve_vlm_target(fidelity_mode, round_num=round_num)
                round_model = round_model_opt or chosen_model
                last_model = round_model
                page_map = {p.pageIndex: idx for idx, p in enumerate(doc_ir.pages)}

                for t_idx, task in enumerate(tasks, start=1):
                    if _is_cancelled(cancel_event):
                        break
                    list_idx = page_map.get(task.pageIndex)
                    if list_idx is None:
                        continue
                    page_ir = doc_ir.pages[list_idx]
                    tasks_attempted += 1
                    image_ref, image_exists = _resolve_task_image(task, page_ir.pageIndex, cache_dir)
                    if image_exists:
                        image_tasks += 1
                    _emit(
                        on_progress,
                        {
                            "stage": "rereading",
                            "iter": round_num,
                            "message": f"VLM 정밀 재판독 {round_num}차 ({t_idx}/{len(tasks)}): {task.kind}",
                        },
                    )
                    prompt_text = _build_reread_prompt(task, page_ir, doc_title=doc_title, cache_dir=cache_dir)
                    t0 = time.perf_counter()
                    try:
                        res = self._one_shot(
                            prompt_text,
                            executable=resolved_bin,
                            model=round_model,
                            timeout_seconds=timeout,
                        )
                    except Exception as exc:
                        elapsed_s = round(time.perf_counter() - t0, 3)
                        error_ops += 1
                        logger.warning("[DocStructScaffoldAgent] reread one_shot failed (%.2fs): %s", elapsed_s, exc)
                        _emit_task(
                            task,
                            round_num=round_num,
                            task_model=round_model,
                            image_ref=image_ref,
                            image_exists=image_exists,
                            elapsed_s=elapsed_s,
                            ok=False,
                            applied=False,
                            rejected=False,
                            fallback_to_image=False,
                            reject_count=reject_counts.get((task.pageIndex, task.blockId or task.kind), 0),
                            errors=[type(exc).__name__],
                            usage={},
                        )
                        warnings.append(f"VLM 재판독 호출 실패 ({task.kind}): {type(exc).__name__}")
                        continue
                    elapsed_s = round(time.perf_counter() - t0, 3)
                    usage = dict(getattr(res, "usage", None) or {})
                    rkey = (task.pageIndex, task.blockId or task.kind)
                    prev_rejects = reject_counts.get(rkey, 0)

                    if _is_cancelled(cancel_event):
                        error_ops += 1
                        _emit_task(
                            task,
                            round_num=round_num,
                            task_model=round_model,
                            image_ref=image_ref,
                            image_exists=image_exists,
                            elapsed_s=elapsed_s,
                            ok=False,
                            applied=False,
                            rejected=False,
                            fallback_to_image=False,
                            reject_count=prev_rejects,
                            errors=["cancelled"],
                            usage=usage,
                        )
                        break
                    if not getattr(res, "ok", False):
                        error_ops += 1
                        err = str(getattr(res, "error", "") or "unknown")[:160]
                        _emit_task(
                            task,
                            round_num=round_num,
                            task_model=round_model,
                            image_ref=image_ref,
                            image_exists=image_exists,
                            elapsed_s=elapsed_s,
                            ok=False,
                            applied=False,
                            rejected=False,
                            fallback_to_image=False,
                            reject_count=prev_rejects,
                            errors=[err],
                            usage=usage,
                        )
                        warnings.append(f"VLM 재판독 오류 ({task.kind}): {err}")
                        continue

                    raw_response = getattr(res, "response", None)
                    parsed = raw_response if isinstance(raw_response, dict) else parse_json_text(str(raw_response or ""))
                    if not isinstance(parsed, dict):
                        error_ops += 1
                        _emit_task(
                            task,
                            round_num=round_num,
                            task_model=round_model,
                            image_ref=image_ref,
                            image_exists=image_exists,
                            elapsed_s=elapsed_s,
                            ok=False,
                            applied=False,
                            rejected=False,
                            fallback_to_image=False,
                            reject_count=prev_rejects,
                            errors=["JSON_PARSE_FAILED"],
                            usage=usage,
                        )
                        warnings.append(f"VLM 재판독 JSON 파싱 실패 ({task.kind})")
                        continue

                    p_obj = pdf_doc[task.pageIndex - 1] if 1 <= task.pageIndex <= len(pdf_doc) else None
                    page_png = cache_dir / f"p{task.pageIndex}.png" if cache_dir is not None else None
                    updated_page, applied, fallback_to_image, next_rejects, errs = self._apply_task_patch(
                        task,
                        page_ir,
                        parsed,
                        reject_count=prev_rejects,
                        page_obj=p_obj,
                        page_png_path=page_png if (page_png and page_png.is_file()) else None,
                        thresholds=thresholds,
                    )
                    reject_counts[rkey] = next_rejects
                    if applied:
                        doc_ir.pages[list_idx] = updated_page
                        applied_patches += 1
                        if fallback_to_image:
                            fallback_ops += 1
                        if cache_dir is not None:
                            save_page_ir(cache_dir, updated_page)
                    else:
                        rejected_ops += 1
                        if errs:
                            warnings.append(f"{task.kind} 패치 보류: {errs[0]}")

                    _emit_task(
                        task,
                        round_num=round_num,
                        task_model=round_model,
                        image_ref=image_ref,
                        image_exists=image_exists,
                        elapsed_s=elapsed_s,
                        ok=True,
                        applied=applied,
                        rejected=not applied,
                        fallback_to_image=fallback_to_image,
                        reject_count=next_rejects,
                        errors=errs,
                        usage=usage,
                    )

                bundle = verify_doc(doc_ir, thresholds=thresholds)
                if not bundle.pendingReads:
                    break
        finally:
            pdf_doc.close()

        summary: dict[str, Any] = {
            "candidateCount": candidate_count,
            "roundsRun": rounds_run,
            "tasksAttempted": tasks_attempted,
            "appliedOps": applied_patches,
            "rejectedOps": rejected_ops,
            "errorOps": error_ops,
            "fallbackOps": fallback_ops,
            "elapsedMs": round((time.perf_counter() - total_t0) * 1000.0, 1),
            "model": last_model,
            "imageTasks": image_tasks,
        }
        return doc_ir, bundle, rounds_run, tasks_attempted, applied_patches, warnings, summary

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
        fidelity_mode: str = "balanced",
        on_progress: Optional[Callable[[dict[str, Any]], None]] = None,
        cancel_event: Any = None,
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]:
        """PDF 바이트를 `docstruct-engine` + `docstruct_vdoc` 으로 스캐폴딩하여 (.vdoc, 블록수, 슬롯수, 실행정보) 반환."""
        if not pdf_bytes:
            raise ValueError("PDF payload is empty")

        doc_title = (title or "").strip() or "추출된 양식 문서"
        mode = fidelity_mode if fidelity_mode in _MODE_ROUNDS else "balanced"

        if _is_cancelled(cancel_event):
            empty_vdoc, blk_cnt, slot_cnt = finalize_vdoc_envelope(
                {"pages": [], "slots": {}}, doc_id=doc_id, title=doc_title
            )
            return empty_vdoc, blk_cnt, slot_cnt, {"status": "cancelled", "engine": "docstruct-engine"}

        thresholds = load_thresholds()
        ocr_port = self._ocr_port if self._ocr_port is not None else default_ocr_port()
        resolved_bin, chosen_model, timeout = self._resolve_vlm_target(mode)
        want_vlm = mode != "fast" and bool(resolved_bin and chosen_model)

        with self._run_workspace() as tmp_root:
            pdf_path = tmp_root / "source.pdf"
            effective_cache_root = self._cache_root if self._cache_root is not None else (tmp_root / "cache")

            _emit(
                on_progress,
                {
                    "stage": "extracting",
                    "iter": 0,
                    "message": "DocIR 기반 문서 구조 · 표 격자 추출 중",
                },
            )
            doc_ir, cache_dir = build_doc_ir_from_pdf_bytes(
                pdf_bytes,
                doc_path=pdf_path,
                cache_root=effective_cache_root,
                ocr_port=ocr_port,
                thresholds=thresholds,
                render_png=(mode != "fast"),
            )
            if _is_cancelled(cancel_event):
                raw_vdoc, _ = doc_ir_to_vdoc(doc_ir, doc_id=doc_id, title=doc_title)
                vdoc_doc, blk_cnt, slot_cnt = finalize_vdoc_envelope(raw_vdoc, doc_id=doc_id, title=doc_title)
                return vdoc_doc, blk_cnt, slot_cnt, {"status": "cancelled", "engine": "docstruct-engine"}

            bundle = verify_doc(doc_ir, thresholds=thresholds)
            pending_cnt = len(bundle.pendingReads)
            _emit(
                on_progress,
                {
                    "stage": "verified" if pending_cnt == 0 else "evaluating",
                    "iter": 0,
                    "verdict": "PASS" if bundle.report.passed else "NEEDS_REVIEW",
                    "message": (
                        "1차 구조 검증 통과"
                        if pending_cnt == 0
                        else f"1차 구조 검증 완료 (재검토 대상 {pending_cnt}건)"
                    ),
                },
            )

            rounds_run = 0
            tasks_attempted = 0
            applied_patches = 0
            reread_warnings: list[str] = []
            reread_summary: dict[str, Any] = {
                "candidateCount": pending_cnt,
                "roundsRun": 0,
                "tasksAttempted": 0,
                "appliedOps": 0,
                "rejectedOps": 0,
                "errorOps": 0,
                "fallbackOps": 0,
                "elapsedMs": 0.0,
                "model": chosen_model if want_vlm else None,
                "imageTasks": 0,
            }
            if want_vlm and resolved_bin and chosen_model and (bundle.pendingReads or mode == "strict"):
                (
                    doc_ir,
                    bundle,
                    rounds_run,
                    tasks_attempted,
                    applied_patches,
                    reread_warnings,
                    reread_summary,
                ) = self._run_reread_loop(
                    doc_ir=doc_ir,
                    pdf_path=pdf_path,
                    doc_title=doc_title,
                    fidelity_mode=mode,
                    cache_dir=cache_dir,
                    bundle=bundle,
                    thresholds=thresholds,
                    resolved_bin=resolved_bin,
                    chosen_model=chosen_model,
                    timeout=timeout,
                    on_progress=on_progress,
                    cancel_event=cancel_event,
                )

            emit_stage_event("reread_summary", metrics=reread_summary, cache_dir=cache_dir)
            logger.info(
                "[DocStructScaffoldAgent] reread_summary docId=%s mode=%s model=%s candidates=%d rounds=%d attempted=%d applied=%d rejected=%d errors=%d fallback=%d imageTasks=%d elapsedMs=%.1f",
                doc_id,
                mode,
                reread_summary["model"] or "-",
                reread_summary["candidateCount"],
                reread_summary["roundsRun"],
                reread_summary["tasksAttempted"],
                reread_summary["appliedOps"],
                reread_summary["rejectedOps"],
                reread_summary["errorOps"],
                reread_summary["fallbackOps"],
                reread_summary["imageTasks"],
                reread_summary["elapsedMs"],
            )

            if _is_cancelled(cancel_event):
                raw_vdoc, _ = doc_ir_to_vdoc(doc_ir, doc_id=doc_id, title=doc_title)
                vdoc_doc, blk_cnt, slot_cnt = finalize_vdoc_envelope(raw_vdoc, doc_id=doc_id, title=doc_title)
                return vdoc_doc, blk_cnt, slot_cnt, {"status": "cancelled", "engine": "docstruct-engine"}

            _emit(
                on_progress,
                {
                    "stage": "compiling",
                    "iter": rounds_run,
                    "message": ".vdoc 블록 및 슬롯 컴파일 중",
                },
            )
            raw_vdoc, _reports = doc_ir_to_vdoc(doc_ir, doc_id=doc_id, title=doc_title)
            vdoc_doc, checked_blocks, checked_slots = finalize_vdoc_envelope(
                raw_vdoc,
                doc_id=doc_id,
                title=doc_title,
            )

            gate_failures = [f for pg in bundle.report.pages for f in pg.gateFailures]
            warnings = list(reread_warnings)
            for gf in gate_failures:
                if gf not in warnings:
                    warnings.append(f"검증 경고: {gf}")
            if checked_blocks == 0:
                warnings.append("추출된 텍스트/표 블록이 없습니다. 원본 PDF의 스캔 상태 및 텍스트 레이어를 확인하세요.")

            verdict = "PASS" if (bundle.report.passed and checked_blocks > 0) else (
                "NEEDS_REVIEW" if checked_blocks > 0 else "EMPTY"
            )
            doc_metrics = summarize_doc_metrics(doc_ir, bundle.pendingReads)
            doc_metrics["pageRulingF1"] = {str(p.pageIndex): round(p.rulingLineF1, 4) for p in bundle.report.pages}
            doc_metrics["vdocBlocks"] = checked_blocks
            doc_metrics["vdocSlots"] = checked_slots
            emit_stage_event("compile_vdoc", metrics=doc_metrics, cache_dir=cache_dir)
            logger.info(
                "[DocStructScaffoldAgent] completed docId=%s mode=%s verdict=%s blocks=%d slots=%d tables=%d pending=%d",
                doc_id,
                mode,
                verdict,
                checked_blocks,
                checked_slots,
                doc_metrics["totalTables"],
                doc_metrics["pendingReadCount"],
            )
            agent_run: dict[str, Any] = {
                "status": "completed" if checked_blocks > 0 else "empty_blocks",
                "engine": "docstruct-engine",
                "fidelityMode": mode,
                "rounds": rounds_run,
                "rereadTasks": tasks_attempted,
                "appliedPatches": applied_patches,
                "pendingReads": len(bundle.pendingReads),
                "sourceKinds": [p.sourceKind for p in doc_ir.pages],
                "metrics": doc_metrics,
                "rereadSummary": reread_summary,
                "best": {
                    "verdict": verdict,
                    "spanScore": None,
                },
                "warnings": warnings,
            }
            return vdoc_doc, checked_blocks, checked_slots, agent_run

