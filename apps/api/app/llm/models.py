"""LLM 게이트웨이 모델 — 엔진 선택 · 설정 화면 선택지 · 실행 정책 대시보드."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from .policy import RuntimePolicyView

#: 대화 실행 차선 — Composer(여러 턴 대화) · 인라인(한 턴 단발)
Lane = Literal["composer", "inline"]


@dataclass(frozen=True)
class EngineChoice:
    """이번 실행에 쓸 엔진 (`agy_cli` | `google_api` | `offline`) 과 모델."""

    provider: str
    model: str
    effort: Optional[str] = None


@dataclass
class OneShotResult:
    """단발 실행 한 번의 결과 (agy `--output-format json` 엔벨로프를 정규화한 것)."""

    ok: bool
    response: Any = None
    text: str = ""
    error: str = ""
    duration_seconds: float = 0.0
    num_turns: int = 0
    usage: dict[str, int] = field(default_factory=dict)
    conversation_id: str = ""


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
