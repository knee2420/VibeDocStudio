"""도메인에 독립적인 Agent 실행 상태 모델.

`AgentRun` 은 로그가 아니라 **재개 가능한 실행 상태**다. 중단·재개가 요구사항인 이상,
프로세스가 죽어도 "무엇을 어디까지 했는가"를 복원할 수 있어야 한다. 그래서
전체 덮어쓰기가 아니라 이벤트 이력(`AgentRunEvent`)을 정본으로 두고, 현재 상태는
그 이력을 접어(fold) 얻는다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

# 아키텍처 계약: idle → running → succeeded / failed / waiting_*
# `queued` 는 접수만 되고 아직 시작하지 않은 상태다.
RunStatus = Literal[
    "queued",
    "running",
    "completed",
    "failed",
    "waiting_for_configuration",
    "waiting_for_approval",
]

# 사람의 개입을 기다리는 상태들. 여기서 멈춘 run 은 실패가 아니라 보류다.
WAITING_STATUSES: frozenset[str] = frozenset(
    {"waiting_for_configuration", "waiting_for_approval"}
)
TERMINAL_STATUSES: frozenset[str] = frozenset({"completed", "failed"})


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunCost(BaseModel):
    """이 실행이 쓴 자원. 원장 집계와 같은 단위를 쓴다."""

    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cache_read_tokens: int = 0
    total_tokens: int = 0


class AgentRunInput(BaseModel):
    """재개에 필요한 입력 스냅샷.

    재개는 "무엇을 다시 하는가"를 알아야 가능하다. 호출부의 클로저는 프로세스와
    함께 사라지므로, 재개 가능한 형태로 남길 수 있는 값만 여기에 담는다.
    """

    use_case: str = Field(description="재개 시 다시 호출할 유스케이스 이름")
    doc_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentRun(BaseModel):
    """실행 한 건의 현재 상태. 이벤트 이력의 폴드 결과다."""

    run_id: str
    agent_name: str
    status: RunStatus
    started_at: datetime = Field(default_factory=_utc_now)
    finished_at: datetime | None = None
    trace_id: str | None = None
    doc_id: str | None = None
    agreement_id: str | None = Field(
        default=None, description="사람의 결정을 기다리는 중이면 그 요청 식별자"
    )
    error_code: str | None = None
    attempt: int = Field(default=1, description="같은 입력에 대한 시도 횟수")
    cost: RunCost = Field(default_factory=RunCost)
    metadata: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def is_waiting(self) -> bool:
        return self.status in WAITING_STATUSES


class Agreement(BaseModel):
    """[B Agreement] 사람이 내린 결정 한 건. 발급되면 내용은 바뀌지 않는다.

    승인 대기는 프로세스 메모리에 둘 수 없다. 재시작을 넘어 살아남아야 하므로
    프로세스 밖(디스크)에 토큰으로 남긴다.
    """

    agreement_id: str
    kind: Literal["configure_google_api", "confirm_cost", "resume_run"]
    run_id: str | None = None
    doc_id: str | None = None
    status: Literal["pending", "approved", "declined"] = "pending"
    reason: str = Field(default="", description="무엇에 대한 동의를 구하는지")
    requested_at: datetime = Field(default_factory=_utc_now)
    decided_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LedgerEntry(BaseModel):
    """[A Observation·집계] 원장 한 줄. 수정하지 않고 덧붙이기만 한다.

    공급자 차단 상태(`state/provider-state.json`)는 이 원장의 파생이다.
    원장이 있으면 상태 파일이 날아가도 다시 계산할 수 있다.
    """

    recorded_at: datetime = Field(default_factory=_utc_now)
    run_id: str | None = None
    trace_id: str | None = None
    doc_id: str | None = None
    task_name: str = ""
    provider: str = ""
    model: str = ""
    status: str = ""
    failure_code: str | None = None
    duration_seconds: float = 0.0
    cost: RunCost = Field(default_factory=RunCost)
    metadata: dict[str, Any] = Field(default_factory=dict)
