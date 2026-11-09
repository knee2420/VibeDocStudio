"""Knowledge Deck HTTP 스키마 (camelCase — 프론트 `entities/knowledge-deck` 계약과 1:1)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Camel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ScopeProfileDto(_Camel):
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)
    max_file_bytes: Optional[int] = Field(default=None, alias="maxFileBytes")
    min_segment_chars: Optional[int] = Field(default=None, alias="minSegmentChars")
    max_segment_chars: Optional[int] = Field(default=None, alias="maxSegmentChars")

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"include": self.include, "exclude": self.exclude}
        for key, val in (("maxFileBytes", self.max_file_bytes), ("minSegmentChars", self.min_segment_chars),
                         ("maxSegmentChars", self.max_segment_chars)):
            if val:
                out[key] = val
        return out


class PromoteToDeckRequest(_Camel):
    """원본 → 지식 덱 색인 요청. 즉시 `queued` 덱과 작업 id 를 돌려준다 (본 작업은 비동기)."""

    title: str
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")
    source_paths: list[str] = Field(default_factory=list, alias="sourcePaths")
    tags: list[str] = Field(default_factory=list)
    depth: Literal["structural", "enriched"] = "enriched"
    language: Literal["ko", "source"] = "ko"
    profile: Optional[ScopeProfileDto] = None


class ReindexRequest(_Camel):
    depth: Optional[Literal["structural", "enriched"]] = None
    profile: Optional[ScopeProfileDto] = None


class ImportDeckRequest(_Camel):
    deck_data: dict[str, Any] = Field(alias="deckData")


class ToggleDeckChoiceRequest(_Camel):
    deck_id: str = Field(alias="deckId")
    is_checked: bool = Field(alias="isChecked")


class SelectSectionsRequest(_Camel):
    deck_id: str = Field(alias="deckId")
    #: None · 빈 목록 = 전부
    section_ids: Optional[list[str]] = Field(default=None, alias="sectionIds")


class PromoteResponse(_Camel):
    deck: dict[str, Any]
    job: dict[str, Any]
