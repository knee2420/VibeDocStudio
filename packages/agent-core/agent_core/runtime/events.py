"""실행 이력과 폴드(Event Sourcing).

상태 파일을 통째로 덮어쓰면 "왜 이 상태가 되었는가"가 남지 않는다. 그러면
재개할 수도, 실패를 되짚을 수도 없다. 그래서 이력을 정본으로 두고 현재 상태는
이력을 접어 얻는다. `snapshot.json` 은 읽기 최적화일 뿐, 잃어도 이력에서 복원된다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Literal

from pydantic import BaseModel, Field

from .models import AgentRun, RunCost, RunStatus

EventType = Literal[
    "queued",
    "started",
    "progressed",
    "cost_recorded",
    "waiting",
    "resumed",
    "succeeded",
    "failed",
]


class AgentRunEvent(BaseModel):
    """이력 한 줄. 발생한 사실만 담고 해석은 폴드가 한다."""

    type: EventType
    at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    agent_name: str | None = None
    trace_id: str | None = None
    doc_id: str | None = None
    status: RunStatus | None = Field(
        default=None, description="waiting 계열에서 어떤 대기인지 구분"
    )
    agreement_id: str | None = None
    error_code: str | None = None
    cost: RunCost | None = None
    result: dict[str, Any] | None = None
    detail: dict[str, Any] = Field(default_factory=dict)


def fold(run_id: str, events: Iterable[AgentRunEvent]) -> AgentRun | None:
    """이력을 접어 현재 상태를 만든다. 이력이 비면 상태도 없다."""
    ordered = list(events)
    if not ordered:
        return None

    first = ordered[0]
    run = AgentRun(
        run_id=run_id,
        agent_name=first.agent_name or "unknown",
        status="queued",
        started_at=first.at,
        trace_id=first.trace_id,
        doc_id=first.doc_id,
    )

    for event in ordered:
        if event.agent_name:
            run.agent_name = event.agent_name
        if event.trace_id:
            run.trace_id = event.trace_id
        if event.doc_id:
            run.doc_id = event.doc_id
        if event.cost:
            run.cost = _accumulate(run.cost, event.cost)

        if event.type == "queued":
            run.status = "queued"
        elif event.type == "started":
            run.status = "running"
            run.started_at = event.at
        elif event.type == "resumed":
            run.status = "running"
            run.attempt += 1
            run.agreement_id = None
            run.error_code = None
        elif event.type == "waiting":
            # 어떤 대기인지는 이벤트가 들고 온다. 기본값은 사람 승인 대기.
            run.status = event.status or "waiting_for_approval"
            run.agreement_id = event.agreement_id
            run.error_code = event.error_code
        elif event.type == "succeeded":
            run.status = "completed"
            run.finished_at = event.at
            run.result = event.result
            run.error_code = None
        elif event.type == "failed":
            run.status = "failed"
            run.finished_at = event.at
            run.error_code = event.error_code or "AGENT_EXECUTION_FAILED"
            if event.detail:
                run.metadata = {**run.metadata, **event.detail}
        elif event.type == "progressed":
            run.metadata = {**run.metadata, **event.detail}

    return run


def _accumulate(base: RunCost, delta: RunCost) -> RunCost:
    return RunCost(
        input_tokens=base.input_tokens + delta.input_tokens,
        output_tokens=base.output_tokens + delta.output_tokens,
        thinking_tokens=base.thinking_tokens + delta.thinking_tokens,
        cache_read_tokens=base.cache_read_tokens + delta.cache_read_tokens,
        total_tokens=base.total_tokens + delta.total_tokens,
    )
