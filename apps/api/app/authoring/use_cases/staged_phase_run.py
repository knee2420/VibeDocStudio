"""Phase 1/2 공통 실행 틀: run_id 발급 · 취소 토큰 등록 · 취소 확인 · 결과 포장."""
from __future__ import annotations

from collections.abc import Callable

from app.core.clock import utc_now_iso
from app.core.storage import RUN_PREFIX, new_id, safe_segment

from ..errors import CompositionRunCancelledError
from ..models import StagedAiDiffItem, StagedPhase, StagedPhaseResult
from ..ports import RunCancellationPort


class StagedPhaseRunner:
    """취소 가능한 한 번의 Phase 실행.

    클라이언트가 `run_id` 를 주면 그 값을 쓴다. 그래야 응답이 오기 전에도 같은 ID 로
    `/runs/{run_id}/cancel` 을 보낼 수 있다. 엔진이 끝난 뒤 취소됐으면 결과를 버리고
    `CompositionRunCancelledError`(409)를 올린다.
    """

    def __init__(self, cancellation: RunCancellationPort) -> None:
        self._cancellation = cancellation

    def run(
        self,
        *,
        phase: StagedPhase,
        engine_name: str,
        run_id: str | None,
        produce: Callable[[], list[StagedAiDiffItem]],
    ) -> StagedPhaseResult:
        resolved_run_id = safe_segment(run_id) if run_id else new_id(RUN_PREFIX)
        self._cancellation.begin(resolved_run_id)
        try:
            self._raise_if_cancelled(resolved_run_id)
            diffs = produce()
            self._raise_if_cancelled(resolved_run_id)
            return StagedPhaseResult(
                run_id=resolved_run_id,
                phase=phase,
                engine_name=engine_name,
                created_at=utc_now_iso(),
                staged_diffs=tuple(diffs),
            )
        finally:
            self._cancellation.finish(resolved_run_id)

    def _raise_if_cancelled(self, run_id: str) -> None:
        if self._cancellation.is_cancelled(run_id):
            raise CompositionRunCancelledError(f"Run '{run_id}' was cancelled")
