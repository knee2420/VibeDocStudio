"""LLM 중앙 관리자 (Dify ModelManager 패턴).

모든 도메인 서비스의 단일 진입점이다. 하는 일은 세 가지뿐이다.

1. 호스트 전용 어댑터를 `HarnessFactory` 에 등록한다 (프로바이더 확장).
2. 주입받은 실행 정책(`RuntimeExecutionPolicy`)을 어댑터 생성에 넘긴다.
3. 모델명만 받아 적합한 하네스를 돌려준다.

프롬프트 내용이나 도메인 규칙은 이 계층이 알지 못하며, 알아서도 안 된다.

인스턴스는 `bootstrap/container.py` 가 하나만 조립한다. 모듈 전역 인스턴스를 두지 않는다.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from llm_driver import (
    AgyCliHarness,
    BaseLlmHarness,
    CliQuotaAvailability,
    FallbackLlmHarness,
    GoogleGenAiHarness,
    HarnessFactory,
    LlmExecutionResult,
    LocalGemmaHarness,
    ModelSpec,
    ProviderStateStore,
    get_model_spec,
)

from app.core.llm.credentials import CredentialStore
from app.core.llm.execution_policy import RuntimeExecutionPolicy

logger = logging.getLogger(__name__)


class LlmManager:
    """백엔드 중앙 LLM 진입점."""

    def __init__(
        self,
        credentials: CredentialStore,
        provider_state: ProviderStateStore,
        cli_availability: CliQuotaAvailability,
        policy: RuntimeExecutionPolicy,
    ) -> None:
        # 자격 증명과 차단 상태는 설정 화면(LlmSettingsService)과 같은 인스턴스여야 한다.
        # ProviderStateStore 는 파일 내용을 메모리에 캐시하므로, 따로 만들면 두 캐시가
        # 갈라져 한쪽의 차단 기록을 다른 쪽이 보지 못하고 서로의 쓰기를 덮어쓴다.
        self._policy = policy
        self._executable: str = policy.agent_cli_bin
        self._credentials = credentials
        self._provider_state = provider_state
        self._cli_availability = cli_availability
        self._register_providers()

    # --- 프로바이더 등록 -------------------------------------------------

    def _register_providers(self) -> None:
        """엔진 팩토리에 호스트 어댑터를 얹는다.

        `agy_cli` 는 엔진에도 기본 빌더가 있지만, 실행 파일 경로(`policy.agent_cli_bin`)를
        아는 것은 호스트뿐이므로 여기서 덮어쓴다.
        """
        HarnessFactory.register("agy_cli", self._build_agy_cli)
        HarnessFactory.register("local_serving", self._build_local_gemma)
        HarnessFactory.register("google_api", self._build_google_genai)

    def _build_agy_cli(
        self, spec: ModelSpec, effort: Optional[str], timeout_seconds: int
    ) -> BaseLlmHarness:
        return AgyCliHarness(
            model=spec.name,
            effort=effort,
            timeout_seconds=timeout_seconds,
            executable=self._executable,
        )

    def _build_local_gemma(
        self, spec: ModelSpec, effort: Optional[str], timeout_seconds: int
    ) -> BaseLlmHarness:
        return LocalGemmaHarness(model=spec.name, timeout_seconds=timeout_seconds)

    def _build_google_genai(
        self, spec: ModelSpec, effort: Optional[str], timeout_seconds: int
    ) -> BaseLlmHarness:
        return GoogleGenAiHarness(model=spec.name, api_key=self._credentials.get_google_api_key(), timeout_seconds=timeout_seconds)

    # --- 공개 API --------------------------------------------------------

    def get_harness(
        self,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        timeout: Optional[int] = None,
        executable: Optional[str] = None,
    ) -> BaseLlmHarness:
        """모델 프로필에 맞는 하네스를 돌려준다."""
        # 인자를 비우면 호출 시점의 런타임 정책을 읽는다.
        # 돌려준 하네스는 그 시점의 정책으로 굳어 있으므로 오래 붙들고 쓰면 안 된다.
        # 장기 주입용은 매 호출마다 여기를 다시 부르는 `RuntimePolicyHarness` 다.
        default_model = self._policy.primary_model
        default_timeout = self._policy.primary_timeout_seconds

        target_model = model or default_model
        timeout_seconds = timeout or default_timeout

        # 호출부가 실행 파일을 직접 지정한 경우에만 팩토리를 우회한다.
        if executable:
            spec = get_model_spec(target_model)
            if spec.provider == "agy_cli":
                return AgyCliHarness(
                    model=spec.name,
                    effort=effort,
                    timeout_seconds=timeout_seconds,
                    executable=executable,
                )
            logger.warning(
                "[LlmManager] executable 지정은 agy_cli 프로바이더에만 적용됩니다 (model=%s, provider=%s)",
                target_model, spec.provider,
            )

        spec = get_model_spec(target_model)
        harness = HarnessFactory.create(
            model=target_model, effort=effort, timeout_seconds=timeout_seconds
        )
        primary_provider = spec.provider
        if primary_provider in ("agy_cli", "google_api"):
            fallback_provider = "google_api" if primary_provider == "agy_cli" else "agy_cli"
            return FallbackLlmHarness(
                primary=harness,
                credentials=self._credentials,
                google_model=self._policy.google_api_model,
                google_timeout_seconds=self._policy.google_api_timeout_seconds,
                provider_state=self._provider_state,
                cli_availability=self._cli_availability,
                primary_provider=primary_provider,
                fallback_provider=fallback_provider,
                cli_model=self._policy.agent_cli_model,
                cli_timeout_seconds=self._policy.agent_cli_timeout_seconds,
                cli_executable=self._executable,
            )
        return harness

    def run_structured(
        self,
        prompt: str,
        *,
        json_schema: Optional[Dict[str, Any]] = None,
        schema_path: Optional[Any] = None,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        conversation_id: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> LlmExecutionResult:
        """구조화 실행 단일 창구."""
        harness = self.get_harness(model=model, effort=effort, timeout=timeout)
        return harness.run_structured(
            prompt,
            json_schema=json_schema,
            schema_path=schema_path,
            conversation_id=conversation_id,
        )

    def run_text(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        conversation_id: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> LlmExecutionResult:
        """텍스트 실행 단일 창구."""
        harness = self.get_harness(model=model, effort=effort, timeout=timeout)
        return harness.run_text(prompt, conversation_id=conversation_id)
