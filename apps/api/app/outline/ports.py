"""outline 도메인 포트 — 저장소 및 projects/documents 브리지 추상화."""
from __future__ import annotations

from typing import Any, Protocol

from .models import WorkingOutlineRecord


class WorkingOutlineRepositoryPort(Protocol):
    """WorkingOutline 파일 저장소 계약."""

    def get(self, project_id: str) -> WorkingOutlineRecord | None: ...

    def save(self, record: WorkingOutlineRecord) -> WorkingOutlineRecord: ...

    def delete(self, project_id: str) -> bool: ...


class ProjectLookupPort(Protocol):
    """projects 도메인으로부터 프로젝트 제목과 문서 목록만 조회하는 좁은 포트."""

    def get_project_meta(self, project_id: str) -> tuple[str, tuple[str, ...]]: ...

    def update_project_doc_ids(self, project_id: str, doc_ids: list[str]) -> None: ...


class DocumentSyncPort(Protocol):
    """documents 도메인과 `.vdoc` 문서를 주고받는 좁은 포트."""

    def load_documents(self, doc_ids: list[str]) -> list[dict[str, Any]]: ...

    def save_documents(self, project_id: str, documents: list[dict[str, Any]]) -> list[dict[str, Any]]: ...
