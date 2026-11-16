"""outline 도메인 예외."""
from __future__ import annotations

from app.core.errors import NotFoundError, ValidationError


class OutlineNotFoundError(NotFoundError):
    """Requested working outline or node was not found."""


class OutlineValidationError(ValidationError):
    """Working outline payload or command was invalid."""
