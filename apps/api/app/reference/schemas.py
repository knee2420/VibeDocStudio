"""reference 도메인 요청 스키마 (응답은 모델의 `to_dict()` 를 그대로 쓴다)."""
from __future__ import annotations

from typing import Optional

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
