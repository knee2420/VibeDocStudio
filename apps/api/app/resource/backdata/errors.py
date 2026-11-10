"""backdata 도메인 오류."""
from __future__ import annotations

from app.core.errors import ValidationError


class EmptyBackdataSourceError(ValidationError):
    """비어 있는 원문 텍스트가 입력되었을 때 발생한다."""
