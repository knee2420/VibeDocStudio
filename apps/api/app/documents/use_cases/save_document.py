"""유스케이스: `.vdoc` 작업 문서를 원자적으로 저장한다."""
from __future__ import annotations

from typing import Any

from app.core.clock import utc_now_iso
from app.core.storage import safe_segment

from ..models import VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort


class SaveDocumentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str, document: dict[str, Any]) -> VDocAggregateRecord:
        normalized_id = safe_segment(doc_id)
        record = VDocAggregateRecord(doc_id=normalized_id, payload={**document, "docId": normalized_id})
        return self._repository.save(record.with_payload(record.payload, now=utc_now_iso()))

