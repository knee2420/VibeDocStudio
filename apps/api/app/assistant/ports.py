"""assistant 도메인 포트 — 서버 도구 묶음 · 사용량 원장.

대화 엔진 계약(`ConversationEngine` · `EngineProvider`)은 LLM 게이트웨이(`app.llm.ports`)에 있다.

엔진 이벤트(dict)의 정규형:
- {"type": "text_delta", "text": str}
- {"type": "agent_tool", "stepIndex": int, "name": str, "state": "running"|"done", "params": dict, "output": str}
- {"type": "status", "state": str, "message": str}
- {"type": "error", "message": str}
- {"type": "turn_done", "usage": dict, "durationMs": int}
"""
from __future__ import annotations

from typing import Any, Optional, Protocol


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
