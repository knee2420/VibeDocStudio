"""재시도와 승인 정책.

"다시 시도하면 되는가"를 판정하는 곳이 한 군데뿐이어야 한다. 이 판정이 흩어지면
UI 는 재시도 버튼을 띄우고 서버는 같은 실패를 반복하는 상태가 된다.

정책은 실패 코드만 본다. 문서·PDF·프롬프트 같은 도메인 세부는 알지 못한다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# 사람이 무언가를 설정해야만 풀리는 실패. 재시도해도 같은 결과다.
_NEEDS_CONFIGURATION = frozenset({"QUOTA_EXHAUSTED", "AUTH_EXPIRED", "FALLBACK_NOT_CONFIGURED"})

# 잠시 뒤면 저절로 풀릴 수 있는 실패.
_TRANSIENT = frozenset({"PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "INVALID_MODEL_OUTPUT"})

MAX_ATTEMPTS = 3

Decision = Literal["retry", "wait_for_configuration", "wait_for_approval", "fail"]


@dataclass(frozen=True)
class RetryPolicy:
    """실패 코드와 시도 횟수로 다음 행동을 정한다."""

    max_attempts: int = MAX_ATTEMPTS

    def decide(self, failure_code: str | None, attempt: int) -> Decision:
        if failure_code in _NEEDS_CONFIGURATION:
            return "wait_for_configuration"
        if failure_code in _TRANSIENT and attempt < self.max_attempts:
            return "retry"
        return "fail"

    def is_retryable(self, failure_code: str | None) -> bool:
        return failure_code in _TRANSIENT


DEFAULT_RETRY_POLICY = RetryPolicy()
