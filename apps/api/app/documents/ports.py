"""documents 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

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

    # --- 개정 이력 (`revisions.jsonl`) ---

    def append_revision(self, doc_id: str, entry: dict[str, Any]) -> None: ...

    def replace_last_revision(self, doc_id: str, entry: dict[str, Any]) -> None: ...

    def list_revisions(self, doc_id: str, limit: int = 200) -> list[dict[str, Any]]:
        """최신이 앞."""
        ...

    # --- 버전 (`versions/`) — 그 시점 문서 전체를 보관해 통째로 되돌릴 수 있다 ---

    def list_versions(self, doc_id: str) -> list[dict[str, Any]]:
        """오래된 것이 앞."""
        ...

    def add_version(self, doc_id: str, entry: dict[str, Any], payload: dict[str, Any]) -> None: ...

    def get_version_payload(self, doc_id: str, version_id: str) -> dict[str, Any] | None: ...

    def update_version(self, doc_id: str, version_id: str, patch: dict[str, Any]) -> dict[str, Any] | None: ...

    def delete_version(self, doc_id: str, version_id: str) -> bool: ...
