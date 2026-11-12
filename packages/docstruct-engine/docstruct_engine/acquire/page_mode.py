"""Page source mode classification (`pdf-vector`, `pdf-scan`, `pdf-hybrid`)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pymupdf

SourceKind = Literal["pdf-vector", "pdf-scan", "pdf-hybrid"]


@dataclass(frozen=True)
class PageModeInfo:
    kind: SourceKind
    charCount: int
    imageCoverage: float
    imageCount: int
    rotation: int


def classify_page_mode(page: pymupdf.Page) -> PageModeInfo:
    """Classify a PDF page as vector, scanned image, or hybrid."""
    rect = page.rect
    page_area = max(1.0, float(rect.width) * float(rect.height))
    rot_mat = page.rotation_matrix

    raw_text = page.get_text("text") or ""
    non_ws_chars = sum(1 for ch in raw_text if not ch.isspace())

    img_infos = page.get_image_info()
    covered_area = 0.0
    for info in img_infos:
        bx = info.get("bbox")
        if not bx:
            continue
        r = pymupdf.Rect(bx)
        if page.rotation:
            r = (r * rot_mat).normalize()
        clipped = r & rect
        if not clipped.is_empty:
            covered_area += max(0.0, float(clipped.width)) * max(0.0, float(clipped.height))

    coverage = min(1.0, covered_area / page_area)
    img_count = len(img_infos)

    if non_ws_chars <= 5 and img_count >= 1 and coverage >= 0.45:
        kind: SourceKind = "pdf-scan"
    elif non_ws_chars <= 10 and len(page.get_drawings()) == 0 and img_count >= 1:
        kind = "pdf-scan"
    elif coverage >= 0.35 and non_ws_chars < 250 and img_count >= 1:
        kind = "pdf-hybrid"
    elif non_ws_chars == 0 and img_count == 0:
        kind = "pdf-vector"
    else:
        kind = "pdf-vector"

    return PageModeInfo(
        kind=kind,
        charCount=non_ws_chars,
        imageCoverage=round(coverage, 4),
        imageCount=img_count,
        rotation=int(page.rotation or 0),
    )

