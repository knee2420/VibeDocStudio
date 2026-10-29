"""LLM Driver — Host-independent Multi-Provider LLM Harness & Fallback Kernel."""
from __future__ import annotations

from .adapters.agy_cli import AgyCliHarness
from .adapters.gemini import GoogleGenAiHarness
from .adapters.gemma import LocalGemmaHarness
from .availability import CliAvailability, CliQuotaAvailability, CliUsageReader
from .base import (
    CLIExecutionResult,
    STATUS_ERROR,
    STATUS_FAILED,
    STATUS_PARSE_ERROR,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    BaseLlmHarness,
    LlmExecutionResult,
)
from .factory import HarnessBuilder, HarnessFactory, UnsupportedProviderError
from .fallback import (
    PRIMARY_PROVIDER_ID,
    FallbackLlmHarness,
    failure_code,
)
from .parsing import parse_json_payload, unknown_ids
from .policy_harness import RuntimePolicyHarness
from .ports import CredentialStore, ModelExecutor
from .provider_state import (
    ProviderStateStore,
    ProviderStatus,
    parse_reset_after,
    remaining_text,
)
from .registry import (
    DEFAULT_CLI_MODEL_NAME,
    DEFAULT_GOOGLE_MODEL_NAME,
    DEFAULT_MODEL_NAME,
    EFFORT_SUFFIXES,
    MODEL_REGISTRY,
    ModelSpec,
    get_model_spec,
    register_model_spec,
    resolve_effort,
)

__all__ = [
    # Base contracts
    "BaseLlmHarness",
    "LlmExecutionResult",
    "CLIExecutionResult",
    "STATUS_SUCCESS",
    "STATUS_ERROR",
    "STATUS_FAILED",
    "STATUS_TIMEOUT",
    "STATUS_PARSE_ERROR",
    # Registry & specs
    "ModelSpec",
    "MODEL_REGISTRY",
    "EFFORT_SUFFIXES",
    "DEFAULT_MODEL_NAME",
    "DEFAULT_GOOGLE_MODEL_NAME",
    "DEFAULT_CLI_MODEL_NAME",
    "get_model_spec",
    "register_model_spec",
    "resolve_effort",
    # Adapters
    "AgyCliHarness",
    "GoogleGenAiHarness",
    "LocalGemmaHarness",
    # Factory
    "HarnessFactory",
    "HarnessBuilder",
    "UnsupportedProviderError",
    # Availability & State
    "CliAvailability",
    "CliQuotaAvailability",
    "CliUsageReader",
    "ProviderStateStore",
    "ProviderStatus",
    "remaining_text",
    "parse_reset_after",
    # Fallback & Dynamic Policy
    "FallbackLlmHarness",
    "RuntimePolicyHarness",
    "failure_code",
    "PRIMARY_PROVIDER_ID",
    # Ports
    "ModelExecutor",
    "CredentialStore",
    # Utilities
    "parse_json_payload",
    "unknown_ids",
]
