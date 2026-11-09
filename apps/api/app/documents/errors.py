"""documents 도메인 오류."""
from __future__ import annotations

from app.core.errors import ConflictError, NotFoundError, ValidationError


class VDocDocumentNotFoundError(NotFoundError):
    """요청한 `.vdoc` 작업 문서를 찾을 수 없을 때 발생한다."""


class VDocSlotNotFoundError(NotFoundError):
    """문서 내에 지정된 `slotId`가 존재하지 않을 때 발생한다."""


class UnsupportedStructurePatchError(ValidationError):
    """등록되지 않은 구조 패치 연산을 요청했을 때 발생한다."""


class VDocRevisionConflictError(ConflictError):
    """저장하려는 문서의 기준 버전이 서버 버전과 다르다 (다른 탭 · 다른 사용자가 먼저 저장했다)."""
