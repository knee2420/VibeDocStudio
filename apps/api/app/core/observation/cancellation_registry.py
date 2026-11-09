"""실행 중인 AI 생성·스캐폴딩 작업을 즉시 중단(`Esc` / Stop)하기 위한 협력적 취소 토큰 레지스트리.

생명주기: `begin(run_id)` → 작업이 단계마다 `is_cancelled(run_id)` 확인 → `finish(run_id)`.
취소 요청(`request_cancel`)은 실행이 시작되기 전에 와도 기록되어, 늦게 시작한 실행도 즉시 멈춘다.
완료된 실행의 항목은 지우고, 시작되지 않은 취소 요청은 최근 `max_pending` 개만 남긴다.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock

from app.core.clock import utc_now_iso


@dataclass(frozen=True)
class CancellationEntry:
    run_id: str
    reason: str
    cancelled_at: str
    status: str = "cancelled"


class CancellationRegistry:
    """`run_id` 단위 취소 상태를 관리하는 스레드 안전 레지스트리."""

    def __init__(self, max_pending: int = 512) -> None:
        self._lock = Lock()
        self._active: set[str] = set()
        self._cancelled: OrderedDict[str, CancellationEntry] = OrderedDict()
        self._max_pending = max_pending

    def begin(self, run_id: str) -> None:
        with self._lock:
            self._active.add(run_id)

    def finish(self, run_id: str) -> None:
        with self._lock:
            self._active.discard(run_id)
            self._cancelled.pop(run_id, None)

    def request_cancel(self, run_id: str, reason: str = "user_aborted") -> CancellationEntry:
        entry = CancellationEntry(run_id=run_id, reason=reason, cancelled_at=utc_now_iso())
        with self._lock:
            self._cancelled[run_id] = entry
            self._cancelled.move_to_end(run_id)
            while len(self._cancelled) > self._max_pending:
                oldest = next(iter(self._cancelled))
                if oldest in self._active:
                    break
                self._cancelled.popitem(last=False)
        return entry

    def is_cancelled(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._cancelled

    def is_active(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._active
