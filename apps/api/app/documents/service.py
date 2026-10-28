"""documents 도메인 서비스 (식별자 정규화 및 유스케이스 위임)."""
from __future__ import annotations

from typing import Any

from .models import VDocAggregateRecord, VDocSummaryRecord
from .use_cases import (
    DeleteDocumentUseCase,
    GetDocumentUseCase,
    ListDocumentsUseCase,
    SaveDocumentUseCase,
    UpdateSlotContentUseCase,
)


class DocumentService:
    def __init__(
        self,
        list_docs: ListDocumentsUseCase,
        get_doc: GetDocumentUseCase,
        save_doc: SaveDocumentUseCase,
        update_slot: UpdateSlotContentUseCase,
        delete_doc: DeleteDocumentUseCase,
    ) -> None:
        self._list_docs = list_docs
        self._get_doc = get_doc
        self._save_doc = save_doc
        self._update_slot = update_slot
        self._delete_doc = delete_doc

    def list_documents(self) -> list[VDocSummaryRecord]:
        return self._list_docs.execute()

    def get_document(self, doc_id: str) -> VDocAggregateRecord:
        return self._get_doc.execute(doc_id)

    def save_document(self, doc_id: str, document: dict[str, Any]) -> VDocAggregateRecord:
        return self._save_doc.execute(doc_id, document)

    def update_slot_content(
        self, doc_id: str, slot_id: str, content: str
    ) -> VDocAggregateRecord:
        return self._update_slot.execute(doc_id, slot_id, content)

    def delete_document(self, doc_id: str) -> None:
        self._delete_doc.execute(doc_id)

