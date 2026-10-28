"""backdata 도메인의 프레임워크 독립 영속 모델."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BackdataChunkRecord:
    chunk_id: str
    source_title: str
    source_type: str
    excerpt: str
    updated_at: str
    tags: tuple[str, ...]

