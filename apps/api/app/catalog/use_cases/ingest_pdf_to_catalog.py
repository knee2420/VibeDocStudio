"""유스케이스: 업로드된 PDF 바이트를 결정론적 기하 엔진으로 추출해 카탈로그에 등록한다."""
from __future__ import annotations

from app.core.storage import CATALOG_PREFIX, new_id

from ..models import CatalogFormBundleRecord, CatalogManifestRecord
from ..ports import CatalogRepositoryPort, PdfVDocExtractorPort


class IngestPdfToCatalogUseCase:
    def __init__(
        self,
        repository: CatalogRepositoryPort,
        extractor: PdfVDocExtractorPort,
    ) -> None:
        self._repository = repository
        self._extractor = extractor

    def execute(
        self,
        *,
        pdf_bytes: bytes,
        title: str,
        category: str = "자동추출 서식",
    ) -> tuple[CatalogFormBundleRecord, int, int]:
        if not pdf_bytes:
            raise ValueError("Uploaded PDF payload is empty")
        clean_title = (title or "").strip() or "추출된 양식 문서"
        catalog_id = new_id(CATALOG_PREFIX)
        vdoc, checked_tables, checked_slots = self._extractor.extract_and_validate(
            pdf_bytes=pdf_bytes,
            doc_id=catalog_id,
            title=clean_title,
        )
        manifest = CatalogManifestRecord(
            catalog_id=catalog_id,
            title=clean_title,
            source_origin="docstruct-engine",
            source_id=catalog_id,
            category=category,
            tags=("PDF자동추출", "DocIR", "OCR지원"),
            description=f"docstruct-engine 파이프라인으로 추출된 양식 (표 {checked_tables}개 · 슬롯 {checked_slots}개)",
        )
        bundle = CatalogFormBundleRecord(manifest=manifest, document=vdoc)
        self._repository.save_bundle(bundle)
        return bundle, checked_tables, checked_slots

