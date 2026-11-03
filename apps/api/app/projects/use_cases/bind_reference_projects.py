"""유스케이스: 활성 프로젝트에 읽기 전용 참조 프로젝트(최대 3개 권장)를 바인딩/해제한다."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.storage import safe_segment

from ..errors import VProjectReadOnlyViolationError, VProjectValidationError
from ..models import VProjectManifestRecord
from ..ports import VProjectRepositoryPort


class BindReferenceProjectsUseCase:
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        project_id: str,
        reference_project_ids: list[str],
    ) -> VProjectManifestRecord:
        safe_target = safe_segment(project_id)
        target = self._repo.get(safe_target)
        if target.is_reference_only:
            raise VProjectReadOnlyViolationError(
                f"Cannot bind references onto read-only project '{safe_target}'"
            )

        normalized_refs: list[str] = []
        for ref_id in reference_project_ids:
            safe_ref = safe_segment(ref_id)
            if safe_ref == safe_target:
                raise VProjectValidationError("A project cannot reference itself")
            # Verify reference project exists
            self._repo.get(safe_ref)
            if safe_ref not in normalized_refs:
                normalized_refs.append(safe_ref)

        updated = VProjectManifestRecord(
            project_id=target.project_id,
            title=target.title,
            description=target.description,
            is_reference_only=target.is_reference_only,
            active_phase=target.active_phase,
            doc_ids=target.doc_ids,
            reference_project_ids=tuple(normalized_refs),
            storyline_nodes=target.storyline_nodes,
            provenance_lineage=target.provenance_lineage,
            updated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        return self._repo.save(updated)

