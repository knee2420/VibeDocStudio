"""유스케이스: 등록된 모든 백데이터 청크 목록을 조회한다."""
from __future__ import annotations

from ..models import BackdataChunkRecord
from ..ports import BackdataRepositoryPort


class ListBackdataChunksUseCase:
    def __init__(self, repository: BackdataRepositoryPort) -> None:
        self._repository = repository

    def execute(self) -> list[BackdataChunkRecord]:
        return self._repository.list_chunks()

