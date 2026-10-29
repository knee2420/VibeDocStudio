"""AGY CLI quota를 실행 전 경로 결정에 쓸 수 있는 작은 스냅샷으로 정규화한다."""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from typing import Any

from .ports import CliUsageReader


@dataclass(frozen=True)
class CliAvailability:
    state: str
    remaining_fraction: float | None = None
    reset_time: str | None = None

    @property
    def exhausted(self) -> bool:
        return self.state in {"exhausted", "disabled"}


class CliQuotaAvailability:
    """짧게 캐시한 usage 결과로 CLI를 호출할 가치가 있는지 판정한다.

    quota 조회 자체가 매 작업의 병목이 되지 않도록 잠깐 캐시한다. 모델과 연결되는
    그룹을 찾지 못하거나 조회가 실패하면 추측하지 않고 unknown을 반환한다.
    """

    def __init__(self, reader: CliUsageReader, ttl_seconds: float = 30.0) -> None:
        self._reader = reader
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._cached_at = 0.0
        self._cached: dict[str, Any] | None = None

    def check(self, model: str) -> CliAvailability:
        try:
            payload = self._read_cached()
        # quota 조회는 실행 경로의 보조 신호다. 어댑터가 없거나 응답이 깨져도
        # 실제 작업을 막지 않고 기존의 CLI 우선 경로로 되돌아간다.
        except Exception:
            return CliAvailability("unknown")
        group = self._matching_group(model, payload.get("groups"))
        if group is None:
            return CliAvailability("unknown")
        buckets = group.get("buckets")
        if not isinstance(buckets, list) or not buckets:
            return CliAvailability("unknown")
        active = [bucket for bucket in buckets if isinstance(bucket, dict) and not bucket.get("disabled")]
        if not active:
            return CliAvailability("disabled")
        remaining = [
            float(bucket["remaining_fraction"])
            for bucket in active
            if isinstance(bucket.get("remaining_fraction"), (int, float))
        ]
        if not remaining:
            return CliAvailability("unknown")
        # 같은 모델 그룹의 분/일/주 제한은 모두 통과해야 하므로 가장 작은 잔여량이 기준이다.
        fraction = min(remaining)
        reset = next(
            (str(bucket.get("reset_time")) for bucket in active if bucket.get("reset_time")),
            None,
        )
        return CliAvailability("exhausted" if fraction <= 0 else "available", fraction, reset)

    def invalidate(self) -> None:
        with self._lock:
            self._cached_at = 0.0
            self._cached = None

    def _read_cached(self) -> dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            if self._cached is not None and now - self._cached_at < self._ttl_seconds:
                return self._cached
            payload = self._reader.read()
            self._cached = payload
            self._cached_at = now
            return payload

    @staticmethod
    def _matching_group(model: str, raw_groups: object) -> dict[str, Any] | None:
        if not isinstance(raw_groups, list):
            return None
        groups = [group for group in raw_groups if isinstance(group, dict)]
        model_tokens = _tokens(model)
        ranked: list[tuple[int, dict[str, Any]]] = []
        for group in groups:
            text = " ".join(
                str(value)
                for value in (group.get("name"), group.get("description"))
                if value
            )
            for bucket in group.get("buckets") or []:
                if isinstance(bucket, dict):
                    text += " " + " ".join(
                        str(value)
                        for value in (bucket.get("id"), bucket.get("name"), bucket.get("description"))
                        if value
                    )
            score = len(model_tokens & _tokens(text))
            ranked.append((score, group))
        best_score = max((score for score, _ in ranked), default=0)
        if best_score == 0:
            return None
        winners = [group for score, group in ranked if score == best_score]
        return winners[0] if len(winners) == 1 else None


def _tokens(value: str) -> set[str]:
    ignored = {"gemini", "model", "models", "low", "medium", "high", "preview", "latest"}
    return {
        token
        for token in re.findall(r"[a-z]+|\d+(?:\.\d+)?", value.lower())
        if token not in ignored
    }
