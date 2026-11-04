"""EngineProvider 구현 — 프로바이더 이름으로 엔진을 고르고, agy 예열 풀과 모델 목록을 관리한다."""
from __future__ import annotations

import logging
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable, Optional

from ..models import EngineChoice, Lane
from .agy_stream import CREATE_NO_WINDOW, AgyConversation, WarmPool
from .text_engines import GoogleTextConversation, OfflineConversation

logger = logging.getLogger(__name__)

AGY_PROVIDER = "agy_cli"
GOOGLE_PROVIDER = "google_api"
OFFLINE_PROVIDER = "offline"

#: `agy models` 를 못 읽을 때 쓰는 목록 (agy 1.4.10 실측 스냅샷).
_AGY_MODEL_SNAPSHOT = [
    ("gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)"),
    ("gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)"),
    ("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"),
    ("gemini-4-argon-low", "Gemini 4 Argon (Low)"),
    ("gemini-4-argon-medium", "Gemini 4 Argon (Medium)"),
    ("gemini-4-argon-high", "Gemini 4 Argon (High)"),
    ("claude-sonnet-5-5-low", "Claude Sonnet 5.5 (Low)"),
    ("claude-sonnet-5-5-medium", "Claude Sonnet 5.5 (Medium)"),
    ("claude-opus-5-5-low", "Claude Opus 5.5 (Low)"),
    ("gpt-oss-120b-medium", "GPT-OSS 120B (Medium)"),
]
_GOOGLE_MODELS = [
    ("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite (Direct API)"),
    ("gemini-3.5-flash", "Gemini 3.5 Flash (Direct API)"),
]
DEFAULT_AGY_MODEL = "gemini-3.8-flash-low"
DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash-lite"


class AssistantEngineProvider:
    def __init__(
        self,
        *,
        agy_executable: str,
        sandbox_dir: Path,
        external_llm_enabled: bool,
        google_api_key: Callable[[], Optional[str]],
        turn_idle_timeout_seconds: int = 180,
        google_timeout_seconds: int = 180,
    ) -> None:
        self.external_llm_enabled = external_llm_enabled
        self._pool = WarmPool(agy_executable, sandbox_dir, enabled=external_llm_enabled)
        self._executable = agy_executable
        self._google_api_key = google_api_key
        self._idle_timeout = turn_idle_timeout_seconds
        self._google_timeout = google_timeout_seconds
        self._agy_models: Optional[list[tuple[str, str]]] = None
        self._models_lock = threading.Lock()

    # --- 엔진 ---------------------------------------------------------------

    def resolve(self, provider: Optional[str], model: Optional[str]) -> EngineChoice:
        """요청 · 정책의 (provider, model) 을 실제로 돌 수 있는 조합으로 바로잡는다."""
        if not self.external_llm_enabled:
            return EngineChoice(OFFLINE_PROVIDER, "offline")
        if provider == GOOGLE_PROVIDER:
            known = {m for m, _ in _GOOGLE_MODELS}
            return EngineChoice(GOOGLE_PROVIDER, model if model in known else DEFAULT_GOOGLE_MODEL)
        known = {m for m, _ in self._agy_model_list()}
        return EngineChoice(AGY_PROVIDER, model if model in known else DEFAULT_AGY_MODEL)

    def open_conversation(
        self,
        choice: EngineChoice,
        *,
        lane: Lane,
        resume: Optional[dict[str, Any]] = None,
    ):
        if choice.provider == OFFLINE_PROVIDER:
            return OfflineConversation(choice)
        if choice.provider == GOOGLE_PROVIDER:
            return GoogleTextConversation(
                choice,
                api_key_provider=self._google_api_key,
                timeout_seconds=self._google_timeout,
                resume=resume,
            )
        return AgyConversation(
            self._pool,
            choice,
            idle_timeout=self._idle_timeout,
            resume_conversation_id=(resume or {}).get("agy_conversation_id"),
            single_turn=lane == "inline",
        )

    def warmup(self, choice: EngineChoice, *, lane: Lane, spares: int = 1) -> None:
        if choice.provider == AGY_PROVIDER:
            threading.Thread(target=self._pool.warm, args=(choice.model, spares), daemon=True).start()

    # --- 모델 목록 --------------------------------------------------------------

    def available_models(self, provider: str) -> list[dict[str, str]]:
        if provider == GOOGLE_PROVIDER:
            rows = _GOOGLE_MODELS
        elif provider == AGY_PROVIDER:
            rows = self._agy_model_list()
        else:
            rows = [("offline", "오프라인 엔진")]
        return [{"id": mid, "name": name} for mid, name in rows]

    def _agy_model_list(self) -> list[tuple[str, str]]:
        if self._agy_models is not None:
            return self._agy_models
        with self._models_lock:
            if self._agy_models is None:
                self._agy_models = self._read_agy_models() or list(_AGY_MODEL_SNAPSHOT)
        return self._agy_models

    def _read_agy_models(self) -> list[tuple[str, str]]:
        if not (self.external_llm_enabled and self._pool.cli_available):
            return []
        try:
            out = subprocess.run(
                [self._executable, "models"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
                creationflags=CREATE_NO_WINDOW,
            ).stdout
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("[assistant] agy models 조회 실패: %s", exc)
            return []
        rows = []
        for line in out.splitlines():
            if "\t" not in line:
                continue
            mid, name = line.split("\t", 1)
            if mid.strip():
                rows.append((mid.strip(), name.strip()))
        return rows

    # --- 상태 ---------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        return {
            "externalLlmEnabled": self.external_llm_enabled,
            "cliAvailable": self._pool.cli_available,
            "warmPool": self._pool.status(),
        }

    def shutdown(self) -> None:
        self._pool.shutdown()
