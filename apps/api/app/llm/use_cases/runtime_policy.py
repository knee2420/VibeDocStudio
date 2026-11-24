"""유스케이스: 실행 정책 조회 · 변경과 Google API 키 관리."""
from __future__ import annotations

import shutil

from typing import Callable, Mapping, Optional, Sequence

from app.core.errors import ValidationError

from ..catalog import build_settings_options
from ..models import ModelOption, RuntimeDashboard
from ..policy import (
    RuntimeExecutionPolicy,
    RuntimePolicyUpdate,
    RuntimePolicyView,
)
from ..ports import CredentialStore


class GetRuntimeDashboardUseCase:
    def __init__(
        self,
        policy: RuntimeExecutionPolicy,
        credentials: CredentialStore,
        model_options: tuple[ModelOption, ...],
        agy_models_provider: Optional[Callable[[bool], Sequence[Mapping[str, str]]]] = None,
    ) -> None:
        self._policy = policy
        self._credentials = credentials
        self._model_options = model_options
        self._agy_models_provider = agy_models_provider

    def execute(self, *, refresh: bool = False) -> RuntimeDashboard:
        view = self._policy.snapshot()
        models = self._model_options
        if self._agy_models_provider is not None:
            try:
                live = self._agy_models_provider(refresh)
                if live:
                    models = build_settings_options(live)
            except Exception:
                models = self._model_options
        return RuntimeDashboard(
            policy=view,
            google_configured=bool(self._credentials.get_google_api_key()),
            cli_available=bool(shutil.which(view.agent_cli_bin)),
            models=models,
        )


class UpdateRuntimePolicyUseCase:
    """정책을 바꾸는 유일한 진입점."""

    def __init__(self, policy: RuntimeExecutionPolicy) -> None:
        self._policy = policy

    def execute(self, update: RuntimePolicyUpdate) -> RuntimePolicyView:
        try:
            return self._policy.apply(update)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc


class SetGoogleApiKeyUseCase:
    def __init__(self, credentials: CredentialStore) -> None:
        self._credentials = credentials

    def execute(self, api_key: str) -> None:
        try:
            self._credentials.set_google_api_key(api_key)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc


class DeleteGoogleApiKeyUseCase:
    def __init__(self, credentials: CredentialStore) -> None:
        self._credentials = credentials

    def execute(self) -> None:
        self._credentials.delete_google_api_key()
