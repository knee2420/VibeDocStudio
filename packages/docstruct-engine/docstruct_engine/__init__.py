"""Host-independent document structure recovery engine (DocIR / PageIR)."""
from __future__ import annotations

from .acquire import WindowsOcrAdapter
from .build import AcquiredPage, acquire_pages, build_doc_ir, build_page_ir
from .config import load_prompt, load_registry, load_thresholds
from .ir.model import (
    BBox,
    BlockIR,
    CaptionBlock,
    CellIR,
    DocIR,
    FieldBlock,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    NoteBlock,
    PageIR,
    ParagraphBlock,
    Ruling,
    Span,
    TableIR,
    Word,
)
from .ir.validate import validate_page_ir
from .ports import OcrPort, StructurePort
from .reread import RereadTask, apply_reread_patch, reread_plan
from .telemetry import emit_stage_event, summarize_doc_metrics, summarize_page_metrics
from .verify import DocVerifyBundle, PendingReadItem, verify_doc, verify_page

__all__ = [
    "AcquiredPage",
    "BBox",
    "BlockIR",
    "CaptionBlock",
    "CellIR",
    "DocIR",
    "DocVerifyBundle",
    "FieldBlock",
    "FigureBlock",
    "HeadingBlock",
    "ListItemBlock",
    "NoteBlock",
    "OcrPort",
    "PageIR",
    "ParagraphBlock",
    "PendingReadItem",
    "RereadTask",
    "Ruling",
    "Span",
    "StructurePort",
    "TableIR",
    "WindowsOcrAdapter",
    "Word",
    "acquire_pages",
    "apply_reread_patch",
    "build_doc_ir",
    "build_page_ir",
    "emit_stage_event",
    "load_prompt",
    "load_registry",
    "load_thresholds",
    "reread_plan",
    "summarize_doc_metrics",
    "summarize_page_metrics",
    "validate_page_ir",
    "verify_doc",
    "verify_page",
]
