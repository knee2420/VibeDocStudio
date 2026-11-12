"""Vector ruling lines and fill rectangle extraction in upright PyMuPDF pt."""
from __future__ import annotations

from typing import Any

import pymupdf
from pdf_fidelity_engine.extract.char_normalizer import PX
from pdf_fidelity_engine.extract.raw_truth import extract_drawings
from pdf_fidelity_engine.layout.rule_stitcher import stitch_dashed_rules

from ..ir.model import BBox, Ruling


def _rot_rect_pt(bx_px: tuple[float, float, float, float], rot_mat: pymupdf.Matrix, page_rect: pymupdf.Rect, rot: int) -> BBox:
    x0, y0, x1, y1 = bx_px[0] / PX, bx_px[1] / PX, bx_px[2] / PX, bx_px[3] / PX
    r = pymupdf.Rect(x0, y0, x1, y1)
    if rot:
        r = (r * rot_mat).normalize()
    rx0 = max(0.0, min(float(page_rect.width), float(r.x0)))
    ry0 = max(0.0, min(float(page_rect.height), float(r.y0)))
    rx1 = max(rx0, min(float(page_rect.width), float(r.x1)))
    ry1 = max(ry0, min(float(page_rect.height), float(r.y1)))
    return (round(rx0, 2), round(ry0, 2), round(rx1, 2), round(ry1, 2))


def extract_vector_rulings_and_fills(
    page: pymupdf.Page,
    *,
    dash_max_gap_pt: float = 6.0,
) -> tuple[list[Ruling], list[dict[str, Any]]]:
    """Return `(rulings_pt, fills_pt)` stitched and normalized into upright pt."""
    raw_rules_px, raw_fills_px = extract_drawings(page)
    stitched_px = stitch_dashed_rules(raw_rules_px, dash_max_gap=dash_max_gap_pt * PX)

    rot = int(page.rotation or 0)
    rot_mat = page.rotation_matrix
    page_rect = page.rect

    rulings: list[Ruling] = []
    for r in stitched_px:
        bx = _rot_rect_pt((float(r["x"]), float(r["y"]), float(r["x1"]), float(r["y1"])), rot_mat, page_rect, rot)
        dx, dy = bx[2] - bx[0], bx[3] - bx[1]
        orient: str = r.get("orient") or ("h" if dx >= dy else "v")
        if rot in (90, 270):
            orient = "v" if orient == "h" else "h"
        if orient == "h" and dx < 3.0:
            continue
        if orient == "v" and dy < 3.0:
            continue
        th_pt = round(float(r.get("thickness") or 1.0) / PX, 2)
        rulings.append(
            Ruling(
                orient=orient,  # type: ignore[arg-type]
                x0=bx[0],
                y0=bx[1],
                x1=bx[2],
                y1=bx[3],
                thickness=max(0.25, th_pt),
                style="dashed" if r.get("dashed") else "solid",
                color=str(r.get("color") or "#000000"),
            )
        )

    fills_pt: list[dict[str, Any]] = []
    for f in raw_fills_px:
        bx = _rot_rect_pt((float(f["x"]), float(f["y"]), float(f["x1"]), float(f["y1"])), rot_mat, page_rect, rot)
        if bx[2] - bx[0] >= 2.0 and bx[3] - bx[1] >= 2.0:
            fills_pt.append(
                {
                    "x0": bx[0],
                    "y0": bx[1],
                    "x1": bx[2],
                    "y1": bx[3],
                    "color": str(f.get("color") or "#FFFFFF"),
                }
            )

    return rulings, fills_pt

