"""composer 도메인 오류."""
from __future__ import annotations


class SlotCompositionValidationError(ValueError):
    """슬롯 작성 요청이 비어 있거나 필수 식별자가 누락되었을 때 발생한다."""

