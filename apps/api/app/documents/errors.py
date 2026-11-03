"""documents 도메인 오류."""
from __future__ import annotations

from app.core.errors import NotFoundError, ValidationError


class VDocDocumentNotFoundError(NotFoundError):
    """요청한 `.vdoc` 작업 문서를 찾을 수 없을 때 발생한다."""


class VDocSlotNotFoundError(NotFoundError):
    """문서 내에 지정된 `slotId`가 존재하지 않을 때 발생한다."""


class UnsupportedStructurePatchError(ValidationError):
    """등록되지 않은 구조 패치 연산을 요청했을 때 발생한다."""
