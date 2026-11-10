"""Auto-Index 산출물의 계약 (스키마 `kdeck/1`).

지식 덱은 세 층으로 이루어진다. 모든 층은 같은 앵커(원문 위치) 위에 선다.

    0층 Archive   원문을 LLM 이 읽기 좋은 크기로 자른 조각 파일 (`archive/…/NN_slug.md`)
                  — grep 은 여기를 훑고, 각 줄은 원문 줄 번호로 되돌아간다.
    1층 Card      조각 하나 = 카드 하나 (`C-SS-NN`). 요약 · 요소 표 · 밖으로(연결) · 원문 앵커.
    2층 Index     섹션(로컬) 인덱스 → 루트 인덱스(지도 · 라우팅 표 · 가로축).

카드 id 와 앵커는 **결정적**이다. 같은 원문 · 같은 설정이면 다시 색인해도 같은 id 가 나온다.
그래서 답변에 남긴 출처 링크가 재색인 뒤에도 살아 있고, 바뀐 조각만 다시 만들 수 있다.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional

SCHEMA_VERSION = "kdeck/1"
#: 카드 생성 프롬프트 · 결정적 추출 규칙이 바뀌면 올린다 (캐시 키에 들어간다).
CARD_RULES_VERSION = "cards/3"

Depth = Literal["structural", "enriched"]


@dataclass(frozen=True)
class Anchor:
    """원문 위치. `source` 는 덱 원본 루트 기준 상대 경로, 줄은 1부터 (끝 포함)."""

    source: str
    line_start: int
    line_end: int
    page: Optional[int] = None

    def label(self) -> str:
        if self.page is not None:
            return f"{self.source}#p{self.page}"
        return f"{self.source}#L{self.line_start}-L{self.line_end}"

    def to_dict(self) -> dict[str, Any]:
        return {"source": self.source, "lines": [self.line_start, self.line_end], "page": self.page}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Anchor":
        lines = data.get("lines") or [1, 1]
        return cls(source=data["source"], line_start=int(lines[0]), line_end=int(lines[1]), page=data.get("page"))


@dataclass(frozen=True)
class SourceDoc:
    """정규화된 원문 하나 (형식과 무관하게 줄 단위 텍스트 + 페이지 경계)."""

    doc_no: int
    rel_path: str
    kind: str  # markdown | text | code | html | pdf | data
    text: str
    sha: str
    #: PDF 처럼 페이지가 있는 원문: 각 페이지가 시작하는 줄 번호(1부터)
    page_starts: tuple[int, ...] = ()
    title: str = ""

    def page_of(self, line: int) -> Optional[int]:
        if not self.page_starts:
            return None
        page = 1
        for idx, start in enumerate(self.page_starts, start=1):
            if line >= start:
                page = idx
        return page


@dataclass
class Segment:
    """0층 조각. 원문의 연속 구간 하나."""

    segment_id: str  # S-<doc_no:03d>-<seq:03d>
    doc_no: int
    seq: int
    heading_path: list[str]
    anchor: Anchor
    text: str
    sha: str
    archive_path: str = ""  # 덱 루트 기준 상대 경로
    #: 아카이브 파일에서 본문이 시작하는 줄 (프론트매터 다음)
    archive_body_line: int = 1

    @property
    def title(self) -> str:
        return self.heading_path[-1] if self.heading_path else f"조각 {self.seq}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "segmentId": self.segment_id,
            "docNo": self.doc_no,
            "seq": self.seq,
            "headingPath": self.heading_path,
            "anchor": self.anchor.to_dict(),
            "sha": self.sha,
            "chars": len(self.text),
            "archivePath": self.archive_path,
            "archiveBodyLine": self.archive_body_line,
        }


@dataclass
class Element:
    """카드의 원자 요소 한 줄 — 이름 · 설명 · (있으면) 원문 줄."""

    name: str
    detail: str = ""
    line: Optional[int] = None
    origin: Literal["table", "figure", "definition", "list", "code", "heading", "llm"] = "list"

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v not in (None, "")}


AssetKind = Literal["table", "figure", "code"]


@dataclass
class Asset:
    """표 · 그림 · 코드 블록 — 본문 문장보다 놓치기 쉬운 요소라 따로 목록을 만든다.

    id: `T-SS-NN`(표) · `F-SS-NN`(그림) · `X-SS-NN`(코드). 루트 인덱스의 "자산 목록"과
    `knowledge.assets` 도구가 이 목록을 그대로 쓴다.
    """

    asset_id: str
    kind: AssetKind
    card_id: str
    caption: str
    #: 표: 헤더 줄 · 그림: 대체 텍스트 + 주변 문장 · 코드: 언어 + 첫 줄들
    summary: str
    anchor: Anchor
    #: 표의 열 이름 · 그림 파일 경로 · 코드 언어 등
    columns: list[str] = field(default_factory=list)
    rows: int = 0
    target: str = ""  # 그림 파일 경로 / URL
    #: 표의 첫 열 값들(행 이름) — "X 행의 값은?" 같은 질문을 색인만으로 좁힌다
    row_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "assetId": self.asset_id,
            "kind": self.kind,
            "cardId": self.card_id,
            "caption": self.caption,
            "summary": self.summary,
            "anchor": self.anchor.to_dict(),
            "columns": self.columns,
            "rows": self.rows,
            "target": self.target,
            "rowKeys": self.row_keys,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Asset":
        return cls(
            asset_id=data["assetId"],
            kind=data.get("kind", "table"),
            card_id=data.get("cardId", ""),
            caption=data.get("caption", ""),
            summary=data.get("summary", ""),
            anchor=Anchor.from_dict(data["anchor"]),
            columns=list(data.get("columns") or []),
            rows=int(data.get("rows", 0)),
            target=data.get("target", ""),
            row_keys=list(data.get("rowKeys") or []),
        )


@dataclass
class Card:
    card_id: str  # C-<section:02d>-<seq:02d>
    section_id: str  # SEC-<nn>
    segment_id: str
    title: str
    heading_path: list[str]
    summary: str
    elements: list[Element]
    keywords: list[str]
    questions: list[str]
    anchor: Anchor
    archive_path: str
    links_out: list[str] = field(default_factory=list)
    #: 같은 것을 가리키는 다른 표현 (약어 · 한국어 표기 · 흔한 오기) — 대충 물어도 찾게 한다
    aliases: list[str] = field(default_factory=list)
    asset_ids: list[str] = field(default_factory=list)
    #: structural(결정적 추출만) | enriched(LLM 보강)
    depth: Depth = "structural"
    #: LLM 이 낸 요소 중 원문에서 확인되지 않아 버린 수 (품질 게이트)
    dropped_elements: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "cardId": self.card_id,
            "sectionId": self.section_id,
            "segmentId": self.segment_id,
            "title": self.title,
            "headingPath": self.heading_path,
            "summary": self.summary,
            "elements": [e.to_dict() for e in self.elements],
            "keywords": self.keywords,
            "questions": self.questions,
            "aliases": self.aliases,
            "assetIds": self.asset_ids,
            "anchor": self.anchor.to_dict(),
            "archivePath": self.archive_path,
            "linksOut": self.links_out,
            "depth": self.depth,
            "droppedElements": self.dropped_elements,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Card":
        return cls(
            card_id=data["cardId"],
            section_id=data["sectionId"],
            segment_id=data["segmentId"],
            title=data.get("title", ""),
            heading_path=list(data.get("headingPath") or []),
            summary=data.get("summary", ""),
            elements=[Element(**_element_kwargs(e)) for e in data.get("elements") or []],
            keywords=list(data.get("keywords") or []),
            questions=list(data.get("questions") or []),
            aliases=list(data.get("aliases") or []),
            asset_ids=list(data.get("assetIds") or []),
            anchor=Anchor.from_dict(data["anchor"]),
            archive_path=data.get("archivePath", ""),
            links_out=list(data.get("linksOut") or []),
            depth=data.get("depth", "structural"),
            dropped_elements=int(data.get("droppedElements", 0)),
        )


def _element_kwargs(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": data.get("name", ""),
        "detail": data.get("detail", ""),
        "line": data.get("line"),
        "origin": data.get("origin", "list"),
    }


@dataclass
class Section:
    section_id: str
    title: str
    source: str
    card_ids: list[str]
    description: str = ""
    keywords: list[str] = field(default_factory=list)
    #: 같은 키워드를 공유하는 다른 섹션 (가로축)
    related: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sectionId": self.section_id,
            "title": self.title,
            "source": self.source,
            "cardIds": self.card_ids,
            "description": self.description,
            "keywords": self.keywords,
            "related": self.related,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Section":
        return cls(
            section_id=data["sectionId"],
            title=data.get("title", ""),
            source=data.get("source", ""),
            card_ids=list(data.get("cardIds") or []),
            description=data.get("description", ""),
            keywords=list(data.get("keywords") or []),
            related=list(data.get("related") or []),
        )


@dataclass(frozen=True)
class ScopeProfile:
    """무엇을 색인할지 (dify 에서 `api/core` 만 고른 것 같은 선별을 선언으로)."""

    include: tuple[str, ...] = ()
    exclude: tuple[str, ...] = ()
    max_file_bytes: int = 4 * 1024 * 1024
    #: 조각 크기 경계 (문자 수)
    min_segment_chars: int = 500
    max_segment_chars: int = 3200

    def to_dict(self) -> dict[str, Any]:
        return {
            "include": list(self.include),
            "exclude": list(self.exclude),
            "maxFileBytes": self.max_file_bytes,
            "minSegmentChars": self.min_segment_chars,
            "maxSegmentChars": self.max_segment_chars,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ScopeProfile":
        data = data or {}
        return cls(
            include=tuple(data.get("include") or ()),
            exclude=tuple(data.get("exclude") or ()),
            max_file_bytes=int(data.get("maxFileBytes") or 4 * 1024 * 1024),
            min_segment_chars=int(data.get("minSegmentChars") or 500),
            max_segment_chars=int(data.get("maxSegmentChars") or 3200),
        )


#: LLM 카드 보강의 출력 계약 (`--json-schema` 로 강제하고, 받은 뒤에도 다시 검증한다).
CARD_BATCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "segmentId": {"type": "string"},
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "elements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"name": {"type": "string"}, "detail": {"type": "string"}},
                            "required": ["name", "detail"],
                        },
                    },
                    "keywords": {"type": "array", "items": {"type": "string"}},
                    "aliases": {"type": "array", "items": {"type": "string"}},
                    "questions": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["segmentId", "summary", "elements", "keywords"],
            },
        }
    },
    "required": ["cards"],
}
