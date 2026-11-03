"""projects 도메인 서비스 (유스케이스 위임 및 식별자 정규화)."""
from __future__ import annotations

from typing import Any

from .models import (
    ProvenanceLineageRecord,
    StorylineNodeRecord,
    VProjectManifestRecord,
)
from .use_cases import (
    BindReferenceProjectsUseCase,
    CloneNodeWithProvenanceUseCase,
    GetProjectOutlineTreeUseCase,
    GetProjectUseCase,
    ListProjectsUseCase,
    SaveProjectUseCase,
)


class ProjectService:
    def __init__(
        self,
        list_projects: ListProjectsUseCase,
        get_project: GetProjectUseCase,
        save_project: SaveProjectUseCase,
        get_outline_tree: GetProjectOutlineTreeUseCase,
        bind_references: BindReferenceProjectsUseCase,
        clone_node: CloneNodeWithProvenanceUseCase,
    ) -> None:
        self._list_projects = list_projects
        self._get_project = get_project
        self._save_project = save_project
        self._get_outline_tree = get_outline_tree
        self._bind_references = bind_references
        self._clone_node = clone_node

    def list_projects(self) -> list[VProjectManifestRecord]:
        return self._list_projects.execute()

    def get_project(self, project_id: str) -> VProjectManifestRecord:
        return self._get_project.execute(project_id)

    def save_project(
        self,
        project_id: str,
        manifest: VProjectManifestRecord,
        *,
        allow_readonly_override: bool = False,
    ) -> VProjectManifestRecord:
        return self._save_project.execute(
            project_id,
            manifest,
            allow_readonly_override=allow_readonly_override,
        )

    def get_outline_tree(
        self,
        project_id: str,
        root_node_id: str | None = None,
    ) -> dict[str, Any]:
        return self._get_outline_tree.execute(project_id, root_node_id=root_node_id)

    def bind_reference_projects(
        self,
        project_id: str,
        reference_project_ids: list[str],
    ) -> VProjectManifestRecord:
        return self._bind_references.execute(project_id, reference_project_ids)

    def clone_node_with_provenance(
        self,
        target_project_id: str,
        source_project_id: str,
        source_node_id: str,
        target_parent_id: str | None = None,
    ) -> tuple[VProjectManifestRecord, StorylineNodeRecord, ProvenanceLineageRecord]:
        return self._clone_node.execute(
            target_project_id=target_project_id,
            source_project_id=source_project_id,
            source_node_id=source_node_id,
            target_parent_id=target_parent_id,
        )

