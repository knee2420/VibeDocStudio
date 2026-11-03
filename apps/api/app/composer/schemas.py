"""composer 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .models import (
    ReferenceNodeInput,
    StagedAiDiffItem,
    StagedPhaseResult,
    StorylineNodeInput,
)


class ComposeBackdataChunkItem(BaseModel):
    chunkId: str = Field(default="bd_inline")
    sourceTitle: str = Field(default="근거 자료")
    excerpt: str = Field(default="")


class SlotComposeRequest(BaseModel):
    slotId: str = Field(..., description="타겟 슬롯 식별자")
    slotLabel: str = Field(default="문서 슬롯", description="타겟 슬롯 라벨")
    currentContent: str = Field(default="", description="슬롯의 현재 Tiptap HTML")
    prompt: str = Field(..., description="사용자 작성·수정 지시문")
    presetId: str | None = Field(default=None, description="빠른 지시 프리셋 ID")
    backdata: list[ComposeBackdataChunkItem] = Field(default_factory=list)
    referenceNodeIds: list[str] = Field(default_factory=list)
    constraints: dict[str, Any] | None = Field(default=None)


class SlotComposeProvenanceResponse(BaseModel):
    runId: str
    modelName: str
    sourceChunkIds: list[str]
    referenceNodeIds: list[str] = Field(default_factory=list)
    createdAt: str


class SlotComposeResponse(BaseModel):
    slotId: str
    html: str
    boundaryGuarantee: str = "GSV-B1/B3 enforced: outer layout and sibling slots untouched"
    provenance: SlotComposeProvenanceResponse


class StagedAiDiffResponse(BaseModel):
    diffId: str
    phase: str
    targetKind: str
    targetId: str
    title: str
    beforeSummary: str
    afterSummary: str
    payload: dict[str, Any]
    sourceReferenceIds: list[str] = Field(default_factory=list)

    @classmethod
    def from_item(cls, item: StagedAiDiffItem) -> StagedAiDiffResponse:
        return cls(
            diffId=item.diff_id,
            phase=item.phase,
            targetKind=item.target_kind,
            targetId=item.target_id,
            title=item.title,
            beforeSummary=item.before_summary,
            afterSummary=item.after_summary,
            payload=item.payload,
            sourceReferenceIds=list(item.source_reference_ids),
        )


class ReferenceNodeSchema(BaseModel):
    """참조 노드. 프론트가 노드 전체를 보내도 필요한 필드만 읽는다."""

    model_config = ConfigDict(extra="ignore")

    nodeId: str
    title: str = ""
    summary: str = ""
    sourceProjectId: str | None = None
    recommendedTemplateId: str | None = None

    def to_input(self) -> ReferenceNodeInput:
        return ReferenceNodeInput(
            node_id=self.nodeId,
            title=self.title,
            summary=self.summary,
            source_project_id=self.sourceProjectId,
            recommended_template_id=self.recommendedTemplateId,
        )


class StorylineNodeSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nodeId: str
    title: str = ""
    summary: str = ""
    recommendedTemplateId: str | None = None

    def to_input(self) -> StorylineNodeInput:
        return StorylineNodeInput(
            node_id=self.nodeId,
            title=self.title,
            summary=self.summary,
            recommended_template_id=self.recommendedTemplateId,
        )


class Phase1StorylineComposeRequest(BaseModel):
    projectId: str
    prompt: str = Field(default="참조 프로젝트의 핵심 구조를 바탕으로 스토리라인 목차를 구성해줘")
    referenceNodes: list[ReferenceNodeSchema] = Field(default_factory=list)
    targetParentId: str | None = None
    runId: str | None = Field(default=None, description="클라이언트가 미리 정한 실행 ID (취소에 사용)")


class Phase2TemplateRecommendRequest(BaseModel):
    projectId: str
    docId: str
    nodes: list[StorylineNodeSchema] = Field(default_factory=list)
    tuningPrompt: str = ""
    runId: str | None = Field(default=None, description="클라이언트가 미리 정한 실행 ID (취소에 사용)")


class StagedPhaseComposeResponse(BaseModel):
    runId: str
    phase: str
    modelName: str
    createdAt: str
    stagedDiffs: list[StagedAiDiffResponse]

    @classmethod
    def from_result(cls, result: StagedPhaseResult) -> StagedPhaseComposeResponse:
        return cls(
            runId=result.run_id,
            phase=result.phase,
            modelName=result.engine_name,
            createdAt=result.created_at,
            stagedDiffs=[StagedAiDiffResponse.from_item(d) for d in result.staged_diffs],
        )


class CancelRunRequest(BaseModel):
    reason: str = "user_aborted"


class CancelRunResponse(BaseModel):
    runId: str
    status: str
    reason: str
    cancelledAt: str
