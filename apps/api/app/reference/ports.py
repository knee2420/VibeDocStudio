"""reference 도메인 포트."""
from __future__ import annotations

from typing import Any, Optional, Protocol

from .models import ProjectBinding, ReferenceItem, ReferencePin


class ReferenceLibraryPort(Protocol):
    """레퍼런스 라이브러리 저장소 (원본 · 추출 · 층위 · 핀 · 프로젝트 연결)."""

    def list_items(self) -> list[ReferenceItem]: ...

    def get_item(self, ref_id: str) -> Optional[ReferenceItem]: ...

    def save_item(self, item: ReferenceItem) -> None: ...

    def delete_item(self, ref_id: str) -> bool: ...

    def write_source(self, ref_id: str, extension: str, data: bytes) -> None: ...

    def read_source(self, ref_id: str) -> Optional[tuple[bytes, str]]:
        """(바이트, 파일 이름) — 없으면 None."""
        ...

    def save_artifact(self, ref_id: str, name: str, payload: Any) -> None:
        """`extraction` · `layers` 같은 파생 결과를 저장한다."""
        ...

    def load_artifact(self, ref_id: str, name: str) -> Any: ...

    def load_pins(self, ref_id: str) -> list[ReferencePin]: ...

    def save_pins(self, ref_id: str, pins: list[ReferencePin]) -> None: ...

    def load_binding(self, project_id: str) -> ProjectBinding: ...

    def save_binding(self, binding: ProjectBinding) -> None: ...

    def list_bindings(self) -> list[ProjectBinding]: ...


class PdfExtractorPort(Protocol):
    def extract(self, data: bytes) -> dict[str, Any]:
        """PDF 바이트 → `extraction` (pages · blocks · outline)."""
        ...


class HtmlExtractorPort(Protocol):
    def extract(self, page: str | bytes, url: str = "", content_type: str = "") -> dict[str, Any]:
        """HTML(문자열 또는 바이트) → `extraction` (blocks · outline · article)."""
        ...


class WebFetcherPort(Protocol):
    def fetch(self, url: str) -> tuple[bytes, str]:
        """URL → (본문 바이트, content-type). 실패하면 예외."""
        ...


class LayerAnalyzerPort(Protocol):
    def analyze(self, extraction: dict[str, Any], layer_set: str) -> dict[str, Any]:
        """`extraction` → `layers` (층위별 측정값)."""
        ...
