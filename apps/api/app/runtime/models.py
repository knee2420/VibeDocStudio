"""runtime 도메인 모델."""
from __future__ import annotations

from dataclasses import dataclass

from app.core.llm.execution_policy import RuntimePolicyView


@dataclass(frozen=True)
class ModelOption:
    """설정 화면에 노출하는 공급자별 모델 선택지."""

    model_id: str
    provider: str
    description: str
    recommended: bool = False


@dataclass(frozen=True)
class RuntimeDashboard:
    policy: RuntimePolicyView
    google_configured: bool
    cli_available: bool
    models: tuple[ModelOption, ...]
