"""Auto-Index 파이프라인 (도메인 로직 — 저장 위치 · LLM 공급자를 모른다).

계약: `contracts.py` (스키마 `kdeck/1`). 실행: `run.run_index()`. 읽기: `reader.DeckReader`.
"""
from .contracts import (
    SCHEMA_VERSION,
    Anchor,
    Asset,
    Card,
    Element,
    ScopeProfile,
    Section,
    Segment,
)
from .run import IndexCancelled, IndexOutcome, IndexSpec, run_index

__all__ = [
    "SCHEMA_VERSION",
    "Anchor",
    "Asset",
    "Card",
    "Element",
    "IndexCancelled",
    "IndexOutcome",
    "IndexSpec",
    "ScopeProfile",
    "Section",
    "Segment",
    "run_index",
]
