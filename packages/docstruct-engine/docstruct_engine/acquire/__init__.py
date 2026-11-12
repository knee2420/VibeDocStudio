"""Acquisition subpackage for PDF/image pages."""
from __future__ import annotations

from .figures import crop_bbox_jpeg_data_uri, extract_figures
from .ocr import WindowsOcrAdapter
from .page_mode import PageModeInfo, SourceKind, classify_page_mode
from .render import crop_pil_image, render_page_png, render_region_crop_png
from .rulings import extract_vector_rulings_and_fills
from .words import extract_vector_words

__all__ = [
    "PageModeInfo",
    "SourceKind",
    "WindowsOcrAdapter",
    "classify_page_mode",
    "crop_bbox_jpeg_data_uri",
    "crop_pil_image",
    "extract_figures",
    "extract_vector_rulings_and_fills",
    "extract_vector_words",
    "render_page_png",
    "render_region_crop_png",
]
