"""reference 도메인 오류."""
from __future__ import annotations

from app.core.errors import NotFoundError, ValidationError


class ReferenceNotFoundError(NotFoundError):
    """라이브러리에 없는 레퍼런스."""


class ReferencePinNotFoundError(NotFoundError):
    """레퍼런스에 없는 핀."""


class UnsupportedReferenceSourceError(ValidationError):
    """레퍼런스로 받을 수 없는 원본 (폴더 · 지원하지 않는 형식 · 빈 파일)."""


class ReferenceValidationError(ValidationError):
    """받을 수 없는 해석 카드 · 앵커 (층위 없음 · 범위가 레퍼런스 밖 · 없는 대안 번호)."""
