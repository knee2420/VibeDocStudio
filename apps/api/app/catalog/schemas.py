"""catalog 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

FidelityMode = Literal["fast", "balanced", "strict"]



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
