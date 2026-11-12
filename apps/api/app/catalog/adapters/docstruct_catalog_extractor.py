"""`docstruct-engine` + `harness_kit.docstruct_vdoc` 기반 카탈로그 인입 어댑터."""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any, Optional

from docstruct_engine.config import load_thresholds
from docstruct_engine.verify import verify_doc
from harness_kit.docstruct_vdoc import (
    build_doc_ir_from_pdf_bytes,
    default_ocr_port,
    doc_ir_to_vdoc,
    finalize_vdoc_envelope,
)

from ..errors import PdfFormExtractionError

logger = logging.getLogger(__name__)


class DocStructCatalogExtractorAdapter:
    """업로드 PDF를 `docstruct-engine` 파이프라인으로 추출·검증하여 `.vdoc` 로 컴파일한다."""

    def __init__(
        self,
        *,
        cache_root: Optional[Path] = None,
        ocr_port: Optional[Any] = None,
    ) -> None:
        self._cache_root = cache_root
        self._ocr_port = ocr_port

    def extract_and_validate(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
    ) -> tuple[dict[str, Any], int, int]:
        if not pdf_bytes:
            raise PdfFormExtractionError("Uploaded PDF payload is empty")

        thresholds = load_thresholds()
        ocr_port = self._ocr_port if self._ocr_port is not None else default_ocr_port()
        with tempfile.TemporaryDirectory(prefix="docstruct_catalog_") as td:
            tmp_dir = Path(td)
            cache_root = self._cache_root if self._cache_root is not None else (tmp_dir / "cache")
            try:
                doc_ir, _ = build_doc_ir_from_pdf_bytes(
                    pdf_bytes,
                    doc_path=tmp_dir / "source.pdf",
                    cache_root=cache_root,
                    ocr_port=ocr_port,
                    thresholds=thresholds,
                    render_png=False,
                )
            except Exception as exc:
                raise PdfFormExtractionError(f"DocStruct extraction failed: {exc}") from exc

        if not doc_ir.pages:
            raise PdfFormExtractionError("DocStruct extraction produced zero pages")

        bundle = verify_doc(doc_ir, thresholds=thresholds)
        gate_failures = [f for pg in bundle.report.pages for f in pg.gateFailures]
        if gate_failures:
            logger.warning("[DocStructCatalogExtractorAdapter] verify warnings: %s", gate_failures)

        raw_vdoc, reports = doc_ir_to_vdoc(doc_ir, doc_id=doc_id, title=title)
        vdoc, _checked_blocks, checked_slots = finalize_vdoc_envelope(
            raw_vdoc,
            doc_id=doc_id,
            title=title,
        )
        checked_tables = sum(rep.tables for rep in reports)
        return vdoc, checked_tables, checked_slots

