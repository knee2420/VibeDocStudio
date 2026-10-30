"""에이전트 실행 한 건의 추적 기록.

한 실행은 디렉터리 하나다.

    <run_dir>/
        trace.jsonl              사건 순서대로 한 줄씩 (run_start · llm_call · tool_call · … · run_end)
        steps/NN_prompt.txt      그 단계에 LLM 에게 보낸 프롬프트 전문
        steps/NN_response.json   LLM 응답 원문 · 파싱 결과 · 토큰 · 소요 시간
        steps/NN_observation.json 도구 실행 결과 전문
        summary.json             최종 상태 (run_end 시점)

같은 내용을 파이썬 로거에도 한 줄씩 흘린다. 로그 줄에는 `RunLogContextFilter` 가
`run_id` · `step` 을 붙이므로, 앱 로그 파일만 grep 해도 실행 한 건을 따라갈 수 있다.
"""
from __future__ import annotations

import contextvars
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("agent_core.react")

_run_id: contextvars.ContextVar[str] = contextvars.ContextVar("react_run_id", default="-")
_step: contextvars.ContextVar[str] = contextvars.ContextVar("react_step", default="-")


class RunLogContextFilter(logging.Filter):
    """로그 레코드에 현재 실행의 `run_id` · `step` 을 붙인다 (포맷 문자열에서 `%(run_id)s`)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.run_id = _run_id.get()
        record.step = _step.get()
        return True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class RunTrace:
    def __init__(self, run_dir: Path, run_id: str) -> None:
        self.run_id = run_id
        self.run_dir = run_dir
        self.steps_dir = run_dir / "steps"
        self.steps_dir.mkdir(parents=True, exist_ok=True)
        self._trace_path = run_dir / "trace.jsonl"
        self._seq = 0
        self._t0 = time.monotonic()
        self._token = _run_id.set(run_id)

    # --- 기록 ------------------------------------------------------------

    def event(self, kind: str, *, step: int | None = None, **data: Any) -> None:
        self._seq += 1
        row = {
            "seq": self._seq,
            "ts": _now(),
            "elapsed_s": round(time.monotonic() - self._t0, 3),
            "run_id": self.run_id,
            "step": step,
            "kind": kind,
            **data,
        }
        with self._trace_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

    def set_step(self, step: int) -> None:
        _step.set(str(step))

    def write_step_file(self, step: int, suffix: str, content: Any) -> Path:
        path = self.steps_dir / f"{step:02d}_{suffix}"
        if isinstance(content, str):
            path.write_text(content, encoding="utf-8")
        else:
            path.write_text(json.dumps(content, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        return path

    def write_json(self, name: str, content: Any) -> Path:
        path = self.run_dir / name
        path.write_text(json.dumps(content, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        return path

    def close(self) -> None:
        _step.set("-")
        try:
            _run_id.reset(self._token)
        except ValueError:  # 다른 컨텍스트에서 닫힌 경우
            _run_id.set("-")
