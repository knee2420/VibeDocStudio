"""documents 도메인의 프레임워크 독립 영속 모델."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class VDocSummaryRecord:
    doc_id: str
    title: str
    status: str
    updated_at: str
    page_count: int
    slot_count: int


@dataclass(frozen=True)
class VDocAggregateRecord:
    doc_id: str
    payload: dict[str, Any]

