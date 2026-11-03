"""실행 중인 AI 생성·스캐폴딩 작업을 즉시 중단(`Esc` / Stop)하기 위한 취소 토큰 레지스트리."""
from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock


class CancellationRegistry:
    """`run_id` 단위로 취소 요청 시각과 사유를 관리하는 스레드 안전 레지스트리."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._cancelled: dict[str, dict[str, str]] = {}

    def request_cancel(self, run_id: str, reason: str = "user_aborted") -> dict[str, str]:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        entry = {
            "runId": run_id,
            "status": "cancelled",
            "reason": reason,
            "cancelledAt": now,
        }
        with self._lock:
            self._cancelled[run_id] = entry
        return entry

    def is_cancelled(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._cancelled

    def get_entry(self, run_id: str) -> dict[str, str] | None:
        with self._lock:
            return self._cancelled.get(run_id)

    def clear(self, run_id: str) -> None:
        with self._lock:
            self._cancelled.pop(run_id, None)

    def list_cancelled(self) -> list[dict[str, str]]:
        with self._lock:
            return list(self._cancelled.values())

