"""documents 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class VDocSummaryResponse(BaseModel):
    docId: str
    title: str
    status: str
    updatedAt: str
    pageCount: int
    slotCount: int


class SaveVDocRequest(BaseModel):
    document: dict[str, Any] = Field(..., description="전체 .vdoc 문서 JSON")


class PatchSlotContentRequest(BaseModel):
    content: str = Field(..., description="슬롯 내부 Tiptap HTML 본문")


class PatchDocumentStructureRequest(BaseModel):
    operation: str = Field(..., description="commit_staged_slots | reorder_pages | insert_storyline_page")
    payload: dict[str, Any] = Field(default_factory=dict)


class VDocDocumentResponse(BaseModel):
    docId: str
    document: dict[str, Any]


class VDocPageChunkResponse(BaseModel):
    docId: str
    title: str
    totalPages: int
    startPage: int
    endPage: int
    windowSize: int
    topSpacerPx: int
    bottomSpacerPx: int
    pages: list[dict[str, Any]]
    slots: dict[str, Any]
    backdata: dict[str, Any]
