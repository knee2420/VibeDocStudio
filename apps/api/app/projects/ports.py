"""projects 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Protocol

from .models import VProjectManifestRecord


class VProjectRepositoryPort(Protocol):
    """`data/knowledge/projects/` 아래의 `.vproj` 프로젝트 매니페스트와 provenance 원장을 관리하는 포트."""

    def list_projects(self) -> list[VProjectManifestRecord]: ...

    def get(self, project_id: str) -> VProjectManifestRecord: ...

    def save(self, record: VProjectManifestRecord) -> VProjectManifestRecord: ...

    def delete(self, project_id: str) -> None: ...

