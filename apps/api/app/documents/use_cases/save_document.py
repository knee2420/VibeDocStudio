"""유스케이스: `.vdoc` 작업 문서를 원자적으로 저장한다."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.storage import safe_segment

from ..models import VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort


class SaveDocumentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str, document: dict[str, Any]) -> VDocAggregateRecord:
        normalized_id = safe_segment(doc_id)
        payload = dict(document)
        payload["docId"] = normalized_id
        payload["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return self._repository.save(
            VDocAggregateRecord(doc_id=normalized_id, payload=payload)
        )

