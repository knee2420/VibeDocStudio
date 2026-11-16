"""outline 도메인 Pydantic 요청·응답 스키마."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkingOutlineSourceRefSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    doc_id: str = Field(alias="docId")
    page_id: str | None = Field(default=None, alias="pageId")
    block_id: str | None = Field(default=None, alias="blockId")
    slot_id: str | None = Field(default=None, alias="slotId")
    row_id: str | None = Field(default=None, alias="rowId")
    cell_id: str | None = Field(default=None, alias="cellId")
    section_id: str | None = Field(default=None, alias="sectionId")
    base_hash: str | None = Field(default=None, alias="baseHash")


class WorkingOutlineNodeSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    node_id: str = Field(alias="nodeId")
    text: str
    element_kind: str = Field(default="text", alias="elementKind")
    note: str | None = None
    is_folded: bool | None = Field(default=None, alias="isFolded")
    is_completed: bool | None = Field(default=None, alias="isCompleted")
    media_target: str | None = Field(default=None, alias="mediaTarget")
    recommended_template_id: str | None = Field(default=None, alias="recommendedTemplateId")
    source_ref: WorkingOutlineSourceRefSchema | None = Field(default=None, alias="sourceRef")
    children: list[WorkingOutlineNodeSchema] = Field(default_factory=list)


class WorkingOutlineResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    revision: int
    base_doc_revisions: dict[str, int] = Field(default_factory=dict, alias="baseDocRevisions")
    dirty: bool
    updated_at: str = Field(alias="updatedAt")
    nodes: list[WorkingOutlineNodeSchema] = Field(default_factory=list)


class SaveWorkingOutlineRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    revision: int | None = None
    base_doc_revisions: dict[str, int] = Field(default_factory=dict, alias="baseDocRevisions")
    dirty: bool = True
    nodes: list[dict[str, Any]] = Field(default_factory=list)


class WorkingOutlineCommandItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal[
        "insert",
        "update",
        "turn_into",
        "move",
        "reparent",
        "delete",
    ]
    node_id: str | None = Field(default=None, alias="nodeId")
    parent_id: str | None = Field(default=None, alias="parentId")
    target_parent_id: str | None = Field(default=None, alias="targetParentId")
    after_node_id: str | None = Field(default=None, alias="afterNodeId")
    index: int | None = None
    text: str | None = None
    note: str | None = None
    element_kind: str | None = Field(default=None, alias="elementKind")
    is_folded: bool | None = Field(default=None, alias="isFolded")
    is_completed: bool | None = Field(default=None, alias="isCompleted")
    media_target: str | None = Field(default=None, alias="mediaTarget")


class WorkingOutlineBatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    commands: list[WorkingOutlineCommandItem] = Field(default_factory=list)


class WorkingOutlineBatchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    outline: WorkingOutlineResponse
    created_node_ids: list[str] = Field(default_factory=list, alias="createdNodeIds")


class CompilePreviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    outline: SaveWorkingOutlineRequest | None = None


class CompilePreviewResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    dirty: bool
    documents: list[dict[str, Any]] = Field(default_factory=list)


class CommitOutlineRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    outline: SaveWorkingOutlineRequest | None = None


class CommitOutlineResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    documents: list[dict[str, Any]] = Field(default_factory=list)
    outline: WorkingOutlineResponse
