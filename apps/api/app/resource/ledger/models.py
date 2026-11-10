"""Resource Manager 도메인 엔티티 모델."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

ResourceType = Literal["file", "web", "capture", "table", "text"]


@dataclass
class ResourceSector:
    """수백 페이지 문서나 외부 소스에서 '발라낸' 세부 섹터(BBox 좌표 또는 텍스트 스니펫)."""
    sector_id: str
    resource_id: str
    text_snippet: str
    title: str = ""
    page: int | None = None
    bbox: list[int] | None = None  # [ymin, xmin, ymax, xmax] (1000분율 정규화 좌표)
    label: str = ""
    is_used_in_editor: bool = False
    created_at: int = field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp() * 1000))

    def to_dict(self) -> dict:
        return {
            "sectorId": self.sector_id,
            "resourceId": self.resource_id,
            "title": self.title,
            "page": self.page,
            "bbox": self.bbox,
            "textSnippet": self.text_snippet,
            "label": self.label,
            "isUsedInEditor": self.is_used_in_editor,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ResourceSector:
        return cls(
            sector_id=data.get("sectorId") or data.get("sector_id", ""),
            resource_id=data.get("resourceId") or data.get("resource_id", ""),
            text_snippet=data.get("textSnippet") or data.get("text_snippet", ""),
            title=data.get("title", ""),
            page=data.get("page"),
            bbox=data.get("bbox"),
            label=data.get("label", ""),
            is_used_in_editor=data.get("isUsedInEditor", False),
            created_at=data.get("createdAt", int(datetime.now(timezone.utc).timestamp() * 1000)),
        )


@dataclass
class ResourceItem:
    """디렉토리 트리 노드 또는 개별 리소스 아이템."""
    id: str
    type: ResourceType
    title: str = ""
    path_or_url: str = ""
    extension: str = ""
    size_bytes: int = 0
    updated_at: int = field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp() * 1000))
    is_checked: bool = True  # Choice(True) vs Not Choice(False)
    sectors: list[ResourceSector] = field(default_factory=list)
    children: list[ResourceItem] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "pathOrUrl": self.path_or_url,
            "extension": self.extension,
            "sizeBytes": self.size_bytes,
            "updatedAt": self.updated_at,
            "isChecked": self.is_checked,
            "sectors": [s.to_dict() for s in self.sectors],
            "children": [c.to_dict() for c in self.children] if self.children else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ResourceItem:
        children = [cls.from_dict(c) for c in data.get("children", [])] if data.get("children") else []
        sectors = [ResourceSector.from_dict(s) for s in data.get("sectors", [])]
        return cls(
            id=data.get("id", ""),
            type=data.get("type", "file"),
            title=data.get("title", ""),
            path_or_url=data.get("pathOrUrl") or data.get("path_or_url", ""),
            extension=data.get("extension", ""),
            size_bytes=data.get("sizeBytes", 0),
            updated_at=data.get("updatedAt", int(datetime.now(timezone.utc).timestamp() * 1000)),
            is_checked=data.get("isChecked", True),
            sectors=sectors,
            children=children,
        )


@dataclass
class ResourceSession:
    """프로젝트별 리소스 세션 영속화 상태."""
    project_id: str
    items: list[ResourceItem] = field(default_factory=list)
    active_resource_id: str | None = None
    selected_sector_id: str | None = None
    updated_at: int = field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp() * 1000))

    def to_dict(self) -> dict:
        return {
            "projectId": self.project_id,
            "items": [it.to_dict() for it in self.items],
            "activeResourceId": self.active_resource_id,
            "selectedSectorId": self.selected_sector_id,
            "updatedAt": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ResourceSession:
        return cls(
            project_id=data.get("projectId") or data.get("project_id", ""),
            items=[ResourceItem.from_dict(it) for it in data.get("items", [])],
            active_resource_id=data.get("activeResourceId"),
            selected_sector_id=data.get("selectedSectorId"),
            updated_at=data.get("updatedAt", int(datetime.now(timezone.utc).timestamp() * 1000)),
        )
