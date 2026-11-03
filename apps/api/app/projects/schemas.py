"""projects 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from .mappers import (
    manifest_to_dict,
    node_fields_from_api,
    node_to_dict,
    provenance_to_dict,
)
from .models import (
    ProvenanceLineageRecord,
    StorylineNodeRecord,
    VProjectManifestRecord,
    WorkbenchPhase,
)
from .use_cases import (
    AssignTemplateCommand,
    DeleteNodeCommand,
    IndentNodeCommand,
    InsertNodeCommand,
    MoveNodeCommand,
    OutlineCommand,
    SetPhaseCommand,
    UpdateNodeCommand,
)


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

    @classmethod
    def from_record(cls, node: StorylineNodeRecord) -> StorylineNodeSchema:
        return cls.model_validate(node_to_dict(node))


class ProvenanceLineageSchema(BaseModel):
    recordId: str
    targetProjectId: str
    targetNodeId: str
    sourceProjectId: str
    sourceProjectTitle: str
    sourceNodeId: str
    sourceNodeTitle: str
    clonedAt: str

    @classmethod
    def from_record(cls, record: ProvenanceLineageRecord) -> ProvenanceLineageSchema:
        return cls.model_validate(provenance_to_dict(record))


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

    @classmethod
    def from_record(cls, record: VProjectManifestRecord) -> VProjectManifestResponse:
        return cls.model_validate(manifest_to_dict(record))


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


class OutlineBreadcrumbSchema(BaseModel):
    nodeId: str
    title: str
    zoomLevel: str


class ProjectOutlineTreeResponse(BaseModel):
    projectId: str
    title: str
    isReferenceOnly: bool
    activePhase: str
    activeZoomLevel: str
    rootNodeId: str
    breadcrumbs: list[OutlineBreadcrumbSchema]
    nodes: list[StorylineNodeSchema]
    totalNodeCount: int


# --- 아웃라인 노드 명령 (`kind` 로 구분하는 합 타입) ---------------------------


class NodeFieldsSchema(BaseModel):
    """노드에서 바꿀 수 있는 필드만. 구조(부모 · 깊이)와 출처는 전용 명령으로만 바뀐다."""

    title: str | None = None
    summary: str | None = None
    zoomLevel: str | None = None
    targetDocId: str | None = None
    targetPageId: str | None = None
    targetBlockId: str | None = None
    targetSlotId: str | None = None
    recommendedTemplateId: str | None = None
    aiStatus: str | None = None

    def provided(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class InsertNodeCommandSchema(BaseModel):
    kind: Literal["insert_node"]
    title: str
    parentId: str | None = None
    nodeId: str | None = None
    fields: NodeFieldsSchema = Field(default_factory=NodeFieldsSchema)
    provenanceSourceProjectId: str | None = None
    provenanceSourceNodeId: str | None = None

    def to_command(self) -> OutlineCommand:
        provenance = (
            (self.provenanceSourceProjectId, self.provenanceSourceNodeId)
            if self.provenanceSourceProjectId and self.provenanceSourceNodeId
            else None
        )
        return InsertNodeCommand(
            title=self.title,
            parent_id=self.parentId,
            node_id=self.nodeId,
            fields=node_fields_from_api(self.fields.provided()),
            provenance_source=provenance,
        )


class UpdateNodeCommandSchema(BaseModel):
    kind: Literal["update_node"]
    nodeId: str
    patch: NodeFieldsSchema

    def to_command(self) -> OutlineCommand:
        return UpdateNodeCommand(node_id=self.nodeId, patch=node_fields_from_api(self.patch.provided()))


class DeleteNodeCommandSchema(BaseModel):
    kind: Literal["delete_node"]
    nodeId: str

    def to_command(self) -> OutlineCommand:
        return DeleteNodeCommand(node_id=self.nodeId)


class MoveNodeCommandSchema(BaseModel):
    kind: Literal["move_node"]
    nodeId: str
    direction: Literal[-1, 1]

    def to_command(self) -> OutlineCommand:
        return MoveNodeCommand(node_id=self.nodeId, direction=self.direction)


class IndentNodeCommandSchema(BaseModel):
    kind: Literal["indent_node"]
    nodeId: str
    delta: Literal[-1, 1]

    def to_command(self) -> OutlineCommand:
        return IndentNodeCommand(node_id=self.nodeId, delta=self.delta)


class AssignTemplateCommandSchema(BaseModel):
    kind: Literal["assign_template"]
    nodeId: str
    templateId: str

    def to_command(self) -> OutlineCommand:
        return AssignTemplateCommand(node_id=self.nodeId, template_id=self.templateId)


class SetPhaseCommandSchema(BaseModel):
    kind: Literal["set_phase"]
    phase: WorkbenchPhase

    def to_command(self) -> OutlineCommand:
        return SetPhaseCommand(phase=self.phase)


OutlineCommandRequest = Annotated[
    InsertNodeCommandSchema
    | UpdateNodeCommandSchema
    | DeleteNodeCommandSchema
    | MoveNodeCommandSchema
    | IndentNodeCommandSchema
    | AssignTemplateCommandSchema
    | SetPhaseCommandSchema,
    Field(discriminator="kind"),
]


class OutlineCommandResponse(BaseModel):
    project: VProjectManifestResponse
    affectedNodeId: str | None = None
