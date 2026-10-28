"""유스케이스: 식별자로 `.vdoc` 작업 문서를 조회한다."""
from __future__ import annotations

from app.core.storage import safe_segment

from ..models import VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort


class GetDocumentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str) -> VDocAggregateRecord:
        normalized_id = safe_segment(doc_id)
        return self._repository.get(normalized_id)

