"""유스케이스: WorkingOutline 을 저장된 `.vdoc` 을 건드리지 않고 Preview `.vdoc[]` 로 컴파일."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.clock import utc_now_iso

from ..mappers import compile_preview_docs, working_outline_from_dict
from ..ports import DocumentSyncPort, ProjectLookupPort, WorkingOutlineRepositoryPort
from .get_working_outline import GetWorkingOutlineUseCase


@dataclass(frozen=True)
class CompilePreviewResult:
    project_id: str
    dirty: bool
    documents: list[dict[str, Any]]


class CompilePreviewUseCase:
    def __init__(
        self,
        repository: WorkingOutlineRepositoryPort,
        projects: ProjectLookupPort,
        documents: DocumentSyncPort,
    ) -> None:
        self._projects = projects
        self._documents = documents
        self._loader = GetWorkingOutlineUseCase(repository, projects, documents)

    def execute(self, project_id: str, outline_override: dict[str, Any] | None = None) -> CompilePreviewResult:
        project_title, doc_ids = self._projects.get_project_meta(project_id)
        base_docs = self._documents.load_documents(list(doc_ids))
        record = (
            working_outline_from_dict({"projectId": project_id, **outline_override})
            if outline_override is not None
            else self._loader.execute(project_id)
        )
        compiled = compile_preview_docs(record, project_title, base_docs, now=utc_now_iso())
        return CompilePreviewResult(project_id=project_id, dirty=record.dirty, documents=compiled)
