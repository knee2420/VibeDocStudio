"""유스케이스: 활성 프로젝트에 읽기 전용 참조 프로젝트(최대 3개 권장)를 바인딩/해제한다."""
from __future__ import annotations

from app.core.clock import utc_now_iso
from app.core.storage import safe_segment

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
        refs = [safe_segment(ref_id) for ref_id in reference_project_ids]
        for ref_id in refs:
            if ref_id != safe_target:
                self._repo.get(ref_id)  # 존재하지 않으면 VProjectNotFoundError
        return self._repo.update(
            safe_target,
            lambda project: project.with_references(refs, now=utc_now_iso()),
        )
