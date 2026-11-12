"""Table detection, grid snapping, word assignment, property enrichment, and continuation."""
from __future__ import annotations

from .assign import assign_words_to_table, join_words_to_text, sort_words_reading_order
from .candidates import CandidateCell, TableCandidate, propose_table_candidates
from .continuation import detect_table_continuations
from .html_io import render_table_proposal_html, validate_table_html_grid
from .props import enrich_table_properties
from .reconcile import ReconcileResult, reconcile_table, validate_and_apply_word_fixes
from .snap import snap_candidate_grid

__all__ = [
    "CandidateCell",
    "ReconcileResult",
    "TableCandidate",
    "assign_words_to_table",
    "detect_table_continuations",
    "enrich_table_properties",
    "join_words_to_text",
    "propose_table_candidates",
    "reconcile_table",
    "render_table_proposal_html",
    "snap_candidate_grid",
    "sort_words_reading_order",
    "validate_and_apply_word_fixes",
    "validate_table_html_grid",
]
