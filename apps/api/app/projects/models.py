"""projects 도메인의 프레임워크 독립 영속 모델 (`.vproj` 다중 문서 프로젝트 & 참조 프로젝트 덱)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class StorylineNodeRecord:
    """4단계 줌인 위계(Project -> Document -> Page/Block -> Slot)를 잇는 아웃라이너 노드."""

    node_id: str
    parent_id: str | None
    depth: int
    zoom_level: str  # "project" | "document" | "page" | "slot"
    title: str
    summary: str = ""
    target_doc_id: str | None = None
    target_page_id: str | None = None
    target_block_id: str | None = None
    target_slot_id: str | None = None
    recommended_template_id: str | None = None
    provenance_source_project_id: str | None = None
    provenance_source_node_id: str | None = None
    ai_status: str = "idle"  # "idle" | "working" | "staged" | "applied"

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodeId": self.node_id,
            "parentId": self.parent_id,
            "depth": self.depth,
            "zoomLevel": self.zoom_level,
            "title": self.title,
            "summary": self.summary,
            "targetDocId": self.target_doc_id,
            "targetPageId": self.target_page_id,
            "targetBlockId": self.target_block_id,
            "targetSlotId": self.target_slot_id,
            "recommendedTemplateId": self.recommended_template_id,
            "provenanceSourceProjectId": self.provenance_source_project_id,
            "provenanceSourceNodeId": self.provenance_source_node_id,
            "aiStatus": self.ai_status,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> StorylineNodeRecord:
        return cls(
            node_id=str(raw.get("nodeId", "")),
            parent_id=raw.get("parentId"),
            depth=int(raw.get("depth", 0)),
            zoom_level=str(raw.get("zoomLevel", "page")),
            title=str(raw.get("title", "")),
            summary=str(raw.get("summary", "")),
            target_doc_id=raw.get("targetDocId"),
            target_page_id=raw.get("targetPageId"),
            target_block_id=raw.get("targetBlockId"),
            target_slot_id=raw.get("targetSlotId"),
            recommended_template_id=raw.get("recommendedTemplateId"),
            provenance_source_project_id=raw.get("provenanceSourceProjectId"),
            provenance_source_node_id=raw.get("provenanceSourceNodeId"),
            ai_status=str(raw.get("aiStatus", "idle")),
        )


@dataclass(frozen=True)
class ProvenanceLineageRecord:
    """참조 프로젝트에서 내 작업 프로젝트로 복제된 노드의 출처(Provenance) 원장 항목."""

    record_id: str
    target_project_id: str
    target_node_id: str
    source_project_id: str
    source_project_title: str
    source_node_id: str
    source_node_title: str
    cloned_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "recordId": self.record_id,
            "targetProjectId": self.target_project_id,
            "targetNodeId": self.target_node_id,
            "sourceProjectId": self.source_project_id,
            "sourceProjectTitle": self.source_project_title,
            "sourceNodeId": self.source_node_id,
            "sourceNodeTitle": self.source_node_title,
            "clonedAt": self.cloned_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> ProvenanceLineageRecord:
        return cls(
            record_id=str(raw.get("recordId", "")),
            target_project_id=str(raw.get("targetProjectId", "")),
            target_node_id=str(raw.get("targetNodeId", "")),
            source_project_id=str(raw.get("sourceProjectId", "")),
            source_project_title=str(raw.get("sourceProjectTitle", "")),
            source_node_id=str(raw.get("sourceNodeId", "")),
            source_node_title=str(raw.get("sourceNodeTitle", "")),
            cloned_at=str(raw.get("clonedAt", "")),
        )


@dataclass(frozen=True)
class VProjectManifestRecord:
    """단일 `.vproj` 프로젝트 매니페스트 (활성 작업 프로젝트 또는 읽기 전용 참조 프로젝트)."""

    project_id: str
    title: str
    description: str
    is_reference_only: bool
    active_phase: str  # "storylining" | "templating" | "drafting"
    doc_ids: tuple[str, ...]
    reference_project_ids: tuple[str, ...]
    storyline_nodes: tuple[StorylineNodeRecord, ...] = field(default_factory=tuple)
    provenance_lineage: tuple[ProvenanceLineageRecord, ...] = field(default_factory=tuple)
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "title": self.title,
            "description": self.description,
            "isReferenceOnly": self.is_reference_only,
            "activePhase": self.active_phase,
            "docIds": list(self.doc_ids),
            "referenceProjectIds": list(self.reference_project_ids),
            "storylineNodes": [n.to_dict() for n in self.storyline_nodes],
            "provenanceLineage": [p.to_dict() for p in self.provenance_lineage],
            "updatedAt": self.updated_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> VProjectManifestRecord:
        return cls(
            project_id=str(raw.get("projectId", "")),
            title=str(raw.get("title", "")),
            description=str(raw.get("description", "")),
            is_reference_only=bool(raw.get("isReferenceOnly", False)),
            active_phase=str(raw.get("activePhase", "storylining")),
            doc_ids=tuple(str(x) for x in raw.get("docIds", [])),
            reference_project_ids=tuple(str(x) for x in raw.get("referenceProjectIds", [])),
            storyline_nodes=tuple(
                StorylineNodeRecord.from_dict(n)
                for n in raw.get("storylineNodes", [])
                if isinstance(n, dict)
            ),
            provenance_lineage=tuple(
                ProvenanceLineageRecord.from_dict(p)
                for p in raw.get("provenanceLineage", [])
                if isinstance(p, dict)
            ),
            updated_at=str(raw.get("updatedAt", "")),
        )

