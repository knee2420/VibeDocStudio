"""유스케이스: 문서 한 편의 생애 — 만들기 · 이름 바꾸기 · 복제 · 삭제를 프로젝트 연결과 함께.

문서는 프로젝트 아래의 산출물이다 (같은 리소스로 레포트 · 주간 보고 · 블로그를 따로 쓴다).
만들 때 프로젝트 `docIds` 에 넣고, 지울 때 뺀다 — 고아 문서가 생기지 않게 한 유스케이스가 둘을 함께 한다.
프로젝트 쪽은 `ProjectLinkPort` 로만 안다 (도메인끼리 직접 import 하지 않는다).
"""
from __future__ import annotations

import copy
from typing import Any, Literal, Optional, Protocol

from app.core.clock import utc_now_iso
from app.core.errors import ValidationError
from app.core.storage import DOCUMENT_PREFIX, new_id, safe_segment

from ..models import VDocAggregateRecord, blank_document
from ..ports import VDocDocumentRepositoryPort

SurfaceKind = Literal["paged", "scroll"]
CreatedBy = Literal["user", "agent", "import"]


class ProjectLinkPort(Protocol):
    """프로젝트 manifest 의 문서 목록만 다룬다."""

    def link(self, project_id: str, doc_id: str) -> None: ...

    def unlink(self, doc_id: str) -> list[str]:
        """이 문서를 가진 모든 프로젝트에서 뺀다. 뺀 프로젝트 id 들."""
        ...

    def exists(self, project_id: str) -> bool: ...


class DocumentLifecycleUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort, projects: ProjectLinkPort) -> None:
        self._repository = repository
        self._projects = projects

    def create(
        self,
        project_id: str,
        *,
        title: str,
        surface: SurfaceKind = "paged",
        surface_width: Optional[int] = None,
        genre: str = "document",
        created_by: CreatedBy = "user",
        session_id: str = "",
    ) -> VDocAggregateRecord:
        project_id = safe_segment(project_id)
        if not self._projects.exists(project_id):
            raise ValidationError(f"프로젝트가 없습니다: {project_id}")
        clean_title = " ".join((title or "").split())[:120] or "새 문서"
        doc_id = new_id(DOCUMENT_PREFIX)
        now = utc_now_iso()
        payload = blank_document(
            doc_id,
            clean_title,
            surface=surface,
            surface_width=surface_width,
            genre=(genre or "document").strip()[:40],
            origin={"createdBy": created_by, "createdAt": now, **({"sessionId": session_id} if session_id else {})},
            project_id=project_id,
            now=now,
        )
        record = self._repository.save(VDocAggregateRecord(doc_id=doc_id, payload=payload))
        self._projects.link(project_id, doc_id)
        return record

    def rename(self, doc_id: str, title: str) -> VDocAggregateRecord:
        clean = " ".join((title or "").split())[:120]
        if not clean:
            raise ValidationError("문서 이름을 넣어 주세요.")
        now = utc_now_iso()
        return self._repository.update(safe_segment(doc_id), lambda r: r.with_fields(now=now, title=clean))

    def duplicate(self, doc_id: str, *, title: str = "", project_id: str = "") -> VDocAggregateRecord:
        source = self._repository.get(safe_segment(doc_id))
        new_doc_id = new_id(DOCUMENT_PREFIX)
        now = utc_now_iso()
        payload: dict[str, Any] = copy.deepcopy(source.payload)
        target_project = safe_segment(project_id) if project_id else str(payload.get("projectId") or "")
        payload.update({
            "docId": new_doc_id,
            "title": (" ".join((title or "").split())[:120] or f"{source.title} (사본)"),
            "revision": 1,
            "updatedAt": now,
            "origin": {"createdBy": "user", "createdAt": now},
            **({"projectId": target_project} if target_project else {}),
        })
        record = self._repository.save(VDocAggregateRecord(doc_id=new_doc_id, payload=payload))
        if target_project and self._projects.exists(target_project):
            self._projects.link(target_project, new_doc_id)
        return record

    def link(self, doc_id: str, project_id: str) -> VDocAggregateRecord:
        """이미 있는 문서를 프로젝트에 넣는다 (불러오기 · 고아 문서 정리). 문서 머리의 projectId 도 맞춘다."""
        project_id = safe_segment(project_id)
        if not self._projects.exists(project_id):
            raise ValidationError(f"프로젝트가 없습니다: {project_id}")
        now = utc_now_iso()
        record = self._repository.update(safe_segment(doc_id), lambda r: r.with_fields(now=now, projectId=project_id))
        self._projects.link(project_id, record.doc_id)
        return record

    def delete(self, doc_id: str) -> list[str]:
        normalized = safe_segment(doc_id)
        self._repository.delete(normalized)
        return self._projects.unlink(normalized)
