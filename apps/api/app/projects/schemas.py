"""projects 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class StorylineNodeSchema(BaseModel):
    nodeId: str
    parentId: str | None = None
    depth: int = 0
    zoomLevel: str = "page"
    title: str
    summary: str = ""
    targetDocId: str | None = None
    targetPageId: str | None = None
    targetBlockId: str | None = None
    targetSlotId: str | None = None
    recommendedTemplateId: str | None = None
    provenanceSourceProjectId: str | None = None
    provenanceSourceNodeId: str | None = None
    aiStatus: str = "idle"


class ProvenanceLineageSchema(BaseModel):
    recordId: str
    targetProjectId: str
    targetNodeId: str
    sourceProjectId: str
    sourceProjectTitle: str
    sourceNodeId: str
    sourceNodeTitle: str
    clonedAt: str


class VProjectManifestResponse(BaseModel):
    projectId: str
    title: str
    description: str = ""
    isReferenceOnly: bool = False
    activePhase: str = "storylining"
    docIds: list[str] = Field(default_factory=list)
    referenceProjectIds: list[str] = Field(default_factory=list)
    storylineNodes: list[StorylineNodeSchema] = Field(default_factory=list)
    provenanceLineage: list[ProvenanceLineageSchema] = Field(default_factory=list)
    updatedAt: str = ""


class SaveVProjectRequest(BaseModel):
    title: str
    description: str = ""
    isReferenceOnly: bool = False
    activePhase: str = "storylining"
    docIds: list[str] = Field(default_factory=list)
    referenceProjectIds: list[str] = Field(default_factory=list)
    storylineNodes: list[dict[str, Any]] = Field(default_factory=list)
    provenanceLineage: list[dict[str, Any]] = Field(default_factory=list)


class BindReferenceProjectsRequest(BaseModel):
    referenceProjectIds: list[str] = Field(default_factory=list)


class CloneReferenceNodeRequest(BaseModel):
    sourceProjectId: str
    sourceNodeId: str
    targetParentId: str | None = None


class CloneReferenceNodeResponse(BaseModel):
    project: VProjectManifestResponse
    clonedNode: StorylineNodeSchema
    provenance: ProvenanceLineageSchema


class ProjectOutlineTreeResponse(BaseModel):
    projectId: str
    title: str
    isReferenceOnly: bool
    activePhase: str
    activeZoomLevel: str
    rootNodeId: str
    breadcrumbs: list[dict[str, Any]]
    nodes: list[StorylineNodeSchema]
    totalNodeCount: int

