"""Harness Factory (Provider Router).

모델명 → 프로필(`ModelSpec`) → 프로바이더 → 어댑터 인스턴스로 이어지는 단일 경로입니다.
호스트 앱이 자체 어댑터를 등록하고 싶을 때는 `HarnessFactory.register`를 통해 확장합니다.
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, Optional

from .adapters.agy_cli import DEFAULT_TIMEOUT_SECONDS, AgyCliHarness
from .adapters.gemini import GoogleGenAiHarness
from .adapters.gemma import LocalGemmaHarness
from .base import BaseLlmHarness
from .registry import DEFAULT_MODEL_NAME, ModelSpec, get_model_spec

logger = logging.getLogger(__name__)

HarnessBuilder = Callable[[ModelSpec, Optional[str], int], BaseLlmHarness]


class UnsupportedProviderError(RuntimeError):
    """등록된 어댑터가 없는 프로바이더를 요청했을 때."""


def _build_agy_cli(spec: ModelSpec, effort: Optional[str], timeout_seconds: int) -> BaseLlmHarness:
    return AgyCliHarness(model=spec.name, effort=effort, timeout_seconds=timeout_seconds)


def _build_google_api(spec: ModelSpec, effort: Optional[str], timeout_seconds: int) -> BaseLlmHarness:
    return GoogleGenAiHarness(model=spec.name, timeout_seconds=timeout_seconds)


def _build_local_gemma(spec: ModelSpec, effort: Optional[str], timeout_seconds: int) -> BaseLlmHarness:
    return LocalGemmaHarness(model=spec.name, timeout_seconds=timeout_seconds)


class HarnessFactory:
    """프로바이더별 어댑터 빌더 레지스트리."""

    _builders: Dict[str, HarnessBuilder] = {
        "agy_cli": _build_agy_cli,
        "google_api": _build_google_api,
        "local_serving": _build_local_gemma,
    }

    @classmethod
    def providers(cls) -> list[str]:
        """등록된 프로바이더 목록을 반환한다."""
        return list(cls._builders.keys())

    @classmethod
    def register(cls, provider: str, builder: HarnessBuilder) -> None:
        """프로바이더 어댑터를 등록/교체한다. 호스트 앱의 확장 지점."""
        cls._builders[provider] = builder

    @classmethod
    def create(
        cls,
        model_name: Optional[str] = None,
        *,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> BaseLlmHarness:
        """모델명 프로필에 등록된 기본 어댑터를 생성한다."""
        target = model or model_name or DEFAULT_MODEL_NAME
        spec = get_model_spec(target)
        builder = cls._builders.get(spec.provider)
        if builder is None:
            raise UnsupportedProviderError(
                f"No harness builder registered for provider '{spec.provider}' (model: {spec.name})"
            )
        logger.info("[HarnessFactory] 하네스 생성: model=%s (provider=%s)", spec.name, spec.provider)
        return builder(spec, effort, timeout_seconds)
