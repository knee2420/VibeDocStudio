"""유스케이스: `.vdoc` 작업 문서를 삭제한다."""
from __future__ import annotations

from app.core.storage import safe_segment

from ..ports import VDocDocumentRepositoryPort


class DeleteDocumentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str) -> None:
        normalized_id = safe_segment(doc_id)
        self._repository.delete(normalized_id)

