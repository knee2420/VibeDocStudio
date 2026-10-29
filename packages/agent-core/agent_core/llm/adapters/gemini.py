"""`BaseLlmHarness` 구현체 — Google Gemini Direct API (Official REST Adapter).

호스트 비의존 순수 엔진 하네스입니다.
CLI 프로세스를 거치지 않고 Google Generative Language REST API를 직접 호출하여 고속 구조화 출력을 수행합니다.
PDF 및 이미지 등 첨부 파일이 주어지면 멀티모달 inlineData(Base64) 파트로 자동 첨부합니다.

API 키 우선순위:
1. 생성자에 명시적으로 전달된 `api_key`
2. 환경 변수 `GOOGLE_API_KEY` 또는 `GEMINI_API_KEY`
"""
from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import requests

from ..base import (
    STATUS_ERROR,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    BaseLlmHarness,
    LlmExecutionResult,
)
from ..registry import DEFAULT_GOOGLE_MODEL_NAME

logger = logging.getLogger(__name__)

# Gemini structured output가 지원하지 않는 JSON Schema 주석/제약 필터
_UNSUPPORTED_SCHEMA_KEYS = {
    "$schema",
    "const",
    "default",
    "deprecated",
    "examples",
    "maxLength",
    "minLength",
    "pattern",
    "readOnly",
    "writeOnly",
}


def _gemini_schema(value: Any) -> Any:
    """Gemini API에 전송하기 위해 비지원 스키마 키를 재귀적으로 제거합니다."""
    if isinstance(value, list):
        return [_gemini_schema(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: _gemini_schema(item)
        for key, item in value.items()
        if key not in _UNSUPPORTED_SCHEMA_KEYS
    }


def _extract_attachment_part(
    file_path: Optional[Union[str, Path]], prompt: str
) -> Optional[Dict[str, Any]]:
    """명시적 file_path 또는 프롬프트 본문에서 파일 경로를 감지하여 inlineData 파트를 생성합니다."""
    target_path: Optional[Path] = None
    if file_path is not None:
        p = Path(file_path).resolve()
        if p.exists() and p.is_file():
            target_path = p

    if target_path is None:
        match = re.search(r"-\s*(?:원본|대상)\s*파일\s*경로:\s*([^\r\n]+)", prompt)
        if match:
            extracted = match.group(1).strip().strip("'\"")
            p = Path(extracted).resolve()
            if p.exists() and p.is_file():
                target_path = p

    if target_path is None:
        return None

    suffix = target_path.suffix.lower()
    mime_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    mime_type = mime_map.get(suffix) or mimetypes.guess_type(target_path.name)[0]
    if not mime_type:
        return None

    try:
        file_size = target_path.stat().st_size
        if file_size > 30 * 1024 * 1024:
            logger.warning(
                "[GoogleGenAiHarness] 첨부 파일 크기가 너무 커서 인라인 첨부를 건너뜁니다: %s (%d bytes)",
                target_path.name,
                file_size,
            )
            return None

        file_bytes = target_path.read_bytes()
        b64_data = base64.b64encode(file_bytes).decode("utf-8")
        logger.info(
            "[GoogleGenAiHarness] 문서 멀티모달 inlineData 첨부 완료: %s (MIME: %s, size: %d bytes)",
            target_path.name,
            mime_type,
            file_size,
        )
        return {
            "inlineData": {
                "mimeType": mime_type,
                "data": b64_data,
            }
        }
    except Exception as exc:
        logger.warning(
            "[GoogleGenAiHarness] 첨부 파일 inlineData 변환 실패 (%s): %s",
            target_path,
            exc,
        )
        return None


class GoogleGenAiHarness(BaseLlmHarness):
    """Google Gemini Direct API 정규 하네스 (Official REST Adapter).

    표준 `requests` 기반으로 호스트 비의존적이며 가볍습니다.
    PDF 및 이미지 등 첨부 파일이 주어지면 inlineData 멀티모달 파트로 자동 첨부합니다.
    """

    name = "google_api"

    def __init__(
        self,
        model: str = DEFAULT_GOOGLE_MODEL_NAME,
        api_key: Optional[str] = None,
        timeout_seconds: int = 180,
    ) -> None:
        super().__init__(model=model, timeout_seconds=timeout_seconds)
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

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
        if not self.api_key:
            return LlmExecutionResult(
                status=STATUS_ERROR,
                model=target_model,
                error="Google API key is not configured.",
                telemetry_metadata={"provider": "google_api", "failure_code": "FALLBACK_NOT_CONFIGURED"},
            )

        resolved_schema = json_schema or kwargs.get("schema")
        if resolved_schema is None and schema_path is not None:
            try:
                resolved_schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError) as exc:
                return LlmExecutionResult(
                    status=STATUS_ERROR,
                    model=target_model,
                    error=f"Google API output schema could not be loaded: {exc}",
                    telemetry_metadata={
                        "provider": "google_api",
                        "failure_code": "OUTPUT_SCHEMA_INVALID",
                    },
                )

        generation_config: Dict[str, Any] = {"responseMimeType": "application/json"}
        if resolved_schema:
            generation_config["responseJsonSchema"] = _gemini_schema(resolved_schema)

        # 멀티모달 parts 구성
        parts: List[Dict[str, Any]] = []
        attachment_part = _extract_attachment_part(file_path, prompt)
        if attachment_part:
            parts.append(attachment_part)
        parts.append({"text": prompt})

        request_body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": generation_config,
        }

        # CLI 전용 접미사(-low, -medium, -high) 정제
        clean_model = re.sub(r"-(low|medium|high)$", "", target_model)

        started = time.monotonic()
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent",
                params={"key": self.api_key},
                json=request_body,
                timeout=timeout or self.timeout_seconds,
            )
        except requests.Timeout:
            return LlmExecutionResult(
                status=STATUS_TIMEOUT,
                model=target_model,
                error="Google API request timed out.",
                telemetry_metadata={"provider": "google_api", "failure_code": "PROVIDER_TIMEOUT"},
            )
        except requests.RequestException as exc:
            return LlmExecutionResult(
                status=STATUS_ERROR,
                model=target_model,
                error=f"Google API network error: {exc}",
                telemetry_metadata={"provider": "google_api", "failure_code": "PROVIDER_UNAVAILABLE"},
            )

        duration = round(time.monotonic() - started, 3)
        if not response.ok:
            try:
                message = response.json().get("error", {}).get("message", response.text)
            except ValueError:
                message = response.text
            status_code = getattr(response, "status_code", "unknown")
            return LlmExecutionResult(
                status=STATUS_ERROR,
                model=target_model,
                duration_seconds=duration,
                error=f"Google API error ({status_code}): {message}",
                telemetry_metadata={"provider": "google_api", "http_status": status_code},
            )

        payload = response.json()
        candidates = payload.get("candidates") or []
        parts_out = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
        text = "".join(str(part.get("text", "")) for part in parts_out)
        try:
            structured_output = json.loads(text) if resolved_schema and text else None
        except json.JSONDecodeError:
            structured_output = None
        usage = payload.get("usageMetadata") or {}
        return LlmExecutionResult(
            status=STATUS_SUCCESS,
            model=target_model,
            structured_output=structured_output,
            raw_response=text,
            duration_seconds=duration,
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0),
            telemetry_metadata={
                "provider": "google_api",
                "fallback_used": False,
                "api_endpoint": f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent",
                "raw_command": (
                    f'curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key=$GOOGLE_API_KEY" \\\n'
                    f'  -H "Content-Type: application/json" \\\n'
                    f'  -d \'{{"generationConfig": {json.dumps(generation_config)}, "contents": [{{"role": "user", "parts": [...]}}]}}\''
                ),
            },
        )
