"""Knowledge Deck(구조화 지식 덱) 도메인 모델 — 목록(레지스트리) 항목 · 색인 작업.

덱의 본체(카드 · 인덱스 · 아카이브)는 `pipeline` 이 쓰는 덱 폴더에 있고,
여기의 `KnowledgeDeck` 은 화면 목록에 필요한 요약(상태 · 진행률 · 통계 · 품질)만 갖는다.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

DeckStatus = Literal["queued", "indexing", "ready", "failed", "cancelled"]
JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]


def _now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class TopicNode:
    """목록 화면의 목차 미리보기 노드 (섹션 → 카드)."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    title: str = ""
    level: int = 1
    page: int | None = None
    snippet: str = ""
    children: list[TopicNode] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "level": self.level,
            "page": self.page,
            "snippet": self.snippet,
            "children": [c.to_dict() for c in self.children],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TopicNode:
        return cls(
            id=data.get("id") or str(uuid.uuid4()),
            title=data.get("title", ""),
            level=data.get("level", 1),
            page=data.get("page"),
            snippet=data.get("snippet", ""),
            children=[cls.from_dict(c) for c in data.get("children", [])],
        )


@dataclass
class DeckStat:
    topics_count: int = 0
    tables_count: int = 0
    chunks_count: int = 0
    files_count: int = 0
    sections_count: int = 0
    cards_count: int = 0
    figures_count: int = 0
    code_count: int = 0
    enriched_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "topicsCount": self.topics_count,
            "tablesCount": self.tables_count,
            "chunksCount": self.chunks_count,
            "filesCount": self.files_count,
            "sectionsCount": self.sections_count,
            "cardsCount": self.cards_count,
            "figuresCount": self.figures_count,
            "codeCount": self.code_count,
            "enrichedCount": self.enriched_count,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DeckStat:
        g = lambda camel, snake: int(data.get(camel, data.get(snake, 0)) or 0)  # noqa: E731
        return cls(
            topics_count=g("topicsCount", "topics_count"),
            tables_count=g("tablesCount", "tables_count"),
            chunks_count=g("chunksCount", "chunks_count"),
            files_count=g("filesCount", "files_count"),
            sections_count=g("sectionsCount", "sections_count"),
            cards_count=g("cardsCount", "cards_count"),
            figures_count=g("figuresCount", "figures_count"),
            code_count=g("codeCount", "code_count"),
            enriched_count=g("enrichedCount", "enriched_count"),
        )

    @classmethod
    def from_pipeline(cls, stats: dict[str, Any]) -> DeckStat:
        return cls(
            topics_count=int(stats.get("cards", 0)),
            tables_count=int(stats.get("tables", 0)),
            chunks_count=int(stats.get("segments", 0)),
            files_count=int(stats.get("files", 0)),
            sections_count=int(stats.get("sections", 0)),
            cards_count=int(stats.get("cards", 0)),
            figures_count=int(stats.get("figures", 0)),
            code_count=int(stats.get("codeBlocks", 0)),
            enriched_count=int(stats.get("enrichedCards", 0)),
        )


@dataclass
class KnowledgeDeck:
    id: str = field(default_factory=lambda: f"deck_{uuid.uuid4().hex[:8]}")
    project_id: str = "default_project"
    title: str = "신규 지식 덱"
    description: str = ""
    source_paths: list[str] = field(default_factory=list)
    status: DeckStatus = "queued"
    progress: int = 0
    stage: str = ""
    depth: str = "structural"
    job_id: str = ""
    error: str = ""
    stat: DeckStat = field(default_factory=DeckStat)
    topics: list[TopicNode] = field(default_factory=list)
    #: {"passed": bool, "failing": [게이트 이름], "metrics": {...}}
    quality: dict[str, Any] = field(default_factory=dict)
    profile: dict[str, Any] = field(default_factory=dict)
    created_at: int = field(default_factory=_now_ms)
    updated_at: int = field(default_factory=_now_ms)
    built_at: str = ""
    is_checked: bool = True
    tags: list[str] = field(default_factory=list)
    #: 원본 파일별 진행 [{path, title, segments, done, status: pending|running|done|skipped, reason?}]
    files: list[dict[str, Any]] = field(default_factory=list)
    #: AI 가 쓸 섹션만 고른 것 (비면 전부). RM 에서 섹션 체크박스로 고른다.
    selected_sections: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "projectId": self.project_id,
            "title": self.title,
            "description": self.description,
            "sourcePaths": self.source_paths,
            "status": self.status,
            "progress": self.progress,
            "stage": self.stage,
            "depth": self.depth,
            "jobId": self.job_id,
            "error": self.error,
            "stat": self.stat.to_dict(),
            "topics": [t.to_dict() for t in self.topics],
            "quality": self.quality,
            "profile": self.profile,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "builtAt": self.built_at,
            "isChecked": self.is_checked,
            "tags": self.tags,
            "files": self.files,
            "selectedSections": self.selected_sections,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> KnowledgeDeck:
        return cls(
            id=data.get("id") or f"deck_{uuid.uuid4().hex[:8]}",
            project_id=data.get("projectId", data.get("project_id", "default_project")),
            title=data.get("title", ""),
            description=data.get("description", ""),
            source_paths=list(data.get("sourcePaths", data.get("source_paths", [])) or []),
            status=data.get("status", "ready"),
            progress=int(data.get("progress", 100) or 0),
            stage=data.get("stage", ""),
            depth=data.get("depth", "structural"),
            job_id=data.get("jobId", ""),
            error=data.get("error", ""),
            stat=DeckStat.from_dict(data.get("stat") or {}),
            topics=[TopicNode.from_dict(t) for t in data.get("topics", [])],
            quality=dict(data.get("quality") or {}),
            profile=dict(data.get("profile") or {}),
            created_at=int(data.get("createdAt", data.get("created_at", _now_ms()))),
            updated_at=int(data.get("updatedAt", data.get("updated_at", _now_ms()))),
            built_at=data.get("builtAt", ""),
            is_checked=bool(data.get("isChecked", data.get("is_checked", True))),
            tags=list(data.get("tags", []) or []),
            files=[f for f in (data.get("files") or []) if isinstance(f, dict)],
            selected_sections=[str(x) for x in (data.get("selectedSections") or [])],
        )


@dataclass
class IndexJob:
    """색인 작업 한 건. 영속되므로 서버가 재시작돼도 이어서 돈다."""

    job_id: str
    deck_id: str
    project_id: str
    title: str
    source_paths: list[str]
    depth: str = "structural"
    language: str = "ko"
    profile: dict[str, Any] = field(default_factory=dict)
    status: JobStatus = "queued"
    stage: str = ""
    progress: float = 0.0
    error: str = ""
    attempts: int = 0
    created_at: int = field(default_factory=_now_ms)
    updated_at: int = field(default_factory=_now_ms)
    finished_at: int = 0
    usage: dict[str, Any] = field(default_factory=dict)

    @property
    def terminal(self) -> bool:
        return self.status in ("succeeded", "failed", "cancelled")

    def to_dict(self) -> dict[str, Any]:
        return {
            "jobId": self.job_id,
            "deckId": self.deck_id,
            "projectId": self.project_id,
            "title": self.title,
            "sourcePaths": self.source_paths,
            "depth": self.depth,
            "language": self.language,
            "profile": self.profile,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 4),
            "error": self.error,
            "attempts": self.attempts,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "finishedAt": self.finished_at,
            "usage": self.usage,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> IndexJob:
        return cls(
            job_id=data["jobId"],
            deck_id=data["deckId"],
            project_id=data.get("projectId", "default_project"),
            title=data.get("title", ""),
            source_paths=list(data.get("sourcePaths") or []),
            depth=data.get("depth", "structural"),
            language=data.get("language", "ko"),
            profile=dict(data.get("profile") or {}),
            status=data.get("status", "queued"),
            stage=data.get("stage", ""),
            progress=float(data.get("progress", 0.0)),
            error=data.get("error", ""),
            attempts=int(data.get("attempts", 0)),
            created_at=int(data.get("createdAt", _now_ms())),
            updated_at=int(data.get("updatedAt", _now_ms())),
            finished_at=int(data.get("finishedAt", 0)),
            usage=dict(data.get("usage") or {}),
        )
