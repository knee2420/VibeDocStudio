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


def detect_raster_photo_boxes(
    page: pymupdf.Page,
    *,
    dpi: int = 150,
    min_dim_pt: float = 32.0,
) -> list[BBox]:
    """Segment continuous-tone chromatic photo regions from a page raster without splitting lines of text."""
    scale = dpi / 72.0
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    w_px, h_px = int(pix.width), int(pix.height)
    if w_px <= 0 or h_px <= 0:
        return []
    px_bytes = memoryview(pix.samples)
    pw = float(page.rect.width)
    ph = float(page.rect.height)
    sx = pw / max(1, w_px)
    sy = ph / max(1, h_px)

    tile = max(16, int(round(12.0 * dpi / 72.0)))
    cols = max(1, w_px // tile)
    rows = max(1, h_px // tile)
    chroma_map: list[list[bool]] = [[False] * cols for _ in range(rows)]
    photo_cells: list[tuple[int, int]] = []
    stride = w_px * 3

    for tr in range(rows):
        y0, y1 = tr * tile, min(h_px, (tr + 1) * tile)
        for tc in range(cols):
            x0, x1 = tc * tile, min(w_px, (tc + 1) * tile)
            sat_sum = 0
            nonwhite = 0
            samples = 0
            for y in range(y0, y1, 3):
                row_off = y * stride
                for x in range(x0, x1, 3):
                    off = row_off + x * 3
                    r, g, b = px_bytes[off], px_bytes[off + 1], px_bytes[off + 2]
                    mx = max(r, g, b)
                    mn = min(r, g, b)
                    sat = mx - mn
                    samples += 1
                    if sat > 18:
                        sat_sum += sat
                    if mn < 235:
                        nonwhite += 1
            if samples > 0 and (nonwhite / samples) > 0.35 and (sat_sum / samples) > 22.0:
                chroma_map[tr][tc] = True
                photo_cells.append((tr, tc))

    seen = [[False] * cols for _ in range(rows)]
    boxes: list[BBox] = []
    for sr, sc in photo_cells:
        if seen[sr][sc]:
            continue
        q = [(sr, sc)]
        seen[sr][sc] = True
        r0 = r1 = sr
        c0 = c1 = sc
        count = 0
        while q:
            cr, cc = q.pop()
            count += 1
            r0, r1 = min(r0, cr), max(r1, cr)
            c0, c1 = min(c0, cc), max(c1, cc)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    nr, nc = cr + dr, cc + dc
                    if 0 <= nr < rows and 0 <= nc < cols and not seen[nr][nc] and chroma_map[nr][nc]:
                        seen[nr][nc] = True
                        q.append((nr, nc))
        bx0 = round(c0 * tile * sx, 2)
        by0 = round(r0 * tile * sy, 2)
        bx1 = round(min(w_px, (c1 + 1) * tile) * sx, 2)
        by1 = round(min(h_px, (r1 + 1) * tile) * sy, 2)
        if count >= 4 and (bx1 - bx0) >= min_dim_pt and (by1 - by0) >= min_dim_pt:
            boxes.append((bx0, by0, bx1, by1))

    boxes.sort(key=lambda b: (b[1], b[0]))
    return boxes


def extract_figures(
    page: pymupdf.Page,
    *,
    exclude_boxes: Optional[list[BBox]] = None,
    extra_photo_boxes: Optional[list[BBox]] = None,
    is_scan: bool = False,
    dpi: int = 150,
    max_edge_px: int = 1600,
    quality: int = 82,
    min_size_pt: float = 12.0,
) -> list[FigureBlock]:
    """Detect non-table raster figures and export each crop as a JPEG data URI."""
    rot = int(page.rotation or 0)
    rot_mat = page.rotation_matrix
    page_rect = page.rect
    page_area = max(1.0, float(page_rect.width) * float(page_rect.height))

    raw_boxes: list[BBox] = []
    saw_fullpage_raster = False
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
        # Full-page background scan raster: segment embedded photo regions rather than emitting whole page
        if (w * h) / page_area >= 0.85:
            saw_fullpage_raster = True
            continue
        cand: BBox = (round(float(r.x0), 2), round(float(r.y0), 2), round(float(r.x1), 2), round(float(r.y1), 2))
        if any(bbox_iou(cand, ex) >= 0.5 for ex in (exclude_boxes or [])):
            continue
        if any(bbox_iou(cand, prev) >= 0.7 for prev in raw_boxes):
            continue
        raw_boxes.append(cand)

    if extra_photo_boxes is not None:
        scan_boxes = list(extra_photo_boxes)
    elif is_scan or saw_fullpage_raster:
        scan_boxes = detect_raster_photo_boxes(page, dpi=dpi)
    else:
        scan_boxes = []
    for cand in scan_boxes:
        if any(bbox_iou(cand, ex) >= 0.5 for ex in (exclude_boxes or [])):
            continue
        if any(bbox_iou(cand, prev) >= 0.35 for prev in raw_boxes):
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

