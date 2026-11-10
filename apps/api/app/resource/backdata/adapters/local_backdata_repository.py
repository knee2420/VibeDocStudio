"""`data/knowledge/backdata/` 아래 백데이터 청크를 저장·조회하는 어댑터."""
from __future__ import annotations

from pathlib import Path

from app.core.storage import read_json, safe_segment, write_json

from ..models import BackdataChunkRecord


class LocalBackdataRepository:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir

    def save_chunks(self, chunks: list[BackdataChunkRecord]) -> None:
        for chunk in chunks:
            safe_id = safe_segment(chunk.chunk_id)
            write_json(
                self._root / f"{safe_id}.json",
                {
                    "chunkId": chunk.chunk_id,
                    "sourceTitle": chunk.source_title,
                    "sourceType": chunk.source_type,
                    "excerpt": chunk.excerpt,
                    "updatedAt": chunk.updated_at,
                    "tags": list(chunk.tags),
                },
            )

    def list_chunks(self) -> list[BackdataChunkRecord]:
        if not self._root.exists():
            return []
        records: list[BackdataChunkRecord] = []
        for path in sorted(self._root.glob("*.json")):
            raw = read_json(path)
            if not isinstance(raw, dict):
                continue
            records.append(
                BackdataChunkRecord(
                    chunk_id=str(raw.get("chunkId", path.stem)),
                    source_title=str(raw.get("sourceTitle", "")),
                    source_type=str(raw.get("sourceType", "markdown")),
                    excerpt=str(raw.get("excerpt", "")),
                    updated_at=str(raw.get("updatedAt", "")),
                    tags=tuple(str(t) for t in raw.get("tags", [])),
                )
            )
        return records

