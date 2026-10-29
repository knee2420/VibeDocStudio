"""Gemma4 31B 로컬 서빙(vLLM / Ollama 호환 REST) 어댑터 — 미연결 스켈레톤.

`run_structured` 하나만 채우면 동작합니다. `run_text` / `run_json` 은 `BaseLlmHarness` 가
이미 구현해두었으므로 어댑터에서 다시 쓰지 않습니다.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional, Union

from ..base import STATUS_FAILED, BaseLlmHarness, LlmExecutionResult

logger = logging.getLogger(__name__)


class LocalGemmaHarness(BaseLlmHarness):
    """로컬 vLLM/Ollama REST 인터페이스 스켈레톤."""

    name = "local-gemma"

    def __init__(
        self,
        model: str = "gemma4-31b",
        endpoint_url: str = "http://localhost:8000/v1",
        timeout_seconds: int = 180,
    ) -> None:
        super().__init__(model=model, timeout_seconds=timeout_seconds)
        self.endpoint_url = endpoint_url

    def run_structured(
        self,
        prompt: str,
        *,
        schema_path: Optional[Union[str, Path]] = None,
        json_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        conversation_id: Optional[str] = None,
        timeout: Optional[int] = None,
        file_path: Optional[Union[str, Path]] = None,
        **kwargs: Any,
    ) -> LlmExecutionResult:
        target_model = model or self.model
        logger.warning(
            "[LocalGemmaHarness] 미연결 스켈레톤 호출 (model=%s, endpoint=%s)",
            target_model, self.endpoint_url,
        )
        return LlmExecutionResult(
            status=STATUS_FAILED,
            model=target_model,
            error=(
                "LocalGemmaHarness is a skeleton adapter — "
                f"no serving backend attached at {self.endpoint_url}."
            ),
            telemetry_metadata={"provider": "local_serving", "attached": False},
        )
