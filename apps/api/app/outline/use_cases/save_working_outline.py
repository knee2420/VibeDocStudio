"""유스케이스: Workflowy 에디터가 편집한 WorkingOutline 트리 전체를 저장한다."""
from __future__ import annotations

from dataclasses import replace

from app.core.clock import utc_now_iso

from ..mappers import working_outline_from_dict
from ..models import WorkingOutlineRecord
from ..ports import ProjectLookupPort, WorkingOutlineRepositoryPort


class SaveWorkingOutlineUseCase:
    def __init__(
        self,
        repository: WorkingOutlineRepositoryPort,
        projects: ProjectLookupPort,
    ) -> None:
        self._repository = repository
        self._projects = projects

    def execute(self, project_id: str, payload: dict[str, object]) -> WorkingOutlineRecord:
        self._projects.get_project_meta(project_id)
        existing = self._repository.get(project_id)
        next_record = working_outline_from_dict({"projectId": project_id, **payload})
        next_rev = max(next_record.revision, (existing.revision + 1) if existing else 1)
        normalized = replace(
            next_record,
            project_id=project_id,
            revision=next_rev,
            updated_at=utc_now_iso(),
        )
        return self._repository.save(normalized)
