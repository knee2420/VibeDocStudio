"""카탈로그 파일시스템 저장소 어댑터 (1서식 = 1폴더 번들 레이아웃 소유)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.storage import read_json, safe_segment, write_json

from ..errors import CatalogEntryNotFoundError
from ..models import CatalogFormBundleRecord, CatalogManifestRecord


def _to_manifest_record(raw: dict[str, Any]) -> CatalogManifestRecord:
    return CatalogManifestRecord(
        catalog_id=str(raw.get("catalogId", "")),
        title=str(raw.get("title", "")),
        source_origin=str(raw.get("sourceOrigin", "")),
        source_id=str(raw.get("sourceId", "")),
        category=str(raw.get("category", "")),
        tags=tuple(str(t) for t in raw.get("tags", [])),
        description=str(raw.get("description", "")),
    )


def _to_manifest_dict(record: CatalogManifestRecord) -> dict[str, Any]:
    return {
        "catalogId": record.catalog_id,
        "title": record.title,
        "sourceOrigin": record.source_origin,
        "sourceId": record.source_id,
        "category": record.category,
        "tags": list(record.tags),
        "description": record.description,
    }


class FilesystemCatalogRepository:
    def __init__(self, catalog_root: Path) -> None:
        self._root = catalog_root

    def list_manifests(self) -> list[CatalogManifestRecord]:
        index_payload = read_json(self._root / "index.json")
        if isinstance(index_payload, dict) and isinstance(index_payload.get("entries"), list):
            return [_to_manifest_record(item) for item in index_payload["entries"]]

        if not self._root.exists():
            return []

        records: list[CatalogManifestRecord] = []
        for entry_dir in sorted(self._root.iterdir()):
            if not entry_dir.is_dir():
                continue
            manifest_raw = read_json(entry_dir / "manifest.json")
            if isinstance(manifest_raw, dict):
                records.append(_to_manifest_record(manifest_raw))
        return records

    def get_bundle(self, catalog_id: str) -> CatalogFormBundleRecord:
        safe_id = safe_segment(catalog_id)
        bundle_dir = self._root / safe_id
        manifest_raw = read_json(bundle_dir / "manifest.json")
        doc_raw = read_json(bundle_dir / "document.json")
        if not isinstance(manifest_raw, dict) or not isinstance(doc_raw, dict):
            raise CatalogEntryNotFoundError(f"Catalog bundle not found: {safe_id}")
        return CatalogFormBundleRecord(
            manifest=_to_manifest_record(manifest_raw),
            document=doc_raw,
        )

    def save_bundle(self, bundle: CatalogFormBundleRecord) -> None:
        safe_id = safe_segment(bundle.manifest.catalog_id)
        bundle_dir = self._root / safe_id
        write_json(bundle_dir / "manifest.json", _to_manifest_dict(bundle.manifest))
        write_json(bundle_dir / "document.json", bundle.document)

