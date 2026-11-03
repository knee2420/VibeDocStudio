"""유스케이스: 대용량 문서(100p+)를 위한 10~20p 슬라이딩 윈도우 청크 조회 (`WindowedPageChunker` 대응)."""
from __future__ import annotations

from typing import Any

from app.core.storage import safe_segment

from ..ports import VDocDocumentRepositoryPort

A4_SHEET_SLOT_STRIDE_PX = 1147  # 1123px A4 height + 24px gap


class GetDocumentPageChunkUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        doc_id: str,
        start_page: int = 1,
        end_page: int = 15,
    ) -> dict[str, Any]:
        safe_id = safe_segment(doc_id)
        record = self._repo.get(safe_id)
        doc = record.payload
        all_pages: list[dict[str, Any]] = list(doc.get("pages", []))
        total_pages = len(all_pages)

        clamped_start = max(1, min(start_page, max(1, total_pages)))
        clamped_end = max(clamped_start, min(end_page, max(1, total_pages)))

        start_idx = clamped_start - 1
        end_idx = clamped_end
        chunk_pages = all_pages[start_idx:end_idx]

        top_spacer_px = max(0, start_idx * A4_SHEET_SLOT_STRIDE_PX)
        bottom_spacer_px = max(0, (total_pages - end_idx) * A4_SHEET_SLOT_STRIDE_PX)

        return {
            "docId": record.doc_id,
            "title": str(doc.get("title", record.doc_id)),
            "totalPages": total_pages,
            "startPage": clamped_start,
            "endPage": clamped_end,
            "windowSize": len(chunk_pages),
            "topSpacerPx": top_spacer_px,
            "bottomSpacerPx": bottom_spacer_px,
            "pages": chunk_pages,
            "slots": doc.get("slots", {}),
            "backdata": doc.get("backdata", {}),
        }

