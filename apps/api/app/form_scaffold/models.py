"""form_scaffold 비동기 PDF 스캐폴딩 작업 도메인 모델."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

TERMINAL_JOB_STATUSES = frozenset({"completed", "failed", "cancelled"})


@dataclass
class ScaffoldPageTask:
    page_number: int
    placeholder_page_id: Optional[str] = None
    status: str = "queued"  # queued | running | completed | failed | cancelled
    stage: str = "queued"
    iter: int = 0
    verdict: Optional[str] = None
    span_score: Optional[float] = None
    message: str = ""
    warnings: list[str] = field(default_factory=list)
    error: Optional[str] = None
    thumbnail: Optional[str] = None
    block_count: int = 0
    slot_count: int = 0
    page: Optional[dict[str, Any]] = None
    slots: dict[str, Any] = field(default_factory=dict)
    variables: dict[str, str] = field(default_factory=dict)
    agent_run: Optional[dict[str, Any]] = None

    def to_dict(self, *, include_payload: bool = True) -> dict[str, Any]:
        data: dict[str, Any] = {
            "pageNumber": self.page_number,
            "placeholderPageId": self.placeholder_page_id,
            "status": self.status,
            "stage": self.stage,
            "iter": self.iter,
            "verdict": self.verdict,
            "spanScore": self.span_score,
            "message": self.message,
            "warnings": list(self.warnings),
            "error": self.error,
            "thumbnail": self.thumbnail,
            "blockCount": self.block_count,
            "slotCount": self.slot_count,
        }
        if include_payload:
            data["page"] = self.page
            data["slots"] = self.slots
            data["variables"] = self.variables
            data["agentRun"] = self.agent_run
        return data

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ScaffoldPageTask":
        return cls(
            page_number=int(raw.get("pageNumber") or 1),
            placeholder_page_id=raw.get("placeholderPageId"),
            status=str(raw.get("status") or "queued"),
            stage=str(raw.get("stage") or "queued"),
            iter=int(raw.get("iter") or 0),
            verdict=raw.get("verdict"),
            span_score=raw.get("spanScore"),
            message=str(raw.get("message") or ""),
            warnings=list(raw.get("warnings") or []),
            error=raw.get("error"),
            thumbnail=raw.get("thumbnail"),
            block_count=int(raw.get("blockCount") or 0),
            slot_count=int(raw.get("slotCount") or 0),
            page=raw.get("page"),
            slots=dict(raw.get("slots") or {}),
            variables=dict(raw.get("variables") or {}),
            agent_run=raw.get("agentRun"),
        )


@dataclass
class ScaffoldJob:
    job_id: str
    title: str
    target_doc_id: str
    mode: str = "insert-pages"  # insert-pages | new-doc
    fidelity_mode: str = "balanced"
    status: str = "queued"  # queued | running | completed | failed | cancelled
    created_at: str = ""
    updated_at: str = ""
    current_page_number: Optional[int] = None
    error: Optional[str] = None
    pages: list[ScaffoldPageTask] = field(default_factory=list)
    document: Optional[dict[str, Any]] = None

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_JOB_STATUSES

    @property
    def completed_count(self) -> int:
        return sum(1 for p in self.pages if p.status == "completed")

    @property
    def total_count(self) -> int:
        return len(self.pages)

    def to_dict(self, *, include_payload: bool = True) -> dict[str, Any]:
        data: dict[str, Any] = {
            "jobId": self.job_id,
            "title": self.title,
            "targetDocId": self.target_doc_id,
            "mode": self.mode,
            "fidelityMode": self.fidelity_mode,
            "status": self.status,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "currentPageNumber": self.current_page_number,
            "completedCount": self.completed_count,
            "totalCount": self.total_count,
            "error": self.error,
            "pages": [p.to_dict(include_payload=include_payload) for p in self.pages],
        }
        if include_payload:
            data["document"] = self.document
        return data

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ScaffoldJob":
        return cls(
            job_id=str(raw.get("jobId") or ""),
            title=str(raw.get("title") or ""),
            target_doc_id=str(raw.get("targetDocId") or ""),
            mode=str(raw.get("mode") or "insert-pages"),
            fidelity_mode=str(raw.get("fidelityMode") or "balanced"),
            status=str(raw.get("status") or "queued"),
            created_at=str(raw.get("createdAt") or ""),
            updated_at=str(raw.get("updatedAt") or ""),
            current_page_number=raw.get("currentPageNumber"),
            error=raw.get("error"),
            pages=[ScaffoldPageTask.from_dict(p) for p in raw.get("pages") or [] if isinstance(p, dict)],
            document=raw.get("document"),
        )

