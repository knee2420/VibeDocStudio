"""저장소 대리키(surrogate key) 발급과 경로 세그먼트 검증."""
from __future__ import annotations

import re
import time
import uuid

from app.core.errors import ValidationError

_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_.\-]{1,128}$")

DOCUMENT_PREFIX = "vdoc"
PROJECT_PREFIX = "vproj"
CATALOG_PREFIX = "cat"
BACKDATA_PREFIX = "bd"
RUN_PREFIX = "run"
PROVENANCE_PREFIX = "prov"
STAGING_PREFIX = "stg"


def new_id(prefix: str) -> str:
    """사전순 정렬이 곧 생성순 정렬이 되는 대리키를 발급한다."""
    milliseconds = int(time.time() * 1000)
    return f"{prefix}-{milliseconds:011x}-{uuid.uuid4().hex[:8]}"


def is_safe_segment(value: str) -> bool:
    """경로 한 조각으로 그대로 써도 안전한지 판정한다."""
    if value in {".", ".."}:
        return False
    return bool(_SAFE_SEGMENT.match(value))


def safe_segment(value: str) -> str:
    """안전하지 않은 경로 조각이면 치환하지 않고 즉시 거부한다."""
    candidate = (value or "").strip()
    if not is_safe_segment(candidate):
        raise ValidationError(f"Unsafe path segment: {value!r}")
    return candidate

