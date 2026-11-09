"""catalog 도메인 오류."""
from __future__ import annotations

from app.core.errors import NotFoundError, ValidationError


class CatalogEntryNotFoundError(NotFoundError):
    """요청한 카탈로그 서식 번들이 존재하지 않을 때 발생한다."""


class PdfFormExtractionError(ValidationError):
    """PDF로부터 유효한 `.vdoc` 기하 격자를 추출하지 못했을 때 발생한다."""
