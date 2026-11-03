"""유스케이스: 실행 중인 AI 생성 작업을 즉시 취소(`Esc` / Stop)한다."""
from __future__ import annotations

from app.core.observation.cancellation_registry import CancellationEntry
from app.core.storage import safe_segment

from ..ports import RunCancellationPort


class CancelCompositionRunUseCase:
    def __init__(self, registry: RunCancellationPort) -> None:
        self._registry = registry

    def execute(self, run_id: str, reason: str = "user_aborted") -> CancellationEntry:
        return self._registry.request_cancel(safe_segment(run_id), reason=reason)
