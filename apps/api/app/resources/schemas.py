"""Resource Manager Pydantic 요청 및 응답 스키마."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

ResourceType = Literal["file", "web", "capture", "table", "text"]


class ResourceSectorDto(BaseModel):
    sector_id: str = Field(alias="sectorId")
    resource_id: str = Field(alias="resourceId")
    title: str = ""
    page: int | None = None
    bbox: list[int] | None = None
    text_snippet: str = Field(alias="textSnippet")
    label: str = ""
    is_used_in_editor: bool = Field(default=False, alias="isUsedInEditor")
    created_at: int = Field(alias="createdAt")

    class Config:
        populate_by_name = True


class ResourceItemDto(BaseModel):
    id: str
    type: ResourceType
    title: str
    path_or_url: str | None = Field(default="", alias="pathOrUrl")
    extension: str = ""
    size_bytes: int = Field(default=0, alias="sizeBytes")
    updated_at: int = Field(alias="updatedAt")
    is_checked: bool = Field(default=True, alias="isChecked")
    sectors: list[ResourceSectorDto] = Field(default_factory=list)
    children: list[ResourceItemDto] | None = None

    class Config:
        populate_by_name = True


class ResourceSessionResponse(BaseModel):
    project_id: str = Field(alias="projectId")
    items: list[ResourceItemDto] = Field(default_factory=list)
    active_resource_id: str | None = Field(default=None, alias="activeResourceId")
    selected_sector_id: str | None = Field(default=None, alias="selectedSectorId")
    updated_at: int = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class IngestDirectoryRequest(BaseModel):
    directory_path: str = Field(alias="directoryPath")

    class Config:
        populate_by_name = True


class IngestWebUrlRequest(BaseModel):
    url: str
    title: str | None = None


class ToggleChoiceRequest(BaseModel):
    item_id: str = Field(alias="itemId")
    is_checked: bool = Field(alias="isChecked")
    cascade: bool = True

    class Config:
        populate_by_name = True


class ExtractSectorRequest(BaseModel):
    resource_id: str = Field(alias="resourceId")
    text_snippet: str = Field(alias="textSnippet")
    title: str = ""
    page: int | None = None
    bbox: list[int] | None = None
    label: str = ""

    class Config:
        populate_by_name = True


class DecoupleItemRequest(BaseModel):
    item_id: str = Field(alias="itemId")

    class Config:
        populate_by_name = True


class BatchDecoupleRequest(BaseModel):
    item_ids: list[str] = Field(alias="itemIds")

    class Config:
        populate_by_name = True


class AiContextSource(BaseModel):
    id: str
    title: str
    type: str
    snippets: list[str] = Field(default_factory=list)


class AiContextBundleResponse(BaseModel):
    total_sources: int = Field(alias="totalSources")
    sources: list[AiContextSource] = Field(default_factory=list)

    class Config:
        populate_by_name = True

