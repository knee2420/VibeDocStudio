"""유스케이스: 실행 정책 조회 · 변경과 Google API 키 관리."""
from __future__ import annotations

import shutil

from app.core.errors import ValidationError
from app.core.llm.credentials import CredentialStore
from app.core.llm.execution_policy import (
    RuntimeExecutionPolicy,
    RuntimePolicyUpdate,
    RuntimePolicyView,
)

from ..models import ModelOption, RuntimeDashboard


class GetRuntimeDashboardUseCase:
    def __init__(
        self,
        policy: RuntimeExecutionPolicy,
        credentials: CredentialStore,
        model_options: tuple[ModelOption, ...],
    ) -> None:
        self._policy = policy
        self._credentials = credentials
        self._model_options = model_options

    def execute(self) -> RuntimeDashboard:
        view = self._policy.snapshot()
        return RuntimeDashboard(
            policy=view,
            google_configured=bool(self._credentials.get_google_api_key()),
            cli_available=bool(shutil.which(view.agent_cli_bin)),
            models=self._model_options,
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
