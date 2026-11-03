"""유스케이스: 프로젝트 목록 조회, 단건 조회, 프로젝트 매니페스트 저장."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.storage import safe_segment

from ..errors import VProjectReadOnlyViolationError, VProjectValidationError
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
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        project_id: str,
        manifest: VProjectManifestRecord,
        *,
        allow_readonly_override: bool = False,
    ) -> VProjectManifestRecord:
        safe_id = safe_segment(project_id)
        if not manifest.title.strip():
            raise VProjectValidationError("Project title must not be empty")

        try:
            existing = self._repo.get(safe_id)
        except Exception:
            existing = None

        if existing and existing.is_reference_only and not allow_readonly_override:
            raise VProjectReadOnlyViolationError(
                f"Reference project '{safe_id}' is read-only and cannot be mutated directly."
            )

        updated = VProjectManifestRecord(
            project_id=safe_id,
            title=manifest.title.strip(),
            description=manifest.description,
            is_reference_only=manifest.is_reference_only,
            active_phase=manifest.active_phase,
            doc_ids=manifest.doc_ids,
            reference_project_ids=manifest.reference_project_ids,
            storyline_nodes=manifest.storyline_nodes,
            provenance_lineage=manifest.provenance_lineage,
            updated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        return self._repo.save(updated)

