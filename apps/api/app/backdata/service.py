"""backdata 도메인 서비스."""
from __future__ import annotations

from .models import BackdataChunkRecord
from .use_cases import ImportRawBackdataUseCase, ListBackdataChunksUseCase


class BackdataService:
    def __init__(
        self,
        import_raw: ImportRawBackdataUseCase,
        list_chunks: ListBackdataChunksUseCase,
    ) -> None:
        self._import_raw = import_raw
        self._list_chunks = list_chunks

    def import_raw_backdata(
        self,
        *,
        source_title: str,
        source_type: str,
        raw_text: str,
        tags: list[str],
    ) -> list[BackdataChunkRecord]:
        return self._import_raw.execute(
            source_title=source_title,
            source_type=source_type,
            raw_text=raw_text,
            tags=tags,
        )

    def list_chunks(self) -> list[BackdataChunkRecord]:
        return self._list_chunks.execute()

