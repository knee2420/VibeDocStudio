"""form_scaffold 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Any, Callable, Optional, Protocol

from .models import ScaffoldJob


class FormScaffoldAgentPort(Protocol):
    """PDF 바이트로부터 시맨틱 블록 · 조항 위계와 정규화된 프레임을 갖춘 `.vdoc` 문서를 스캐폴딩하는 에이전트 포트."""

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
        fidelity_mode: str = "balanced",
        on_progress: Optional[Callable[[dict[str, Any]], None]] = None,
        cancel_event: Any = None,
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]: ...


class ScaffoldJobStorePort(Protocol):
    """비동기 PDF 스캐폴딩 작업 상태 · 이벤트 · 원본 PDF 저장소 계약."""

    def save(self, job: ScaffoldJob) -> None: ...
    def get(self, job_id: str) -> Optional[ScaffoldJob]: ...
    def list_jobs(self, *, target_doc_id: Optional[str] = None, limit: int = 30) -> list[ScaffoldJob]: ...
    def list_unfinished(self) -> list[ScaffoldJob]: ...
    def save_source_pdf(self, job_id: str, pdf_bytes: bytes) -> None: ...
    def load_source_pdf(self, job_id: str) -> bytes: ...
    def append_event(self, job_id: str, event: dict[str, Any]) -> None: ...
    def events(self, job_id: str, after: int = 0) -> list[dict[str, Any]]: ...
