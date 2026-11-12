"""Automated PageIR / DocIR self-verification and pendingReads triage queue generation."""
from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from ..config import load_thresholds
from ..ir.model import BBox, DocIR, PageIR, Ruling, TableIR, Word, point_in_bbox
from ..ir.validate import validate_page_ir
from ..telemetry import emit_stage_event, summarize_doc_metrics
from .layout_checks import evaluate_page_layout, summarize_layout_suite
from .lines import compare_rulings, table_grid_lines
from .report import EvalReport, PageVerifyReport


class PendingReadItem(BaseModel):
    pageIndex: int
    kind: Literal["table_reread", "page_blocks", "ocr_review"]
    blockId: Optional[str] = None
    bbox: Optional[BBox] = None
    reasons: list[str] = Field(default_factory=list)
    priority: int = 1


class DocVerifyBundle(BaseModel):
    report: EvalReport
    pendingReads: list[PendingReadItem] = Field(default_factory=list)


def _is_inline_text_underline(r: Ruling, tables: list[TableIR], words: list[Word]) -> bool:
    """Return True when a horizontal interior stroke sits directly under printed text as an underline."""
    if r.orient != "h" or not words:
        return False
    r_len = r.x1 - r.x0
    if r_len <= 0.0:
        return False
    ry = (r.y0 + r.y1) * 0.5
    host: Optional[TableIR] = None
    mid = ((r.x0 + r.x1) * 0.5, ry)
    for t in tables:
        if t.bbox is None or not point_in_bbox(mid, t.bbox, tol=4.0):
            continue
        if ry <= t.bbox[1] + 3.0 or ry >= t.bbox[3] - 3.0:
            continue
        if any(abs(ry - gy) <= 2.5 for gy in t.rowYs):
            return False
        host = t
        break
    if host is None or host.bbox is None:
        return False

    spans: list[tuple[float, float]] = []
    for w in words:
        if w.bbox is None:
            continue
        # VLM 셀 병합/보정(`rw.text = ""`, `rw.src = "vlm"`)으로 후행 단어 텍스트가 비어도
        # 원본 PDF 글리프 bbox 는 밑줄 위 인쇄 문자로 유지되므로 제외하지 않는다.
        if not w.text.strip() and w.src != "vlm":
            continue
        wx0, wy0, wx1, wy1 = w.bbox
        wh = wy1 - wy0
        if wh < 4.0:
            continue
        if not (wy0 + 0.25 * wh <= ry <= wy1 + 0.8):
            continue
        ix0 = max(r.x0, wx0)
        ix1 = min(r.x1, wx1)
        if ix1 > ix0:
            spans.append((ix0, ix1))
    if not spans:
        return False
    spans.sort()
    covered = 0.0
    cur0, cur1 = spans[0]
    for a, b in spans[1:]:
        if a <= cur1 + 1.5:
            cur1 = max(cur1, b)
        else:
            covered += cur1 - cur0
            cur0, cur1 = a, b
    covered += cur1 - cur0
    return (covered / r_len) >= 0.40


def _table_area_rulings(
    rulings: list[Ruling],
    tables: list[TableIR],
    *,
    tol_pt: float = 4.0,
    words: Optional[list[Word]] = None,
    filtered_out: Optional[dict[str, int]] = None,
) -> list[Ruling]:
    if not tables:
        return []
    out: list[Ruling] = []
    underline_cnt = 0
    for r in rulings:
        mid = ((r.x0 + r.x1) * 0.5, (r.y0 + r.y1) * 0.5)
        if any(t.bbox is not None and point_in_bbox(mid, t.bbox, tol=tol_pt) for t in tables):
            if words and _is_inline_text_underline(r, tables, words):
                underline_cnt += 1
                continue
            out.append(r)
    if filtered_out is not None:
        filtered_out["underlines"] = underline_cnt
    return out


def verify_page(
    page: PageIR,
    *,
    raw_rulings: Optional[list[Ruling]] = None,
    thresholds: Optional[dict[str, Any]] = None,
    layout_truth: Optional[Any] = None,
    vdoc_page: Optional[dict[str, Any]] = None,
    vdoc_slots: Optional[dict[str, Any]] = None,
    compiled_report: Optional[Any] = None,
) -> tuple[PageVerifyReport, list[PendingReadItem]]:
    """Verify invariants #1-#6, table ruling F1, and OCR confidence; return pendingReads tasks."""
    th = thresholds or load_thresholds()
    tol_pt = float(th.get("containmentTolPt", 2.0))
    orphan_inset = float(th.get("orphanInsetPt", 1.0))
    is_scan = page.sourceKind in ("pdf-scan", "pdf-hybrid", "image")
    f1_min = float(th.get("rulingScanLineF1Min", 0.85) if is_scan else th.get("rulingLineF1Min", 0.90))
    ocr_min = float(th.get("ocrConfMin", 0.65))

    val_res = validate_page_ir(page, containment_tol_pt=tol_pt, orphan_inset_pt=orphan_inset)

    tables = [b for b in page.blocks if isinstance(b, TableIR)]
    all_rulings = raw_rulings if raw_rulings is not None else page.rulings
    filter_stats: dict[str, int] = {}
    gold_table_rulings = _table_area_rulings(all_rulings, tables, words=page.words, filtered_out=filter_stats)
    pred_table_rulings = [r for t in tables for r in table_grid_lines(t)]

    if tables and gold_table_rulings:
        line_res = compare_rulings(pred_table_rulings, gold_table_rulings)
        ruling_f1 = line_res.f1
        missing_boxes = list(line_res.missingBoxes)
    else:
        ruling_f1 = 1.0
        missing_boxes = []

    confs = [w.conf for w in page.words if w.src == "ocr" or w.needsReview]
    all_confs = [w.conf for w in page.words]
    ocr_mean = round(sum(all_confs) / len(all_confs), 4) if (all_confs and (is_scan or confs)) else None
    low_conf_words = [w for w in page.words if w.conf < ocr_min or w.needsReview]

    gate_failures: list[str] = []
    if not val_res.ok:
        gate_failures.append("INVARIANTS_FAILED")
    if tables and gold_table_rulings and ruling_f1 < f1_min:
        gate_failures.append(f"RULING_LINE_F1_LOW:{ruling_f1:.3f}<{f1_min:.2f}")
    if ocr_mean is not None and ocr_mean < ocr_min:
        gate_failures.append(f"OCR_CONF_LOW:{ocr_mean:.3f}<{ocr_min:.2f}")

    pending: list[PendingReadItem] = []
    queued_tables: set[str] = set()

    for tid in val_res.failedTables:
        tbl = next((t for t in tables if t.id == tid), None)
        if tbl and not tbl.imageFallbackSrc:
            queued_tables.add(tid)
            pending.append(
                PendingReadItem(
                    pageIndex=page.pageIndex,
                    kind="table_reread",
                    blockId=tid,
                    bbox=tbl.bbox,
                    reasons=["TABLE_INVARIANT_FAILED"],
                    priority=0,
                )
            )

    for tbl in tables:
        if tbl.id in queued_tables or tbl.imageFallbackSrc:
            continue
        if tbl.needsReview or (ruling_f1 < f1_min and gold_table_rulings):
            queued_tables.add(tbl.id)
            reasons = []
            if tbl.needsReview:
                reasons.append("TABLE_NEEDS_REVIEW")
            if ruling_f1 < f1_min and gold_table_rulings:
                reasons.append(f"RULING_F1:{ruling_f1:.3f}")
            pending.append(
                PendingReadItem(
                    pageIndex=page.pageIndex,
                    kind="table_reread",
                    blockId=tbl.id,
                    bbox=tbl.bbox,
                    reasons=reasons,
                    priority=1,
                )
            )

    non_table_needs_review = any(
        getattr(b, "needsReview", False) for b in page.blocks if not isinstance(b, TableIR)
    )
    if val_res.orphanWordIds or non_table_needs_review or (is_scan and len(low_conf_words) > 0):
        reasons = []
        if val_res.orphanWordIds:
            reasons.append(f"ORPHAN_WORDS:{len(val_res.orphanWordIds)}")
        if non_table_needs_review:
            reasons.append("BLOCKS_NEEDS_REVIEW")
        if is_scan and low_conf_words:
            reasons.append(f"LOW_OCR_CONF:{len(low_conf_words)}")
        pending.append(
            PendingReadItem(
                pageIndex=page.pageIndex,
                kind="page_blocks",
                blockId=None,
                bbox=(0.0, 0.0, page.size.width, page.size.height),
                reasons=reasons,
                priority=2,
            )
        )

    layout_rep = None
    if layout_truth is not None and vdoc_page is not None and vdoc_slots is not None:
        layout_rep = evaluate_page_layout(
            layout_truth,
            page,
            vdoc_page,
            vdoc_slots,
            compiled_report=compiled_report,
            thresholds=th,
        )
        if not layout_rep.ok:
            stage = layout_rep.firstFailingStage
            if layout_rep.reasons:
                for rs in layout_rep.reasons:
                    gate_failures.append(f"LAYOUT_{stage}:{rs}")
            else:
                fail_issues = [
                    iss
                    for st in layout_rep.stages
                    if not st.ok
                    for iss in st.issues
                ]
                gate_failures.append(f"LAYOUT_{stage}:{','.join(fail_issues) or 'FAILED'}")

            # WP7: Enqueue layout rereads ONLY when root cause is C1 (measurement/typography/table bounds),
            # never for C3/C4 compiler/rendering issues that vision reread cannot fix.
            if stage == "C1":
                has_l2 = any(r.startswith("L2_") for r in layout_rep.reasons)
                has_l4 = any(r.startswith("L4_") for r in layout_rep.reasons)
                if has_l2:
                    c3_issues = next((st.issues for st in layout_rep.stages if st.stage == "C3"), [])
                    bad_tidxs: set[int] = set()
                    for iss in c3_issues:
                        m = re.search(r":t(\d+)r\d+c\d+", iss)
                        if m:
                            bad_tidxs.add(int(m.group(1)))
                    target_tables = [
                        tbl
                        for ti, tbl in enumerate(tables)
                        if (not bad_tidxs or ti in bad_tidxs)
                        and tbl.id not in queued_tables
                        and not tbl.imageFallbackSrc
                        and tbl.bbox is not None
                    ]
                    for tbl in target_tables:
                        queued_tables.add(tbl.id)
                        pending.append(
                            PendingReadItem(
                                pageIndex=page.pageIndex,
                                kind="table_reread",
                                blockId=tbl.id,
                                bbox=tbl.bbox,
                                reasons=["C1_LAYOUT_CELL_MEASURE"],
                                priority=1,
                            )
                        )
                if has_l4 and not any(it.kind == "page_blocks" and it.pageIndex == page.pageIndex for it in pending):
                    pending.append(
                        PendingReadItem(
                            pageIndex=page.pageIndex,
                            kind="page_blocks",
                            blockId=None,
                            bbox=(0.0, 0.0, page.size.width, page.size.height),
                            reasons=["C1_LAYOUT_FONT_MEASURE"],
                            priority=2,
                        )
                    )

    p_report = PageVerifyReport(
        pageIndex=page.pageIndex,
        sourceKind=page.sourceKind,
        ok=(len(gate_failures) == 0 and len(pending) == 0 and (layout_rep.ok if layout_rep is not None else True)),
        rulingLineF1=ruling_f1,
        ocrConfMean=ocr_mean,
        lowConfWordCount=len(low_conf_words),
        validation=val_res,
        missingLineBoxes=missing_boxes,
        gateFailures=gate_failures,
        layoutReport=layout_rep,
    )
    emit_stage_event(
        "verify_page",
        page_index=page.pageIndex,
        metrics={
            "ok": p_report.ok,
            "rulingLineF1": round(ruling_f1, 4),
            "missingLineBoxes": len(missing_boxes),
            "filteredUnderlines": filter_stats.get("underlines", 0),
            "pendingReads": [f"{it.kind}:{it.blockId or '-'}" for it in pending],
            "gateFailures": gate_failures,
            "layoutOk": layout_rep.ok if layout_rep is not None else None,
            "layoutFirstFailingStage": layout_rep.firstFailingStage if layout_rep is not None else None,
        },
    )
    return p_report, pending


def verify_doc(
    doc: DocIR,
    *,
    thresholds: Optional[dict[str, Any]] = None,
    include_layout: bool = True,
) -> DocVerifyBundle:
    """Run automated verification across every page of `DocIR` and build `pendingReads` queue."""
    th = thresholds or load_thresholds()
    page_reports: list[PageVerifyReport] = []
    all_pending: list[PendingReadItem] = []

    vdoc_pages_by_idx: dict[int, dict[str, Any]] = {}
    creps_by_idx: dict[int, Any] = {}
    vdoc_slots: dict[str, Any] = {}
    truths_by_idx: dict[int, Any] = {}

    if include_layout and doc.pages and doc.sourcePath and str(doc.sourcePath).lower().endswith(".pdf"):
        src_p = Path(str(doc.sourcePath))
        if src_p.is_file():
            try:
                from ..compile.docstruct_vdoc import doc_ir_to_vdoc
                from .layout_truth import extract_doc_layout_truth

                bg_cover = float((th.get("layout") or {}).get("pageBgCoverRatio", 0.75))
                vdoc, creps = doc_ir_to_vdoc(doc, doc_id=doc.docId, title=doc.title)
                vdoc_slots = vdoc.get("slots") or {}
                for pir, vpg, crep in zip(doc.pages, vdoc.get("pages") or [], creps):
                    vdoc_pages_by_idx[pir.pageIndex] = vpg
                    creps_by_idx[pir.pageIndex] = crep
                truths = extract_doc_layout_truth(
                    src_p,
                    page_indices=[p.pageIndex for p in doc.pages],
                    bg_cover_ratio=bg_cover,
                )
                truths_by_idx = {tr.pageIndex: tr for tr in truths}
            except Exception:
                truths_by_idx = {}

    for p in doc.pages:
        prep, pending = verify_page(
            p,
            thresholds=th,
            layout_truth=truths_by_idx.get(p.pageIndex),
            vdoc_page=vdoc_pages_by_idx.get(p.pageIndex),
            vdoc_slots=vdoc_slots if truths_by_idx.get(p.pageIndex) is not None else None,
            compiled_report=creps_by_idx.get(p.pageIndex),
        )
        page_reports.append(prep)
        all_pending.extend(pending)

    passed = all(p.ok and not p.gateFailures for p in page_reports)
    doc_metrics = summarize_doc_metrics(doc, all_pending)
    doc_metrics["pageRulingF1"] = {str(p.pageIndex): round(p.rulingLineF1, 4) for p in page_reports}
    layout_reps = [p.layoutReport for p in page_reports if p.layoutReport is not None]
    if layout_reps:
        doc_metrics["layoutSummary"] = summarize_layout_suite(layout_reps)
    eval_rep = EvalReport(
        docId=doc.docId,
        pages=page_reports,
        passed=passed,
        summary={
            "pageCount": len(page_reports),
            "pendingReads": len(all_pending),
            "failedPages": [p.pageIndex for p in page_reports if not p.ok],
            "docMetrics": doc_metrics,
        },
    )
    emit_stage_event(
        "verify_doc",
        metrics={
            "passed": passed,
            "pendingReads": len(all_pending),
            "failedPages": eval_rep.summary["failedPages"],
            "pageRulingF1": doc_metrics["pageRulingF1"],
        },
    )
    return DocVerifyBundle(report=eval_rep, pendingReads=all_pending)

