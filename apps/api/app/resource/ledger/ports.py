"""RM 원장 포트 — 유스케이스는 이 계약만 안다."""
from __future__ import annotations

from typing import Any, Iterator, Protocol

from .models import ResourceItem, ResourceSession


class LedgerRepository(Protocol):
    """프로젝트별 리소스 원장(트리 · 체크 상태 · 발췌 섹터)의 영속화."""

    def get_session(self, project_id: str) -> ResourceSession:
        """원장을 읽는다. 없으면 빈 원장."""
        ...

    def save_session(self, session: ResourceSession) -> None: ...

    def iter_sessions(self) -> Iterator[ResourceSession]:
        """저장된 모든 원장 (원문 열람 허용 범위를 정할 때 쓴다)."""
        ...


class ResourceProvider(Protocol):
    """원천 하나를 원장 항목 트리로 바꾸는 인입 어댑터 (로컬 파일 · 디렉터리 · 웹 링크 …)."""

    def can_handle(self, source_type: str) -> bool: ...

    def ingest(self, target: Any) -> list[ResourceItem]: ...
