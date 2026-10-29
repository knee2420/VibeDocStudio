"""LLM Driver 표준 추상 포트(Protocol) 정의."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional, Protocol, Union

from .base import LlmExecutionResult


class ModelExecutor(Protocol):
    """엔진 및 도메인이 모델 호출에 요구하는 최소 프로토콜."""

    model: str

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
    ) -> LlmExecutionResult: ...


class CredentialStore(Protocol):
    """공급자 인증 정보 조회 포트."""

    def get_google_api_key(self) -> str | None: ...
    def set_google_api_key(self, api_key: str) -> None: ...
    def delete_google_api_key(self) -> None: ...


class CliUsageReader(Protocol):
    """CLI Quota 사용량 조회 포트."""

    def read(self) -> dict[str, Any]: ...
