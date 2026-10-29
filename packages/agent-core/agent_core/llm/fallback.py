"""첫 실행 실패 시에만, 안전하게 설정된 보조 경로로 한 번 재시도하는 대칭형 라우팅 하네스."""
from __future__ import annotations

import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Union

from ..runtime.progress import report_progress

from .adapters.agy_cli import AgyCliHarness
from .adapters.gemini import GoogleGenAiHarness
from .availability import CliQuotaAvailability
from .base import BaseLlmHarness, LlmExecutionResult
from .ports import CredentialStore
from .provider_state import ProviderStateStore, remaining_text
from .registry import DEFAULT_CLI_MODEL_NAME

PRIMARY_PROVIDER_ID = "agy-cli"

_ELIGIBLE_FAILURE_MARKERS = ("quota", "rate limit", "auth", "unauthorized", "unavailable", "timeout")

# 곧바로 다시 부르면 안 되는 실패와, 그때 건너뛸 기간.
_BLOCKING_FAILURE_CODES: dict[str, timedelta | None] = {
    "QUOTA_EXHAUSTED": None,  # 응답에 적힌 회복 시각을 그대로 쓴다
    "AUTH_EXPIRED": None,
    "PROVIDER_TIMEOUT": timedelta(minutes=5),
}


def failure_code(result: LlmExecutionResult) -> str:
    message = (result.error or "").lower()
    if "quota" in message or "rate limit" in message:
        return "QUOTA_EXHAUSTED"
    if "auth" in message or "unauthorized" in message or "api key" in message:
        return "AUTH_EXPIRED"
    if result.status == "TIMEOUT" or ("timeout" in message and "usage of agy" not in message and "flags provided" not in message):
        return "PROVIDER_TIMEOUT"
    return "PROVIDER_UNAVAILABLE"


def _invoke_harness(
    harness: BaseLlmHarness, prompt: str, *, model: Optional[str] = None, **call: Any
) -> LlmExecutionResult:
    """하네스가 file_path 등 신규 인자를 지원하지 않는 구형 어댑터인 경우 유연하게 제외 후 호출한다."""
    try:
        return harness.run_structured(prompt, model=model, **call)
    except TypeError as exc:
        if "file_path" in str(exc) or "unexpected keyword" in str(exc):
            safe_call = {
                k: v
                for k, v in call.items()
                if k in ("schema_path", "json_schema", "effort", "conversation_id", "timeout")
            }
            return harness.run_structured(prompt, model=model, **safe_call)
        raise


class FallbackLlmHarness(BaseLlmHarness):
    """첫 실행 실패 시에만, 안전하게 설정된 보조 경로로 한 번 재시도하는 대칭형 라우팅 하네스."""

    name = "adaptive-routing-fallback"

    def __init__(
        self,
        primary: BaseLlmHarness,
        credentials: CredentialStore,
        google_model: str,
        google_timeout_seconds: int,
        provider_state: Optional[ProviderStateStore] = None,
        cli_availability: Optional[CliQuotaAvailability] = None,
        *,
        primary_provider: str = "agy-cli",
        fallback_provider: str = "google-api",
        cli_model: Optional[str] = None,
        cli_timeout_seconds: Optional[int] = None,
        cli_executable: Optional[str] = None,
    ) -> None:
        super().__init__(model=primary.model, timeout_seconds=primary.timeout_seconds)
        self._primary = primary
        self._credentials = credentials
        self._google_model = google_model
        self._google_timeout_seconds = google_timeout_seconds
        self._state = provider_state
        self._cli_availability = cli_availability
        self._primary_provider = primary_provider
        self._fallback_provider = fallback_provider
        self._cli_model = cli_model or primary.model or DEFAULT_CLI_MODEL_NAME
        self._cli_timeout_seconds = cli_timeout_seconds or primary.timeout_seconds
        self._cli_executable = cli_executable or "agy"

    @property
    def primary_provider(self) -> str:
        return self._primary_provider

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
        call = dict(
            schema_path=schema_path,
            json_schema=json_schema,
            effort=effort,
            conversation_id=conversation_id,
            timeout=timeout,
            file_path=file_path,
            **kwargs,
        )

        report_progress({"execution": {"phase": "routing", "provider": None, "model": None}})

        is_google_primary = self._primary_provider in ("google_api", "google-api")
        if is_google_primary:
            res = self._run_google_primary(prompt, model=model, **call)
        else:
            res = self._run_cli_primary(prompt, model=model, **call)
        self.last_result = res
        return res

    def _run_cli_primary(self, prompt: str, *, model: Optional[str] = None, **call: Any) -> LlmExecutionResult:
        # 1. 이미 못 쓰는 것으로 확인된 공급자는 부르지 않는다.
        blocked_until = self._state.blocked_until(PRIMARY_PROVIDER_ID) if self._state else None
        if blocked_until is not None:
            code = self._state.block_reason(PRIMARY_PROVIDER_ID) or "PROVIDER_UNAVAILABLE"
            return self._fallback_or_report(
                prompt,
                code,
                blocked_until,
                model=model,
                route_reason="cli_blocked",
                **call,
            )

        # 2. 실행 직전 quota가 0이면 실패할 CLI 프로세스를 띄우지 않는다.
        availability = (
            self._cli_availability.check(model or self._primary.model)
            if self._cli_availability
            else None
        )
        if availability and availability.exhausted:
            return self._fallback_or_report(
                prompt,
                "QUOTA_EXHAUSTED",
                None,
                model=model,
                route_reason="cli_quota_exhausted",
                skipped_primary=True,
                **call,
            )

        # 3. quota가 남았거나 확인할 수 없으면 CLI를 먼저 쓴다.
        report_progress(
            {
                "execution": {
                    "phase": "running",
                    "provider": PRIMARY_PROVIDER_ID,
                    "model": model or self._primary.model,
                    "routeReason": (
                        "cli_available"
                        if availability and availability.state == "available"
                        else "cli_quota_unknown"
                    ),
                }
            }
        )
        primary = _invoke_harness(self._primary, prompt, model=model, **call)
        if self._cli_availability:
            self._cli_availability.invalidate()
        primary.telemetry_metadata.setdefault("provider", "agy_cli")
        if primary.ok:
            primary.telemetry_metadata.setdefault("fallback_used", False)
            if self._state:
                self._state.record_success(PRIMARY_PROVIDER_ID)
            return primary

        code = failure_code(primary)

        # 4. 한동안 회복되지 않을 실패는 기억해 둔다.
        blocked_until = None
        if self._state and code in _BLOCKING_FAILURE_CODES:
            blocked_until = self._state.record_failure(
                PRIMARY_PROVIDER_ID,
                code=code,
                message=primary.error,
                duration=_BLOCKING_FAILURE_CODES[code],
            )

        if not any(marker in (primary.error or "").lower() for marker in _ELIGIBLE_FAILURE_MARKERS):
            primary.telemetry_metadata["failure_code"] = code
            return primary

        return self._fallback_or_report(
            prompt,
            code,
            blocked_until,
            model=model,
            primary_result=primary,
            route_reason="cli_failed",
            **call,
        )

    def _run_google_primary(self, prompt: str, *, model: Optional[str] = None, **call: Any) -> LlmExecutionResult:
        target_model = model or self._google_model
        api_key = self._credentials.get_google_api_key()

        blocked_until = self._state.blocked_until("google-api") if self._state else None
        if not api_key:
            return self._fallback_to_cli_or_report(
                prompt,
                "AUTH_EXPIRED",
                blocked_until=None,
                model=model,
                route_reason="google_api_key_missing",
                skipped_primary=True,
                **call,
            )
        if blocked_until is not None:
            code = self._state.block_reason("google-api") if self._state else "PROVIDER_UNAVAILABLE"
            return self._fallback_to_cli_or_report(
                prompt,
                code,
                blocked_until=blocked_until,
                model=model,
                route_reason="google_api_blocked",
                skipped_primary=True,
                **call,
            )

        report_progress(
            {
                "execution": {
                    "phase": "running",
                    "provider": "google-api",
                    "model": target_model,
                    "routeReason": "google_api_primary",
                }
            }
        )
        primary = _invoke_harness(self._primary, prompt, model=target_model, **call)
        primary.telemetry_metadata.setdefault("provider", "google_api")
        if primary.ok:
            primary.telemetry_metadata.setdefault("fallback_used", False)
            if self._state:
                self._state.record_success("google-api")
            return primary

        code = failure_code(primary)
        if self._state and code in _BLOCKING_FAILURE_CODES:
            blocked_until = self._state.record_failure(
                "google-api",
                code=code,
                message=primary.error,
                duration=_BLOCKING_FAILURE_CODES[code],
            )

        return self._fallback_to_cli_or_report(
            prompt,
            code,
            blocked_until=blocked_until,
            model=model,
            primary_result=primary,
            route_reason="google_api_failed",
            **call,
        )

    def _fallback_to_cli_or_report(
        self,
        prompt: str,
        primary_code: str,
        blocked_until: Optional[datetime],
        *,
        model: Optional[str] = None,
        primary_result: Optional[LlmExecutionResult] = None,
        route_reason: str = "google_api_failed",
        skipped_primary: bool = False,
        **call: Any,
    ) -> LlmExecutionResult:
        """Google API 실패 시 CLI 보조 경로로 시도한다."""
        cli_bin = self._cli_executable
        cli_available = bool(shutil.which(cli_bin))
        if self._state and self._state.blocked_until(PRIMARY_PROVIDER_ID):
            cli_available = False

        if cli_available:
            cli_model = self._cli_model
            report_progress(
                {
                    "execution": {
                        "phase": "switched" if not skipped_primary else "running",
                        "provider": PRIMARY_PROVIDER_ID,
                        "model": cli_model,
                        "routeReason": route_reason,
                        "fallbackFrom": None if skipped_primary else "google-api",
                    }
                }
            )
            cli = AgyCliHarness(
                model=cli_model,
                timeout_seconds=self._cli_timeout_seconds,
                cli_executable=cli_bin,
            )
            result = _invoke_harness(cli, prompt, model=cli_model, **call)
            result.telemetry_metadata.update(
                {
                    "provider": "agy_cli",
                    "fallback_used": True,
                    "primary_provider": "google_api",
                    "primary_failure_code": primary_code,
                    "route_reason": route_reason,
                    "skipped_primary": skipped_primary,
                }
            )
            return result

        report_progress(
            {
                "execution": {
                    "phase": "running",
                    "provider": None,
                    "model": None,
                    "routeReason": route_reason,
                }
            }
        )
        res = primary_result or LlmExecutionResult(
            status="ERROR",
            model=model or self._google_model,
            error=f"{primary_code}: Google API 및 CLI 보조 경로를 사용할 수 없습니다.",
            telemetry_metadata={"provider": "google_api", "skipped_primary": True},
        )
        res.telemetry_metadata.update({
            "failure_code": "PRIMARY_AND_FALLBACK_UNAVAILABLE",
            "primary_failure_code": primary_code,
            "route_reason": route_reason,
            "skipped_primary": skipped_primary,
        })
        return res

    # --- 내부 ---------------------------------------------------------

    def _fallback_or_report(
        self,
        prompt: str,
        primary_code: str,
        blocked_until: Optional[datetime],
        *,
        model: Optional[str] = None,
        primary_result: Optional[LlmExecutionResult] = None,
        route_reason: str = "cli_failed",
        skipped_primary: bool = False,
        **call: Any,
    ) -> LlmExecutionResult:
        """보조 공급자가 설정돼 있으면 그쪽으로, 아니면 설정이 필요하다고 알린다."""
        api_key = self._credentials.get_google_api_key()

        if api_key:
            report_progress(
                {
                    "execution": {
                        "phase": "switched" if not skipped_primary else "running",
                        "provider": "google-api",
                        "model": self._google_model,
                        "routeReason": route_reason,
                        "fallbackFrom": None if skipped_primary else PRIMARY_PROVIDER_ID,
                    }
                }
            )
            call.pop("model", None)
            fallback = GoogleGenAiHarness(
                model=self._google_model,
                api_key=api_key,
                timeout_seconds=self._google_timeout_seconds,
            )
            result = _invoke_harness(fallback, prompt, model=None, **call)
            result.telemetry_metadata.update(
                {
                    "provider": "google_api",
                    "fallback_used": True,
                    "primary_provider": "agy_cli",
                    "primary_failure_code": primary_code,
                    "route_reason": route_reason,
                    "skipped_primary": skipped_primary,
                }
            )
            if not result.ok:
                result.telemetry_metadata.setdefault("failure_code", failure_code(result))
            return result

        # 보조 경로가 없다 — 설정이 필요하다는 것을 그대로 드러낸다.
        report_progress(
            {
                "execution": {
                    "phase": "running",
                    "provider": None,
                    "model": None,
                    "routeReason": route_reason,
                }
            }
        )
        result = primary_result or self._blocked_result(primary_code, blocked_until)
        metadata = {
            "failure_code": "FALLBACK_NOT_CONFIGURED",
            "primary_failure_code": primary_code,
            "requires_action": "configure_google_api",
            "retryable": False,
            "route_reason": route_reason,
            "skipped_primary": skipped_primary,
        }
        if blocked_until is not None:
            metadata["primary_blocked_until"] = blocked_until.isoformat()
            metadata["primary_recovers_in"] = remaining_text(blocked_until)
        result.telemetry_metadata.update(metadata)
        return result

    def _blocked_result(
        self, primary_code: str, blocked_until: Optional[datetime]
    ) -> LlmExecutionResult:
        """CLI 를 부르지 않고 즉시 실패로 돌려줄 결과를 만든다."""
        when = f" ({remaining_text(blocked_until)} 복구)" if blocked_until else ""
        return LlmExecutionResult(
            status="ERROR",
            model=self.model,
            error=f"{primary_code}: 기본 AI 공급자를 지금 사용할 수 없습니다{when}.",
            telemetry_metadata={"provider": "agy_cli", "skipped_primary": True},
        )
