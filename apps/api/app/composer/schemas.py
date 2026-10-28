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
    constraints: dict[str, Any] | None = Field(default=None)


class SlotComposeProvenanceResponse(BaseModel):
    runId: str
    modelName: str
    sourceChunkIds: list[str]
    createdAt: str


class SlotComposeResponse(BaseModel):
    slotId: str
    html: str
    boundaryGuarantee: str = "GSV-B1/B3 enforced: outer layout and sibling slots untouched"
    provenance: SlotComposeProvenanceResponse
