"""composer 도메인 오류."""
from __future__ import annotations

from app.core.errors import ConflictError, ValidationError


class SlotCompositionValidationError(ValidationError):
    """슬롯 작성 요청이 비어 있거나 필수 식별자가 누락되었을 때 발생한다."""


class CompositionRunCancelledError(ConflictError):
    """실행 도중 사용자가 취소(`Esc` / Stop)해 결과를 버렸을 때 발생한다."""
