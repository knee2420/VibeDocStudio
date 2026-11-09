"""projects 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any, Protocol

from .models import VProjectManifestRecord


class VProjectRepositoryPort(Protocol):
    """`data/knowledge/projects/` 아래의 `.vproj` 프로젝트 매니페스트를 관리하는 포트."""

    def is_empty(self) -> bool: ...

    def seed(self, records: Iterable[VProjectManifestRecord]) -> None: ...

    def list_projects(self) -> list[VProjectManifestRecord]: ...

    def get(self, project_id: str) -> VProjectManifestRecord: ...

    def save(self, record: VProjectManifestRecord) -> VProjectManifestRecord: ...

    def update(
        self,
        project_id: str,
        mutate: Callable[[VProjectManifestRecord], VProjectManifestRecord],
    ) -> VProjectManifestRecord:
        """읽기 → 변경 → 쓰기를 원자적으로 수행한다."""
        ...

    def delete(self, project_id: str) -> None: ...


class StagingStorePort(Protocol):
    """프로젝트별 Staged 변경안 대기열 (`staging.json`)."""

    def list(self, project_id: str) -> list[dict[str, Any]]: ...

    def replace(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    def append(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    def merge(self, project_id: str, changes: list[dict[str, Any]], removed: list[str]) -> list[dict[str, Any]]: ...
