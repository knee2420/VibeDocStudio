"""Verification metrics package for docstruct-engine."""
from __future__ import annotations

from .fields import FieldEvalResult, evaluate_fields
from .lines import LineMatchResult, compare_rulings, table_grid_lines
from .ned import compute_ned, page_ned, page_reading_order_text
from .report import EvalReport, PageVerifyReport, format_eval_summary
from .teds import compute_teds, levenshtein, normalize_text, page_table_teds
from .verify import DocVerifyBundle, PendingReadItem, verify_doc, verify_page

__all__ = [
    "DocVerifyBundle",
    "EvalReport",
    "FieldEvalResult",
    "LineMatchResult",
    "PageVerifyReport",
    "PendingReadItem",
    "compare_rulings",
    "compute_ned",
    "compute_teds",
    "evaluate_fields",
    "format_eval_summary",
    "levenshtein",
    "normalize_text",
    "page_ned",
    "page_reading_order_text",
    "page_table_teds",
    "table_grid_lines",
    "verify_doc",
    "verify_page",
]
