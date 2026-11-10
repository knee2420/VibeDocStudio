"""`CardEnricher` 구현 — 빈 샌드박스에서 agy 단발 실행으로 카드 재료 JSON 을 받는다."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.llm.adapters.agy_print import parse_json_text, run_agy_print

logger = logging.getLogger(__name__)


class AgyCardEnricher:
    """`CardEnricher` 구현 — 빈 샌드박스에서 agy 를 돌려 카드 재료 JSON 을 받는다."""

    def __init__(self, *, executable: str, model: str, sandbox_dir: Path, timeout_seconds: int = 300) -> None:
        self.executable = executable
        self.model = model
        self.sandbox_dir = sandbox_dir
        self.timeout_seconds = timeout_seconds

    def run(self, prompt: str, schema: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
        result = run_agy_print(prompt, executable=self.executable, model=self.model, cwd=self.sandbox_dir,
                               schema=schema, timeout_seconds=self.timeout_seconds)
        meta: dict[str, Any] = {"calls": 1, **result.usage, "seconds": round(result.duration_seconds, 2)}
        if not result.ok:
            logger.warning("[knowledge] agy 보강 실패: %s", result.error[:300])
            return None, meta
        data = result.response if isinstance(result.response, (dict, list)) else parse_json_text(result.text)
        return data, meta
