"""유스케이스: 참조 프로젝트의 아웃라인 노드를 활성 프로젝트로 복제하고 출처(Provenance) 원장에 기록한다."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.storage import PROVENANCE_PREFIX, new_id, safe_segment

from ..errors import (
    VProjectNotFoundError,
    VProjectReadOnlyViolationError,
    VProjectValidationError,
)
from ..models import (
    ProvenanceLineageRecord,
    StorylineNodeRecord,
    VProjectManifestRecord,
)
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
    ) -> tuple[VProjectManifestRecord, StorylineNodeRecord, ProvenanceLineageRecord]:
        safe_target = safe_segment(target_project_id)
        safe_source = safe_segment(source_project_id)

        target_proj = self._repo.get(safe_target)
        if target_proj.is_reference_only:
            raise VProjectReadOnlyViolationError(
                f"Target project '{safe_target}' is read-only and cannot receive cloned nodes."
            )

        source_proj = self._repo.get(safe_source)
        source_node = next(
            (n for n in source_proj.storyline_nodes if n.node_id == source_node_id),
            None,
        )
        if source_node is None:
            raise VProjectNotFoundError(
                f"Source node '{source_node_id}' not found in '{safe_source}'"
            )

        # Determine parent and depth in target project
        parent_depth = 0
        resolved_parent_id = target_parent_id
        if resolved_parent_id:
            parent_node = next(
                (n for n in target_proj.storyline_nodes if n.node_id == resolved_parent_id),
                None,
            )
            if parent_node is None:
                raise VProjectValidationError(
                    f"Target parent node '{resolved_parent_id}' not found"
                )
            parent_depth = parent_node.depth + 1
        elif target_proj.storyline_nodes:
            root_candidate = next(
                (n for n in target_proj.storyline_nodes if n.parent_id is None),
                None,
            )
            if root_candidate:
                resolved_parent_id = root_candidate.node_id
                parent_depth = 1

        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        cloned_node_id = new_id("node")
        cloned_node = StorylineNodeRecord(
            node_id=cloned_node_id,
            parent_id=resolved_parent_id,
            depth=parent_depth,
            zoom_level=source_node.zoom_level if source_node.zoom_level != "project" else "page",
            title=source_node.title,
            summary=source_node.summary,
            target_doc_id=source_node.target_doc_id or (target_proj.doc_ids[0] if target_proj.doc_ids else None),
            target_page_id=source_node.target_page_id,
            target_block_id=source_node.target_block_id,
            target_slot_id=source_node.target_slot_id,
            recommended_template_id=source_node.recommended_template_id,
            provenance_source_project_id=source_proj.project_id,
            provenance_source_node_id=source_node.node_id,
            ai_status="applied",
        )

        provenance_entry = ProvenanceLineageRecord(
            record_id=new_id(PROVENANCE_PREFIX),
            target_project_id=target_proj.project_id,
            target_node_id=cloned_node_id,
            source_project_id=source_proj.project_id,
            source_project_title=source_proj.title,
            source_node_id=source_node.node_id,
            source_node_title=source_node.title,
            cloned_at=now,
        )

        updated_manifest = VProjectManifestRecord(
            project_id=target_proj.project_id,
            title=target_proj.title,
            description=target_proj.description,
            is_reference_only=target_proj.is_reference_only,
            active_phase=target_proj.active_phase,
            doc_ids=target_proj.doc_ids,
            reference_project_ids=target_proj.reference_project_ids,
            storyline_nodes=(*target_proj.storyline_nodes, cloned_node),
            provenance_lineage=(*target_proj.provenance_lineage, provenance_entry),
            updated_at=now,
        )
        saved = self._repo.save(updated_manifest)
        return saved, cloned_node, provenance_entry

