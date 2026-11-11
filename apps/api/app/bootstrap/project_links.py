"""문서 ↔ 프로젝트 연결 어댑터 — documents 도메인의 `ProjectLinkPort` 를 projects 저장소로 구현한다.

두 도메인이 서로 import 하지 않도록 조립부(bootstrap)에 둔다.
"""
from __future__ import annotations

from dataclasses import replace

from app.core.clock import utc_now_iso
from app.projects.errors import VProjectNotFoundError
from app.projects.ports import VProjectRepositoryPort


class ProjectDocLinks:
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def exists(self, project_id: str) -> bool:
        try:
            self._repo.get(project_id)
            return True
        except VProjectNotFoundError:
            return False

    def link(self, project_id: str, doc_id: str) -> None:
        def _add(project):
            if doc_id in project.doc_ids:
                return project
            return replace(project, doc_ids=(*project.doc_ids, doc_id), updated_at=utc_now_iso())

        self._repo.update(project_id, _add)

    def unlink(self, doc_id: str) -> list[str]:
        removed: list[str] = []
        for project in self._repo.list_projects():
            if doc_id not in project.doc_ids:
                continue
            self._repo.update(
                project.project_id,
                lambda p: replace(p, doc_ids=tuple(d for d in p.doc_ids if d != doc_id), updated_at=utc_now_iso()),
            )
            removed.append(project.project_id)
        return removed
