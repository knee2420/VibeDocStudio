"""Agent Runtime 이 외부 세계에 요구하는 계약.

여기에 파일 경로·JSON·디렉터리 같은 구현 세부를 두지 않는다.
"""
from __future__ import annotations

from typing import Iterable, Protocol

from .events import AgentRunEvent
from .models import AgentRun, AgentRunInput, Agreement, LedgerEntry


class AgentRunRepository(Protocol):
    """실행 이력의 기록과 복원 계약."""

    def append(self, run_id: str, event: AgentRunEvent) -> AgentRun: ...

    def get(self, run_id: str) -> AgentRun | None: ...

    def save_input(self, run_id: str, payload: AgentRunInput) -> None: ...

    def get_input(self, run_id: str) -> AgentRunInput | None: ...

    def list_unfinished(self) -> list[AgentRun]: ...


class AgreementRepository(Protocol):
    """사람의 결정 기록 계약."""

    def create(self, agreement: Agreement) -> Agreement: ...

    def get(self, agreement_id: str) -> Agreement | None: ...

    def decide(self, agreement_id: str, approved: bool) -> Agreement | None: ...

    def list_pending(self) -> list[Agreement]: ...


class LedgerPort(Protocol):
    """토큰·비용 원장 계약. 덧붙이기만 한다."""

    def record(self, entry: LedgerEntry) -> None: ...

    def entries(self, limit: int = 200) -> Iterable[LedgerEntry]: ...
