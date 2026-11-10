"""LLM 게이트웨이 포트 — 다른 도메인의 유스케이스는 이 계약만 안다.

엔진 이벤트(dict)의 정규형:
- {"type": "text_delta", "text": str}
- {"type": "agent_tool", "stepIndex": int, "name": str, "state": "running"|"done", "params": dict, "output": str}
- {"type": "status", "state": str, "message": str}
- {"type": "error", "message": str}
- {"type": "turn_done", "usage": dict, "durationMs": int}
"""
from __future__ import annotations

import threading
from typing import Any, Iterator, Optional, Protocol

from .models import EngineChoice, Lane, OneShotResult


class ConversationEngine(Protocol):
    """대화 하나. 턴을 넣으면 이벤트를 흘린다."""

    choice: EngineChoice

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]: ...

    def export_state(self) -> dict[str, Any]:
        """엔진을 바꿔 끼울 때 대화를 이어가기 위한 상태 (agy conversation_id, 대화록 …)."""
        ...

    def close(self) -> None: ...


class EngineProvider(Protocol):
    def resolve(self, provider: Optional[str], model: Optional[str]) -> EngineChoice:
        """요청 · 정책의 조합을 실제로 돌 수 있는 엔진으로 바로잡는다."""
        ...

    def open_conversation(
        self,
        choice: EngineChoice,
        *,
        lane: Lane,
        resume: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> ConversationEngine: ...

    def warmup(self, targets: dict[EngineChoice, int]) -> None:
        """대기 엔진 목표를 통째로 바꾼다 (목표에서 빠진 엔진의 대기 프로세스는 내린다)."""
        ...

    def available_models(self, provider: str) -> list[dict[str, str]]: ...

    def status(self) -> dict[str, Any]: ...

    def shutdown(self) -> None: ...


class OneShotRunner(Protocol):
    """프롬프트 하나 → 응답 하나 (대화 상태 없음). 서식 스캐폴딩의 구획명 정리 같은 단발 호출용."""

    def __call__(self, prompt: str, *, executable: str, model: str, timeout_seconds: int) -> OneShotResult: ...


class CredentialStore(Protocol):
    def get_google_api_key(self) -> str | None: ...
    def set_google_api_key(self, api_key: str) -> None: ...
    def delete_google_api_key(self) -> None: ...
