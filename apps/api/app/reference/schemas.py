"""reference 도메인 요청 스키마 (응답은 모델의 `to_dict()` 를 그대로 쓴다)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class AddUrlRequest(BaseModel):
    url: str
    title: str = ""


class RenameRequest(BaseModel):
    title: str


class CreatePinRequest(BaseModel):
    kind: str = "region"
    page: Optional[int] = None
    bbox: Optional[list[float]] = None
    text: str = ""
    label: str = ""
    note: str = ""
    layer: str = ""


class UpdatePinRequest(BaseModel):
    label: Optional[str] = None
    note: Optional[str] = None
    layer: Optional[str] = None


class UpdateBindingRequest(BaseModel):
    enabled: Optional[bool] = None
    layers: dict[str, bool] = Field(default_factory=dict)


class ConsensusCardRequest(BaseModel):
    """확정할 해석 카드 (AI 제안을 그대로 또는 고쳐서). cardId 를 비우면 새로 만든다."""

    cardId: Optional[str] = None
    layer: str
    scope: str
    adoption: Literal["follow", "consult", "exclude"] = "follow"
    reading: str = ""
    evidence: list[str] = Field(default_factory=list)
    alternatives: list[dict[str, Any]] = Field(default_factory=list)


class UpdateConsensusCardRequest(BaseModel):
    adoption: Optional[Literal["follow", "consult", "exclude"]] = None
    reading: Optional[str] = None
    scope: Optional[str] = None
    layer: Optional[str] = None
    evidence: Optional[list[str]] = None
    #: 대안 해석 번호 — 그 해석을 본 해석으로 올린다
    chooseAlternative: Optional[int] = None
