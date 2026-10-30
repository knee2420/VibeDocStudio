"""catalog 도메인 서비스 (식별자 정규화 및 유스케이스 위임)."""
from __future__ import annotations

from typing import Any, Optional

from .models import CatalogFormBundleRecord, CatalogManifestRecord
from .use_cases import (
    GetCatalogBundleUseCase,
    IngestPdfToCatalogUseCase,
    ListCatalogFormsUseCase,
    ScaffoldPdfToDocumentUseCase,
)


class CatalogService:
    def __init__(
        self,
        list_forms: ListCatalogFormsUseCase,
        get_bundle: GetCatalogBundleUseCase,
        ingest_pdf: IngestPdfToCatalogUseCase,
        scaffold_pdf: ScaffoldPdfToDocumentUseCase,
    ) -> None:
        self._list_forms = list_forms
        self._get_bundle = get_bundle
        self._ingest_pdf = ingest_pdf
        self._scaffold_pdf = scaffold_pdf

    def list_manifests(self) -> list[CatalogManifestRecord]:
        return self._list_forms.execute()

    def get_bundle(self, catalog_id: str) -> CatalogFormBundleRecord:
        return self._get_bundle.execute(catalog_id)

    def ingest_pdf_form(
        self,
        *,
        pdf_bytes: bytes,
        title: str,
        category: str = "자동추출 서식",
    ) -> tuple[CatalogFormBundleRecord, int, int]:
        return self._ingest_pdf.execute(
            pdf_bytes=pdf_bytes,
            title=title,
            category=category,
        )

    def scaffold_pdf_document(
        self,
        *,
        pdf_bytes: bytes,
        title: str,
        fidelity_mode: str = "balanced",
    ) -> tuple[dict[str, Any], int, int, int, Optional[dict[str, Any]]]:
        return self._scaffold_pdf.execute(
            pdf_bytes=pdf_bytes,
            title=title,
            fidelity_mode=fidelity_mode,
        )
