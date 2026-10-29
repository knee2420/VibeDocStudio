"""[B Agreement] 사람의 결정을 발급하고 소비한다.

승인 대기를 프로세스 메모리에 두면 재시작과 함께 사라진다. 그러면 사용자는
"승인했는데 아무 일도 일어나지 않는" 상태를 만난다. 그래서 대기는 디스크에
토큰으로 남기고, 재개는 그 토큰을 소비하는 형태로 구현한다.
"""
from __future__ import annotations

from typing import Literal

from .models import Agreement
from .ports import AgreementRepository
from .utils import AGREEMENT_PREFIX, new_id

AgreementKind = Literal["configure_google_api", "confirm_cost", "resume_run"]

# 실패 코드가 요구하는 사람의 행동. 정책이 판정하고 여기서 형태를 만든다.
_KIND_BY_FAILURE: dict[str, AgreementKind] = {
    "QUOTA_EXHAUSTED": "configure_google_api",
    "AUTH_EXPIRED": "configure_google_api",
    "FALLBACK_NOT_CONFIGURED": "configure_google_api",
}


class ApprovalService:
    """대기 토큰의 발급과 조회. 상태 전이는 저장소가 맡는다."""

    def __init__(self, repository: AgreementRepository) -> None:
        self._repository = repository

    def request(
        self,
        kind: AgreementKind,
        *,
        run_id: str | None = None,
        doc_id: str | None = None,
        reason: str = "",
    ) -> Agreement:
        return self._repository.create(
            Agreement(
                agreement_id=new_id(AGREEMENT_PREFIX),
                kind=kind,
                run_id=run_id,
                doc_id=doc_id,
                reason=reason,
            )
        )

    def request_for_failure(
        self, failure_code: str | None, *, run_id: str | None, doc_id: str | None, reason: str
    ) -> Agreement | None:
        """실패 코드가 사람의 설정을 요구하면 대기 토큰을 만든다."""
        kind = _KIND_BY_FAILURE.get(failure_code or "")
        if kind is None:
            return None
        return self.request(kind, run_id=run_id, doc_id=doc_id, reason=reason)

    def get(self, agreement_id: str) -> Agreement | None:
        return self._repository.get(agreement_id)

    def decide(self, agreement_id: str, approved: bool) -> Agreement | None:
        return self._repository.decide(agreement_id, approved)

    def list_pending(self) -> list[Agreement]:
        return self._repository.list_pending()
