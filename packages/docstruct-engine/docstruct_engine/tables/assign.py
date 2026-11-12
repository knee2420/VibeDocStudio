"""Assign extracted words to table cells in reading order with border-orphan snapping."""
from __future__ import annotations

import math
from typing import Optional

from ..blocks.text_join import join_words_smart
from ..ir.model import BBox, CellIR, TableIR, Word, bbox_center, point_in_bbox
from .candidates import TableCandidate


def sort_words_reading_order(words: list[Word]) -> list[Word]:
    """Sort words into top-to-bottom visual lines, left-to-right within each line."""
    if len(words) <= 1:
        return list(words)
    items = [w for w in words if w.bbox is not None]
    no_box = [w for w in words if w.bbox is None]
    items.sort(key=lambda w: (bbox_center(w.bbox)[1], w.bbox[0]))  # type: ignore[arg-type]

    lines: list[list[Word]] = []
    line_ys: list[float] = []
    for w in items:
        assert w.bbox is not None
        cy = (w.bbox[1] + w.bbox[3]) * 0.5
        wh = max(2.0, w.bbox[3] - w.bbox[1])
        placed = False
        for idx, ay in enumerate(line_ys):
            if abs(cy - ay) <= max(2.0, wh * 0.55):
                lines[idx].append(w)
                line_ys[idx] = sum((it.bbox[1] + it.bbox[3]) * 0.5 for it in lines[idx] if it.bbox) / len(lines[idx])
                placed = True
                break
        if not placed:
            lines.append([w])
            line_ys.append(cy)

    lines.sort(key=lambda ln: sum((it.bbox[1] + it.bbox[3]) * 0.5 for it in ln if it.bbox) / len(ln))
    ordered: list[Word] = []
    for ln in lines:
        ln.sort(key=lambda w: (w.bbox[0] if w.bbox else 0.0, w.id))
        ordered.extend(ln)
    ordered.extend(no_box)
    return ordered


def join_words_to_text(words: list[Word]) -> str:
    """Render ordered words as multi-line plain text preserving visual line breaks."""
    if not words:
        return ""
    ordered = sort_words_reading_order(words)
    boxed = [w for w in ordered if w.bbox is not None]
    if not boxed:
        return " ".join(w.text for w in ordered if w.text).strip()

    lines: list[list[str]] = [[boxed[0].text]]
    prev_w = boxed[0]
    anchor_y = (boxed[0].bbox[1] + boxed[0].bbox[3]) * 0.5  # type: ignore[index]
    anchor_h = max(2.0, boxed[0].bbox[3] - boxed[0].bbox[1])  # type: ignore[index]
    for w in boxed[1:]:
        assert w.bbox is not None
        cy = (w.bbox[1] + w.bbox[3]) * 0.5
        wh = max(2.0, w.bbox[3] - w.bbox[1])
        same_hint = prev_w.lineHint is not None and prev_w.lineHint == w.lineHint
        if same_hint or abs(cy - anchor_y) <= max(2.0, min(anchor_h, wh) * 0.6):
            lines[-1].append(w.text)
        else:
            lines.append([w.text])
            anchor_y = cy
            anchor_h = wh
        prev_w = w
    return "\n".join(" ".join(tok for tok in ln if tok).strip() for ln in lines if any(tok for tok in ln))


def _dist_to_bbox(pt: tuple[float, float], bbox: BBox) -> float:
    dx = max(bbox[0] - pt[0], 0.0, pt[0] - bbox[2])
    dy = max(bbox[1] - pt[1], 0.0, pt[1] - bbox[3])
    return math.hypot(dx, dy)


def _overlap_area(a: BBox, b: BBox) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy


def assign_words_to_table(
    cand: TableCandidate,
    words: list[Word],
    *,
    excluded_word_ids: Optional[set[str]] = None,
    orphan_inset_pt: float = 1.0,
) -> tuple[TableIR, set[str]]:
    """Place eligible words into `cand.cells`, snapping inner border orphans with `needsReview=True`."""
    excluded = excluded_word_ids or set()
    n_rows = max(1, len(cand.rowYs) - 1)
    n_cols = max(1, len(cand.colXs) - 1)

    cell_words: dict[int, list[Word]] = {idx: [] for idx in range(len(cand.cells))}
    cell_needs_review: dict[int, bool] = {idx: False for idx in range(len(cand.cells))}
    assigned_ids: set[str] = set()

    # Pass 1: Strict center containment inside a cell
    remaining_in_table: list[Word] = []
    for w in words:
        if w.id in excluded or w.bbox is None:
            continue
        ctr = bbox_center(w.bbox)
        best_idx: Optional[int] = None
        best_overlap = -1.0
        for idx, cell in enumerate(cand.cells):
            if point_in_bbox(ctr, cell.bbox, tol=0.0):
                ov = _overlap_area(w.bbox, cell.bbox)
                if ov > best_overlap:
                    best_overlap = ov
                    best_idx = idx
        if best_idx is not None:
            cell_words[best_idx].append(w)
            assigned_ids.add(w.id)
        elif point_in_bbox(ctr, cand.bbox, inset=orphan_inset_pt):
            remaining_in_table.append(w)

    # Pass 2: Snap words inside `table.bbox` inset `1pt` on borders/gutters to nearest cell (§3 #3, §12.7)
    for w in remaining_in_table:
        assert w.bbox is not None
        ctr = bbox_center(w.bbox)
        best_idx: Optional[int] = None
        best_key: Optional[tuple[float, float]] = None
        for idx, cell in enumerate(cand.cells):
            dist = _dist_to_bbox(ctr, cell.bbox)
            ov = _overlap_area(w.bbox, cell.bbox)
            key = (round(dist, 4), -round(ov, 4))
            if best_key is None or key < best_key:
                best_key = key
                best_idx = idx
        if best_idx is not None:
            cell_words[best_idx].append(w)
            cell_needs_review[best_idx] = True
            assigned_ids.add(w.id)

    width_pt = round(cand.colXs[-1] - cand.colXs[0], 2)
    width_ratio = (
        [round((cand.colXs[i + 1] - cand.colXs[i]) / width_pt, 4) for i in range(n_cols)]
        if width_pt > 0
        else None
    )

    cells_ir: list[CellIR] = []
    for idx, cell in enumerate(cand.cells):
        ordered = sort_words_reading_order(cell_words[idx])
        text = join_words_smart(ordered, preserve_line_breaks=True)
        confs = [w.conf for w in ordered] if ordered else [1.0]
        needs_rev = cell_needs_review[idx] or any(w.needsReview for w in ordered)
        cells_ir.append(
            CellIR(
                r=cell.r,
                c=cell.c,
                rs=cell.rs,
                cs=cell.cs,
                role="td",
                bbox=cell.bbox,
                wordIds=[w.id for w in ordered],
                text=text,
                conf=min(confs),
                needsReview=needs_rev,
            )
        )

    table_ir = TableIR(
        id=cand.id,
        bbox=cand.bbox,
        nRows=n_rows,
        nCols=n_cols,
        colXs=list(cand.colXs),
        rowYs=list(cand.rowYs),
        widthRatio=width_ratio,
        widthPt=width_pt if width_pt > 0 else None,
        cells=cells_ir,
        needsReview=any(c.needsReview for c in cells_ir),
    )
    return table_ir, assigned_ids
