"""레퍼런스 라이브러리 유스케이스 — 수집 → 해체(구조 추출 · 층위 측정) → 핀 → 프로젝트 연결.

이 서비스는 레퍼런스를 '읽기 전용 원료'로만 다룬다. 작업 문서에 무엇을 어떻게 옮길지는 Document 쪽 몫이다.
"""
from __future__ import annotations

import logging
import mimetypes
import uuid
from dataclasses import replace
from pathlib import PurePath
from typing import Any, Optional
from urllib.parse import urlparse

from app.core.storage import new_id

from ..errors import (
    ReferenceNotFoundError,
    ReferencePinNotFoundError,
    ReferenceValidationError,
    UnsupportedReferenceSourceError,
)
from ..models import (
    DEFAULT_LAYER_SET,
    PIN_KINDS,
    BindingEntry,
    ConsensusCard,
    ProjectBinding,
    ReferenceAnchor,
    ReferenceItem,
    ReferencePin,
    now_ms,
)
from ..ports import (
    HtmlExtractorPort,
    LayerAnalyzerPort,
    LayoutWebExtractorPort,
    PdfExtractorPort,
    ReferenceLibraryPort,
    WebFetcherPort,
)

logger = logging.getLogger(__name__)

REFERENCE_PREFIX = "ref"
_FILE_KINDS = {
    ".pdf": "pdf",
    ".html": "web",
    ".htm": "web",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
}
_MAX_FILE_BYTES = 80 * 1024 * 1024


def _guess_layer_set(extraction: dict[str, Any]) -> str:
    """사진이 글 덩어리에 견줄 만큼 많으면 시각 글(blog) 층위 세트로 잰다."""
    blocks = extraction.get("blocks") or []
    photos = int((extraction.get("stats") or {}).get("photos") or 0)
    texts = sum(1 for b in blocks if b.get("kind") in ("paragraph", "list"))
    return "blog" if photos >= 4 and photos * 3 >= max(1, texts) else DEFAULT_LAYER_SET


def _empty_extraction(kind: str) -> dict[str, Any]:
    return {"version": 1, "kind": kind, "pages": [{"page": 1, "width": 0, "height": 0}], "blocks": [], "outline": []}


class ReferenceLibraryService:
    def __init__(
        self,
        library: ReferenceLibraryPort,
        pdf_extractor: PdfExtractorPort,
        html_extractor: HtmlExtractorPort,
        fetcher: WebFetcherPort,
        analyzer: Optional[LayerAnalyzerPort] = None,
        layout_extractor: Optional[LayoutWebExtractorPort] = None,
    ) -> None:
        self.library = library
        self.pdf_extractor = pdf_extractor
        self.html_extractor = html_extractor
        self.fetcher = fetcher
        self.analyzer = analyzer
        #: 웹 주소는 먼저 브라우저 실측(사진 · 배치 보존)으로, 안 되면 정적 HTML 파서로
        self.layout_extractor = layout_extractor

    # --- 라이브러리 ------------------------------------------------------------------------------

    def list_items(self) -> list[ReferenceItem]:
        return self.library.list_items()

    def get(self, ref_id: str) -> ReferenceItem:
        item = self.library.get_item(ref_id)
        if item is None:
            raise ReferenceNotFoundError(f"레퍼런스 '{ref_id}' 가 라이브러리에 없습니다.")
        return item

    def add_file(self, filename: str, data: bytes, title: str = "") -> ReferenceItem:
        name = PurePath(filename or "").name
        ext = PurePath(name).suffix.lower()
        kind = _FILE_KINDS.get(ext)
        if kind is None:
            raise UnsupportedReferenceSourceError(
                f"레퍼런스는 PDF · HTML · 이미지 파일 하나씩만 받습니다 ('{name or '이름 없음'}'). "
                "폴더나 대량 자료는 Resource Manager 에 넣으세요."
            )
        if not data:
            raise UnsupportedReferenceSourceError("빈 파일입니다.")
        if len(data) > _MAX_FILE_BYTES:
            raise UnsupportedReferenceSourceError("파일이 너무 큽니다 (80MB 초과).")
        mime = "application/pdf" if kind == "pdf" else "text/html" if kind == "web" else (
            mimetypes.guess_type(name)[0] or "application/octet-stream")
        item = ReferenceItem(
            ref_id=new_id(REFERENCE_PREFIX), kind=kind,  # type: ignore[arg-type]
            title=(title or PurePath(name).stem or "레퍼런스").strip(),
            source_name=name, mime_type=mime, size_bytes=len(data),
        )
        self.library.write_source(item.ref_id, ext, data)
        return self._process(item, data, content_type=mime, explicit_title=bool(title))

    def add_url(self, url: str, title: str = "", layer_set: str = "") -> ReferenceItem:
        url = (url or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise UnsupportedReferenceSourceError("http(s) 주소 하나를 넣어 주세요.")
        item = ReferenceItem(
            ref_id=new_id(REFERENCE_PREFIX), kind="web", title=(title or parsed.netloc).strip(),
            source_url=url, mime_type="text/html", layer_set=(layer_set or "").strip() or DEFAULT_LAYER_SET,
        )
        return self._fetch_into(item, explicit_title=bool(title), auto_layer_set=not layer_set)

    def reanalyze(self, ref_id: str) -> ReferenceItem:
        item = self.get(ref_id)
        layout = self.library.load_artifact(ref_id, "layout")
        if item.kind == "web" and isinstance(layout, dict) and self.layout_extractor is not None:
            return self._finish(item, self.layout_extractor.from_layout(layout, item.source_url), explicit_title=True)
        source = self.library.read_source(ref_id)
        if source is None:
            if item.kind == "web" and item.source_url:
                # 가져오기에 실패했던 웹 레퍼런스 — 제목이 주소 기본값이면 글 제목으로 바꾼다
                return self._fetch_into(item, explicit_title=item.title != urlparse(item.source_url).netloc)
            raise ReferenceNotFoundError(f"레퍼런스 '{ref_id}' 의 원본이 없습니다.")
        data, _ = source
        return self._process(item, data, content_type=item.mime_type, explicit_title=True)

    def rename(self, ref_id: str, title: str) -> ReferenceItem:
        title = (title or "").strip()
        if not title:
            raise UnsupportedReferenceSourceError("제목이 비어 있습니다.")
        item = self.get(ref_id).touched(title=title)
        self.library.save_item(item)
        return item

    def delete(self, ref_id: str) -> None:
        self.get(ref_id)
        for binding in self.library.list_bindings():
            if binding.find(ref_id):
                self.library.save_binding(binding.with_entries(tuple(e for e in binding.entries if e.ref_id != ref_id)))
        self.library.delete_item(ref_id)

    def source(self, ref_id: str) -> tuple[bytes, str, str]:
        item = self.get(ref_id)
        found = self.library.read_source(ref_id)
        if found is None:
            raise ReferenceNotFoundError(f"레퍼런스 '{ref_id}' 의 원본이 없습니다.")
        data, filename = found
        return data, item.mime_type or "application/octet-stream", item.source_name or filename

    def extraction(self, ref_id: str) -> dict[str, Any]:
        item = self.get(ref_id)
        raw = self.library.load_artifact(ref_id, "extraction")
        return raw if isinstance(raw, dict) else {**_empty_extraction(item.kind), "refId": ref_id}

    def layers(self, ref_id: str) -> dict[str, Any]:
        item = self.get(ref_id)
        raw = self.library.load_artifact(ref_id, "layers")
        return raw if isinstance(raw, dict) else {"version": 1, "set": item.layer_set, "metrics": {}, "layers": []}

    # --- 핀 --------------------------------------------------------------------------------

    def list_pins(self, ref_id: str) -> list[ReferencePin]:
        self.get(ref_id)
        return self.library.load_pins(ref_id)

    def add_pin(self, ref_id: str, fields: dict[str, Any]) -> ReferencePin:
        item = self.get(ref_id)
        kind = str(fields.get("kind") or "region")
        if kind not in PIN_KINDS:
            raise UnsupportedReferenceSourceError(f"핀 종류는 {', '.join(PIN_KINDS)} 중 하나입니다.")
        if kind == "region" and not fields.get("bbox"):
            raise UnsupportedReferenceSourceError("영역 핀에는 bbox 가 필요합니다.")
        if kind == "text" and not str(fields.get("text") or "").strip():
            raise UnsupportedReferenceSourceError("텍스트 핀에는 text 가 필요합니다.")
        pins = self.library.load_pins(ref_id)
        pin = ReferencePin.from_dict({
            **fields,
            "pinId": f"pin_{uuid.uuid4().hex[:10]}",
            "refId": item.ref_id,
            "kind": kind,
            "label": str(fields.get("label") or self._default_label(kind, fields, len(pins))),
            "createdAt": now_ms(),
        })
        self.library.save_pins(ref_id, [*pins, pin])
        return pin

    def update_pin(self, ref_id: str, pin_id: str, fields: dict[str, Any]) -> ReferencePin:
        pins = self.list_pins(ref_id)
        current = next((p for p in pins if p.pin_id == pin_id), None)
        if current is None:
            raise ReferencePinNotFoundError(f"핀 '{pin_id}' 가 없습니다.")
        allowed = {k: v for k, v in fields.items() if k in ("label", "note", "layer", "text") and v is not None}
        updated = ReferencePin.from_dict({**current.to_dict(), **allowed})
        self.library.save_pins(ref_id, [updated if p.pin_id == pin_id else p for p in pins])
        return updated

    def delete_pin(self, ref_id: str, pin_id: str) -> None:
        pins = self.list_pins(ref_id)
        if not any(p.pin_id == pin_id for p in pins):
            raise ReferencePinNotFoundError(f"핀 '{pin_id}' 가 없습니다.")
        self.library.save_pins(ref_id, [p for p in pins if p.pin_id != pin_id])

    # --- 프로젝트 연결 -------------------------------------------------------------------------

    def binding(self, project_id: str) -> ProjectBinding:
        binding = self.library.load_binding(project_id)
        live = tuple(e for e in binding.entries if self.library.get_item(e.ref_id) is not None)
        return binding if live == binding.entries else binding.with_entries(live)

    def bind(self, project_id: str, ref_id: str) -> ProjectBinding:
        self.get(ref_id)
        binding = self.binding(project_id)
        if binding.find(ref_id):
            return binding
        updated = binding.with_entries((*binding.entries, BindingEntry(ref_id)))
        self.library.save_binding(updated)
        return updated

    def unbind(self, project_id: str, ref_id: str) -> ProjectBinding:
        binding = self.binding(project_id)
        updated = binding.with_entries(tuple(e for e in binding.entries if e.ref_id != ref_id))
        self.library.save_binding(updated)
        return updated

    def update_binding(
        self, project_id: str, ref_id: str, *, enabled: Optional[bool] = None, layers: Optional[dict[str, bool]] = None
    ) -> ProjectBinding:
        binding = self.binding(project_id)
        entry = binding.find(ref_id)
        if entry is None:
            raise ReferenceNotFoundError(f"프로젝트 '{project_id}' 에 연결된 레퍼런스 '{ref_id}' 가 없습니다.")
        new_entry = replace(
            entry,
            enabled=entry.enabled if enabled is None else bool(enabled),
            layers={**entry.layers, **{str(k): bool(v) for k, v in (layers or {}).items()}},
        )
        updated = binding.with_entries(tuple(new_entry if e.ref_id == ref_id else e for e in binding.entries))
        self.library.save_binding(updated)
        return updated

    # --- 합의된 해석 (조율 결과) --------------------------------------------------------------------

    def consensus(self, project_id: str, ref_id: str) -> list[ConsensusCard]:
        return list(self._entry(project_id, ref_id).consensus)

    def confirm_card(self, project_id: str, ref_id: str, fields: dict[str, Any], by: str = "user") -> ConsensusCard:
        """AI 가 낸 해석 카드(또는 사용자가 쓴 카드)를 확정해 저장한다. 같은 cardId 면 덮어쓴다."""
        entry = self._entry(project_id, ref_id)
        raw = {**fields, "status": "confirmed", "by": by, "at": now_ms()}
        raw["cardId"] = str(raw.get("cardId") or f"card_{uuid.uuid4().hex[:10]}")
        card = ConsensusCard.from_dict(raw)
        self._validate_card(ref_id, card)
        cards = [c for c in entry.consensus if c.card_id != card.card_id] + [card]
        self._save_entry(project_id, replace(entry, consensus=tuple(cards)))
        return card

    def update_card(self, project_id: str, ref_id: str, card_id: str, fields: dict[str, Any]) -> ConsensusCard:
        """채택 강도 · 해석 문장 · 범위를 고치거나, 대안 해석(`chooseAlternative`: 번호)을 본 해석으로 올린다."""
        entry = self._entry(project_id, ref_id)
        card = next((c for c in entry.consensus if c.card_id == card_id), None)
        if card is None:
            raise ReferenceNotFoundError(f"해석 카드 '{card_id}' 가 없습니다.")
        raw = card.to_dict()
        choose = fields.get("chooseAlternative")
        if choose is not None:
            alts = list(raw["alternatives"])
            idx = int(choose)
            if not 0 <= idx < len(alts):
                raise ReferenceValidationError(f"대안 해석 번호 {idx} 가 없습니다.")
            picked = alts.pop(idx)
            alts.insert(0, {"reading": raw["reading"], "evidence": raw["evidence"]})
            raw.update(reading=str(picked.get("reading") or ""), evidence=list(picked.get("evidence") or raw["evidence"]),
                       alternatives=alts)
        for key in ("adoption", "reading", "scope", "layer", "evidence"):
            if fields.get(key) is not None:
                raw[key] = fields[key]
        raw.update(at=now_ms(), by="user")
        updated = ConsensusCard.from_dict(raw)
        self._validate_card(ref_id, updated)
        cards = tuple(updated if c.card_id == card_id else c for c in entry.consensus)
        self._save_entry(project_id, replace(entry, consensus=cards))
        return updated

    def delete_card(self, project_id: str, ref_id: str, card_id: str) -> None:
        entry = self._entry(project_id, ref_id)
        self._save_entry(project_id, replace(entry, consensus=tuple(c for c in entry.consensus if c.card_id != card_id)))

    def _entry(self, project_id: str, ref_id: str) -> BindingEntry:
        entry = self.binding(project_id).find(ref_id)
        if entry is None:
            raise ReferenceNotFoundError(f"프로젝트 '{project_id}' 에 연결된 레퍼런스 '{ref_id}' 가 없습니다.")
        return entry

    def _save_entry(self, project_id: str, new_entry: BindingEntry) -> None:
        binding = self.binding(project_id)
        entries = tuple(new_entry if e.ref_id == new_entry.ref_id else e for e in binding.entries)
        self.library.save_binding(binding.with_entries(entries))

    @staticmethod
    def _validate_card(ref_id: str, card: ConsensusCard) -> None:
        if not card.layer:
            raise ReferenceValidationError("해석 카드에 층위(layer)가 없습니다.")
        scope = ReferenceAnchor.parse(card.scope or f"ref:{ref_id}")
        if scope.ref_id != ref_id:
            raise ReferenceValidationError(f"카드 범위 {card.scope} 가 레퍼런스 {ref_id} 밖입니다.")

    def resolve_anchor(self, anchor: str) -> dict[str, Any]:
        parsed = ReferenceAnchor.parse(anchor)
        item = self.get(parsed.ref_id)
        out: dict[str, Any] = {"anchor": parsed.render(), "refId": item.ref_id, "title": item.title,
                               "page": parsed.page, "bbox": None, "text": "", "pin": None, "block": None}
        if parsed.pin_id:
            pin = next((p for p in self.library.load_pins(item.ref_id) if p.pin_id == parsed.pin_id), None)
            if pin is None:
                raise ReferencePinNotFoundError(f"핀 '{parsed.pin_id}' 가 없습니다.")
            out.update(page=pin.page or parsed.page, bbox=list(pin.bbox) if pin.bbox else None, text=pin.text,
                       pin=pin.to_dict())
        if parsed.block_id:
            block = next((b for b in self.extraction(item.ref_id).get("blocks") or [] if b.get("id") == parsed.block_id), None)
            if block is not None:
                out.update(page=block.get("page") or out["page"], bbox=block.get("bbox") or out["bbox"],
                           text=out["text"] or block.get("text", ""), block=block)
        return out

    # --- 내부 --------------------------------------------------------------------------------

    def _process(self, item: ReferenceItem, data: bytes, *, content_type: str, explicit_title: bool) -> ReferenceItem:
        """원본 → 구조 추출 → 층위 측정. 실패해도 항목과 원본은 남긴다 (보기 · 핀은 된다)."""
        try:
            if item.kind == "pdf":
                extraction = self.pdf_extractor.extract(data)
            elif item.kind == "web":
                extraction = self.html_extractor.extract(data, item.source_url, content_type)
            else:
                extraction = _empty_extraction("image")
        except Exception as exc:  # noqa: BLE001
            logger.warning("[reference] %s 해체 실패: %s", item.ref_id, exc)
            done = item.touched(status="failed", error=f"구조 추출 실패: {exc}"[:300])
            self.library.save_item(done)
            return done
        return self._finish(item, extraction, explicit_title=explicit_title)

    def _finish(self, item: ReferenceItem, extraction: dict[str, Any], *, explicit_title: bool) -> ReferenceItem:
        """덩어리 목록 저장 → 층위 측정 → 항목 갱신."""
        try:
            extraction["refId"] = item.ref_id
            self.library.save_artifact(item.ref_id, "extraction", extraction)
            layer_set = item.layer_set or DEFAULT_LAYER_SET
            if self.analyzer is not None and extraction.get("blocks"):
                self.library.save_artifact(item.ref_id, "layers", self.analyzer.analyze(extraction, layer_set))
            title = item.title
            article_title = str((extraction.get("article") or {}).get("title") or "").strip()
            if not explicit_title and article_title:
                title = article_title[:120]
            done = item.touched(status="ready", error="", title=title, layer_set=layer_set,
                                page_count=len(extraction.get("pages") or []) or 1)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[reference] %s 측정 실패: %s", item.ref_id, exc)
            done = item.touched(status="failed", error=f"구조 추출 실패: {exc}"[:300])
        self.library.save_item(done)
        return done

    def _fetch_into(self, item: ReferenceItem, *, explicit_title: bool, auto_layer_set: bool = False) -> ReferenceItem:
        """웹 주소를 가져와 같은 refId 에 원본으로 둔다. 실패해도 항목은 남겨 다시 시도할 수 있게 한다.

        브라우저 실측 추출기가 있으면 먼저 쓴다 (사진 · 사진 묶음 · 링크 카드 · 구분선까지 덩어리로 남고, 레이아웃
        `.vdoc` 를 `layout` 산출물로 보관한다). 원문 HTML 은 보기용으로만 따로 받아 둔다 (실패해도 계속).
        """
        if self.layout_extractor is not None and not item.source_url.lower().endswith(".pdf"):
            try:
                extraction, layout = self.layout_extractor.extract(item.source_url)
            except Exception as exc:  # noqa: BLE001 — 실측이 안 되면 정적 파서로 내려간다
                logger.warning("[reference] %s 레이아웃 실측 실패 → 정적 파서: %s", item.ref_id, exc)
            else:
                if extraction.get("blocks"):
                    self.library.save_artifact(item.ref_id, "layout", layout)
                    try:
                        data, _ = self.fetcher.fetch(item.source_url)
                        self.library.write_source(item.ref_id, ".html", data)
                        item = replace(item, size_bytes=len(data))
                    except Exception:  # noqa: BLE001
                        pass
                    if auto_layer_set:
                        item = replace(item, layer_set=_guess_layer_set(extraction))
                    return self._finish(item, extraction, explicit_title=explicit_title)
        try:
            data, content_type = self.fetcher.fetch(item.source_url)
        except Exception as exc:  # noqa: BLE001
            failed = item.touched(status="failed", error=f"가져오기 실패: {exc}"[:300])
            self.library.save_item(failed)
            return failed
        is_pdf = "pdf" in content_type.lower() or data[:5] == b"%PDF-"
        self.library.write_source(item.ref_id, ".pdf" if is_pdf else ".html", data)
        item = replace(item, kind="pdf" if is_pdf else "web",
                       mime_type="application/pdf" if is_pdf else "text/html", size_bytes=len(data))
        return self._process(item, data, content_type=content_type, explicit_title=explicit_title)

    @staticmethod
    def _default_label(kind: str, fields: dict[str, Any], count: int) -> str:
        page = fields.get("page")
        where = f"{page}p" if page else ""
        if kind == "text":
            text = " ".join(str(fields.get("text") or "").split())
            return f"{where}: {text[:24]}{'…' if len(text) > 24 else ''}".strip(": ")
        if kind == "memo":
            return f"메모 {count + 1}"
        return f"{where} 영역 {count + 1}".strip()
