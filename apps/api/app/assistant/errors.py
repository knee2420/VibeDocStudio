"""assistant 도메인 오류."""
from __future__ import annotations

from app.core.errors import NotFoundError


class AssistantSessionNotFoundError(NotFoundError):
    """만료되었거나 존재하지 않는 Composer 세션."""
