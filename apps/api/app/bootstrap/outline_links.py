"""outline 도메인이 projects/documents 저장소에 직접 의존하지 않도록 이어 주는 부트스트랩 어댑터."""
from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.core.clock import utc_now_iso
from app.documents.ports import VDocDocumentRepositoryPort
from app.documents.use_cases import SaveDocumentUseCase
from app.outline.ports import DocumentSyncPort, ProjectLookupPort
from app.projects.ports import VProjectRepositoryPort


class OutlineProjectBridge(ProjectLookupPort):
    def __init__(self, projects: VProjectRepositoryPort) -> None:
        self._projects = projects

    def get_project_meta(self, project_id: str) -> tuple[str, tuple[str, ...]]:
        record = self._projects.get(project_id)
        return record.title, tuple(record.doc_ids)

    def update_project_doc_ids(self, project_id: str, doc_ids: list[str]) -> None:
        self._projects.update(
            project_id,
            lambda record: replace(
                record,
                doc_ids=tuple(doc_ids),
                updated_at=utc_now_iso(),
            ),
        )


class OutlineDocumentBridge(DocumentSyncPort):
    def __init__(self, documents: VDocDocumentRepositoryPort) -> None:
        self._documents = documents
        self._saver = SaveDocumentUseCase(documents)

    def load_documents(self, doc_ids: list[str]) -> list[dict[str, Any]]:
        loaded: list[dict[str, Any]] = []
        for doc_id in doc_ids:
            if not self._documents.exists(doc_id):
                continue
            loaded.append(self._documents.get(doc_id).payload)
        return loaded

    def save_documents(self, project_id: str, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        saved_payloads: list[dict[str, Any]] = []
        for doc in documents:
            doc_id = str(doc.get("docId") or "")
            if not doc_id:
                continue
            payload = {**doc, "projectId": project_id}
            record = self._saver.execute(doc_id, payload)
            saved_payloads.append(record.payload)
        return saved_payloads
