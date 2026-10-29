"""Base LLM Harness & Execution Result (SSOT 계약).

모든 모델 하네스(CLI, REST, 로컬 서빙, SDK 직결)가 준수하는 단일 규격입니다.
호스트 앱 및 도메인 엔진은 이 계약을 재정의하지 않고 그대로 참조합니다.

설계 원칙:
- `run_structured` 의 `prompt` 이후 인자는 전부 키워드 전용(keyword-only)입니다.
- `run_text` / `run_json` 은 구상 메서드로서 `run_structured` 를 호출하므로, 어댑터는 `run_structured` 하나만 구현하면 됩니다.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Union

from .parsing import parse_json_payload
from .registry import DEFAULT_MODEL_NAME

logger = logging.getLogger(__name__)

# 실행 상태 값
STATUS_SUCCESS = "SUCCESS"
STATUS_ERROR = "ERROR"
STATUS_FAILED = "FAILED"
STATUS_TIMEOUT = "TIMEOUT"
STATUS_PARSE_ERROR = "PARSE_ERROR"


@dataclass
class LlmExecutionResult:
    """하네스 실행 결과 표준 엔벨로프 및 세션 텔레메트리."""

    status: str = STATUS_SUCCESS
    model: str = ""
    structured_output: Optional[Dict[str, Any]] = None
    raw_response: str = ""
    conversation_id: Optional[str] = None
    duration_seconds: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cache_read_tokens: int = 0
    total_tokens: int = 0
    error: Optional[str] = None
    telemetry_metadata: Dict[str, Any] = field(default_factory=dict)
    attempts: list[Any] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status == STATUS_SUCCESS


CLIExecutionResult = LlmExecutionResult


class BaseLlmHarness(ABC):
    """모든 LLM 공급자 어댑터의 기저 추상 클래스."""

    name = "base"

    def __init__(
        self,
        model: str = DEFAULT_MODEL_NAME,
        timeout_seconds: int = 180,
    ) -> None:
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.last_result: Optional[LlmExecutionResult] = None

    @property
    def primary_provider(self) -> str:
        return self.name

    @abstractmethod
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
        """JSON Schema 를 걸어 정형 데이터를 1-Stage 로 회수한다. 어댑터의 유일한 필수 구현."""
        raise NotImplementedError

    def run_text(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        conversation_id: Optional[str] = None,
        timeout: Optional[int] = None,
        file_path: Optional[Union[str, Path]] = None,
        **kwargs: Any,
    ) -> str:
        """비정형 텍스트를 회수한다. 실패 시 예외."""
        res = self.run_structured(
            prompt,
            model=model,
            effort=effort,
            conversation_id=conversation_id,
            timeout=timeout,
            file_path=file_path,
            **kwargs,
        )
        self.last_result = res
        if not res.ok:
            raise RuntimeError(f"[{self.name}] LLM run_text 실패 ({res.status}): {res.error}")
        return res.raw_response

    def run_json(
        self,
        prompt: str,
        *,
        schema_path: Optional[Union[str, Path]] = None,
        json_schema: Optional[Dict[str, Any]] = None,
        schema: Optional[Dict[str, Any]] = None,
        list_key: str = "blocks",
        model: Optional[str] = None,
        effort: Optional[str] = None,
        conversation_id: Optional[str] = None,
        timeout: Optional[int] = None,
        file_path: Optional[Union[str, Path]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """JSON 객체를 회수한다. structured_output 우선, 실패 시 raw_response 관대 파싱."""
        target_schema = json_schema or schema
        res = self.run_structured(
            prompt,
            schema_path=schema_path,
            json_schema=target_schema,
            model=model,
            effort=effort,
            conversation_id=conversation_id,
            timeout=timeout,
            file_path=file_path,
            **kwargs,
        )
        self.last_result = res
        if not res.ok:
            raise RuntimeError(f"[{self.name}] LLM run_json 실패 ({res.status}): {res.error}")

        if res.structured_output is not None:
            return res.structured_output

        parsed = parse_json_payload(res.raw_response, list_key=list_key)
        if parsed is None:
            raise ValueError(
                f"[{self.name}] LLM 응답에서 유효한 JSON을 파싱할 수 없습니다. "
                f"(raw_len={len(res.raw_response)})"
            )
        return parsed
