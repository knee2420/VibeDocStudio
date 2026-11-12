"""Candidate table region detection from vector/scan rulings and aligned word grids."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Literal, Optional

import pymupdf
from pydantic import BaseModel, Field

from ..acquire.pdf import PX
from ..config import load_thresholds
from ..ir.model import BBox, Ruling, Word, bbox_iou, point_in_bbox
from .grid_detect import detect_tables


def cluster_coordinates(values: Iterable[float], tolerance_pt: float = 1.8) -> tuple[float, ...]:
    """가까운 X 또는 Y 좌표들을 허용 오차(기본 ±1.8pt) 이내에서 하나의 격자선으로 병합한다."""
    sorted_vals = sorted(float(v) for v in values)
    if not sorted_vals:
        return ()
    clusters: list[list[float]] = [[sorted_vals[0]]]
    for val in sorted_vals[1:]:
        if abs(val - clusters[-1][-1]) <= tolerance_pt:
            clusters[-1].append(val)
        else:
            clusters.append([val])
    return tuple(round(sum(group) / len(group), 2) for group in clusters)


class CandidateCell(BaseModel):
    r: int = Field(ge=0)
    c: int = Field(ge=0)
    rs: int = Field(default=1, ge=1)
    cs: int = Field(default=1, ge=1)
    bbox: BBox
    borders: dict[str, Optional[dict[str, Any]]] = Field(default_factory=dict)
    bg: Optional[str] = None


class TableCandidate(BaseModel):
    id: str
    bbox: BBox
    colXs: list[float]
    rowYs: list[float]
    cells: list[CandidateCell] = Field(default_factory=list)
    hasRulings: bool = True
    source: Literal["rulings", "borderless"] = "rulings"


def _words_in_bbox(words: list[Word], bbox: BBox, tol: float = 1.0) -> list[Word]:
    out: list[Word] = []
    for w in words:
        if w.bbox is None:
            continue
        cx = (w.bbox[0] + w.bbox[2]) * 0.5
        cy = (w.bbox[1] + w.bbox[3]) * 0.5
        if point_in_bbox((cx, cy), bbox, tol=tol):
            out.append(w)
    return out


def _rulings_to_px(rulings: list[Ruling]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rulings:
        out.append(
            {
                "orient": r.orient,
                "x": r.x0 * PX,
                "y": r.y0 * PX,
                "x1": r.x1 * PX,
                "y1": r.y1 * PX,
                "thickness": r.thickness * PX,
                "color": r.color,
                "dashed": r.style == "dashed",
            }
        )
    return out


def _fills_to_px(fills_pt: Optional[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    if not fills_pt:
        return []
    return [
        {
            "x": float(f["x0"]) * PX,
            "y": float(f["y0"]) * PX,
            "x1": float(f["x1"]) * PX,
            "y1": float(f["y1"]) * PX,
            "color": f.get("color", "#FFFFFF"),
        }
        for f in fills_pt
    ]


def _words_to_px_spans(words: list[Word]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for w in words:
        if w.bbox is None:
            continue
        out.append(
            {
                "x": w.bbox[0] * PX,
                "y": w.bbox[1] * PX,
                "x1": w.bbox[2] * PX,
                "y1": w.bbox[3] * PX,
                "text": w.text,
            }
        )
    return out


def _edges_px_to_pt(borders_px: Optional[dict[str, Any]]) -> dict[str, Optional[dict[str, Any]]]:
    if not borders_px:
        return {}
    out: dict[str, Optional[dict[str, Any]]] = {}
    for side in ("top", "right", "bottom", "left"):
        edge = borders_px.get(side)
        if edge is None:
            out[side] = None
        else:
            out[side] = {
                "width": round(float(edge.get("th", 1.0)) / PX, 2),
                "color": str(edge.get("color") or "#000000"),
                "dashed": bool(edge.get("dashed", False)),
            }
    return out


def _group_h_rule_bands(
    rulings: list[Ruling],
    words: list[Word],
    existing_boxes: list[BBox],
    *,
    min_width_pt: float,
    min_height_pt: float,
) -> list[TableCandidate]:
    """Detect horizontal-ruling tables (no vertical lines) from parallel wide h-rules + column X alignment."""
    wide_h = sorted(
        [
            r
            for r in rulings
            if r.orient == "h"
            and (r.x1 - r.x0) >= max(min_width_pt * 2.0, 80.0)
            and not any(
                point_in_bbox(((r.x0 + r.x1) * 0.5, (r.y0 + r.y1) * 0.5), ex, tol=2.0)
                for ex in existing_boxes
            )
        ],
        key=lambda r: ((r.y0 + r.y1) * 0.5, r.x0),
    )
    if len(wide_h) < 3:
        return []

    # Cluster wide h-rules that share horizontal span overlap >= 70%
    groups: list[list[Ruling]] = []
    for r in wide_h:
        ry = (r.y0 + r.y1) * 0.5
        placed = False
        for g in groups:
            g_x0 = min(item.x0 for item in g)
            g_x1 = max(item.x1 for item in g)
            inter_w = max(0.0, min(g_x1, r.x1) - max(g_x0, r.x0))
            min_w = max(1.0, min(g_x1 - g_x0, r.x1 - r.x0))
            last_y = (g[-1].y0 + g[-1].y1) * 0.5
            if inter_w / min_w >= 0.70 and 0.0 < (ry - last_y) <= 120.0:
                g.append(r)
                placed = True
                break
        if not placed:
            groups.append([r])

    candidates: list[TableCandidate] = []
    for g in groups:
        if len(g) < 3:
            continue
        x0 = min(r.x0 for r in g)
        x1 = max(r.x1 for r in g)
        ys = list(cluster_coordinates([(r.y0 + r.y1) * 0.5 for r in g], tolerance_pt=2.5))
        if len(ys) < 3:
            continue
        bx: BBox = (round(x0, 2), round(ys[0], 2), round(x1, 2), round(ys[-1], 2))
        if (bx[2] - bx[0]) < min_width_pt or (bx[3] - bx[1]) < min_height_pt:
            continue
        if any(bbox_iou(bx, ex) >= 0.25 for ex in existing_boxes):
            continue

        in_words = _words_in_bbox(words, bx, tol=1.0)
        if len(in_words) < 4:
            continue

        # Build column boundaries by finding vertical whitespace gutters inside bx
        gutter_xs = _infer_column_gutters(in_words, bx[0], bx[2])
        if len(gutter_xs) < 3:
            continue

        cells = [
            CandidateCell(
                r=ri,
                c=ci,
                rs=1,
                cs=1,
                bbox=(gutter_xs[ci], ys[ri], gutter_xs[ci + 1], ys[ri + 1]),
            )
            for ri in range(len(ys) - 1)
            for ci in range(len(gutter_xs) - 1)
        ]
        candidates.append(
            TableCandidate(
                id=f"cand_{len(candidates)}",
                bbox=bx,
                colXs=gutter_xs,
                rowYs=ys,
                cells=cells,
                hasRulings=True,
                source="rulings",
            )
        )
    return candidates


def _infer_column_gutters(words: list[Word], x0: float, x1: float) -> list[float]:
    """Find consistent X-gutter dividers across words in a multi-row band."""
    intervals: list[tuple[float, float]] = []
    for w in words:
        if w.bbox is not None:
            intervals.append((max(x0, w.bbox[0]), min(x1, w.bbox[2])))
    if not intervals:
        return [round(x0, 2), round(x1, 2)]

    # Scan candidate vertical gaps via X-projection coverage
    width = x1 - x0
    bins = max(20, int(round(width)))
    counts = [0] * bins
    for wx0, wx1 in intervals:
        b0 = max(0, min(bins - 1, int((wx0 - x0) / width * bins)))
        b1 = max(b0, min(bins - 1, int((wx1 - x0) / width * bins)))
        for bi in range(b0, b1 + 1):
            counts[bi] += 1

    # Ignore leading/trailing blank margin inside x0..x1
    first_occ = next((i for i, c in enumerate(counts) if c > 0), 0)
    last_occ = len(counts) - 1 - next((i for i, c in enumerate(reversed(counts)) if c > 0), 0)
    dividers: list[float] = [round(x0, 2)]
    run_start: Optional[int] = None
    min_gutter_bins = max(4, int(round(4.0 / width * bins)))
    for i in range(first_occ, last_occ + 1):
        if counts[i] == 0:
            if run_start is None:
                run_start = i
        elif run_start is not None:
            if (i - run_start) >= min_gutter_bins:
                mid_bin = (run_start + i) * 0.5
                dividers.append(round(x0 + (mid_bin / bins) * width, 2))
            run_start = None
    dividers.append(round(x1, 2))
    return dividers


def _pymupdf_text_fallback(
    page: Optional[pymupdf.Page],
    words: list[Word],
    existing_boxes: list[BBox],
    *,
    min_width_pt: float,
    min_height_pt: float,
) -> list[TableCandidate]:
    """Conservative borderless table fallback using PyMuPDF find_tables(strategy='text')."""
    if page is None:
        return []
    try:
        finder = page.find_tables(strategy="text")
    except Exception:
        return []
    candidates: list[TableCandidate] = []
    for tab in getattr(finder, "tables", []):
        tbx = getattr(tab, "bbox", None)
        if not tbx or len(tbx) != 4:
            continue
        bx: BBox = (round(float(tbx[0]), 2), round(float(tbx[1]), 2), round(float(tbx[2]), 2), round(float(tbx[3]), 2))
        if (bx[2] - bx[0]) < min_width_pt or (bx[3] - bx[1]) < min_height_pt:
            continue
        if any(bbox_iou(bx, ex) >= 0.25 for ex in existing_boxes):
            continue
        rows = getattr(tab, "rows", None) or []
        col_count = getattr(tab, "col_count", 0) or (len(rows[0].cells) if rows else 0)
        if len(rows) < 3 or col_count < 2:
            continue
        extracted = tab.extract() or []
        non_empty = sum(1 for r in extracted for c in r if c and str(c).strip())
        total = max(1, len(extracted) * col_count)
        if non_empty / total < 0.45:
            continue
        # Ensure columns don't slice right through single vector words (prose leakage guard)
        col_xs = [round(bx[0], 2)]
        first_cells = rows[0].cells if rows else []
        for cbox in first_cells:
            if cbox is not None:
                cx1 = round(float(cbox[2]), 2)
                if cx1 > col_xs[-1] + 2.0:
                    col_xs.append(cx1)
        if col_xs[-1] < bx[2] - 1.0:
            col_xs[-1] = round(bx[2], 2)
        row_ys = [round(bx[1], 2)]
        for row_obj in rows:
            rbox = getattr(row_obj, "bbox", None)
            if rbox is not None:
                ry1 = round(float(rbox[3]), 2)
                if ry1 > row_ys[-1] + 2.0:
                    row_ys.append(ry1)
        if len(col_xs) < 3 or len(row_ys) < 4:
            continue
        in_words = _words_in_bbox(words, bx, tol=1.0)
        if any(w.bbox[0] < gx - 2.0 and w.bbox[2] > gx + 2.0 for w in in_words if w.bbox for gx in col_xs[1:-1]):
            continue
        cells = [
            CandidateCell(
                r=ri,
                c=ci,
                rs=1,
                cs=1,
                bbox=(col_xs[ci], row_ys[ri], col_xs[ci + 1], row_ys[ri + 1]),
            )
            for ri in range(len(row_ys) - 1)
            for ci in range(len(col_xs) - 1)
        ]
        candidates.append(
            TableCandidate(
                id=f"cand_bl_{len(candidates)}",
                bbox=bx,
                colXs=col_xs,
                rowYs=row_ys,
                cells=cells,
                hasRulings=False,
                source="borderless",
            )
        )
    return candidates


def propose_table_candidates(
    rulings: list[Ruling],
    words: list[Word],
    *,
    fills_pt: Optional[list[dict[str, Any]]] = None,
    page: Optional[pymupdf.Page] = None,
    thresholds: Optional[dict[str, Any]] = None,
) -> list[TableCandidate]:
    """Detect vector/scan ruling tables and conservative borderless tables in pt."""
    th = thresholds or load_thresholds()
    min_w = float(th.get("minTableWidthPt", 36.0))
    min_h = float(th.get("minTableHeightPt", 18.0))
    dash_gap = float(th.get("dashMaxGapPt", 6.0))
    border_tol_px = float(th.get("snapTolPt", 1.8)) * PX * 1.5

    rules_px = _rulings_to_px(rulings)
    fills_px = _fills_to_px(fills_pt)
    spans_px = _words_to_px_spans(words)

    raw_tables = detect_tables(
        rules_px,
        fills=fills_px,
        spans=spans_px,
        dash_max_gap=dash_gap * PX,
        border_pair_tol=border_tol_px,
    )

    candidates: list[TableCandidate] = []
    seen_boxes: list[BBox] = []

    for tbl in raw_tables:
        col_xs = [round(float(x) / PX, 2) for x in tbl.get("col_xs", [])]
        row_ys = [round(float(y) / PX, 2) for y in tbl.get("row_ys", [])]
        if len(col_xs) < 2 or len(row_ys) < 2:
            continue
        bx: BBox = (
            round(float(tbl["x"]) / PX, 2),
            round(float(tbl["y"]) / PX, 2),
            round(float(tbl["x1"]) / PX, 2),
            round(float(tbl["y1"]) / PX, 2),
        )
        if (bx[2] - bx[0]) < min_w or (bx[3] - bx[1]) < min_h:
            continue
        raw_cells = tbl.get("cells") or []
        if len(raw_cells) == 1 and not _words_in_bbox(words, bx, tol=1.0):
            continue
        if any(bbox_iou(bx, prev) >= 0.45 for prev in seen_boxes):
            continue

        cells = [
            CandidateCell(
                r=int(c["row"]),
                c=int(c["col"]),
                rs=max(1, int(c.get("row_span", 1))),
                cs=max(1, int(c.get("col_span", 1))),
                bbox=(
                    round(float(c["x"]) / PX, 2),
                    round(float(c["y"]) / PX, 2),
                    round(float(c["x1"]) / PX, 2),
                    round(float(c["y1"]) / PX, 2),
                ),
                borders=_edges_px_to_pt(c.get("borders")),
                bg=c.get("bg"),
            )
            for c in raw_cells
        ]
        seen_boxes.append(bx)
        candidates.append(
            TableCandidate(
                id=f"t{len(candidates)}",
                bbox=bx,
                colXs=col_xs,
                rowYs=row_ys,
                cells=cells,
                hasRulings=True,
                source="rulings",
            )
        )

    for cand in _group_h_rule_bands(
        rulings,
        words,
        seen_boxes,
        min_width_pt=min_w,
        min_height_pt=min_h,
    ):
        seen_boxes.append(cand.bbox)
        candidates.append(cand)

    for cand in _pymupdf_text_fallback(
        page,
        words,
        seen_boxes,
        min_width_pt=min_w,
        min_height_pt=min_h,
    ):
        seen_boxes.append(cand.bbox)
        candidates.append(cand)

    candidates.sort(key=lambda c: (c.bbox[1], c.bbox[0]))
    for idx, cand in enumerate(candidates):
        cand.id = f"t{idx}"
    return candidates

