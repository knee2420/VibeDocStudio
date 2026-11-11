"""form_scaffold HTTP 응답 스키마."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ScaffoldDocumentResponse(BaseModel):
    docId: str
    title: str
    totalPages: int
    checkedBlocks: int
    checkedSlots: int
    document: dict[str, Any]
    fidelityMode: str = "balanced"
    #: CLI 에이전트 루프 실행 정보 (runId · runDir · 반복별 판정). 루프가 돌지 않았으면 None.
    agentRun: Optional[dict[str, Any]] = None


class PdfPreviewPageSchema(BaseModel):
    pageNumber: int
    widthPx: float
    heightPx: float
    hasTextLayer: bool
    spanCount: int
    imageCount: int
    drawingCount: int
    thumbnailDataUrl: str


class PdfPreviewResponse(BaseModel):
    title: str
    totalPages: int
    hasAnyTextLayer: bool
    pages: list[PdfPreviewPageSchema]


class UrlScaffoldRequest(BaseModel):
    url: str
    title: str = ""
    splitMode: Literal["height", "heading", "single"] = "height"
    targetHeightPx: int = Field(default=1500, ge=480, le=4000)
    includeImages: bool = True
    useBrowserFallback: bool = True


class UrlScaffoldResponse(BaseModel):
    docId: str
    title: str
    sourceUrl: str
    totalPages: int
    checkedBlocks: int
    checkedSlots: int
    document: dict[str, Any]
    metrics: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)
