"""공급자의 일시적 사용 불가 상태를 기억한다.

쿼터가 소진되면 CLI 는 처음 한 번만 사유를 돌려주고, 그 뒤로는 응답 없이 멈춘다.
그래서 상태를 기억해 두지 않으면 매 요청이 타임아웃까지 기다린 뒤 같은 실패를 본다.

여기에는 도메인 지식을 두지 않는다. "어떤 공급자가 언제까지 못 쓰는가"만 안다.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# "Resets in 41h41m40s" / "resets in 12m" 형태에서 남은 시간을 읽는다.
_RESET_PATTERN = re.compile(
    r"resets?\s+in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?",
    re.IGNORECASE,
)

# 사유를 못 읽었을 때 적용할 기본 차단 시간.
_DEFAULT_BLOCK_MINUTES = 15


def parse_reset_after(message: Optional[str]) -> Optional[timedelta]:
    """공급자 오류 문구에서 복구까지 남은 시간을 읽는다. 못 읽으면 None."""
    if not message:
        return None
    match = _RESET_PATTERN.search(message)
    if not match or not any(match.groups()):
        return None
    hours, minutes, seconds = (int(g) if g else 0 for g in match.groups())
    return timedelta(hours=hours, minutes=minutes, seconds=seconds)


def remaining_text(until: datetime) -> str:
    """해제까지 남은 시간을 사람이 읽는 문구로 만든다."""
    seconds = max(0, int((until - datetime.now(timezone.utc)).total_seconds()))
    hours, minutes = seconds // 3600, (seconds % 3600) // 60
    if hours:
        return f"약 {hours}시간 {minutes}분 뒤"
    if minutes:
        return f"약 {minutes}분 뒤"
    return "곧"


class ProviderStateStore:
    """공급자별 차단 상태를 파일 하나에 보관한다.

    개발 중 서버가 자주 재시작되므로 메모리에만 두면 매번 잊는다.
    """

    def __init__(self, state_file: Path) -> None:
        self._state_file = state_file
        self._cache: Optional[Dict[str, Any]] = None

    # --- 조회 ---------------------------------------------------------

    def blocked_until(self, provider_id: str) -> Optional[datetime]:
        """아직 차단 중이면 해제 시각을, 아니면 None 을 돌려준다."""
        entry = self._read().get(provider_id)
        if not entry:
            return None
        try:
            until = datetime.fromisoformat(entry["blocked_until"])
        except (KeyError, ValueError):
            return None
        if until <= datetime.now(timezone.utc):
            self.clear(provider_id)
            return None
        return until

    def block_reason(self, provider_id: str) -> Optional[str]:
        entry = self._read().get(provider_id)
        return entry.get("reason") if entry else None

    def is_blocked(self, provider_id: str) -> bool:
        return self.blocked_until(provider_id) is not None

    # --- 기록 ---------------------------------------------------------

    def block(
        self,
        provider_id: str,
        *,
        reason: str,
        message: Optional[str] = None,
        reset_after: Optional[timedelta] = None,
    ) -> datetime:
        """공급자를 일정 시간 차단한다. 해제 시각을 돌려준다."""
        delta = reset_after or parse_reset_after(message) or timedelta(minutes=_DEFAULT_BLOCK_MINUTES)
        until = datetime.now(timezone.utc) + delta
        state = self._read()
        state[provider_id] = {
            "blocked_until": until.isoformat(),
            "reason": reason,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        self._write(state)
        logger.warning(
            "[ProviderState] %s 차단: %s (해제 %s)", provider_id, reason, until.isoformat()
        )
        return until

    def clear(self, provider_id: str) -> None:
        state = self._read()
        if state.pop(provider_id, None) is not None:
            self._write(state)
            logger.info("[ProviderState] %s 차단 해제", provider_id)

    # 호환성 별칭
    def record_failure(
        self,
        provider_id: str,
        *,
        code: str,
        message: Optional[str] = None,
        duration: Optional[timedelta] = None,
    ) -> datetime:
        return self.block(provider_id, reason=code, message=message, reset_after=duration)

    def record_success(self, provider_id: str) -> None:
        self.clear(provider_id)

    # --- 파일 I/O ------------------------------------------------------

    def _read(self) -> Dict[str, Any]:
        if self._cache is not None:
            return self._cache
        try:
            with open(self._state_file, "r", encoding="utf-8") as f:
                self._cache = json.load(f)
        except (OSError, ValueError):
            self._cache = {}
        return self._cache

    def _write(self, state: Dict[str, Any]) -> None:
        self._cache = state
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._state_file, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except OSError as exc:
            logger.warning("[ProviderState] 상태 저장 실패: %s", exc)


class ProviderStatus:
    """공급자 상태 모델."""

    def __init__(
        self,
        provider_id: str,
        available: bool,
        blocked_until: Optional[datetime] = None,
        reason: Optional[str] = None,
    ) -> None:
        self.provider_id = provider_id
        self.available = available
        self.blocked_until = blocked_until
        self.reason = reason
