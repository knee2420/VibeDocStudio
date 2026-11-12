"""Unified C1 / C2 / C3 (+ optional C4) layout fidelity evaluation and stage diagnosis."""
from __future__ import annotations

import re
import statistics
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from ..ir.model import FigureBlock, NoteBlock, PageIR, TableIR, bbox_iou
from .layout_measure import MeasuredPageDOM
from .layout_predict import PX_PER_PT, PageLayoutPrediction, predict_vdoc_page_layout
from .layout_truth import PageLayoutTruth

StageName = Literal["NONE", "C1", "C2", "C3", "C4"]
_TAG_RE = re.compile(r"<[^>]+>")
_INLINE_FS_RE = re.compile(r"font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px", re.IGNORECASE)


def _collect_page_font_sizes_pt(
    vdoc_page: dict[str, Any],
    slots: dict[str, Any],
    dom_pt: float,
) -> set[float]:
    """Collect every emitted font size (pt) referenced by blocks, cells, chrome, and inline styles on one page."""
    pts: set[float] = {round(dom_pt, 1)}
    slot_ids: list[str] = []
    for key in ("headerSlotId", "footerSlotId"):
        sid = vdoc_page.get(key)
        if sid:
            slot_ids.append(str(sid))

    def _add_px_str(raw: Any) -> None:
        if raw and str(raw).strip().lower().endswith("px"):
            try:
                pts.add(round(float(str(raw).strip()[:-2]) / PX_PER_PT, 1))
            except ValueError:
                pass

    for blk in vdoc_page.get("blocks") or []:
        if blk.get("slotId"):
            slot_ids.append(str(blk["slotId"]))
        for col in blk.get("columns") or []:
            if col.get("slotId"):
                slot_ids.append(str(col["slotId"]))
        for row in blk.get("rows") or []:
            for cell in row.get("cells") or []:
                _add_px_str(cell.get("fontSize"))
                if cell.get("slotId"):
                    slot_ids.append(str(cell["slotId"]))

    for sid in slot_ids:
        slot = slots.get(sid)
        if not slot:
            continue
        _add_px_str((slot.get("constraints") or {}).get("fontSize"))
        content = str(slot.get("content") or "")
        for m in _INLINE_FS_RE.finditer(content):
            try:
                pts.add(round(float(m.group(1)) / PX_PER_PT, 1))
            except ValueError:
                pass
    return pts


def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", s or "")).strip()


def _parse_lh(raw: Any) -> Optional[float]:
    if raw is None or raw == "":
        return None
    s = str(raw).strip().lower()
    if s.endswith("px") or s.endswith("pt"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _norm_hex(col: Optional[str]) -> str:
    return (col or "").strip().lower()


def _color_close(a: Optional[str], b: Optional[str], tol: int = 24) -> bool:
    ha = _norm_hex(a)
    hb = _norm_hex(b)
    if not ha or not hb or not ha.startswith("#") or not hb.startswith("#"):
        return ha == hb and bool(ha)
    if len(ha) == 4:
        ha = "#" + "".join(ch * 2 for ch in ha[1:])
    if len(hb) == 4:
        hb = "#" + "".join(ch * 2 for ch in hb[1:])
    if len(ha) != 7 or len(hb) != 7:
        return ha == hb
    try:
        ra, ga, ba = int(ha[1:3], 16), int(ha[3:5], 16), int(ha[5:7], 16)
        rb, gb, bb = int(hb[1:3], 16), int(hb[3:5], 16), int(hb[5:7], 16)
    except ValueError:
        return ha == hb
    return abs(ra - rb) <= tol and abs(ga - gb) <= tol and abs(ba - bb) <= tol


class StageDiagnosis(BaseModel):
    stage: Literal["C1", "C2", "C3", "C4"]
    ok: bool
    issues: list[str] = Field(default_factory=list)


class LayoutPageReport(BaseModel):
    pageIndex: int
    isScan: bool = False
    ok: bool = True
    firstFailingStage: StageName = "NONE"
    l1Overflow: bool = False
    l1OverflowPx: float = 0.0
    l2TableCellLineMatch: float = 1.0
    l3LineGroupF1: float = 1.0
    l4FontSizeMatch: float = 1.0
    l5SpacingMatch: float = 1.0
    l6PhotoTextPollution: float = 0.0
    l7RowHeightMatch: float = 1.0
    a1BgMatch: float = 1.0
    a2PageBgOk: bool = True
    a3HeaderFooterOk: bool = True
    falseTableCount: int = 0
    stages: list[StageDiagnosis] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    prediction: Optional[PageLayoutPrediction] = None


def check_c1_acquire(page_ir: PageIR, truth: PageLayoutTruth, th: dict[str, Any]) -> StageDiagnosis:
    """Verify C1 acquire fidelity (word/font/photo separation) against C0 truth."""
    issues: list[str] = []
    # L6: Check if acquired words exist inside C0 photo regions without being marked keepText figures.
    if truth.photoRegions:
        fig_boxes = [b.bbox for b in page_ir.blocks if isinstance(b, FigureBlock) and b.bbox is not None]
        if not fig_boxes:
            issues.append(f"C1_PHOTO_MISSED:{len(truth.photoRegions)}")
        polluted_words = 0
        for w in page_ir.words:
            if w.bbox is None:
                continue
            cx = (w.bbox[0] + w.bbox[2]) * 0.5
            cy = (w.bbox[1] + w.bbox[3]) * 0.5
            in_photo = any(
                pr.bbox[0] <= cx <= pr.bbox[2] and pr.bbox[1] <= cy <= pr.bbox[3]
                for pr in truth.photoRegions
            )
            if in_photo:
                polluted_words += 1
        if polluted_words > 0:
            issues.append(f"C1_PHOTO_OCR_POLLUTION:{polluted_words}")

    # L4 C1 check: scan or vector word sizes vs C0 truth
    if truth.dominantFontSizePt is not None and page_ir.words:
        sizes = [float(w.size) for w in page_ir.words if w.size is not None and float(w.size) > 0]
        if sizes:
            sizes_sorted = sorted(sizes)
            med_w_size = sizes_sorted[len(sizes_sorted) // 2]
            tol_ratio = 0.25 if truth.isScan else 0.15
            if abs(med_w_size - truth.dominantFontSizePt) / max(6.0, truth.dominantFontSizePt) > tol_ratio:
                issues.append(f"C1_FONT_SIZE_DRIFT:{med_w_size:.1f}vs{truth.dominantFontSizePt:.1f}")

    return StageDiagnosis(stage="C1", ok=len(issues) == 0, issues=issues)


def check_c2_ir_emit(
    page_ir: PageIR,
    truth: PageLayoutTruth,
    vdoc_page: dict[str, Any],
    slots: dict[str, Any],
    th: dict[str, Any],
) -> StageDiagnosis:
    """Verify C2 IR grouping + vdoc emission against C0 truth."""
    issues: list[str] = []
    vblocks = list(vdoc_page.get("blocks") or [])
    layout = vdoc_page.get("layout") or {}

    # 1. False tables when C0 has no ruled tables (e.g. TOC / columns misdetected as borderless TableIR)
    ir_tables = [b for b in page_ir.blocks if isinstance(b, TableIR)]
    if not truth.tables and len(ir_tables) > 0:
        issues.append(f"C2_FALSE_TABLES:{len(ir_tables)}")

    # 2. Horizontal split lines -> columns-grid / multi-col group missing
    grid_blocks = [b for b in vblocks if b.get("kind") == "columns-grid"]
    if truth.horizontalGroupCount > 0 and len(grid_blocks) == 0:
        issues.append(f"C2_MISSING_LINE_GROUPS:{truth.horizontalGroupCount}")

    # 3. Paragraph splitting / spacing emission check
    if len(truth.paraGapsPt) >= 2:
        text_blocks = [b for b in vblocks if b.get("kind") in {"text", "heading", "form-title"}]
        if len(text_blocks) <= 1 and len(truth.lines) >= 3:
            issues.append("C2_MERGED_FLOW_PARAGRAPHS")

    # 4. Page background panel
    if truth.pageBgColor:
        emitted_bg = _norm_hex(layout.get("background"))
        if not emitted_bg or not _color_close(emitted_bg, truth.pageBgColor, tol=24):
            issues.append(f"C2_MISSING_PAGE_BG:{truth.pageBgColor}")

    # 5. Repeated running header/footer check
    if truth.repeatedHeader:
        has_ir_hdr = any(isinstance(b, NoteBlock) and b.noteKind == "header" for b in page_ir.blocks)
        hdr_slot = slots.get(str(vdoc_page.get("headerSlotId") or "")) or {}
        hdr_html = str(hdr_slot.get("content") or "")
        has_vdoc_hdr = bool(_strip_html(hdr_html)) or (
            bool(vdoc_page.get("headerSlotId")) and not vdoc_page.get("hideHeaderFooter", True)
        )
        logo_ok = (not truth.hasTopImageBand) or ("<img" in hdr_html)
        if not ((has_ir_hdr or has_vdoc_hdr) and logo_ok):
            issues.append("C2_MISSING_RUNNING_HEADER")
    if truth.repeatedFooter:
        has_ir_ftr = any(isinstance(b, NoteBlock) and b.noteKind == "footer" for b in page_ir.blocks)
        if not has_ir_ftr and vdoc_page.get("hideHeaderFooter", True):
            issues.append("C2_MISSING_RUNNING_FOOTER")

    # 6. Line height emission vs C0 truth
    if truth.lineSpacingRatio is not None:
        pred_lh = _parse_lh(layout.get("lineHeight"))
        max_dev = float((th.get("layout") or {}).get("lineHeightDeviationMax", 0.15))
        if pred_lh is None or abs(pred_lh - truth.lineSpacingRatio) > max_dev:
            issues.append(f"C2_LINE_HEIGHT_MISMATCH:{pred_lh}vs{truth.lineSpacingRatio:.2f}")

    return StageDiagnosis(stage="C2", ok=len(issues) == 0, issues=issues)


def evaluate_page_layout(
    truth: PageLayoutTruth,
    page_ir: PageIR,
    vdoc_page: dict[str, Any],
    slots: dict[str, Any],
    *,
    compiled_report: Optional[Any] = None,
    measured_dom: Optional[MeasuredPageDOM] = None,
    thresholds: Optional[dict[str, Any]] = None,
) -> LayoutPageReport:
    """Compute C1/C2/C3 (+ optional C4) diagnostics and L1..L7 / A1..A3 scores."""
    th = thresholds or {}
    lth = th.get("layout") or {}
    overflow_tol = float(lth.get("pageOverflowTolerancePx", 2.0))
    max_lh_dev = float(lth.get("lineHeightDeviationMax", 0.15))
    min_l2 = float(lth.get("l2TableLineMatchMin", 0.90))
    min_l3 = float(lth.get("l3LineGroupF1Min", 0.95))
    min_l4 = float(lth.get("l4ScanFontSizeMatchMin", 0.90) if truth.isScan else lth.get("l4FontSizeMatchMin", 0.95))
    min_l5 = float(lth.get("l5SpacingMatchMin", 0.90))
    max_l6 = float(lth.get("l6PhotoContamMaxRatio", 0.0))
    min_l7 = float(lth.get("l7RowHeightMatchMin", 0.90))

    c1 = check_c1_acquire(page_ir, truth, th)
    c2 = check_c2_ir_emit(page_ir, truth, vdoc_page, slots, th)
    pred = predict_vdoc_page_layout(vdoc_page, slots, overflow_tol_px=overflow_tol)

    c3_issues: list[str] = []
    if pred.hasOverflow:
        c3_issues.append(f"C3_PAGE_OVERFLOW:{pred.overflowPx:.1f}px")

    # L2: Cell wrap line match against truth table cells (table-scoped + span-aware)
    l2_match = 1.0
    if truth.tables:
        truth_cells = [c for t in truth.tables for c in t.cells if c.lineCount > 0]
        if truth_cells:
            pred_tables: dict[int, list[Any]] = {}
            for cw in pred.cellWraps:
                pred_tables.setdefault(cw.tableIndex, []).append(cw)

            used_tidx: set[int] = set()
            matched = 0
            for ti, tt in enumerate(truth.tables):
                tt_cells = [c for c in tt.cells if c.lineCount > 0]
                if not tt_cells:
                    continue
                tt_tokens = {tok for c in tt_cells for tok in (c.text or "").split() if len(tok) >= 2}
                best_idx: Optional[int] = None
                best_score = -1.0
                for cand_idx, cand_wraps in pred_tables.items():
                    if cand_idx in used_tidx:
                        continue
                    pt_tokens = {tok for cw in cand_wraps for tok in (cw.text or "").split() if len(tok) >= 2}
                    overlap = len(tt_tokens & pt_tokens)
                    if overlap > best_score or (overlap == best_score and best_idx is not None and abs(cand_idx - ti) < abs(best_idx - ti)):
                        best_score = float(overlap)
                        best_idx = cand_idx
                if best_idx is None and pred_tables:
                    # Fallback if fewer pred tables than truth tables
                    best_idx = min(pred_tables.keys(), key=lambda idx: abs(idx - ti))
                elif best_idx is not None:
                    used_tidx.add(best_idx)

                pred_cov: dict[tuple[int, int], Any] = {}
                if best_idx is not None:
                    for cw in pred_tables.get(best_idx, []):
                        for dr in range(max(1, cw.rs)):
                            for dc in range(max(1, cw.cs)):
                                key = (cw.r + dr, cw.c + dc)
                                if key not in pred_cov:
                                    pred_cov[key] = cw

                for tc in tt_cells:
                    pc = pred_cov.get((tc.r, tc.c))
                    if pc is not None and pc.predLines <= tc.lineCount:
                        matched += 1
                    else:
                        c3_issues.append(f"C3_CELL_WRAP_EXCEEDED:t{ti}r{tc.r}c{tc.c}")
            l2_match = round(matched / len(truth_cells), 4)

    # L7: Row height match against truth table rows
    l7_match = 1.0
    if truth.tables:
        truth_row_h_px = [h * PX_PER_PT for t in truth.tables for h in t.rowHeightsPt]
        if truth_row_h_px and pred.predictedRowHeightsPx:
            cnt = min(len(truth_row_h_px), len(pred.predictedRowHeightsPx))
            ok_rows = 0
            for i in range(cnt):
                th_px = truth_row_h_px[i]
                ph_px = pred.predictedRowHeightsPx[i]
                if ph_px <= th_px + max(5.0, th_px * 0.22):
                    ok_rows += 1
            l7_match = round(ok_rows / cnt, 4)

    # L3: Horizontal line groups (left/right/TOC) vs columns-grid blocks
    ir_tables = [b for b in page_ir.blocks if isinstance(b, TableIR)]
    false_tables = len(ir_tables) if not truth.tables else max(0, len(ir_tables) - len(truth.tables))
    grid_count = sum(1 for b in (vdoc_page.get("blocks") or []) if b.get("kind") == "columns-grid")
    if truth.horizontalGroupCount > 0:
        tp = min(truth.horizontalGroupCount, grid_count)
        prec = tp / max(1, grid_count) if grid_count else 0.0
        rec = tp / truth.horizontalGroupCount
        l3_f1 = round((2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0, 4)
        # Penalize TOC converted into false table instead of columns-grid
        if truth.tocLineCount > 0 and false_tables > 0:
            l3_f1 = round(max(0.0, l3_f1 * 0.5), 4)
    else:
        l3_f1 = 1.0 if false_tables == 0 else round(max(0.0, 1.0 - 0.5 * false_tables), 4)

    # L4: Font size match
    l4_match = 1.0
    if truth.dominantFontSizePt is not None:
        pred_dom_pt = pred.dominantFontSizePx / PX_PER_PT
        tol_pt = max(1.2, truth.dominantFontSizePt * 0.2) if truth.isScan else max(0.8, truth.dominantFontSizePt * 0.08)
        dom_ok = 1.0 if abs(pred_dom_pt - truth.dominantFontSizePt) <= tol_pt else 0.0
        if not truth.isScan and len(truth.fontSizesPt) >= 2:
            emitted_pts = _collect_page_font_sizes_pt(vdoc_page, slots, pred_dom_pt)
            hit = sum(1 for ts in truth.fontSizesPt if any(abs(ep - ts) <= 1.2 for ep in emitted_pts))
            l4_match = round((dom_ok + hit / len(truth.fontSizesPt)) * 0.5, 4)
        else:
            l4_match = dom_ok

    # L5: Spacing match (lineHeight + multi-paragraph flow splitting / spaceBefore)
    spacing_scores: list[float] = []
    if truth.lineSpacingRatio is not None:
        pred_lh = _parse_lh((vdoc_page.get("layout") or {}).get("lineHeight"))
        if pred_lh is None:
            spacing_scores.append(0.0)
        else:
            diff = abs(pred_lh - truth.lineSpacingRatio)
            spacing_scores.append(1.0 if diff <= max_lh_dev else max(0.0, round(1.0 - (diff - max_lh_dev), 4)))
    if len(truth.paraGapsPt) >= 2:
        vblocks = [
            b
            for b in (vdoc_page.get("blocks") or [])
            if b.get("kind") in {"text", "heading", "form-title", "columns-grid"}
        ]
        has_split = len(vblocks) >= min(len(truth.paraGapsPt) + 1, 3)
        gap_spread = max(truth.paraGapsPt) - min(truth.paraGapsPt)
        sb_vals = [round(float(b.get("spaceBefore") or 0.0) / PX_PER_PT, 1) for b in vblocks[1:]]
        if gap_spread > 3.5:
            has_var_sb = len(set(sb_vals)) >= 2
        else:
            med_gap = float(statistics.median(truth.paraGapsPt))
            has_var_sb = any(abs(sb - med_gap) <= max(4.0, med_gap * 0.45) for sb in sb_vals)
        if has_split and has_var_sb:
            spacing_scores.append(1.0)
        elif has_split:
            spacing_scores.append(0.5)
        else:
            spacing_scores.append(0.0)
    l5_match = round(sum(spacing_scores) / len(spacing_scores), 4) if spacing_scores else 1.0

    # L6: Photo text pollution
    l6_pollution = 0.0
    if truth.photoRegions:
        polluted = 0
        for pr in truth.photoRegions:
            has_text_word = any(
                w.bbox is not None
                and pr.bbox[0] <= (w.bbox[0] + w.bbox[2]) * 0.5 <= pr.bbox[2]
                and pr.bbox[1] <= (w.bbox[1] + w.bbox[3]) * 0.5 <= pr.bbox[3]
                for w in page_ir.words
            )
            has_figure = any(
                isinstance(b, FigureBlock) and b.bbox is not None and bbox_iou(b.bbox, pr.bbox) >= 0.2
                for b in page_ir.blocks
            )
            if has_text_word or not has_figure:
                polluted += 1
        l6_pollution = round(polluted / len(truth.photoRegions), 4)

    # A1: Cell / panel background fidelity
    a1_bg = 1.0
    if truth.panelCount > 0 or any(c.bg for t in truth.tables for c in t.cells):
        expected_panels = truth.panelCount
        vblocks = list(vdoc_page.get("blocks") or [])
        cell_bgs = [
            cell.get("backgroundColor")
            for blk in vblocks
            for row in (blk.get("rows") or [])
            for cell in (row.get("cells") or [])
            if cell.get("backgroundColor")
        ]
        # Count matched background tables or panels
        if expected_panels > 0:
            one_by_one_bgs = sum(
                1
                for blk in vblocks
                if blk.get("kind") in {"structured-table", "table"}
                and len(blk.get("rows") or []) == 1
                and len((blk.get("rows") or [{}])[0].get("cells") or []) == 1
                and bool((((blk.get("rows") or [{}])[0].get("cells") or [{}])[0]).get("backgroundColor"))
            )
            a1_bg = round(min(1.0, one_by_one_bgs / expected_panels), 4)
        elif any(c.bg for t in truth.tables for c in t.cells) and not cell_bgs:
            a1_bg = 0.0

    # A2: Page background
    a2_ok = True
    if truth.pageBgColor:
        emitted_bg = (vdoc_page.get("layout") or {}).get("background")
        a2_ok = _color_close(emitted_bg, truth.pageBgColor, tol=24)

    # A3: Repeated running header / footer
    a3_ok = True
    if truth.repeatedHeader:
        a3_ok = a3_ok and not any(it == "C2_MISSING_RUNNING_HEADER" for it in c2.issues)
    if truth.repeatedFooter:
        a3_ok = a3_ok and not any(it == "C2_MISSING_RUNNING_FOOTER" for it in c2.issues)

    stages = [c1, c2, StageDiagnosis(stage="C3", ok=len(c3_issues) == 0, issues=c3_issues)]
    if measured_dom is not None:
        c4_issues: list[str] = []
        if measured_dom.hasOverflow:
            c4_issues.append(f"C4_DOM_OVERFLOW:{measured_dom.overflowPx:.1f}px")
        stages.append(StageDiagnosis(stage="C4", ok=len(c4_issues) == 0, issues=c4_issues))

    reasons: list[str] = []
    if pred.hasOverflow:
        reasons.append(f"L1_OVERFLOW:{pred.overflowPx:.1f}px")
    if l2_match < min_l2:
        reasons.append(f"L2_CELL_WRAP_LOW:{l2_match:.2f}<{min_l2:.2f}")
    if l3_f1 < min_l3:
        reasons.append(f"L3_LINE_GROUP_LOW:{l3_f1:.2f}<{min_l3:.2f}")
    if l4_match < min_l4:
        reasons.append(f"L4_FONT_SIZE_LOW:{l4_match:.2f}<{min_l4:.2f}")
    if l5_match < min_l5:
        reasons.append(f"L5_SPACING_LOW:{l5_match:.2f}<{min_l5:.2f}")
    if l6_pollution > max_l6:
        reasons.append(f"L6_PHOTO_CONTAM:{l6_pollution:.2f}>{max_l6:.2f}")
    if l7_match < min_l7:
        reasons.append(f"L7_ROW_HEIGHT_LOW:{l7_match:.2f}<{min_l7:.2f}")
    if not a2_ok:
        reasons.append("A2_PAGE_BG_MISSING")
    if not a3_ok:
        reasons.append("A3_RUNNING_HEADER_FOOTER_MISSING")

    first_fail: StageName = "NONE"
    for st in stages:
        if not st.ok:
            first_fail = st.stage
            break

    return LayoutPageReport(
        pageIndex=page_ir.pageIndex,
        isScan=truth.isScan,
        ok=len(reasons) == 0 and a1_bg >= 0.9,
        firstFailingStage=first_fail,
        l1Overflow=pred.hasOverflow,
        l1OverflowPx=pred.overflowPx,
        l2TableCellLineMatch=l2_match,
        l3LineGroupF1=l3_f1,
        l4FontSizeMatch=l4_match,
        l5SpacingMatch=l5_match,
        l6PhotoTextPollution=l6_pollution,
        l7RowHeightMatch=l7_match,
        a1BgMatch=a1_bg,
        a2PageBgOk=a2_ok,
        a3HeaderFooterOk=a3_ok,
        falseTableCount=false_tables,
        stages=stages,
        reasons=reasons,
        prediction=pred,
    )


def summarize_layout_suite(reports: list[LayoutPageReport]) -> dict[str, Any]:
    """Aggregate per-page LayoutPageReport items into gate summary metrics."""
    if not reports:
        return {"pages": 0, "okPages": 0, "passRate": 0.0}
    n = float(len(reports))
    return {
        "pages": len(reports),
        "okPages": sum(1 for r in reports if r.ok),
        "passRate": round(sum(1 for r in reports if r.ok) / n, 4),
        "l1OverflowPages": sum(1 for r in reports if r.l1Overflow),
        "l2TableCellLineMatch": round(sum(r.l2TableCellLineMatch for r in reports) / n, 4),
        "l3LineGroupF1": round(sum(r.l3LineGroupF1 for r in reports) / n, 4),
        "l4FontSizeMatch": round(sum(r.l4FontSizeMatch for r in reports) / n, 4),
        "l5SpacingMatch": round(sum(r.l5SpacingMatch for r in reports) / n, 4),
        "l6PhotoTextPollution": round(sum(r.l6PhotoTextPollution for r in reports) / n, 4),
        "l7RowHeightMatch": round(sum(r.l7RowHeightMatch for r in reports) / n, 4),
        "a1BgMatch": round(sum(r.a1BgMatch for r in reports) / n, 4),
        "a2PageBgPassRate": round(sum(1 for r in reports if r.a2PageBgOk) / n, 4),
        "a3HeaderFooterPassRate": round(sum(1 for r in reports if r.a3HeaderFooterOk) / n, 4),
        "falseTablesTotal": sum(r.falseTableCount for r in reports),
    }


def format_layout_comparison(baseline: dict[str, Any], current: dict[str, Any]) -> str:
    """Render a side-by-side baseline -> current (delta) table."""
    keys = [
        ("okPages", True),
        ("l1OverflowPages", False),
        ("l2TableCellLineMatch", True),
        ("l3LineGroupF1", True),
        ("l4FontSizeMatch", True),
        ("l5SpacingMatch", True),
        ("l6PhotoTextPollution", False),
        ("l7RowHeightMatch", True),
        ("a1BgMatch", True),
        ("a2PageBgPassRate", True),
        ("a3HeaderFooterPassRate", True),
        ("falseTablesTotal", False),
    ]
    lines = ["Metric                     | Baseline | Current  | Delta"]
    lines.append("---------------------------+----------+----------+--------")
    for k, higher_better in keys:
        bv = float(baseline.get(k, 0.0))
        cv = float(current.get(k, 0.0))
        delta = cv - bv
        mark = ""
        if abs(delta) > 1e-6:
            good = (delta > 0) if higher_better else (delta < 0)
            mark = " ok" if good else " REGR"
        lines.append(f"{k:<26} | {bv:>8.3f} | {cv:>8.3f} | {delta:>+7.3f}{mark}")
    return "\n".join(lines)
