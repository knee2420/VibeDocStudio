"""form_scaffold 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Any, Optional, Protocol


class FormScaffoldAgentPort(Protocol):
    """PDF 바이트로부터 시맨틱 블록 · 조항 위계와 정규화된 프레임을 갖춘 `.vdoc` 문서를 스캐폴딩하는 에이전트 포트."""

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
        fidelity_mode: str = "balanced",
    ) -> tuple[dict[str, Any], int, int, Optional[dict[str, Any]]]: ...
