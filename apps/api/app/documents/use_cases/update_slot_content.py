"""유스케이스: `.vdoc` 문서 내 단일 슬롯의 HTML 본문만 부분 갱신한다."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.storage import safe_segment

from ..errors import VDocSlotNotFoundError
from ..models import VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort


class UpdateSlotContentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str, slot_id: str, content: str) -> VDocAggregateRecord:
        normalized_doc_id = safe_segment(doc_id)
        normalized_slot_id = safe_segment(slot_id)
        record = self._repository.get(normalized_doc_id)
        payload = dict(record.payload)
        slots = dict(payload.get("slots", {}))
        if normalized_slot_id not in slots:
            raise VDocSlotNotFoundError(
                f"Slot '{normalized_slot_id}' not found in document '{normalized_doc_id}'"
            )
        slot_obj = dict(slots[normalized_slot_id])
        slot_obj["content"] = content
        slots[normalized_slot_id] = slot_obj
        payload["slots"] = slots
        payload["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return self._repository.save(
            VDocAggregateRecord(doc_id=normalized_doc_id, payload=payload)
        )

