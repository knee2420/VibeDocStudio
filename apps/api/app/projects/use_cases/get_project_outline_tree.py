"""유스케이스: 4단계 프랙탈 줌 위계(Project -> Document -> Page/Block -> Slot) 아웃라인 트리 프로젝션."""
from __future__ import annotations

from dataclasses import dataclass

from app.core.storage import safe_segment

from ..models import OutlineSubtree, VProjectManifestRecord
from ..ports import VProjectRepositoryPort


@dataclass(frozen=True)
class ProjectOutlineProjection:
    project: VProjectManifestRecord
    subtree: OutlineSubtree


class GetProjectOutlineTreeUseCase:
    """프로젝트의 아웃라이너 트리를 특정 `root_node_id`(Zoom-In 타겟) 및 조상 경로와 함께 반환한다."""

    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        project_id: str,
        root_node_id: str | None = None,
    ) -> ProjectOutlineProjection:
        project = self._repo.get(safe_segment(project_id))
        return ProjectOutlineProjection(
            project=project,
            subtree=project.outline_subtree(root_node_id),
        )
