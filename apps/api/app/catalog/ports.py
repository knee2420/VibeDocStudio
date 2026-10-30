"""catalog 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Any, Optional, Protocol

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
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]:
        """(문서, 블록 수, 슬롯 수, 에이전트 실행 정보 | None). 실행 정보에는 runId 와 로그 디렉터리가 있다."""
        ...


class FormScaffoldAgentPort(Protocol):
    """PDF 바이트로부터 시맨틱 블록·조항 위계와 정규화된 프레임을 갖춘 `.vdoc` 문서를 스캐폴딩하는 에이전트 포트."""

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
        fidelity_mode: str = "balanced",
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]: ...



