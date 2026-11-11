"""documents 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class VDocSummaryResponse(BaseModel):
    docId: str
    title: str
    status: str
    updatedAt: str
    pageCount: int
    slotCount: int


class ChangeNotePayload(BaseModel):
    """이번 저장에 들어간 변경의 출처 — 슬롯별 작성자를 개정 이력에 남긴다 (없으면 사람의 편집)."""

    slotIds: list[str] = Field(default_factory=list)
    variables: list[str] = Field(default_factory=list)
    author: str = "human"
    harnessId: str | None = None
    runId: str | None = None
    label: str | None = None


class SaveVDocRequest(BaseModel):
    document: dict[str, Any] = Field(..., description="전체 .vdoc 문서 JSON")
    #: 클라이언트가 마지막으로 받은 서버 버전. 서버 버전과 다르면 409 (덮어쓰지 않는다).
    baseRevision: int | None = None
    changes: list[ChangeNotePayload] = Field(default_factory=list)


class RevisionListResponse(BaseModel):
    docId: str
    revisions: list[dict[str, Any]]


class PatchSlotContentRequest(BaseModel):
    content: str = Field(..., description="슬롯 내부 Tiptap HTML 본문")


class PatchDocumentStructureRequest(BaseModel):
    operation: str = Field(..., description="commit_staged_slots | reorder_pages | insert_storyline_page")
    payload: dict[str, Any] = Field(default_factory=dict)


class VDocDocumentResponse(BaseModel):
    docId: str
    document: dict[str, Any]


class VDocPageChunkResponse(BaseModel):
    docId: str
    title: str
    totalPages: int
    startPage: int
    endPage: int
    windowSize: int
    topSpacerPx: int
    bottomSpacerPx: int
    pages: list[dict[str, Any]]
    slots: dict[str, Any]
    backdata: dict[str, Any]


class CreateDocumentRequest(BaseModel):
    projectId: str
    title: str = ""
    #: paged = A4 쪽 나눔 · scroll = 블로그처럼 이음매 없는 한 단
    surface: Literal["paged", "scroll"] = "paged"
    surfaceWidth: Optional[int] = Field(default=None, ge=360, le=1400)
    genre: str = "document"
    createdBy: Literal["user", "agent", "import"] = "user"
    sessionId: str = ""


class RenameDocumentRequest(BaseModel):
    title: str


class DuplicateDocumentRequest(BaseModel):
    title: str = ""
    projectId: str = ""


class LinkDocumentRequest(BaseModel):
    projectId: str


class DeleteDocumentResponse(BaseModel):
    docId: str
    unlinkedProjects: list[str]

