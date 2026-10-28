"""유스케이스: 원문 텍스트를 단락별로 분할하여 백데이터 청크로 등록한다."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.storage import BACKDATA_PREFIX, new_id

from ..errors import EmptyBackdataSourceError
from ..models import BackdataChunkRecord
from ..ports import BackdataRepositoryPort


class ImportRawBackdataUseCase:
    def __init__(self, repository: BackdataRepositoryPort) -> None:
        self._repository = repository

    def execute(
        self,
        *,
        source_title: str,
        source_type: str,
        raw_text: str,
        tags: list[str],
    ) -> list[BackdataChunkRecord]:
        cleaned = (raw_text or "").strip()
        if not cleaned:
            raise EmptyBackdataSourceError("raw_text must not be empty")
        title = (source_title or "").strip() or "원문 자료"
        paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
        now_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        records: list[BackdataChunkRecord] = []
        for idx, para in enumerate(paragraphs or [cleaned]):
            records.append(
                BackdataChunkRecord(
                    chunk_id=new_id(BACKDATA_PREFIX),
                    source_title=f"{title} (#{idx + 1})" if len(paragraphs) > 1 else title,
                    source_type=source_type or "markdown",
                    excerpt=para,
                    updated_at=now_date,
                    tags=tuple(tags or ["백데이터"]),
                )
            )

        self._repository.save_chunks(records)
        return records

