"""Pydantic schemas for AI-based Asset parsing (Capture / Ref Extract) & Nuance Application."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AssetKindLiteral = Literal["a4-page", "blog-section", "table", "list", "callout", "columns"]


class AssetNuanceDto(BaseModel):
    summary: str
    structureRules: list[str] = Field(default_factory=list)
    visualRules: list[str] = Field(default_factory=list)
    adaptationHints: list[str] = Field(default_factory=list)


class AssetParseFromBlockRequest(BaseModel):
    title: str = ""
    assetKind: AssetKindLiteral = "table"
    targetKind: str = "structured-table"
    outlineDsl: list[str] = Field(default_factory=list)
    sourceRef: str | None = None
    contextHint: str | None = None


class AssetParseFromRefRequest(BaseModel):
    refTitle: str
    assetKind: AssetKindLiteral = "a4-page"
    extractedText: str = ""
    frameLabels: list[str] = Field(default_factory=list)
    sourceRef: str | None = None
    thumbnailUrl: str | None = None


class AssetParseResponse(BaseModel):
    title: str
    assetKind: AssetKindLiteral
    category: str
    tags: list[str] = Field(default_factory=list)
    nuance: AssetNuanceDto
    outlineDsl: list[str] = Field(default_factory=list)
    engine: Literal["llm", "fallback"] = "llm"


class AssetApplyPreviewRequest(BaseModel):
    mode: Literal["transform", "insert"] = "transform"
    profileId: Literal["a4", "blog", "web"] = "a4"
    assetId: str
    assetTitle: str
    assetKind: AssetKindLiteral
    assetNuance: AssetNuanceDto
    assetOutlineDsl: list[str] = Field(default_factory=list)
    userOutlineDsl: list[str] = Field(default_factory=list)
    userPlainText: str = ""
    documentTitle: str = ""
    feedback: str | None = None
    feedbackHistory: list[str] = Field(default_factory=list)
    extraContext: dict[str, Any] = Field(default_factory=dict)


class AssetApplyPreviewResponse(BaseModel):
    outlineDsl: list[str] = Field(default_factory=list)
    rationale: str
    engine: Literal["llm", "fallback"] = "llm"
    warnings: list[str] = Field(default_factory=list)
