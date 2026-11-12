"""Ruling line F1 geometric comparison without browser dependencies."""
from __future__ import annotations

from pydantic import BaseModel, Field

from ..ir.model import BBox, Ruling, TableIR


class LineMatchResult(BaseModel):
    precision: float
    recall: float
    f1: float
    matched: int
    predCount: int
    goldCount: int
    missingBoxes: list[BBox] = Field(default_factory=list)
    extraBoxes: list[BBox] = Field(default_factory=list)


def _ruling_box(r: Ruling) -> BBox:
    pad = max(0.5, r.thickness * 0.5)
    if r.orient == "h":
        return (r.x0, r.y0 - pad, r.x1, r.y1 + pad)
    return (r.x0 - pad, r.y0, r.x1 + pad, r.y1)


def _merge_collinear(rulings: list[Ruling], *, coord_tol: float = 1.5, gap_tol: float = 2.5) -> list[Ruling]:
    out: list[Ruling] = []
    for orient in ("h", "v"):
        subset = [r for r in rulings if r.orient == orient]
        if not subset:
            continue

        def perp_center(r: Ruling) -> float:
            return (r.y0 + r.y1) * 0.5 if orient == "h" else (r.x0 + r.x1) * 0.5

        def span(r: Ruling) -> tuple[float, float]:
            return (r.x0, r.x1) if orient == "h" else (r.y0, r.y1)

        subset.sort(key=perp_center)
        groups: list[list[Ruling]] = [[subset[0]]]
        for r in subset[1:]:
            if abs(perp_center(r) - perp_center(groups[-1][0])) <= coord_tol:
                groups[-1].append(r)
            else:
                groups.append([r])

        for grp in groups:
            grp.sort(key=lambda r: span(r)[0])
            cur = grp[0].model_copy()
            for nxt in grp[1:]:
                ca, cb = span(cur)
                na, nb = span(nxt)
                if na <= cb + gap_tol:
                    if orient == "h":
                        cur.x0, cur.x1 = min(ca, na), max(cb, nb)
                        cur.y0 = min(cur.y0, nxt.y0)
                        cur.y1 = max(cur.y1, nxt.y1)
                    else:
                        cur.y0, cur.y1 = min(ca, na), max(cb, nb)
                        cur.x0 = min(cur.x0, nxt.x0)
                        cur.x1 = max(cur.x1, nxt.x1)
                    cur.thickness = max(cur.thickness, nxt.thickness)
                else:
                    out.append(cur)
                    cur = nxt.model_copy()
            out.append(cur)
    return out


def table_grid_lines(table: TableIR) -> list[Ruling]:
    """Reconstruct merged-span-aware ruling segments implied by a TableIR."""
    if not table.colXs or not table.rowYs:
        return []
    if len(table.colXs) != table.nCols + 1 or len(table.rowYs) != table.nRows + 1:
        return []

    raw: list[Ruling] = []
    for cell in table.cells:
        if cell.r + cell.rs > table.nRows or cell.c + cell.cs > table.nCols:
            continue
        x0, x1 = table.colXs[cell.c], table.colXs[cell.c + cell.cs]
        y0, y1 = table.rowYs[cell.r], table.rowYs[cell.r + cell.rs]
        b = cell.borders
        edges = (
            ("h", x0, y0, x1, y0, b.top if b else None),
            ("h", x0, y1, x1, y1, b.bottom if b else None),
            ("v", x0, y0, x0, y1, b.left if b else None),
            ("v", x1, y0, x1, y1, b.right if b else None),
        )
        for orient, ex0, ey0, ex1, ey1, edge in edges:
            if edge is not None and edge.style == "none":
                continue
            raw.append(
                Ruling(
                    orient=orient,  # type: ignore[arg-type]
                    x0=ex0,
                    y0=ey0,
                    x1=ex1,
                    y1=ey1,
                    thickness=edge.width if edge else 0.75,
                    style=edge.style if edge else "solid",
                    color=edge.color if edge else "#000000",
                )
            )
    return _merge_collinear(raw)


def _overlap_ratio(a0: float, a1: float, b0: float, b1: float) -> float:
    inter = max(0.0, min(a1, b1) - max(a0, b0))
    denom = max(min(a1 - a0, b1 - b0), 1e-6)
    return inter / denom


def compare_rulings(
    pred_rulings: list[Ruling],
    gold_rulings: list[Ruling],
    *,
    tol_pt: float = 2.0,
    min_overlap: float = 0.7,
    min_len_pt: float = 6.0,
) -> LineMatchResult:
    """Compare predicted and gold ruling sets using length-weighted geometric overlap."""
    preds = [r for r in _merge_collinear(pred_rulings) if _seg_len(r) >= min_len_pt]
    golds = [r for r in _merge_collinear(gold_rulings) if _seg_len(r) >= min_len_pt]
    if not preds and not golds:
        return LineMatchResult(precision=1.0, recall=1.0, f1=1.0, matched=0, predCount=0, goldCount=0)
    if not preds or not golds:
        return LineMatchResult(
            precision=0.0,
            recall=0.0,
            f1=0.0,
            matched=0,
            predCount=len(preds),
            goldCount=len(golds),
            missingBoxes=[_ruling_box(g) for g in golds],
            extraBoxes=[_ruling_box(p) for p in preds],
        )

    matched_pred: set[int] = set()
    matched_gold: set[int] = set()

    for gi, g in enumerate(golds):
        gc = (g.y0 + g.y1) * 0.5 if g.orient == "h" else (g.x0 + g.x1) * 0.5
        ga, gb = (g.x0, g.x1) if g.orient == "h" else (g.y0, g.y1)
        covered = 0.0
        for pi, p in enumerate(preds):
            if p.orient != g.orient:
                continue
            pc = (p.y0 + p.y1) * 0.5 if p.orient == "h" else (p.x0 + p.x1) * 0.5
            if abs(pc - gc) > tol_pt:
                continue
            pa, pb = (p.x0, p.x1) if p.orient == "h" else (p.y0, p.y1)
            inter = max(0.0, min(gb, pb) - max(ga, pa))
            if inter > 0.0 and (_overlap_ratio(ga, gb, pa, pb) >= min_overlap or inter / max(gb - ga, 1e-6) >= 0.45):
                matched_pred.add(pi)
                covered += inter
        if covered / max(gb - ga, 1e-6) >= min_overlap:
            matched_gold.add(gi)

    matched_g_cnt = len(matched_gold)
    matched_p_cnt = len(matched_pred)
    recall = matched_g_cnt / len(golds)
    precision = matched_p_cnt / len(preds)
    f1 = (2.0 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return LineMatchResult(
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1=round(f1, 4),
        matched=matched_g_cnt,
        predCount=len(preds),
        goldCount=len(golds),
        missingBoxes=[_ruling_box(g) for i, g in enumerate(golds) if i not in matched_gold],
        extraBoxes=[_ruling_box(p) for i, p in enumerate(preds) if i not in matched_pred],
    )


def _seg_len(r: Ruling) -> float:
    return (r.x1 - r.x0) if r.orient == "h" else (r.y1 - r.y0)

