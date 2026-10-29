"""LLM 비밀 값 저장 포트와 OS 자격 증명 저장소 구현."""
from __future__ import annotations

import os
from typing import Protocol

import keyring

GOOGLE_API_KEY_NAME = "google-api-key"
_SERVICE_NAME = "VibePatchNote"


class CredentialStore(Protocol):
    def get_google_api_key(self) -> str | None: ...
    def set_google_api_key(self, api_key: str) -> None: ...
    def delete_google_api_key(self) -> None: ...


class OsCredentialStore:
    """Windows 자격 증명 관리자 등 OS keyring에만 사용자 키를 보관한다."""

    def get_google_api_key(self) -> str | None:
        # 개발/배포 환경에서만 환경 변수 키를 허용한다. UI가 저장한 키보다 우선하지 않는다.
        try:
            stored = keyring.get_password(_SERVICE_NAME, GOOGLE_API_KEY_NAME)
        except keyring.errors.KeyringError:
            stored = None
        return stored or os.getenv("VIBE_GOOGLE_API_KEY") or None

    def set_google_api_key(self, api_key: str) -> None:
        value = api_key.strip()
        if not value:
            raise ValueError("Google API key must not be empty.")
        keyring.set_password(_SERVICE_NAME, GOOGLE_API_KEY_NAME, value)

    def delete_google_api_key(self) -> None:
        try:
            keyring.delete_password(_SERVICE_NAME, GOOGLE_API_KEY_NAME)
        except keyring.errors.PasswordDeleteError:
            pass
