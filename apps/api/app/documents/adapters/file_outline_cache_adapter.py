"""`cache/outlines/` 아래 문서별 결정적 아웃라인 트리 프로젝션 캐시 어댑터."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.storage import read_json, safe_segment, write_json


class FileOutlineCacheAdapter:
    def __init__(self, cache_root: Path) -> None:
        self._root = cache_root
        self._root.mkdir(parents=True, exist_ok=True)

    def _cache_file(self, doc_id: str) -> Path:
        return self._root / f"{safe_segment(doc_id)}.outline.json"

    def get_cached_outline(self, doc_id: str) -> dict[str, Any] | None:
        raw = read_json(self._cache_file(doc_id))
        return raw if isinstance(raw, dict) else None

    def put_cached_outline(self, doc_id: str, payload: dict[str, Any]) -> None:
        write_json(self._cache_file(doc_id), payload)

    def invalidate(self, doc_id: str) -> None:
        path = self._cache_file(doc_id)
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass

