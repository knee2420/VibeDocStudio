"""유스케이스: 프로젝트 목록 조회, 단건 조회, 프로젝트 매니페스트 저장(복원)."""
from __future__ import annotations

from dataclasses import replace

from app.core.clock import utc_now_iso
from app.core.storage import safe_segment

from ..errors import VProjectNotFoundError, VProjectValidationError
from ..models import VProjectManifestRecord
from ..ports import VProjectRepositoryPort


class ListProjectsUseCase:
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(self) -> list[VProjectManifestRecord]:
        return self._repo.list_projects()


class GetProjectUseCase:
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(self, project_id: str) -> VProjectManifestRecord:
        return self._repo.get(safe_segment(project_id))


class SaveProjectUseCase:
    """매니페스트 전체를 교체한다 (새 프로젝트 생성 · Undo 시점으로의 복원)."""

    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(self, project_id: str, manifest: VProjectManifestRecord) -> VProjectManifestRecord:
        safe_id = safe_segment(project_id)
        if not manifest.title.strip():
            raise VProjectValidationError("Project title must not be empty")

        candidate = replace(
            manifest,
            project_id=safe_id,
            title=manifest.title.strip(),
            updated_at=utc_now_iso(),
        )

        def _replace(existing: VProjectManifestRecord) -> VProjectManifestRecord:
            return candidate

        try:
            return self._repo.update(safe_id, _replace)
        except VProjectNotFoundError:
            return self._repo.save(candidate)
