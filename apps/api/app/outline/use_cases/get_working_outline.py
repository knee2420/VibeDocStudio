"""유스케이스: 프로젝트의 WorkingOutline 조회 (없거나 강제 재동기화 시 `.vdoc`에서 추출)."""
from __future__ import annotations

from app.core.clock import utc_now_iso

from ..mappers import extract_working_outline_from_docs
from ..models import WorkingOutlineRecord
from ..ports import DocumentSyncPort, ProjectLookupPort, WorkingOutlineRepositoryPort


class GetWorkingOutlineUseCase:
    def __init__(
        self,
        repository: WorkingOutlineRepositoryPort,
        projects: ProjectLookupPort,
        documents: DocumentSyncPort,
    ) -> None:
        self._repository = repository
        self._projects = projects
        self._documents = documents

    def execute(self, project_id: str, *, force_refresh: bool = False) -> WorkingOutlineRecord:
        existing = None if force_refresh else self._repository.get(project_id)
        if existing is not None:
            return existing

        project_title, doc_ids = self._projects.get_project_meta(project_id)
        docs = self._documents.load_documents(list(doc_ids))
        extracted = extract_working_outline_from_docs(
            project_id,
            project_title,
            docs,
            now=utc_now_iso(),
        )
        return self._repository.save(extracted)
