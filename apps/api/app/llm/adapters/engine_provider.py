"""EngineProvider 구현 — 프로바이더 이름으로 엔진을 고르고, agy 예열 풀 및 ACP 클라이언트와 모델 목록을 관리한다."""
from __future__ import annotations

import logging
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable, Optional

from app.core.process_tree import CREATE_NO_WINDOW

from ..catalog import (
    AGY_MODELS,
    AGY_PROVIDER,
    DEFAULT_AGY_MODEL,
    DEFAULT_AGY_STREAM_MODEL,
    DEFAULT_GOOGLE_MODEL,
    GOOGLE_MODELS,
    GOOGLE_PROVIDER,
    OFFLINE_PROVIDER,
)
from ..models import EngineChoice, Lane
from .acp_client import AcpClient
from .agy_acp import AcpConversation
from .agy_stream import AgyConversation, WarmPool
from .text_engines import GoogleTextConversation, OfflineConversation

logger = logging.getLogger(__name__)

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
        prepare_sandbox: Optional[Callable[[], None]] = None,
        transport: str = "acp",
        default_thought_level: str = "medium",
        mcp_server_spec_provider: Optional[Callable[[str], list[dict[str, Any]]]] = None,
        roots_provider: Optional[Callable[[str], list[str]]] = None,
    ) -> None:
        if prepare_sandbox is not None:
            try:
                prepare_sandbox()
            except Exception:
                logger.exception("[assistant] agy 작업 폴더 준비 실패 — 쓰기 차단 · vibefs 도구 없이 뜹니다")
        self.external_llm_enabled = external_llm_enabled
        self.transport = (transport or "acp").lower()
        self.default_thought_level = default_thought_level or "medium"
        self._sandbox_dir = sandbox_dir
        self._executable = agy_executable
        self._google_api_key = google_api_key
        self._idle_timeout = turn_idle_timeout_seconds
        self._google_timeout = google_timeout_seconds
        self._mcp_server_spec_provider = mcp_server_spec_provider
        self._roots_provider = roots_provider
        self._last_unrecognized_model: Optional[str] = None
        self._pool = WarmPool(agy_executable, sandbox_dir, enabled=external_llm_enabled and self.transport == "stream")
        self._acp_client: Optional[AcpClient] = None
        self._acp_lock = threading.Lock()
        self._agy_models: Optional[list[tuple[str, str]]] = None
        self._models_lock = threading.Lock()

    def _get_acp_client(self) -> AcpClient:
        if self._acp_client is not None and self._acp_client.alive:
            return self._acp_client
        with self._acp_lock:
            if self._acp_client is None or not self._acp_client.alive:
                self._acp_client = AcpClient(
                    executable=self._executable,
                    cwd=self._sandbox_dir,
                )
            return self._acp_client

    # --- 엔진 ---------------------------------------------------------------

    def resolve(self, provider: Optional[str], model: Optional[str]) -> EngineChoice:
        """요청 · 정책의 (provider, model) 을 실제로 돌 수 있는 조합으로 바로잡는다."""
        if not self.external_llm_enabled:
            return EngineChoice(OFFLINE_PROVIDER, "offline")
        if provider == GOOGLE_PROVIDER:
            known = {m for m, _ in GOOGLE_MODELS}
            return EngineChoice(GOOGLE_PROVIDER, model if model in known else DEFAULT_GOOGLE_MODEL)
        known = {m for m, _ in self._agy_model_list()}
        default_model = DEFAULT_AGY_MODEL if self.transport == "acp" else DEFAULT_AGY_STREAM_MODEL
        if model and model not in known:
            logger.warning("[assistant] 알 수 없는 모델 요청 '%s' — 기본값 '%s' 로 대체합니다.", model, default_model)
            self._last_unrecognized_model = model
            resolved_model = default_model
        else:
            resolved_model = model or default_model
        return EngineChoice(AGY_PROVIDER, resolved_model)

    def open_conversation(
        self,
        choice: EngineChoice,
        *,
        lane: Lane,
        resume: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
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
        if self.transport == "acp":
            client = self._get_acp_client()
            sid = session_id or (resume or {}).get("acp_session_id") or (resume or {}).get("agy_conversation_id") or "asst-default"
            mcp_servers = self._mcp_server_spec_provider(sid) if self._mcp_server_spec_provider else None
            roots_fn = (lambda: self._roots_provider(sid)) if self._roots_provider else None
            return AcpConversation(
                client,
                choice,
                sandbox_dir=self._sandbox_dir,
                idle_timeout=self._idle_timeout,
                resume_session_id=(resume or {}).get("acp_session_id") or (resume or {}).get("agy_conversation_id"),
                single_turn=lane == "inline",
                default_thought_level=self.default_thought_level,
                mcp_servers=mcp_servers,
                system_prompt=system_prompt,
                roots_provider=roots_fn,
            )
        return AgyConversation(
            self._pool,
            choice,
            idle_timeout=self._idle_timeout,
            resume_conversation_id=(resume or {}).get("agy_conversation_id"),
            single_turn=lane == "inline",
        )

    def warmup(self, targets: dict[EngineChoice, int]) -> None:
        if self.transport == "acp":
            # ACP 는 프로세스 하나에서 여러 세션을 빠르게 처리하므로 클라이언트 연결을 선제 확보
            threading.Thread(target=self._get_acp_client, daemon=True).start()
            return
        agy_targets: dict[str, int] = {}
        for choice, spares in targets.items():
            if choice.provider == AGY_PROVIDER:
                agy_targets[choice.model] = agy_targets.get(choice.model, 0) + spares
        threading.Thread(target=self._pool.retarget, args=(agy_targets,), daemon=True).start()

    # --- 모델 목록 --------------------------------------------------------------

    def available_models(self, provider: str) -> list[dict[str, str]]:
        if provider == GOOGLE_PROVIDER:
            rows = list(GOOGLE_MODELS)
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
                self._agy_models = self._read_agy_models() or list(AGY_MODELS)
        return self._agy_models

    def _read_agy_models(self) -> list[tuple[str, str]]:
        if not self.external_llm_enabled:
            return []
        rows = []
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
            for line in out.splitlines():
                if "\t" not in line:
                    continue
                mid, name = line.split("\t", 1)
                if mid.strip():
                    rows.append((mid.strip(), name.strip()))
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("[assistant] agy models 조회 실패: %s", exc)

        # ACP 기본 지원 모델 스냅샷 병합
        existing = {mid for mid, _ in rows}
        for mid, name in AGY_MODELS:
            if mid not in existing:
                rows.append((mid, name))
        return rows

    # --- 상태 ---------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        acp_alive = self._acp_client.alive if self._acp_client else False
        return {
            "externalLlmEnabled": self.external_llm_enabled,
            "transport": self.transport,
            "acpAlive": acp_alive,
            "lastUnrecognizedModel": self._last_unrecognized_model,
            "cliAvailable": self._pool.cli_available if self.transport == "stream" else acp_alive,
            "warmPool": self._pool.status() if self.transport == "stream" else {},
        }

    def shutdown(self) -> None:
        if self._acp_client:
            self._acp_client.close()
        self._pool.shutdown()
