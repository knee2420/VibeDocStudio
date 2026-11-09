"""projects 도메인 예외."""
from __future__ import annotations

from app.core.errors import NotFoundError, ValidationError


class VProjectNotFoundError(NotFoundError):
    """요청한 `.vproj` 프로젝트 또는 노드를 찾을 수 없을 때 발생."""


class VProjectValidationError(ValidationError):
    """프로젝트 매니페스트 또는 아웃라인 노드 요청이 유효하지 않을 때 발생."""
