"""catalog 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Any, Protocol

from .models import CatalogFormBundleRecord, CatalogManifestRecord


class CatalogRepositoryPort(Protocol):
    """1서식 = 1폴더 카탈로그 번들을 읽고 기록하는 저장소 포트."""

    def list_manifests(self) -> list[CatalogManifestRecord]: ...

    def get_bundle(self, catalog_id: str) -> CatalogFormBundleRecord: ...

    def save_bundle(self, bundle: CatalogFormBundleRecord) -> None: ...


class PdfVDocExtractorPort(Protocol):
    """PDF 바이트로부터 `.vdoc` 문서와 기하 검증 점수를 도출하는 엔진 포트."""

    def extract_and_validate(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
    ) -> tuple[dict[str, Any], int, int]: ...

