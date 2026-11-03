"""composer 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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


class Phase1StorylineComposeRequest(BaseModel):
    projectId: str
    prompt: str = Field(default="참조 프로젝트의 핵심 구조를 바탕으로 스토리라인 목차를 구성해줘")
    referenceNodes: list[dict[str, Any]] = Field(default_factory=list)
    targetParentId: str | None = None


class Phase2TemplateRecommendRequest(BaseModel):
    projectId: str
    docId: str
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    tuningPrompt: str = ""


class StagedPhaseComposeResponse(BaseModel):
    runId: str
    phase: str
    modelName: str
    createdAt: str
    stagedDiffs: list[StagedAiDiffResponse]


class CancelRunRequest(BaseModel):
    reason: str = "user_aborted"


class CancelRunResponse(BaseModel):
    runId: str
    status: str
    reason: str
    cancelledAt: str
