"""백엔드 공통 LLM 진입점 (core/llm).

계약의 정본은 모노레포 패키지인 `agent_core.llm`(`packages/agent-core`)입니다.
이 패키지는 `agent_core.llm`의 핵심 계약을 재수출하며, 호스트 고유의 것(DI 조립, 공급자 상태)을 얹습니다.

관측 자료의 저장은 여기가 아니라 `app.core.observation` 이 맡습니다.
"""
from agent_core.llm import (
    DEFAULT_MODEL_NAME,
    MODEL_REGISTRY,
    PRIMARY_PROVIDER_ID,
    BaseLlmHarness,
    CliQuotaAvailability,
    FallbackLlmHarness,
    HarnessFactory,
    LlmExecutionResult,
    ModelSpec,
    ProviderStateStore,
    RuntimePolicyHarness,
    UnsupportedProviderError,
    get_model_spec,
    parse_json_payload,
    register_model_spec,
    resolve_effort,
)

from app.core.llm.agy_status_snapshot import AgyStatusSnapshot
from app.core.llm.execution_policy import (
    CLI_PROVIDER,
    GOOGLE_PROVIDER,
    RuntimeExecutionPolicy,
    normalize_provider,
)
from app.core.llm.manager import LlmManager
from app.core.llm.ports import ModelExecutor

__all__ = [
    # 엔진 계약 재수출
    "BaseLlmHarness",
    "LlmExecutionResult",
    "ModelSpec",
    "MODEL_REGISTRY",
    "DEFAULT_MODEL_NAME",
    "PRIMARY_PROVIDER_ID",
    "FallbackLlmHarness",
    "CliQuotaAvailability",
    "ProviderStateStore",
    "HarnessFactory",
    "UnsupportedProviderError",
    "get_model_spec",
    "register_model_spec",
    "resolve_effort",
    "parse_json_payload",
    # 호스트 고유
    "LlmManager",
    "RuntimePolicyHarness",
    "AgyStatusSnapshot",
    "RuntimeExecutionPolicy",
    "normalize_provider",
    "GOOGLE_PROVIDER",
    "CLI_PROVIDER",
    # 계약
    "ModelExecutor",
]
