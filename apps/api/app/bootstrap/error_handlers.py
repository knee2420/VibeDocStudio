"""도메인 오류 → HTTP 응답 번역의 유일한 장소 (`app.bootstrap.error_handlers`).

라우터는 예외를 잡지 않는다. 도메인 오류는 `app.core.errors` 계층을 따르므로
여기서 상태 코드만 정하면 모든 도메인에 같은 규칙이 적용된다.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.errors import (
    ConflictError,
    DomainError,
    ForbiddenOperationError,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)

_STATUS_BY_ERROR: tuple[tuple[type[DomainError], int], ...] = (
    (NotFoundError, 404),
    (ForbiddenOperationError, 403),
    (ConflictError, 409),
    (ValidationError, 400),
)


def _status_for(exc: DomainError) -> int:
    for error_type, status in _STATUS_BY_ERROR:
        if isinstance(exc, error_type):
            return status
    return 400


async def _domain_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return JSONResponse(status_code=_status_for(exc), content={"detail": str(exc)})


async def _value_error_handler(_: Request, exc: Exception) -> JSONResponse:
    # 도메인 계층 밖(엔진 · 서드파티)에서 올라온 입력 오류.
    logger.info("[ErrorHandler] 입력 오류: %s", exc)
    return JSONResponse(status_code=400, content={"detail": str(exc)})


def register_error_handlers(application: FastAPI) -> None:
    application.add_exception_handler(DomainError, _domain_error_handler)
    application.add_exception_handler(ValueError, _value_error_handler)
