"""backdata 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Protocol

from .models import BackdataChunkRecord


class BackdataRepositoryPort(Protocol):
    """`data/knowledge/backdata/` 아래 청킹된 백데이터를 저장·조회하는 포트."""

    def save_chunks(self, chunks: list[BackdataChunkRecord]) -> None: ...

    def list_chunks(self) -> list[BackdataChunkRecord]: ...

