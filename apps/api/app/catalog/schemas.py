"""catalog 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class CatalogManifestResponse(BaseModel):
    catalogId: str
    title: str
    sourceOrigin: str
    sourceId: str = ""
    category: str
    tags: list[str] = Field(default_factory=list)
    description: str


class CatalogBundleResponse(BaseModel):
    manifest: CatalogManifestResponse
    document: dict[str, Any]


class PdfIngestResponse(BaseModel):
    catalogId: str
    title: str
    checkedTables: int
    checkedSlots: int
    document: dict[str, Any]


class ScaffoldDocumentResponse(BaseModel):
    docId: str
    title: str
    totalPages: int
    checkedBlocks: int
    checkedSlots: int
    document: dict[str, Any]
    #: CLI 에이전트 루프 실행 정보 (runId · runDir · 반복별 판정). 루프가 돌지 않았으면 None.
    agentRun: Optional[dict[str, Any]] = None

