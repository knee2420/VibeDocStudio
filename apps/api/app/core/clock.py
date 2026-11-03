"""시각 표기의 단일 게이트 (`app.core.clock`).

저장소·응답에 남는 타임스탬프는 모두 초 단위 UTC `YYYY-MM-DDTHH:MM:SSZ` 한 형식으로 쓴다.
"""
from __future__ import annotations

from datetime import datetime, timezone

ISO_UTC_SECONDS = "%Y-%m-%dT%H:%M:%SZ"


def utc_now_iso() -> str:
    """지금 시각을 저장 표준 형식(초 단위 UTC)으로 돌려준다."""
    return datetime.now(timezone.utc).strftime(ISO_UTC_SECONDS)
