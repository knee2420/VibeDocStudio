"""유스케이스: 저장된 `.vdoc` 작업 문서 요약 목록을 조회한다."""
from __future__ import annotations

from ..models import VDocSummaryRecord
from ..ports import VDocDocumentRepositoryPort


class ListDocumentsUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self) -> list[VDocSummaryRecord]:
        return self._repository.list_summaries()

