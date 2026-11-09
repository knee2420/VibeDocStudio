"""reference 도메인 모델.

저장 구조 (`data/knowledge/references/`)::

    items/<refId>/ref.json          메타 (종류 · 제목 · 출처 · 상태)
    items/<refId>/source.<ext>      원본 (pdf · html · png …) — 그대로 보관한다
    items/<refId>/extraction.json   구조 추출 결과 (읽기 전용 분석 재료)
    items/<refId>/layers.json       층위 측정 (D1–D6 …)
    items/<refId>/pins.json         핀
    bindings/<projectId>.json       프로젝트 연결 (레퍼런스별 사용 여부 · 층위 on/off)

`extraction.json` 형식 (레퍼런스 전용 — vdoc 과 무관)::

    {
      "version": 1, "refId": "...", "kind": "pdf" | "web" | "image",
      "pages":   [{"page": 1, "width": 595.0, "height": 842.0}],
      "blocks":  [{"id": "b1", "page": 1, "kind": "heading" | "paragraph" | "list" | "table",
                   "level": 1, "text": "...", "html": "<h1>...</h1>", "bbox": [y0, x0, y1, x1] | null}],
      "outline": [{"blockId": "b1", "title": "...", "level": 1, "page": 1}],
      "article": {"title": "...", "siteName": "...", "html": "...", "text": "..."}   # 웹만
    }

좌표(bbox)는 핀과 같은 규약: 쪽 크기를 1000 으로 둔 `[ymin, xmin, ymax, xmax]`.

앵커는 문자열 하나로 쓴다: `ref:<refId>[#p<쪽>][#pin:<pinId>][#blk:<blockId>]`.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field, replace
from typing import Any, Literal, Optional

ReferenceKind = Literal["pdf", "web", "image"]
ReferenceStatus = Literal["ready", "failed"]
PinKind = Literal["region", "text", "memo"]

REFERENCE_KINDS: tuple[str, ...] = ("pdf", "web", "image")
PIN_KINDS: tuple[str, ...] = ("region", "text", "memo")
DEFAULT_LAYER_SET = "document"


def now_ms() -> int:
    return int(time.time() * 1000)


def _bbox(raw: Any) -> Optional[tuple[int, int, int, int]]:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        values = tuple(max(0, min(1000, int(round(float(v))))) for v in raw)
    except (TypeError, ValueError):
        return None
    return values  # type: ignore[return-value]


@dataclass(frozen=True)
class ReferenceItem:
    """라이브러리에 있는 레퍼런스 하나. 프로젝트에 묶이지 않는다."""

    ref_id: str
    kind: ReferenceKind
    title: str
    source_name: str = ""  # 업로드 파일 이름 (웹이면 빈 값)
    source_url: str = ""  # 웹 주소 (파일이면 빈 값)
    mime_type: str = ""
    size_bytes: int = 0
    page_count: int = 0
    layer_set: str = DEFAULT_LAYER_SET
    status: ReferenceStatus = "ready"
    error: str = ""
    created_at: int = field(default_factory=now_ms)
    updated_at: int = field(default_factory=now_ms)

    def touched(self, **changes: Any) -> "ReferenceItem":
        return replace(self, updated_at=now_ms(), **changes)

    def to_dict(self) -> dict[str, Any]:
        return {
            "refId": self.ref_id,
            "kind": self.kind,
            "title": self.title,
            "sourceName": self.source_name,
            "sourceUrl": self.source_url,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "pageCount": self.page_count,
            "layerSet": self.layer_set,
            "status": self.status,
            "error": self.error,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ReferenceItem":
        kind = str(raw.get("kind") or "pdf")
        status = str(raw.get("status") or "ready")
        return cls(
            ref_id=str(raw["refId"]),
            kind=kind if kind in REFERENCE_KINDS else "pdf",  # type: ignore[arg-type]
            title=str(raw.get("title") or raw["refId"]),
            source_name=str(raw.get("sourceName") or ""),
            source_url=str(raw.get("sourceUrl") or ""),
            mime_type=str(raw.get("mimeType") or ""),
            size_bytes=int(raw.get("sizeBytes") or 0),
            page_count=int(raw.get("pageCount") or 0),
            layer_set=str(raw.get("layerSet") or DEFAULT_LAYER_SET),
            status=status if status in ("ready", "failed") else "ready",  # type: ignore[arg-type]
            error=str(raw.get("error") or ""),
            created_at=int(raw.get("createdAt") or 0),
            updated_at=int(raw.get("updatedAt") or 0),
        )


@dataclass(frozen=True)
class ReferencePin:
    """원본 위의 한 곳 — "이 부분의 결정을 가져오고 싶다" 는 표시."""

    pin_id: str
    ref_id: str
    kind: PinKind
    page: Optional[int] = None
    bbox: Optional[tuple[int, int, int, int]] = None
    text: str = ""  # 영역 · 문장의 글자 (발췌)
    label: str = ""
    note: str = ""
    layer: str = ""  # 층위 태그 (D1 …) — 비우면 층위를 정하지 않은 핀
    created_at: int = field(default_factory=now_ms)

    @property
    def anchor(self) -> str:
        return f"ref:{self.ref_id}#pin:{self.pin_id}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "pinId": self.pin_id,
            "refId": self.ref_id,
            "kind": self.kind,
            "page": self.page,
            "bbox": list(self.bbox) if self.bbox else None,
            "text": self.text,
            "label": self.label,
            "note": self.note,
            "layer": self.layer,
            "anchor": self.anchor,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ReferencePin":
        kind = str(raw.get("kind") or "region")
        page = raw.get("page")
        return cls(
            pin_id=str(raw["pinId"]),
            ref_id=str(raw["refId"]),
            kind=kind if kind in PIN_KINDS else "region",  # type: ignore[arg-type]
            page=int(page) if isinstance(page, (int, float)) and page > 0 else None,
            bbox=_bbox(raw.get("bbox")),
            text=str(raw.get("text") or ""),
            label=str(raw.get("label") or ""),
            note=str(raw.get("note") or ""),
            layer=str(raw.get("layer") or ""),
            created_at=int(raw.get("createdAt") or 0),
        )


@dataclass(frozen=True)
class BindingEntry:
    """프로젝트에 연결된 레퍼런스 하나. `layers` 에 없는 층위는 켜진 것으로 본다."""

    ref_id: str
    enabled: bool = True
    layers: dict[str, bool] = field(default_factory=dict)

    def layer_on(self, layer_id: str) -> bool:
        return self.layers.get(layer_id, True)

    def to_dict(self) -> dict[str, Any]:
        return {"refId": self.ref_id, "enabled": self.enabled, "layers": dict(self.layers)}

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "BindingEntry":
        layers = raw.get("layers") or {}
        return cls(
            ref_id=str(raw["refId"]),
            enabled=bool(raw.get("enabled", True)),
            layers={str(k): bool(v) for k, v in layers.items()} if isinstance(layers, dict) else {},
        )


@dataclass(frozen=True)
class ProjectBinding:
    """프로젝트 하나의 레퍼런스 연결 목록 (순서 = 화면의 참조 번호)."""

    project_id: str
    entries: tuple[BindingEntry, ...] = ()
    updated_at: int = field(default_factory=now_ms)

    def find(self, ref_id: str) -> Optional[BindingEntry]:
        return next((e for e in self.entries if e.ref_id == ref_id), None)

    def with_entries(self, entries: tuple[BindingEntry, ...]) -> "ProjectBinding":
        return replace(self, entries=entries, updated_at=now_ms())

    def to_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "entries": [e.to_dict() for e in self.entries],
            "updatedAt": self.updated_at,
        }

    @classmethod
    def from_dict(cls, project_id: str, raw: dict[str, Any] | None) -> "ProjectBinding":
        raw = raw or {}
        entries = tuple(
            BindingEntry.from_dict(e) for e in raw.get("entries") or [] if isinstance(e, dict) and e.get("refId")
        )
        return cls(project_id=project_id, entries=entries, updated_at=int(raw.get("updatedAt") or 0))


_ANCHOR = re.compile(r"^ref:(?P<ref>[^#\s]+)(?P<rest>(?:#[^#\s]+)*)$")


@dataclass(frozen=True)
class ReferenceAnchor:
    """`ref:<refId>[#p<쪽>][#pin:<pinId>][#blk:<blockId>]` 를 풀어 놓은 값."""

    ref_id: str
    page: Optional[int] = None
    pin_id: str = ""
    block_id: str = ""

    def render(self) -> str:
        out = f"ref:{self.ref_id}"
        if self.page:
            out += f"#p{self.page}"
        if self.pin_id:
            out += f"#pin:{self.pin_id}"
        if self.block_id:
            out += f"#blk:{self.block_id}"
        return out

    @classmethod
    def parse(cls, raw: str) -> "ReferenceAnchor":
        match = _ANCHOR.match((raw or "").strip())
        if not match:
            raise ValueError(f"레퍼런스 앵커 형식이 아닙니다: {raw!r} (ref:<refId>[#p<쪽>][#pin:<id>][#blk:<id>])")
        page, pin_id, block_id = None, "", ""
        for part in filter(None, match.group("rest").split("#")):
            if part.startswith("pin:"):
                pin_id = part[4:]
            elif part.startswith("blk:"):
                block_id = part[4:]
            elif re.fullmatch(r"p\d+", part):
                page = int(part[1:])
            else:
                raise ValueError(f"알 수 없는 앵커 조각 '#{part}'")
        return cls(match.group("ref"), page, pin_id, block_id)
