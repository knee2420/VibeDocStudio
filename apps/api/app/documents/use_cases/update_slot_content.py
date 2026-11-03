"""유스케이스: `.vdoc` 문서 내 단일 슬롯의 HTML 본문만 부분 갱신한다."""
from __future__ import annotations

from app.core.clock import utc_now_iso
from app.core.storage import safe_segment

from ..models import VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort


class UpdateSlotContentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str, slot_id: str, content: str) -> VDocAggregateRecord:
        normalized_slot_id = safe_segment(slot_id)
        return self._repository.update(
            safe_segment(doc_id),
            lambda doc: doc.with_slot_content(normalized_slot_id, content, now=utc_now_iso()),
        )
