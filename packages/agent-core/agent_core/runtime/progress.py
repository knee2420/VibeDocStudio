"""현재 Agent Run에 가벼운 진행 메타데이터를 전달하는 실행 컨텍스트."""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable, Iterator

ProgressSink = Callable[[dict[str, object]], None]
_sink: ContextVar[ProgressSink | None] = ContextVar("agent_run_progress_sink", default=None)
_run_id: ContextVar[str | None] = ContextVar("agent_run_id", default=None)


@contextmanager
def bind_progress(sink: ProgressSink, run_id: str | None = None) -> Iterator[None]:
    """현재 실행과 중첩된 실행 모두에 진행 이벤트가 도달하도록 sink를 묶는다."""
    parent = _sink.get()

    def combined(detail: dict[str, object]) -> None:
        if parent is not None:
            parent(detail)
        sink(detail)

    token = _sink.set(combined)
    run_token = _run_id.set(run_id or _run_id.get())
    try:
        yield
    finally:
        _run_id.reset(run_token)
        _sink.reset(token)


def report_progress(detail: dict[str, object]) -> None:
    """실행 컨텍스트가 있으면 진행 사실을 기록하고, 없으면 조용히 건너뛴다."""
    sink = _sink.get()
    if sink is not None:
        sink(detail)


def current_run_id() -> str | None:
    return _run_id.get()
