"""`packages/pdf-vdoc-engine`을 호출하는 어댑터."""
from __future__ import annotations

from typing import Any

from pdf_vdoc_engine import extract_vdoc_from_pdf

from ..errors import PdfFormExtractionError


class PdfVDocEngineAdapter:
    def extract_and_validate(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
    ) -> tuple[dict[str, Any], int, int]:
        vdoc, score = extract_vdoc_from_pdf(
            pdf_bytes=pdf_bytes,
            doc_id=doc_id,
            title=title,
        )
        if not score.valid:
            joined = "; ".join(score.errors)
            raise PdfFormExtractionError(f"Grid invariant validation failed: {joined}")
        return vdoc, score.checked_tables, score.checked_slots

