"""Non-table block detection, reflow, and reading order."""
from __future__ import annotations

from .fields import detect_field_blocks
from .markers import (
    PatternMatcher,
    VisualLine,
    group_words_into_lines,
    spans_from_words,
)
from .order import compute_reading_order
from .reflow import reflow_non_table_blocks

__all__ = [
    "PatternMatcher",
    "VisualLine",
    "compute_reading_order",
    "detect_field_blocks",
    "group_words_into_lines",
    "reflow_non_table_blocks",
    "spans_from_words",
]
