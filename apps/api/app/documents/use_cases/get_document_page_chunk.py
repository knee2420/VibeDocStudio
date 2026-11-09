"""유스케이스: 대용량 문서(100p+)를 위한 10~20p 슬라이딩 윈도우 청크 조회 (`WindowedPageChunker` 대응).

창에 들어온 페이지가 참조하는 슬롯과 근거 자료만 돌려준다.
"""
from __future__ import annotations

from app.core.storage import safe_segment

from ..models import VDocPageWindow
from ..ports import VDocDocumentRepositoryPort


class GetDocumentPageChunkUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        doc_id: str,
        start_page: int = 1,
        end_page: int = 15,
    ) -> VDocPageWindow:
        return self._repo.get(safe_segment(doc_id)).page_window(start_page, end_page)
