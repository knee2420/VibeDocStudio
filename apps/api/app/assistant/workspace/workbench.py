"""작업대(Workbench) — 에디터 문서 · 레퍼런스 · 이력을 agy 가 직접 읽는 읽기 전용 모델 (표준 라이브러리만).

출처 넷의 역할 (역할 계약):
  editor     지금 쓰는 문서 — 고칠 대상. 범위(scope) 안만 고칠 수 있다.
  reference  남이 비슷한 문제를 풀며 내린 결정의 궤적 — 층위별 '패턴'만 가져온다. 사실 근거가 아니다.
  resource   원천 자료 (vibefs · read_file) — 사실 · 내용의 근거.
  history    이 문서의 과거 판 (revisions.jsonl · 슬롯 originalContent) — "원래대로 · 무엇이 바뀌었나".

모든 위치는 앵커 문자열 하나로 가리킨다:
  slot:<slotId> · block:<blockId> · page:<pageId|번호> · doc
  ref:<refId>[#p<쪽>|#pin:<pinId>|#blk:<blockId>]   (레퍼런스 라이브러리 — vdoc 이 아니다)
  rev:<번호>[#slot:<slotId>] · orig:<slotId>
"""
from __future__ import annotations

import html as html_lib
import json
import os
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any, Iterable, Optional


# --- HTML → 구조 보존 텍스트 ------------------------------------------------------------------

class _TextHtml(HTMLParser):
    """제목(#) · 목록(-) · 굵게(**) · 표 칸(|) · 인용(>) 을 남기는 간단한 변환기."""

    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote", "section", "article"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.line: list[str] = []
        self.prefix = ""

    def _flush(self) -> None:
        text = "".join(self.line).strip()
        if text:
            self.out.append(self.prefix + text)
        self.line = []
        self.prefix = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in self.BLOCK:
            self._flush()
            if tag.startswith("h") and len(tag) == 2:
                self.prefix = "#" * int(tag[1]) + " "
            elif tag == "li":
                self.prefix = "- "
            elif tag == "blockquote":
                self.prefix = "> "
        elif tag == "br":
            self._flush()
        elif tag in ("strong", "b"):
            self.line.append("**")
        elif tag in ("td", "th"):
            if self.line:
                self.line.append(" | ")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("strong", "b"):
            self.line.append("**")
        elif tag in self.BLOCK:
            self._flush()

    def handle_data(self, data: str) -> None:
        self.line.append(data)

    def text(self) -> str:
        self._flush()
        return "\n".join(self.out)


def html_to_text(content: str) -> str:
    if not content:
        return ""
    if "<" not in content:
        return html_lib.unescape(content).strip()
    parser = _TextHtml()
    try:
        parser.feed(content)
        parser.close()
    except Exception:  # 깨진 HTML 이라도 글자는 돌려준다
        return re.sub(r"<[^>]+>", " ", content)
    return re.sub(r"\*\*\s*\*\*", "", parser.text())


def plain(content: str) -> str:
    """굵게 표시까지 뺀 순수 글자 (비교 · 검증용)."""
    return re.sub(r"\s+", " ", html_to_text(content).replace("**", "")).strip()


# --- vdoc 문서 -----------------------------------------------------------------------------------

def _collect_slot_ids(node: Any, out: list[str]) -> None:
    if isinstance(node, dict):
        sid = node.get("slotId")
        if isinstance(sid, str) and sid not in out:
            out.append(sid)
        for value in node.values():
            if isinstance(value, (dict, list)):
                _collect_slot_ids(value, out)
    elif isinstance(node, list):
        for value in node:
            _collect_slot_ids(value, out)


@dataclass
class SlotPlace:
    slot_id: str
    page_id: str
    page_no: int
    page_label: str
    block_id: str
    block_kind: str
    block_title: str


@dataclass
class VDoc:
    doc_id: str
    path: str
    data: dict[str, Any]
    places: dict[str, SlotPlace] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)

    @classmethod
    def load(cls, path: str, doc_id: str = "") -> "VDoc":
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        doc = cls(doc_id or str(data.get("docId") or os.path.basename(os.path.dirname(path))), path, data)
        for idx, page in enumerate(data.get("pages") or []):
            for block in page.get("blocks") or []:
                ids: list[str] = []
                _collect_slot_ids(block, ids)
                for sid in ids:
                    if sid in doc.places:
                        continue
                    doc.places[sid] = SlotPlace(
                        sid, str(page.get("pageId") or f"page{idx + 1}"), idx + 1, str(page.get("pageLabel") or ""),
                        str(block.get("blockId") or ""), str(block.get("kind") or ""), str(block.get("title") or ""),
                    )
                    doc.order.append(sid)
        # 페이지 밖 칸 (머리글 등) 은 뒤에 붙인다
        for sid in (data.get("slots") or {}):
            if sid not in doc.places:
                doc.order.append(sid)
        return doc

    @property
    def title(self) -> str:
        return str(self.data.get("title") or self.doc_id)

    @property
    def slots(self) -> dict[str, dict[str, Any]]:
        return self.data.get("slots") or {}

    @property
    def pages(self) -> list[dict[str, Any]]:
        return self.data.get("pages") or []

    def page_of(self, ref: str) -> Optional[dict[str, Any]]:
        ref = str(ref).strip()
        for idx, page in enumerate(self.pages):
            if ref in (str(page.get("pageId")), str(idx + 1), f"p{idx + 1}"):
                return page
        return None

    def page_no(self, page: dict[str, Any]) -> int:
        return self.pages.index(page) + 1

    def slots_of_page(self, page: dict[str, Any]) -> list[str]:
        pid = str(page.get("pageId"))
        return [sid for sid in self.order if sid in self.places and self.places[sid].page_id == pid]

    def slots_of_block(self, block_id: str) -> list[str]:
        return [sid for sid in self.order if sid in self.places and self.places[sid].block_id == block_id]

    def evidence_for(self, slot_id: str) -> list[dict[str, Any]]:
        links = self.data.get("evidenceLinks") or []
        if isinstance(links, dict):
            links = list(links.values())
        out = [l for l in links if isinstance(l, dict) and l.get("slotId") == slot_id and l.get("status") != "missing"]
        slot = self.slots.get(slot_id) or {}
        out += [{"source": "backdata", "refId": ref} for ref in slot.get("backDataRefs") or []]
        return out

    def flags(self, slot_id: str) -> dict[str, Any]:
        slot = self.slots.get(slot_id) or {}
        text = plain(str(slot.get("content") or ""))
        cons = slot.get("constraints") or {}
        max_chars = cons.get("maxChars") or cons.get("maxLength")
        role = str(slot.get("role") or "")
        fill = slot.get("fill") or {}
        return {
            "chars": len(text),
            "empty": not text,
            "maxChars": max_chars,
            "over": bool(max_chars) and len(text) > int(max_chars),
            "evidence": len(self.evidence_for(slot_id)),
            "locked": role in ("boilerplate", "locked") or bool(cons.get("locked")),
            "edited": bool(slot.get("isEdited")),
            "ai": fill.get("author") == "ai",
            "hasOriginal": bool(slot.get("originalContent")),
        }

    def slot_text(self, slot_id: str) -> str:
        return html_to_text(str((self.slots.get(slot_id) or {}).get("content") or ""))


def _flag_marks(f: dict[str, Any]) -> str:
    marks = []
    if f["locked"]:
        marks.append("고정")
    if f["empty"]:
        marks.append("빈칸")
    if f["over"]:
        marks.append(f"분량초과 {f['chars']}/{f['maxChars']}")
    elif f["maxChars"]:
        marks.append(f"{f['chars']}/{f['maxChars']}자")
    if not f["empty"] and not f["locked"] and f["evidence"] == 0:
        marks.append("근거없음")
    if f["ai"]:
        marks.append("AI작성")
    if f["edited"] or f["hasOriginal"]:
        marks.append("수정됨(원본 있음)" if f["hasOriginal"] else "수정됨")
    return " · ".join(marks)


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


# --- 작업대 상태 --------------------------------------------------------------------------------

@dataclass
class RefBook:
    """레퍼런스 라이브러리의 한 항목 (`data/knowledge/references/items/<refId>/`) — vdoc 이 아니다.

    `extraction.json` 의 덩어리(제목 · 문단 · 목록 · 표)와 `pins.json` 의 핀을 읽는다.
    """

    ref_id: str
    title: str
    kind: str
    page_count: int
    blocks: list[dict[str, Any]]
    outline_items: list[dict[str, Any]]
    pins: list[dict[str, Any]]
    layers: dict[str, bool]

    @classmethod
    def load(cls, folder: str, ref_id: str = "", pin_ids: Optional[Iterable[str]] = None,
             layers: Optional[dict[str, Any]] = None) -> "RefBook":
        def read(name: str, default: Any) -> Any:
            try:
                with open(os.path.join(folder, name), "r", encoding="utf-8") as fh:
                    return json.load(fh)
            except (OSError, ValueError):
                return default

        meta = read("ref.json", None)
        if not isinstance(meta, dict):
            raise ValueError(f"레퍼런스 메타가 없습니다: {folder}")
        extraction = read("extraction.json", {}) or {}
        pins = [p for p in read("pins.json", []) or [] if isinstance(p, dict)]
        if pin_ids is not None:  # None = 핀 전부 · 목록 = 고른 핀만 (빈 목록이면 핀 없음)
            wanted = {str(x) for x in pin_ids}
            pins = [p for p in pins if str(p.get("pinId")) in wanted]
        return cls(
            ref_id=ref_id or str(meta.get("refId") or os.path.basename(folder)),
            title=str(meta.get("title") or ref_id),
            kind=str(meta.get("kind") or ""),
            page_count=int(meta.get("pageCount") or len(extraction.get("pages") or []) or 1),
            blocks=[b for b in extraction.get("blocks") or [] if isinstance(b, dict)],
            outline_items=[o for o in extraction.get("outline") or [] if isinstance(o, dict)],
            pins=pins,
            layers={str(k): bool(v) for k, v in (layers or {}).items()},
        )

    def layer_on(self, layer_id: str) -> bool:
        return self.layers.get(layer_id, True)

    def block(self, block_id: str) -> Optional[dict[str, Any]]:
        return next((b for b in self.blocks if str(b.get("id")) == block_id), None)

    def blocks_of_page(self, page: int) -> list[dict[str, Any]]:
        return [b for b in self.blocks if int(b.get("page") or 1) == page]

    def block_kinds(self) -> list[str]:
        return sorted({str(b.get("kind")) for b in self.blocks if b.get("kind")})

    def htmls(self, blocks: Optional[Iterable[dict[str, Any]]] = None) -> list[str]:
        return [str(b.get("html") or "") for b in (self.blocks if blocks is None else blocks)]

    def text(self) -> str:
        return "\n".join(str(b.get("text") or "") for b in self.blocks)

    def pin(self, pin_id: str) -> Optional[dict[str, Any]]:
        return next((p for p in self.pins if str(p.get("pinId")) == pin_id), None)

    def pin_text(self, pin: dict[str, Any]) -> str:
        """핀의 글: 핀에 저장된 발췌가 있으면 그것, 없으면 그 쪽에서 영역과 겹치는 덩어리."""
        if pin.get("text"):
            return str(pin["text"])
        page = int(pin.get("page") or 1)
        bbox = pin.get("bbox") or [0, 0, 1000, 1000]
        texts = []
        for b in self.blocks_of_page(page):
            box = b.get("bbox")
            if box and (box[2] < bbox[0] or box[0] > bbox[2] or box[3] < bbox[1] or box[1] > bbox[3]):
                continue
            texts.append(str(b.get("text") or ""))
        return "\n".join(t for t in texts if t)


@dataclass
class Workbench:
    """세션 하나가 보고 있는 작업대: 문서 · 범위 · 레퍼런스(+핀) · 이력."""

    doc: Optional[VDoc]
    scope: dict[str, Any]
    refs: dict[str, RefBook]
    revisions: list[dict[str, Any]]
    selection: list[str]

    @classmethod
    def from_state(cls, state: Optional[dict[str, Any]]) -> "Workbench":
        state = state or {}
        doc = None
        doc_path = state.get("docPath")
        if doc_path and os.path.isfile(doc_path):
            try:
                doc = VDoc.load(doc_path, str(state.get("docId") or ""))
            except (OSError, ValueError):
                doc = None
        refs: dict[str, RefBook] = {}
        for ref in state.get("references") or []:
            folder = ref.get("dir")
            if not folder or not os.path.isdir(folder):
                continue
            try:
                book = RefBook.load(folder, str(ref.get("refId") or ""), ref.get("pinIds"), ref.get("layers"))
            except (OSError, ValueError):
                continue
            refs[book.ref_id] = book
        revisions: list[dict[str, Any]] = []
        if doc is not None:
            rev_path = os.path.join(os.path.dirname(doc.path), "revisions.jsonl")
            try:
                with open(rev_path, "r", encoding="utf-8") as fh:
                    for line in fh:
                        try:
                            revisions.append(json.loads(line))
                        except ValueError:
                            continue
            except OSError:
                pass
        return cls(doc, dict(state.get("scope") or {}), refs, revisions, list(state.get("selection") or []))

    # --- 범위 ---------------------------------------------------------------------------------

    def scope_slots(self) -> Optional[set[str]]:
        """고칠 수 있는 칸. None = 문서 전체."""
        if self.doc is None:
            return set()
        mode = self.scope.get("mode")
        if mode == "off":
            return set()
        if self.scope.get("slotIds"):
            return set(self.scope["slotIds"])
        if self.scope.get("pageIds"):
            out: set[str] = set()
            for pid in self.scope["pageIds"]:
                page = self.doc.page_of(pid)
                if page is not None:
                    out.update(self.doc.slots_of_page(page))
            return out
        return None

    def scope_label(self) -> str:
        if self.doc is None:
            return "문서 없음"
        return str(self.scope.get("label") or {"off": "문서 끔", "selection": "선택", "page": "페이지", "document": "문서 전체"}.get(
            str(self.scope.get("mode") or "document"), "문서 전체"))

    # --- 지도 ---------------------------------------------------------------------------------

    def overview(self, resource_line: str = "") -> str:
        rows = ["[작업대 지도 — 출처 넷과 역할]"]
        if self.doc is not None:
            d = self.doc
            stats = {"빈칸": 0, "근거없음": 0, "분량초과": 0}
            for sid in d.order:
                f = d.flags(sid)
                if f["locked"]:
                    continue
                stats["빈칸"] += f["empty"]
                stats["근거없음"] += (not f["empty"] and f["evidence"] == 0)
                stats["분량초과"] += f["over"]
            rows.append(f"✎ 에디터(고칠 대상): {d.title} (docId={d.doc_id}, rev {d.data.get('revision', '-')}) · "
                        f"{len(d.pages)}쪽 · 칸 {len(d.order)}개 · 범위: {self.scope_label()}")
            rows.append("   " + " · ".join(f"{k} {v}" for k, v in stats.items()))
            for idx, page in enumerate(d.pages):
                ids = d.slots_of_page(page)
                rows.append(f"   p{idx + 1} {page.get('pageLabel') or ''} (pageId={page.get('pageId')}) — 칸 {len(ids)}")
            if self.selection:
                rows.append(f"   선택된 칸: {', '.join(self.selection[:8])}")
        else:
            rows.append("✎ 에디터: 열린 문서 없음 (또는 범위 끔)")
        if self.refs:
            rows.append(f"📖 레퍼런스(패턴만 가져온다 · 사실 근거 아님): {len(self.refs)}개")
            for rid, ref in self.refs.items():
                pins = f" · 핀 {len(ref.pins)}개" if ref.pins else ""
                rows.append(f"   ref:{rid} — {ref.title} ({ref.kind} · {ref.page_count}쪽 · 덩어리 {len(ref.blocks)}){pins}")
                off = sorted(k for k, v in ref.layers.items() if not v)
                if off:
                    rows.append(f"      꺼 둔 층위: {', '.join(off)} — 이 층위는 따르지 않는다")
                for pin in ref.pins[:5]:
                    layer = f" [{pin.get('layer')}]" if pin.get("layer") else ""
                    rows.append(f"      핀 ref:{rid}#pin:{pin.get('pinId')}{layer} — {pin.get('label') or ''} (p{pin.get('page') or '?'})")
        else:
            rows.append("📖 레퍼런스: 없음")
        rows.append(f"📦 리소스(사실 근거): {resource_line or '마운트 없음'}")
        if self.doc is not None:
            originals = sum(1 for sid in self.doc.order if (self.doc.slots.get(sid) or {}).get("originalContent"))
            rows.append(f"🕘 이력: 개정 {len(self.revisions)}건 · 원본이 남은 칸 {originals}개 (wb_history · orig:<slotId>)")
        return "\n".join(rows)

    def outline(self, target: str = "doc", page: str = "") -> str:
        if target.startswith("ref:"):
            ref = self.refs.get(target[4:].split("#")[0])
            if ref is None:
                raise ValueError(f"레퍼런스 {target} 가 없습니다. wb_overview 의 ref: 목록을 쓰세요.")
            return self._outline_ref(ref, page)
        if self.doc is None:
            raise ValueError("열린 문서가 없습니다.")
        return self._outline_doc(self.doc, page, with_flags=True, prefix="slot:")

    def _outline_ref(self, ref: RefBook, page: str) -> str:
        rows = [f"[개요] 레퍼런스 {ref.title} (ref:{ref.ref_id})"]
        if ref.outline_items and not page:
            rows.append("목차: " + " › ".join(f"{'#' * int(o.get('level') or 1)} {o.get('title')}" for o in ref.outline_items[:30]))
        wanted = int(page.lstrip("p")) if page and page.lstrip("p").isdigit() else None
        last_page = None
        for b in ref.blocks:
            pno = int(b.get("page") or 1)
            if wanted is not None and pno != wanted:
                continue
            if pno != last_page:
                rows.append(f"# p{pno}")
                last_page = pno
            rows.append(f"  ref:{ref.ref_id}#blk:{b.get('id')} ({b.get('kind')}) — {_clip(str(b.get('text') or ''), 70)}")
        if last_page is None:
            rows.append("(추출된 글이 없습니다 — 이미지 · 스캔본은 원본을 보고 판단한다)")
        text = "\n".join(rows)
        return text if len(text) <= 9000 else text[:8900] + "\n… (길어서 잘림 — page 인자로 쪽을 골라 보세요)"

    def _outline_doc(self, doc: VDoc, page: str, *, with_flags: bool, prefix: str) -> str:
        rows = [f"[개요] {doc.title}"]
        in_scope = self.scope_slots() if with_flags else None
        pages = [doc.page_of(page)] if page else doc.pages
        for pg in pages:
            if pg is None:
                raise ValueError(f"페이지 {page} 가 없습니다.")
            rows.append(f"# p{doc.page_no(pg)} {pg.get('pageLabel') or ''} (pageId={pg.get('pageId')})")
            last_block = None
            for sid in doc.slots_of_page(pg):
                place = doc.places[sid]
                if place.block_id != last_block:
                    rows.append(f"  ▸ block:{place.block_id} ({place.block_kind}{' · ' + place.block_title if place.block_title else ''})")
                    last_block = place.block_id
                slot = doc.slots.get(sid) or {}
                text = _clip(plain(str(slot.get("content") or "")), 70)
                marks = _flag_marks(doc.flags(sid)) if with_flags else ""
                out_scope = " [범위밖]" if (in_scope is not None and sid not in in_scope) else ""
                rows.append(f"    {prefix}{sid} {slot.get('label') or ''}{out_scope} — {text or '(비어 있음)'}"
                            + (f"  ⟨{marks}⟩" if marks else ""))
        text = "\n".join(rows)
        return text if len(text) <= 9000 else text[:8900] + "\n… (길어서 잘림 — page 인자로 쪽을 골라 보세요)"

    # --- 읽기 ---------------------------------------------------------------------------------

    def read(self, anchor: str) -> tuple[str, list[str]]:
        """앵커 → (사람이 읽는 본문, 그 안의 칸 원문 HTML 목록 — 패턴 측정용)."""
        anchor = (anchor or "").strip()
        if not anchor or anchor == "doc":
            if self.doc is None:
                raise ValueError("열린 문서가 없습니다.")
            return self._render(self.doc, self.doc.order, "slot:")
        kind, _, rest = anchor.partition(":")
        if not rest:  # 맨 칸 id
            kind, rest = "slot", anchor
        if kind == "ref":
            return self._read_ref(rest)
        if kind in ("rev", "orig"):
            return self._read_history(kind, rest)
        if self.doc is None:
            raise ValueError("열린 문서가 없습니다.")
        if kind == "slot":
            if rest not in self.doc.slots:
                raise ValueError(f"칸 {rest} 가 없습니다. wb_outline 으로 slotId 를 확인하세요.")
            return self._render(self.doc, [rest], "slot:")
        if kind == "block":
            ids = self.doc.slots_of_block(rest)
            if not ids:
                raise ValueError(f"블록 {rest} 가 없습니다.")
            return self._render(self.doc, ids, "slot:")
        if kind == "page":
            page = self.doc.page_of(rest)
            if page is None:
                raise ValueError(f"페이지 {rest} 가 없습니다.")
            return self._render(self.doc, self.doc.slots_of_page(page), "slot:")
        raise ValueError(f"알 수 없는 앵커 '{anchor}'. slot:/block:/page:/doc/ref:/rev:/orig: 중 하나를 쓰세요.")

    def _render(self, doc: VDoc, ids: Iterable[str], prefix: str) -> tuple[str, list[str]]:
        rows, htmls = [], []
        for sid in ids:
            slot = doc.slots.get(sid) or {}
            content = str(slot.get("content") or "")
            htmls.append(content)
            place = doc.places.get(sid)
            where = f"p{place.page_no} · block:{place.block_id}" if place else "페이지 밖"
            rows.append(f"── {prefix}{sid} [{slot.get('label') or ''}] ({where})")
            rows.append(html_to_text(content) or "(비어 있음)")
        text = "\n".join(rows)
        return (text if len(text) <= 12000 else text[:11900] + "\n… (길어서 잘림 — 더 좁은 앵커로 읽으세요)"), htmls

    @staticmethod
    def _render_ref(ref: RefBook, blocks: list[dict[str, Any]]) -> tuple[str, list[str]]:
        rows = []
        for b in blocks:
            rows.append(f"── ref:{ref.ref_id}#blk:{b.get('id')} ({b.get('kind')} · p{b.get('page') or 1})")
            rows.append(html_to_text(str(b.get("html") or "")) or str(b.get("text") or "") or "(비어 있음)")
        if not rows:
            rows.append("(추출된 글이 없습니다 — 이미지 · 스캔본입니다)")
        text = "\n".join(rows)
        return (text if len(text) <= 12000 else text[:11900] + "\n… (길어서 잘림 — 더 좁은 앵커로 읽으세요)"), ref.htmls(blocks)

    def _read_ref(self, rest: str) -> tuple[str, list[str]]:
        rid, _, sub = rest.partition("#")
        ref = self.refs.get(rid)
        if ref is None:
            raise ValueError(f"레퍼런스 {rid} 가 없습니다 (활성: {', '.join(self.refs) or '없음'}).")
        if not sub:
            text, htmls = self._render_ref(ref, ref.blocks)
        elif sub.startswith("pin:"):
            pin = ref.pin(sub[4:])
            if pin is None:
                raise ValueError(f"핀 {sub} 가 없습니다.")
            body = ref.pin_text(pin)
            layer = f" · 층위 {pin.get('layer')}" if pin.get("layer") else ""
            note = f"\n(메모: {pin.get('note')})" if pin.get("note") else ""
            text, htmls = f"── ref:{rid}#{sub} [{pin.get('label') or ''}] (p{pin.get('page') or '?'}{layer})\n{body}{note}", [body]
        elif sub.startswith("blk:"):
            block = ref.block(sub[4:])
            if block is None:
                raise ValueError(f"덩어리 {sub} 가 없습니다. wb_outline target=ref:{rid} 로 blk id 를 확인하세요.")
            text, htmls = self._render_ref(ref, [block])
        elif re.fullmatch(r"p\d+", sub):
            blocks = ref.blocks_of_page(int(sub[1:]))
            if not blocks:
                raise ValueError(f"레퍼런스 쪽 {sub} 에 추출된 글이 없습니다 (전체 {ref.page_count}쪽).")
            text, htmls = self._render_ref(ref, blocks)
        else:
            raise ValueError(f"레퍼런스 앵커 '{rest}' 형식: ref:<refId>[#p<쪽>|#pin:<id>|#blk:<id>]")
        header = "[레퍼런스 — 이 글의 '결정 방식'만 참고한다. 고유명사 · 수치 · 문장은 내 문서로 옮기지 않는다]\n"
        return header + text, htmls

    def _read_history(self, kind: str, rest: str) -> tuple[str, list[str]]:
        if self.doc is None:
            raise ValueError("열린 문서가 없습니다.")
        if kind == "orig":
            slot = self.doc.slots.get(rest) or {}
            orig = slot.get("originalContent")
            if not orig:
                raise ValueError(f"칸 {rest} 에는 원본(originalContent)이 없습니다. wb_history 로 개정 이력을 보세요.")
            return f"── orig:{rest} [{slot.get('label') or ''}] (처음 상태)\n{html_to_text(orig)}", [orig]
        num, _, sub = rest.partition("#")
        rev = next((r for r in self.revisions if str(r.get("rev")) == num.strip()), None)
        if rev is None:
            raise ValueError(f"개정 {num} 이 없습니다. wb_history 로 번호를 확인하세요.")
        target = sub[5:] if sub.startswith("slot:") else ""
        rows, htmls = [f"── rev:{num} ({rev.get('at')}, {rev.get('author')}, {rev.get('label') or ''})"], []
        for ch in rev.get("slots") or []:
            if target and ch.get("slotId") != target:
                continue
            rows.append(f"  slot:{ch.get('slotId')} [{ch.get('label') or ''}]")
            rows.append(f"    이전: {html_to_text(str(ch.get('before') or '')) or '(비어 있음)'}")
            rows.append(f"    이후: {html_to_text(str(ch.get('after') or '')) or '(비어 있음)'}")
            htmls.append(str(ch.get("before") or ""))
        return "\n".join(rows), htmls

    # --- 이력 · 검색 --------------------------------------------------------------------------

    def history(self, slot_id: str = "", limit: int = 20) -> str:
        if self.doc is None:
            raise ValueError("열린 문서가 없습니다.")
        rows = [f"[이력] {self.doc.title} — 개정 {len(self.revisions)}건 (최근 순)"]
        shown = 0
        for rev in reversed(self.revisions):
            changes = [c for c in rev.get("slots") or [] if not slot_id or c.get("slotId") == slot_id]
            if slot_id and not changes:
                continue
            labels = ", ".join(f"{c.get('slotId')}" for c in changes[:6])
            rows.append(f"- rev:{rev.get('rev')} {rev.get('at')} · {rev.get('author')} · {rev.get('label') or ''} — {labels}")
            for c in changes[:3] if slot_id else []:
                rows.append(f"    이전: {_clip(plain(str(c.get('before') or '')), 120) or '(비어 있음)'}")
                rows.append(f"    이후: {_clip(plain(str(c.get('after') or '')), 120) or '(비어 있음)'}")
            shown += 1
            if shown >= limit:
                break
        ids = [slot_id] if slot_id else [s for s in self.doc.order if (self.doc.slots.get(s) or {}).get("originalContent")]
        origs = [s for s in ids if (self.doc.slots.get(s) or {}).get("originalContent")]
        if origs:
            rows.append("처음 상태가 남은 칸: " + ", ".join(f"orig:{s}" for s in origs[:12]))
        if shown == 0 and not origs:
            rows.append("(이 칸의 이력이 없습니다)" if slot_id else "(개정 이력이 없습니다)")
        return "\n".join(rows)

    def search(self, query: str, where: str = "doc,ref,history", limit: int = 30) -> str:
        if not query:
            raise ValueError("query 가 비어 있습니다.")
        try:
            rx = re.compile(query, re.I)
        except re.error:
            rx = re.compile(re.escape(query), re.I)
        areas = {w.strip() for w in where.split(",") if w.strip()}
        hits: list[str] = []

        def scan(doc: VDoc, prefix: str) -> None:
            for sid in doc.order:
                text = plain(str((doc.slots.get(sid) or {}).get("content") or ""))
                m = rx.search(text)
                if m:
                    lo = max(0, m.start() - 40)
                    hits.append(f"{prefix}{sid} — …{text[lo:m.end() + 60]}…")

        if "doc" in areas and self.doc is not None:
            scan(self.doc, "slot:")
        if "ref" in areas:
            for rid, ref in self.refs.items():
                for b in ref.blocks:
                    text = str(b.get("text") or "")
                    m = rx.search(text)
                    if m:
                        lo = max(0, m.start() - 40)
                        hits.append(f"ref:{rid}#blk:{b.get('id')} — …{text[lo:m.end() + 60]}…")
        if "history" in areas and self.doc is not None:
            for rev in self.revisions:
                for c in rev.get("slots") or []:
                    text = plain(str(c.get("before") or ""))
                    if rx.search(text):
                        hits.append(f"rev:{rev.get('rev')}#slot:{c.get('slotId')} (이전 글) — {_clip(text, 100)}")
        if not hits:
            return f"'{query}' 를 {', '.join(sorted(areas))} 에서 찾지 못했습니다. (원천 자료는 ws_grep)"
        more = f"\n… 외 {len(hits) - limit}건" if len(hits) > limit else ""
        return f"[검색 '{query}' — {len(hits)}건]\n" + "\n".join(hits[:limit]) + more

    def texts_of(self, anchors: Iterable[str]) -> list[str]:
        out = []
        for anchor in anchors:
            try:
                out.extend(self.read(anchor)[1])
            except ValueError:
                continue
        return out
