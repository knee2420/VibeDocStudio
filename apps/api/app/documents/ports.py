"""documents 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Protocol

from .models import VDocAggregateRecord, VDocSummaryRecord


class VDocDocumentRepositoryPort(Protocol):
    """`data/knowledge/documents/` 아래의 `.vdoc` 작업 문서를 관리하는 포트."""

    def list_summaries(self) -> list[VDocSummaryRecord]: ...

    def get(self, doc_id: str) -> VDocAggregateRecord: ...

    def save(self, record: VDocAggregateRecord) -> VDocAggregateRecord: ...

    def delete(self, doc_id: str) -> None: ...

