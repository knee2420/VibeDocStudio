"""assistant 도메인 포트 — 유스케이스는 이 계약만 알고, 구체 엔진은 adapters 가 구현한다.

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

from .models import EngineChoice, Lane


class ConversationEngine(Protocol):
    """대화 하나. 턴을 넣으면 이벤트를 흘린다."""

    choice: EngineChoice

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]: ...

    def export_state(self) -> dict[str, Any]:
        """엔진을 바꿔 끼울 때 대화를 이어가기 위한 상태 (agy conversation_id, 대화록 …)."""
        ...

    def close(self) -> None: ...


class ServerToolbox(Protocol):
    """서버에서 실행되는 도구 묶음 (예: 지식 덱 `knowledge.*`).

    특정 종류의 첨부(`context_kind()`, 예: "deck")가 메시지에 있을 때만 켜진다. 그 첨부들의 id 가
    도구의 범위(scope)가 된다 — 도구는 첨부되지 않은 대상을 읽지 않는다.
    """

    def context_kind(self) -> str: ...

    def specs(self) -> list[dict[str, Any]]:
        """[{name, description, risk, inputSchema}] — 프론트 도구 목록과 같은 모양."""
        ...

    def handles(self, name: str) -> bool: ...

    def run(self, name: str, args: dict[str, Any], scope: list[str]) -> Any: ...

    def brief(self, ref_id: str) -> Optional[str]:
        """첨부 본문으로 넣을 요약 (덱의 섹션 지도). 없으면 None."""
        ...

    def skill_text(self) -> str:
        """도구를 쓰는 절차 (운영 규칙 뒤에 붙는다)."""
        ...

    def describe(self, name: str, args: dict[str, Any]) -> str: ...

    def resolve_evidence(self, locators: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """근거 위치(예: kcard) → 위치 + 본문 발췌(`excerpt`) · 원문 지문(`sourceSha`). 하네스의 근거 묶음용."""
        ...

    def suggest_evidence(self, scope: list[str], query: str, limit: int = 4) -> list[dict[str, Any]]:
        """질의로 근거 후보를 찾는다 (지식 덱 lookup) — 같은 모양의 위치 + excerpt."""
        ...


class UsageLedger(Protocol):
    """하네스 · 실행별 토큰 · 시간 원장 (비용 예산 · 관측)."""

    def record(self, entry: dict[str, Any]) -> None: ...

    def summary(self, limit: int = 2000) -> dict[str, Any]: ...


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
    ) -> ConversationEngine: ...

    def warmup(self, targets: dict[EngineChoice, int]) -> None:
        """대기 엔진 목표를 통째로 바꾼다 (목표에서 빠진 엔진의 대기 프로세스는 내린다)."""
        ...

    def available_models(self, provider: str) -> list[dict[str, str]]: ...

    def status(self) -> dict[str, Any]: ...

    def shutdown(self) -> None: ...
