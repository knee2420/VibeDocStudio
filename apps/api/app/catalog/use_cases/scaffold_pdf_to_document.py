"""유스케이스: 업로드된 PDF 바이트를 분석하여 캔버스에서 즉시 편집 가능한 `.vdoc` 문서로 변환한다."""
from __future__ import annotations

from typing import Any, Optional

from app.core.storage import DOCUMENT_PREFIX, new_id

from ..ports import FormScaffoldAgentPort


class ScaffoldPdfToDocumentUseCase:
    """PDF -> 고충실도 .vdoc 스캐폴딩 실행 유스케이스."""

    def __init__(self, agent: FormScaffoldAgentPort) -> None:
        self._agent = agent

    def execute(
        self,
        *,
        pdf_bytes: bytes,
        title: str,
    ) -> tuple[dict[str, Any], int, int, int, Optional[dict[str, Any]]]:
        """PDF를 파싱하여 (vdoc, total_pages, checked_blocks, checked_slots, agent_run) 반환."""
        if not pdf_bytes:
            raise ValueError("Uploaded PDF payload is empty")

        clean_title = (title or "").strip() or "추출된 양식 문서"
        doc_id = new_id(DOCUMENT_PREFIX)

        vdoc, checked_blocks, checked_slots, agent_run = self._agent.scaffold_document(
            pdf_bytes=pdf_bytes,
            doc_id=doc_id,
            title=clean_title,
        )
        total_pages = len(vdoc.get("pages", []))
        return vdoc, total_pages, checked_blocks, checked_slots, agent_run

