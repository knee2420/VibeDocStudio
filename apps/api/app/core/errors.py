"""도메인 오류의 공통 계층 (`app.core.errors`).

각 도메인의 오류는 아래 넷 중 하나를 상속한다. HTTP 상태 코드로의 번역은
`app.bootstrap.error_handlers` 한 곳에서만 하므로 라우터는 예외를 잡지 않는다.
"""
from __future__ import annotations


class DomainError(Exception):
    """도메인 규칙 위반의 최상위 오류."""


class NotFoundError(DomainError):
    """요청한 대상이 존재하지 않는다 (404)."""


class ForbiddenOperationError(DomainError):
    """대상은 있지만 이 작업이 허용되지 않는다 (403)."""


class ConflictError(DomainError):
    """현재 상태와 충돌해 작업을 끝낼 수 없다 (409)."""


class ValidationError(DomainError, ValueError):
    """입력이 도메인 규칙에 맞지 않는다 (400)."""
