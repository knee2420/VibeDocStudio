"""DocIR / HWPX -> .vdoc compiler and block builders."""
from __future__ import annotations

from .docstruct_vdoc import (
    BLOCK_GAP,
    CompiledPageReport,
    build_doc_ir_from_pdf_bytes,
    default_ocr_port,
    doc_ir_pages_to_vdoc,
    doc_ir_to_vdoc,
    finalize_vdoc_envelope,
)
from .hwpx_vdoc import BuildResult, PageReport, build_pages, page_summary, parse_numbers
from .vdoc_build import (
    KINDS,
    SURFACE_PAGE,
    blank_page,
    block_slot_ids,
    inline_text,
    make_block,
    media_sources,
    sanitize_html,
)

__all__ = [
    "BLOCK_GAP",
    "BuildResult",
    "CompiledPageReport",
    "KINDS",
    "PageReport",
    "SURFACE_PAGE",
    "blank_page",
    "block_slot_ids",
    "build_doc_ir_from_pdf_bytes",
    "build_pages",
    "default_ocr_port",
    "doc_ir_pages_to_vdoc",
    "doc_ir_to_vdoc",
    "finalize_vdoc_envelope",
    "inline_text",
    "make_block",
    "media_sources",
    "page_summary",
    "parse_numbers",
    "sanitize_html",
]

