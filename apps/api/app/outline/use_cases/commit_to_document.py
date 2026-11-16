"""유스케이스: WorkingOutline 을 Phase 3 `.vdoc` 정본으로 확정 커밋하고 sourceRef 를 재정렬."""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from app.core.clock import utc_now_iso

from ..mappers import (
    compile_preview_docs,
    extract_working_outline_from_docs,
    working_outline_from_dict,
)
from ..models import WorkingOutlineRecord
from ..ports import DocumentSyncPort, ProjectLookupPort, WorkingOutlineRepositoryPort
from .get_working_outline import GetWorkingOutlineUseCase


@dataclass(frozen=True)
class CommitOutlineResult:
    project_id: str
    documents: list[dict[str, Any]]
    outline: WorkingOutlineRecord


class CommitOutlineToDocumentsUseCase:
    def __init__(
        self,
        repository: WorkingOutlineRepositoryPort,
        projects: ProjectLookupPort,
        documents: DocumentSyncPort,
    ) -> None:
        self._repository = repository
        self._projects = projects
        self._documents = documents
        self._loader = GetWorkingOutlineUseCase(repository, projects, documents)

    def execute(self, project_id: str, outline_override: dict[str, Any] | None = None) -> CommitOutlineResult:
        project_title, doc_ids = self._projects.get_project_meta(project_id)
        base_docs = self._documents.load_documents(list(doc_ids))
        current = (
            working_outline_from_dict({"projectId": project_id, **outline_override})
            if outline_override is not None
            else self._loader.execute(project_id)
        )
        now = utc_now_iso()
        compiled = compile_preview_docs(current, project_title, base_docs, now=now)
        saved_docs = self._documents.save_documents(project_id, compiled)
        self._projects.update_project_doc_ids(project_id, [str(d["docId"]) for d in saved_docs])

        synced = extract_working_outline_from_docs(project_id, project_title, saved_docs, now=now)
        final_outline = replace(synced, revision=current.revision + 1, dirty=False)
        self._repository.save(final_outline)
        return CommitOutlineResult(project_id=project_id, documents=saved_docs, outline=final_outline)
