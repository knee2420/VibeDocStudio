"""유스케이스: 참조 프로젝트의 아웃라인 노드를 활성 프로젝트로 복제하고 출처(Provenance) 원장에 기록한다."""
from __future__ import annotations

from app.core.clock import utc_now_iso
from app.core.storage import PROVENANCE_PREFIX, new_id, safe_segment

from ..models import NodeClone, VProjectManifestRecord
from ..ports import VProjectRepositoryPort


class CloneNodeWithProvenanceUseCase:
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        target_project_id: str,
        source_project_id: str,
        source_node_id: str,
        target_parent_id: str | None = None,
    ) -> NodeClone:
        source = self._repo.get(safe_segment(source_project_id))
        node_id = new_id("node")
        result: list[NodeClone] = []

        def _clone(target: VProjectManifestRecord) -> VProjectManifestRecord:
            clone = target.clone_node_from(
                source,
                source_node_id,
                target_parent_id=target_parent_id,
                node_id=node_id,
                record_id=new_id(PROVENANCE_PREFIX),
                now=utc_now_iso(),
            )
            result.append(clone)
            return clone.project

        saved = self._repo.update(safe_segment(target_project_id), _clone)
        clone = result[0]
        return NodeClone(project=saved, node=clone.node, provenance=clone.provenance)
