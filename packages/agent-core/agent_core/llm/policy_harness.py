"""호출할 때마다 현재 런타임 정책을 다시 읽는 하네스.

컨테이너는 하네스 하나를 만들어 모든 에이전트·유스케이스에 나눠 줍니다.
이 하네스는 아무것도 굳히지 않고, 호출마다 `resolve()` 로 지금 정책의 구체 하네스를 받아 위임합니다.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Dict, Optional, Union

from .base import BaseLlmHarness, LlmExecutionResult


class RuntimePolicyHarness(BaseLlmHarness):
    """주입은 한 번, 모델·타임아웃 선택은 매 호출."""

    name = "runtime-policy"

    def __init__(self, resolve: Callable[[], BaseLlmHarness]) -> None:
        self._resolve = resolve

    @property
    def model(self) -> str:
        return self._resolve().model

    @property
    def timeout_seconds(self) -> int:
        return self._resolve().timeout_seconds

    @property
    def provider(self) -> str:
        resolved = self._resolve()
        return getattr(
            resolved,
            "provider",
            getattr(
                resolved,
                "_primary_provider",
                getattr(resolved, "name", "google_api"),
            ),
        )

    @property
    def _primary_provider(self) -> str:
        return self.provider

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
        return self._resolve().run_structured(
            prompt,
            schema_path=schema_path,
            json_schema=json_schema,
            model=model,
            effort=effort,
            conversation_id=conversation_id,
            timeout=timeout,
            file_path=file_path,
            **kwargs,
        )
