"""catalog 도메인의 프레임워크 독립 영속 모델."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CatalogManifestRecord:
    catalog_id: str
    title: str
    source_origin: str
    source_id: str
    category: str
    tags: tuple[str, ...]
    description: str


@dataclass(frozen=True)
class CatalogFormBundleRecord:
    manifest: CatalogManifestRecord
    document: dict[str, Any]

