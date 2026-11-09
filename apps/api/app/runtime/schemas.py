"""runtime 도메인 HTTP 요청 · 응답 스키마."""
from __future__ import annotations

from pydantic import BaseModel

from app.core.llm.execution_policy import RuntimePolicyView

from .models import ModelOption


class RuntimePolicyUpdateRequest(BaseModel):
    primaryProvider: str | None = None
    fallbackProvider: str | None = None
    primaryModel: str | None = None
    fallbackModel: str | None = None
    primaryTimeoutSeconds: int | None = None
    fallbackTimeoutSeconds: int | None = None


class RuntimePolicyResponse(BaseModel):
    primaryProvider: str
    fallbackProvider: str
    primaryModel: str
    fallbackModel: str
    primaryTimeoutSeconds: int
    fallbackTimeoutSeconds: int
    agentCliBin: str

    @classmethod
    def from_view(cls, view: RuntimePolicyView) -> RuntimePolicyResponse:
        return cls(
            primaryProvider=view.primary_provider,
            fallbackProvider=view.fallback_provider,
            primaryModel=view.primary_model,
            fallbackModel=view.fallback_model,
            primaryTimeoutSeconds=view.primary_timeout_seconds,
            fallbackTimeoutSeconds=view.fallback_timeout_seconds,
            agentCliBin=view.agent_cli_bin,
        )


class ModelOptionResponse(BaseModel):
    id: str
    name: str
    provider: str
    description: str
    recommended: bool = False

    @classmethod
    def from_option(cls, option: ModelOption) -> ModelOptionResponse:
        return cls(
            id=option.model_id,
            name=option.model_id,
            provider=option.provider,
            description=option.description,
            recommended=option.recommended,
        )


class RuntimeDashboardResponse(BaseModel):
    policy: RuntimePolicyResponse
    googleConfigured: bool
    cliAvailable: bool
    models: list[ModelOptionResponse]


class GoogleApiKeyRequest(BaseModel):
    api_key: str


class ProviderKeyStatusResponse(BaseModel):
    status: str = "ok"
    configured: bool
