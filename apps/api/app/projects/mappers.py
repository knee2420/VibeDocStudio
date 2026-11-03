"""projects 도메인 모델 ↔ camelCase JSON 사전 변환 (저장 형식 · API 응답 공용).

도메인 모델은 직렬화 형식을 모른다. 저장소 어댑터와 라우터가 이 모듈을 거친다.
"""
from __future__ import annotations

from typing import Any

from .models import (
    AiStatus,
    ProvenanceLineageRecord,
    StorylineNodeRecord,
    VProjectManifestRecord,
    WorkbenchPhase,
    ZoomLevel,
)

#: API 의 camelCase 노드 필드 → 도메인 필드.
NODE_FIELD_ALIASES: dict[str, str] = {
    "title": "title",
    "summary": "summary",
    "zoomLevel": "zoom_level",
    "targetDocId": "target_doc_id",
    "targetPageId": "target_page_id",
    "targetBlockId": "target_block_id",
    "targetSlotId": "target_slot_id",
    "recommendedTemplateId": "recommended_template_id",
    "aiStatus": "ai_status",
}


def node_fields_from_api(raw: dict[str, Any]) -> dict[str, object]:
    """camelCase 노드 패치를 도메인 필드 이름으로 옮긴다. 모르는 키는 그대로 넘겨 도메인이 거부하게 한다."""
    return {NODE_FIELD_ALIASES.get(key, key): value for key, value in raw.items()}


def node_to_dict(node: StorylineNodeRecord) -> dict[str, Any]:
    return {
        "nodeId": node.node_id,
        "parentId": node.parent_id,
        "depth": node.depth,
        "zoomLevel": str(node.zoom_level),
        "title": node.title,
        "summary": node.summary,
        "targetDocId": node.target_doc_id,
        "targetPageId": node.target_page_id,
        "targetBlockId": node.target_block_id,
        "targetSlotId": node.target_slot_id,
        "recommendedTemplateId": node.recommended_template_id,
        "provenanceSourceProjectId": node.provenance_source_project_id,
        "provenanceSourceNodeId": node.provenance_source_node_id,
        "aiStatus": str(node.ai_status),
    }


def node_from_dict(raw: dict[str, Any]) -> StorylineNodeRecord:
    return StorylineNodeRecord(
        node_id=str(raw.get("nodeId", "")),
        parent_id=raw.get("parentId"),
        depth=int(raw.get("depth", 0)),
        zoom_level=ZoomLevel.parse(raw.get("zoomLevel"), ZoomLevel.PAGE),
        title=str(raw.get("title", "")),
        summary=str(raw.get("summary", "")),
        target_doc_id=raw.get("targetDocId"),
        target_page_id=raw.get("targetPageId"),
        target_block_id=raw.get("targetBlockId"),
        target_slot_id=raw.get("targetSlotId"),
        recommended_template_id=raw.get("recommendedTemplateId"),
        provenance_source_project_id=raw.get("provenanceSourceProjectId"),
        provenance_source_node_id=raw.get("provenanceSourceNodeId"),
        ai_status=AiStatus.parse(raw.get("aiStatus"), AiStatus.IDLE),
    )


def provenance_to_dict(record: ProvenanceLineageRecord) -> dict[str, Any]:
    return {
        "recordId": record.record_id,
        "targetProjectId": record.target_project_id,
        "targetNodeId": record.target_node_id,
        "sourceProjectId": record.source_project_id,
        "sourceProjectTitle": record.source_project_title,
        "sourceNodeId": record.source_node_id,
        "sourceNodeTitle": record.source_node_title,
        "clonedAt": record.cloned_at,
    }


def provenance_from_dict(raw: dict[str, Any]) -> ProvenanceLineageRecord:
    return ProvenanceLineageRecord(
        record_id=str(raw.get("recordId", "")),
        target_project_id=str(raw.get("targetProjectId", "")),
        target_node_id=str(raw.get("targetNodeId", "")),
        source_project_id=str(raw.get("sourceProjectId", "")),
        source_project_title=str(raw.get("sourceProjectTitle", "")),
        source_node_id=str(raw.get("sourceNodeId", "")),
        source_node_title=str(raw.get("sourceNodeTitle", "")),
        cloned_at=str(raw.get("clonedAt", "")),
    )


def manifest_to_dict(record: VProjectManifestRecord) -> dict[str, Any]:
    return {
        "projectId": record.project_id,
        "title": record.title,
        "description": record.description,
        "isReferenceOnly": record.is_reference_only,
        "activePhase": str(record.active_phase),
        "docIds": list(record.doc_ids),
        "referenceProjectIds": list(record.reference_project_ids),
        "storylineNodes": [node_to_dict(n) for n in record.storyline_nodes],
        "provenanceLineage": [provenance_to_dict(p) for p in record.provenance_lineage],
        "updatedAt": record.updated_at,
    }


def manifest_from_dict(raw: dict[str, Any]) -> VProjectManifestRecord:
    return VProjectManifestRecord(
        project_id=str(raw.get("projectId", "")),
        title=str(raw.get("title", "")),
        description=str(raw.get("description", "")),
        is_reference_only=bool(raw.get("isReferenceOnly", False)),
        active_phase=WorkbenchPhase.parse(raw.get("activePhase"), WorkbenchPhase.STORYLINING),
        doc_ids=tuple(str(x) for x in raw.get("docIds", [])),
        reference_project_ids=tuple(str(x) for x in raw.get("referenceProjectIds", [])),
        storyline_nodes=tuple(
            node_from_dict(n) for n in raw.get("storylineNodes", []) if isinstance(n, dict)
        ),
        provenance_lineage=tuple(
            provenance_from_dict(p) for p in raw.get("provenanceLineage", []) if isinstance(p, dict)
        ),
        updated_at=str(raw.get("updatedAt", "")),
    )
