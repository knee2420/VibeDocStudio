"""Cell/table styling, alignment, header role, padding, and form-field enrichment."""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Literal, Optional

from ..config import compile_patterns, load_registry, load_thresholds
from ..ir.model import (
    BBox,
    BorderEdge,
    CellBorders,
    CellFieldMeta,
    CellFont,
    CellIR,
    CellPadding,
    Ruling,
    TableIR,
    Word,
)


def _match_edge(
    orient: Literal["h", "v"],
    pos: float,
    span_start: float,
    span_end: float,
    rulings: list[Ruling],
    tol_pt: float,
) -> BorderEdge:
    span_len = max(1.0, span_end - span_start)
    best: Optional[Ruling] = None
    best_overlap = 0.0
    for r in rulings:
        if r.orient != orient:
            continue
        r_pos = (r.y0 + r.y1) * 0.5 if orient == "h" else (r.x0 + r.x1) * 0.5
        if abs(r_pos - pos) > tol_pt:
            continue
        r0, r1 = (r.x0, r.x1) if orient == "h" else (r.y0, r.y1)
        ov = max(0.0, min(span_end, r1) - max(span_start, r0))
        if ov / span_len >= 0.45 and ov > best_overlap:
            best_overlap = ov
            best = r
    if best is None:
        return BorderEdge(style="none", width=0.0, color="#000000")
    return BorderEdge(style=best.style, width=best.thickness, color=best.color)


def _match_fill_color(cell_bbox: BBox, fills_pt: list[dict[str, Any]]) -> Optional[str]:
    cx = (cell_bbox[0] + cell_bbox[2]) * 0.5
    cy = (cell_bbox[1] + cell_bbox[3]) * 0.5
    cell_area = max(1.0, (cell_bbox[2] - cell_bbox[0]) * (cell_bbox[3] - cell_bbox[1]))
    best_color: Optional[str] = None
    best_ratio = 0.0
    best_area = float("inf")
    for f in fills_pt:
        fx0, fy0, fx1, fy1 = float(f["x0"]), float(f["y0"]), float(f["x1"]), float(f["y1"])
        if not (fx0 - 1.5 <= cx <= fx1 + 1.5 and fy0 - 1.5 <= cy <= fy1 + 1.5):
            continue
        ix = max(0.0, min(cell_bbox[2], fx1) - max(cell_bbox[0], fx0))
        iy = max(0.0, min(cell_bbox[3], fy1) - max(cell_bbox[1], fy0))
        ratio = (ix * iy) / cell_area
        f_area = max(1.0, (fx1 - fx0) * (fy1 - fy0))
        col = str(f.get("color") or "").strip().lower()
        if ratio >= 0.45 and col and col not in ("#ffffff", "#fff", "transparent"):
            if ratio > best_ratio + 0.02 or (abs(ratio - best_ratio) <= 0.02 and f_area < best_area):
                best_ratio = ratio
                best_area = f_area
                best_color = col.upper()
    return best_color


def _dominant_font(cell_words: list[Word]) -> Optional[CellFont]:
    if not cell_words:
        return None
    families = [w.font for w in cell_words if w.font]
    colors = [w.color for w in cell_words if w.color]
    sizes = [w.size for w in cell_words if w.size]
    bolds = [bool(w.bold) for w in cell_words if w.bold is not None]
    italics = [bool(w.italic) for w in cell_words if w.italic is not None]
    underlines = [bool(w.underline) for w in cell_words if w.underline is not None]

    family = Counter(families).most_common(1)[0][0] if families else None
    color = Counter(colors).most_common(1)[0][0] if colors else None
    size = round(sum(sizes) / len(sizes), 1) if sizes else None
    bold = (sum(1 for b in bolds if b) > len(bolds) / 2) if bolds else None
    italic = (sum(1 for b in italics if b) > len(italics) / 2) if italics else None
    underline = (sum(1 for b in underlines if b) > len(underlines) / 2) if underlines else None
    return CellFont(
        family=family,
        color=color,
        size=size,
        bold=bold,
        italic=italic,
        underline=underline,
    )


from ..verify.layout_predict import PX_PER_PT, estimate_wrapped_lines


def _cell_orig_line_count(cwords: list[Word]) -> int:
    hints = {w.lineHint for w in cwords if w.lineHint is not None}
    if hints:
        return len(hints)
    ys = sorted((w.bbox[1] + w.bbox[3]) * 0.5 for w in cwords if w.bbox is not None)
    if not ys:
        return 1
    sz = max(6.0, max((float(w.size or 9.0) for w in cwords), default=9.0))
    lines = 1
    anchor = ys[0]
    for y in ys[1:]:
        if abs(y - anchor) > sz * 0.55:
            lines += 1
            anchor = y
    return lines


def _cell_line_height(cwords: list[Word], size_pt: float) -> float:
    boxed = [w for w in cwords if w.bbox is not None]
    if len(boxed) < 2:
        return 1.2
    groups: list[list[Word]] = []
    anchors: list[float] = []
    for w in sorted(boxed, key=lambda x: ((x.bbox[1] + x.bbox[3]) * 0.5, x.bbox[0])):  # type: ignore[index]
        cy = (w.bbox[1] + w.bbox[3]) * 0.5  # type: ignore[index]
        if not groups or abs(cy - anchors[-1]) > max(3.0, size_pt * 0.55):
            groups.append([w])
            anchors.append(cy)
        else:
            groups[-1].append(w)
    if len(groups) < 2:
        return 1.2
    pitches = [b - a for a, b in zip(anchors, anchors[1:]) if 0.8 * size_pt <= (b - a) <= 2.2 * size_pt]
    if not pitches:
        return 1.2
    pitches.sort()
    med_pitch = pitches[len(pitches) // 2]
    return round(max(1.05, min(1.55, med_pitch / max(6.0, size_pt))), 2)


def _infer_alignment_and_padding(
    cell_bbox: BBox,
    cell_words: list[Word],
    *,
    min_pad_pt: float = 1.5,
    max_pad_ratio: float = 0.25,
    max_pad_pt: float = 8.0,
) -> tuple[Literal["left", "center", "right"], Literal["top", "middle", "bottom"], CellPadding, bool]:
    if not cell_words:
        return "left", "middle", CellPadding(t=min_pad_pt, r=min_pad_pt, b=min_pad_pt, l=min_pad_pt), False
    boxed = [w for w in cell_words if w.bbox is not None]
    if not boxed:
        return "left", "middle", CellPadding(t=min_pad_pt, r=min_pad_pt, b=min_pad_pt, l=min_pad_pt), False

    min_x0 = min(w.bbox[0] for w in boxed)  # type: ignore[index]
    max_x1 = max(w.bbox[2] for w in boxed)  # type: ignore[index]
    min_y0 = min(w.bbox[1] for w in boxed)  # type: ignore[index]
    max_y1 = max(w.bbox[3] for w in boxed)  # type: ignore[index]

    left_gap = max(0.0, min_x0 - cell_bbox[0])
    right_gap = max(0.0, cell_bbox[2] - max_x1)
    top_gap = max(0.0, min_y0 - cell_bbox[1])
    bot_gap = max(0.0, cell_bbox[3] - max_y1)
    cell_w = max(8.0, cell_bbox[2] - cell_bbox[0])
    cell_h = max(8.0, cell_bbox[3] - cell_bbox[1])

    align: Literal["left", "center", "right"] = "left"
    if left_gap > 4.0 and right_gap > 4.0 and abs(left_gap - right_gap) <= max(4.5, (left_gap + right_gap) * 0.28):
        align = "center"
    elif right_gap <= 9.0 and left_gap > right_gap + 8.0:
        align = "right"

    valign: Literal["top", "middle", "bottom"] = "middle"
    if top_gap > 4.0 and bot_gap > 4.0 and abs(top_gap - bot_gap) <= 4.0:
        valign = "middle"
    elif top_gap < bot_gap - 4.0:
        valign = "top"
    elif bot_gap < top_gap - 4.0:
        valign = "bottom"

    cap_x = min(max_pad_pt, cell_w * max_pad_ratio)
    cap_y = min(max_pad_pt, cell_h * max_pad_ratio)

    def _clamp_x(g: float) -> float:
        return round(max(min_pad_pt, min(cap_x, g)), 1)

    def _clamp_y(g: float) -> float:
        return round(max(min_pad_pt, min(cap_y, g)), 1)

    if align == "center":
        pad_l, pad_r = min_pad_pt, min_pad_pt
    elif align == "right":
        pad_l, pad_r = min_pad_pt, _clamp_x(right_gap)
    else:
        pad_l, pad_r = _clamp_x(left_gap), min_pad_pt

    if valign == "middle":
        pad_t, pad_b = min_pad_pt, min_pad_pt
    elif valign == "top":
        pad_t, pad_b = _clamp_y(top_gap), min_pad_pt
    else:
        pad_t, pad_b = min_pad_pt, _clamp_y(bot_gap)

    orig_lines = _cell_orig_line_count(cell_words)
    cell_txt = " ".join(w.text for w in boxed).strip()
    dom_sz = max(6.0, max((float(w.size or 9.0) for w in boxed), default=9.0))
    dom_bold = all(bool(w.bold) for w in boxed)
    inner_w_px = max(4.0, (cell_w - pad_l - pad_r) * PX_PER_PT)
    pred_lines = estimate_wrapped_lines(cell_txt, inner_w_px, dom_sz * PX_PER_PT, bold=dom_bold)
    needs_review = False
    if pred_lines > orig_lines:
        pad_l = min_pad_pt
        pad_r = min_pad_pt
        inner_min_px = max(4.0, (cell_w - pad_l - pad_r) * PX_PER_PT)
        pred_min = estimate_wrapped_lines(cell_txt, inner_min_px, dom_sz * PX_PER_PT, bold=dom_bold)
        if pred_min > orig_lines:
            needs_review = True

    pad = CellPadding(t=pad_t, r=pad_r, b=pad_b, l=pad_l)
    return align, valign, pad, needs_review


def _detect_cell_field(
    cell: CellIR,
    table: TableIR,
    by_rc: dict[tuple[int, int], CellIR],
    registry: dict[str, Any],
    *,
    date_res: list[re.Pattern[str]],
    sign_res: list[re.Pattern[str]],
    underline_re: Optional[re.Pattern[str]],
) -> Optional[CellFieldMeta]:
    if cell.role == "th" or cell.nested:
        return None
    raw = (cell.text or "").strip()
    fp = registry.get("fieldPatterns") or {}
    checkbox_glyphs = [str(g) for g in (fp.get("checkboxGlyphs") or [])]
    empty_placeholders = {str(p).strip() for p in (registry.get("emptyCellPlaceholders") or [""])}

    kind: Optional[Literal["text", "date", "sign", "check"]] = None
    if any(g in raw for g in checkbox_glyphs):
        kind = "check"
    elif any(rx.search(raw) for rx in sign_res):
        kind = "sign"
    elif any(rx.search(raw) for rx in date_res):
        kind = "date"
    elif (underline_re and underline_re.search(raw)) or raw in empty_placeholders:
        kind = "text"

    if kind is None:
        return None

    # Resolve nearest header or shaded/left label cell for readable label
    label = ""
    if cell.c > 0:
        left_cell = by_rc.get((cell.r, cell.c - 1))
        if left_cell is None:
            for prev_c in range(cell.c - 1, -1, -1):
                cand_c = by_rc.get((cell.r, prev_c))
                if cand_c and cand_c.c + cand_c.cs >= cell.c:
                    left_cell = cand_c
                    break
        if left_cell and not left_cell.continued:
            ltxt = " ".join((left_cell.text or "").split())
            is_left_placeholder = (
                ltxt in empty_placeholders
                or any(g in ltxt for g in checkbox_glyphs)
                or any(rx.search(ltxt) for rx in sign_res)
                or any(rx.search(ltxt) for rx in date_res)
                or bool(underline_re and underline_re.search(ltxt))
            )
            looks_like_plain_label = (
                1 <= len(ltxt) <= 24
                and "\n" not in (left_cell.text or "").strip()
                and not ltxt.endswith((".", "다"))
                and not is_left_placeholder
            )
            if ltxt and (left_cell.role == "th" or left_cell.bg or looks_like_plain_label):
                label = ltxt[:40]
    if not label and cell.r > 0:
        top_cell = by_rc.get((0, cell.c))
        if top_cell and top_cell.role == "th" and (top_cell.text or "").strip():
            label = " ".join((top_cell.text or "").split())[:40]

    return CellFieldMeta(
        fieldId=f"{table.id}_r{cell.r}c{cell.c}",
        kind=kind,
        label=label or f"r{cell.r + 1}c{cell.c + 1}",
        placeholder=raw if raw in empty_placeholders or (underline_re and underline_re.search(raw)) else "",
    )


def enrich_table_properties(
    table: TableIR,
    words_by_id: dict[str, Word],
    rulings: list[Ruling],
    *,
    fills_pt: Optional[list[dict[str, Any]]] = None,
    thresholds: Optional[dict[str, Any]] = None,
    registry: Optional[dict[str, Any]] = None,
) -> TableIR:
    """Populate borders, background fill, alignment, fonts, padding, th role, and form fields."""
    th = thresholds or load_thresholds()
    reg = registry or load_registry()
    tol_pt = float(th.get("snapTolPt", 1.8))
    fills = fills_pt or []

    fp = reg.get("fieldPatterns") or {}
    date_res = compile_patterns([str(p) for p in (fp.get("date") or [])])
    sign_res = compile_patterns([str(p) for p in (fp.get("sign") or [])])
    underline_pat = fp.get("underlineRun")
    underline_re = re.compile(str(underline_pat)) if underline_pat else None

    lth = th.get("layout") or {}
    min_pad_pt = float(lth.get("cellPaddingMinPt", 1.5))
    max_pad_ratio = float(lth.get("cellPaddingMaxRatio", 0.25))

    for cell in table.cells:
        cwords = [words_by_id[w] for w in cell.wordIds if w in words_by_id]
        bx = cell.bbox
        cell.font = _dominant_font(cwords)
        sz_pt = float(cell.font.size) if cell.font and cell.font.size is not None else 9.5
        if cell.lineHeight is None:
            cell.lineHeight = _cell_line_height(cwords, sz_pt)
        if bx is not None:
            cell.borders = CellBorders(
                top=_match_edge("h", bx[1], bx[0], bx[2], rulings, tol_pt),
                bottom=_match_edge("h", bx[3], bx[0], bx[2], rulings, tol_pt),
                left=_match_edge("v", bx[0], bx[1], bx[3], rulings, tol_pt),
                right=_match_edge("v", bx[2], bx[1], bx[3], rulings, tol_pt),
            )
            cell.bg = _match_fill_color(bx, fills) or cell.bg
            align, valign, pad, wrap_review = _infer_alignment_and_padding(
                bx,
                cwords,
                min_pad_pt=min_pad_pt,
                max_pad_ratio=max_pad_ratio,
            )
            cell.align = align
            cell.valign = valign
            cell.padding = pad
            if wrap_review:
                cell.needsReview = True

    # Header role heuristic: row 0 with >=2 rows and non-white bg or bold text or distinct center header look
    if table.nRows >= 2:
        row0 = [c for c in table.cells if c.r == 0]
        row1 = [c for c in table.cells if c.r == 1]
        r0_shaded = any(bool(c.bg) for c in row0) and not all(c.bg == row0[0].bg for c in row1 if row0 and row1)
        r0_bold = any(bool(c.font and c.font.bold) for c in row0) and not all(
            bool(c.font and c.font.bold) for c in row1
        )
        r0_centered = all(c.align == "center" or not (c.text or "").strip() for c in row0) and any(
            (c.text or "").strip() for c in row0
        )
        if r0_shaded or r0_bold or r0_centered:
            for c in row0:
                if (c.text or "").strip():
                    c.role = "th"
        # Key-value form tables: column 0 shaded while body cells unshaded
        if not any(c.role == "th" for c in table.cells) and table.nCols >= 2:
            col0 = [c for c in table.cells if c.c == 0]
            if col0 and all(bool(c.bg) for c in col0) and any(not c.bg for c in table.cells if c.c > 0):
                for c in col0:
                    c.role = "th"

    by_rc = {(c.r, c.c): c for c in table.cells}
    for cell in table.cells:
        if cell.field is None:
            cell.field = _detect_cell_field(
                cell,
                table,
                by_rc,
                reg,
                date_res=date_res,
                sign_res=sign_res,
                underline_re=underline_re,
            )

    return table

