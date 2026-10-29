"""Agent Runtime — 실행 상태, 재시도, 중단·재개, 사용자 승인 대기.

도메인 세부(문서·PDF·프롬프트)를 import 하거나 저장하지 않는다.
도메인별 Agent 정의는 각 도메인의 `agents/` 에 둔다.
일반 CRUD·파일 조회 요청은 이 Runtime 을 사용하지 않는다.
"""
from .approval import ApprovalService
from .events import AgentRunEvent, fold
from .models import (
    TERMINAL_STATUSES,
    WAITING_STATUSES,
    AgentRun,
    AgentRunInput,
    Agreement,
    LedgerEntry,
    RunCost,
    RunStatus,
)
from .policy import DEFAULT_RETRY_POLICY, RetryPolicy
from .ports import AgentRunRepository, AgreementRepository, LedgerPort
from .progress import bind_progress, current_run_id, report_progress
from .repository import LocalAgentRunRepository, LocalAgreementRepository, LocalLedger
from .runtime import INTERRUPTED_CODE, AgentRuntime

__all__ = [
    "AgentRun",
    "AgentRunInput",
    "AgentRunEvent",
    "AgentRuntime",
    "Agreement",
    "ApprovalService",
    "LedgerEntry",
    "RunCost",
    "RunStatus",
    "RetryPolicy",
    "DEFAULT_RETRY_POLICY",
    "AgentRunRepository",
    "AgreementRepository",
    "LedgerPort",
    "LocalAgentRunRepository",
    "bind_progress",
    "current_run_id",
    "report_progress",
    "LocalAgreementRepository",
    "LocalLedger",
    "INTERRUPTED_CODE",
    "TERMINAL_STATUSES",
    "WAITING_STATUSES",
    "fold",
]
