"""Page PNG and padded region crop rendering for VLM/OCR reads."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pymupdf

from ..ir.model import BBox


def render_page_png(
    page: pymupdf.Page,
    out_path: str | Path,
    *,
    dpi: int = 200,
) -> Path:
    dest = Path(out_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    scale = dpi / 72.0
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    pix.save(str(dest))
    return dest


def render_region_crop_png(
    page: pymupdf.Page,
    bbox_pt: BBox,
    out_path: str | Path,
    *,
    dpi: int = 200,
    pad_pt: float = 8.0,
) -> Path:
    dest = Path(out_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    scale = dpi / 72.0
    clip = pymupdf.Rect(
        bbox_pt[0] - pad_pt,
        bbox_pt[1] - pad_pt,
        bbox_pt[2] + pad_pt,
        bbox_pt[3] + pad_pt,
    ) & page.rect
    if clip.is_empty:
        clip = page.rect
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
    pix.save(str(dest))
    return dest


def crop_pil_image(
    img_path: str | Path,
    bbox_pt: BBox,
    page_size_pt: tuple[float, float],
    out_path: Optional[str | Path] = None,
    *,
    pad_pt: float = 8.0,
) -> Path:
    """Crop from a rendered page PNG when only raster image exists."""
    from PIL import Image

    img = Image.open(img_path)
    sx = img.width / max(1.0, page_size_pt[0])
    sy = img.height / max(1.0, page_size_pt[1])
    x0 = max(0, int((bbox_pt[0] - pad_pt) * sx))
    y0 = max(0, int((bbox_pt[1] - pad_pt) * sy))
    x1 = min(img.width, int((bbox_pt[2] + pad_pt) * sx))
    y1 = min(img.height, int((bbox_pt[3] + pad_pt) * sy))
    cropped = img.crop((x0, y0, max(x0 + 1, x1), max(y0 + 1, y1)))
    dest = Path(out_path) if out_path else Path(img_path).with_suffix(".crop.png")
    dest.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(dest)
    return dest

