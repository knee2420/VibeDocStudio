"""Figure detection and JPEG data URI export (150 DPI, long edge <= 1600px, quality 82)."""
from __future__ import annotations

import base64
import io
from typing import Optional

import pymupdf
from PIL import Image

from ..ir.model import BBox, FigureBlock, bbox_iou


def crop_bbox_jpeg_data_uri(
    page: pymupdf.Page,
    bbox_pt: BBox,
    *,
    dpi: int = 150,
    max_edge_px: int = 1600,
    quality: int = 82,
) -> str:
    """Render a page region in upright coordinates and encode as JPEG data URI (§12.1)."""
    scale = dpi / 72.0
    clip = pymupdf.Rect(bbox_pt) & page.rect
    if clip.is_empty:
        clip = page.rect
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    w, h = img.size
    if max(w, h) > max_edge_px and max(w, h) > 0:
        ratio = max_edge_px / float(max(w, h))
        img = img.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def extract_figures(
    page: pymupdf.Page,
    *,
    exclude_boxes: Optional[list[BBox]] = None,
    dpi: int = 150,
    max_edge_px: int = 1600,
    quality: int = 82,
    min_size_pt: float = 18.0,
) -> list[FigureBlock]:
    """Detect non-table raster figures and export each crop as a JPEG data URI."""
    rot = int(page.rotation or 0)
    rot_mat = page.rotation_matrix
    page_rect = page.rect
    page_area = max(1.0, float(page_rect.width) * float(page_rect.height))

    raw_boxes: list[BBox] = []
    for info in page.get_image_info(xrefs=True):
        bx = info.get("bbox")
        if not bx:
            continue
        r = pymupdf.Rect(bx)
        if rot:
            r = (r * rot_mat).normalize()
        r = r & page_rect
        if r.is_empty:
            continue
        w, h = float(r.width), float(r.height)
        if w < min_size_pt or h < min_size_pt:
            continue
        # Full-page background scan raster is not a localized embedded figure
        if (w * h) / page_area >= 0.85:
            continue
        cand: BBox = (round(float(r.x0), 2), round(float(r.y0), 2), round(float(r.x1), 2), round(float(r.y1), 2))
        if any(bbox_iou(cand, ex) >= 0.5 for ex in (exclude_boxes or [])):
            continue
        if any(bbox_iou(cand, prev) >= 0.7 for prev in raw_boxes):
            continue
        raw_boxes.append(cand)

    raw_boxes.sort(key=lambda b: (b[1], b[0]))
    figures: list[FigureBlock] = []
    for idx, bx in enumerate(raw_boxes):
        uri = crop_bbox_jpeg_data_uri(
            page,
            bx,
            dpi=dpi,
            max_edge_px=max_edge_px,
            quality=quality,
        )
        figures.append(
            FigureBlock(
                id=f"fig{idx}",
                bbox=bx,
                figureKind="photo",
                keepText=False,
                alt=f"figure_{idx + 1}",
                src=uri,
            )
        )
    return figures

