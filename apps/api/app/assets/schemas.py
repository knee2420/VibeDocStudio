"""Pydantic schemas for AI-based Asset parsing (Capture / Ref Extract), Nuance Application, and Select Recommendation."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AssetKindLiteral = Literal["a4-page", "blog-section", "table", "list", "callout", "columns"]
AssetSchemaVersionLiteral = Literal["v1", "v2"]


class AssetNuanceDto(BaseModel):
    summary: str
    structureRules: list[str] = Field(default_factory=list)
    visualRules: list[str] = Field(default_factory=list)
    adaptationHints: list[str] = Field(default_factory=list)


class AssetParseFromBlockRequest(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v1"
    title: str = ""
    assetKind: AssetKindLiteral = "table"
    targetKind: str = "structured-table"
    outlineDsl: list[str] = Field(default_factory=list)
    sourceRef: str | None = None
    contextHint: str | None = None


class AssetParseFromRefRequest(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v1"
    refTitle: str
    assetKind: AssetKindLiteral = "a4-page"
    extractedText: str = ""
    frameLabels: list[str] = Field(default_factory=list)
    sourceRef: str | None = None
    thumbnailUrl: str | None = None


class AssetParseResponse(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v1"
    title: str
    assetKind: AssetKindLiteral
    category: str
    tags: list[str] = Field(default_factory=list)
    nuance: AssetNuanceDto
    outlineDsl: list[str] = Field(default_factory=list)
    v2Spec: dict[str, Any] | None = None
    engine: Literal["llm", "fallback"] = "llm"


class AssetApplyPreviewRequest(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v1"
    mode: Literal["transform", "insert"] = "transform"
    profileId: Literal["a4", "blog", "web"] = "a4"
    assetId: str
    assetTitle: str
    assetKind: AssetKindLiteral
    assetNuance: AssetNuanceDto
    assetOutlineDsl: list[str] = Field(default_factory=list)
    assetV2Spec: dict[str, Any] | None = None
    userOutlineDsl: list[str] = Field(default_factory=list)
    userPlainText: str = ""
    documentTitle: str = ""
    feedback: str | None = None
    feedbackHistory: list[str] = Field(default_factory=list)
    extraContext: dict[str, Any] = Field(default_factory=dict)


class AssetApplyPreviewResponse(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v1"
    outlineDsl: list[str] = Field(default_factory=list)
    rationale: str
    engine: Literal["llm", "fallback"] = "llm"
    warnings: list[str] = Field(default_factory=list)


class AssetCatalogItemDto(BaseModel):
    assetId: str
    title: str
    category: str = ""
    summary: str = ""


class AssetRecommendSelectRequest(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v2"
    query: str
    catalog: list[AssetCatalogItemDto] = Field(default_factory=list)


class AssetRecommendHitDto(BaseModel):
    assetId: str
    score: float
    reasons: list[str] = Field(default_factory=list)


class AssetRecommendSelectResponse(BaseModel):
    schemaVersion: AssetSchemaVersionLiteral = "v2"
    engine: Literal["llm", "heuristic"] = "heuristic"
    hits: list[AssetRecommendHitDto] = Field(default_factory=list)
