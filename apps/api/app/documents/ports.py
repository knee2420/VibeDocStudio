"""documents 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from .models import VDocAggregateRecord, VDocSummaryRecord


class VDocDocumentRepositoryPort(Protocol):
    """`data/knowledge/documents/` 아래의 `.vdoc` 작업 문서를 관리하는 포트."""

    def exists(self, doc_id: str) -> bool: ...

    def list_summaries(self) -> list[VDocSummaryRecord]: ...

    def get(self, doc_id: str) -> VDocAggregateRecord: ...

    def save(self, record: VDocAggregateRecord) -> VDocAggregateRecord: ...

    def update(
        self,
        doc_id: str,
        mutate: Callable[[VDocAggregateRecord], VDocAggregateRecord],
    ) -> VDocAggregateRecord:
        """읽기 → 변경 → 쓰기를 원자적으로 수행한다."""
        ...

    def delete(self, doc_id: str) -> None: ...
