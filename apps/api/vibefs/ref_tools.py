"""레퍼런스 도구 (`rf_*`) — 남의 완성작에서 결정(층위)을 읽고, 해석을 제안하고, 합의된 해석을 꺼낸다.

레퍼런스는 사실 근거가 아니라 **의도**다. 같은 레퍼런스를 사람마다 다르게 읽고, "레퍼런스로 삼아 달라"는
통째 복제가 아니라 일부분일 수 있다. 그래서 이 도구들은 두 가지를 기록으로 남긴다:

- 읽은 범위: `rf_read` 가 실제로 보여 준 덩어리 · 핀 (`ref_reads.jsonl`) — 해석의 근거가 읽은 곳인지 잰다
- 해석 카드: `rf_interpret` 가 낸 제안 (`interpretations.jsonl`) — 사용자가 확정하면 프로젝트 합의가 된다

앵커: `ref:<refId>[#p<쪽>|#sec:<번호>|#blk:<덩어리>|#pin:<핀>]`
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from harness_kit import packs, patterns

from .store import WorkspaceStore
from .workbench import RefBook, Workbench, _clip, html_to_text

#: 레퍼런스 하네스 설정 — 하네스 reference 팩 (한 번에 보여 주는 분량 · 채택 강도 이름 · 읽기 머리말)
_SETTINGS = packs.data("reference:settings.json")
READ_BUDGET = int(_SETTINGS["readBudget"])
OUTLINE_ROWS = int(_SETTINGS["outlineRows"])
ADOPTIONS: dict[str, str] = dict(_SETTINGS["adoptions"])
_LEAK_HEADER = str(_SETTINGS["readHeader"])

_ANCHOR_HELP = "ref:<refId>[#p<쪽>|#sec:<번호>|#blk:<덩어리>|#pin:<핀>]"

#: rf_* 도구 명세 — 하네스 reference 팩
RF_TOOL_SPECS: list[dict[str, Any]] = packs.tool_specs("reference")

RF_ARG_ALIASES: dict[str, dict[str, str]] = packs.tool_aliases("reference")


@dataclass
class RefAnchor:
    ref_id: str
    page: Optional[int] = None
    section: Optional[int] = None
    block_id: str = ""
    pin_id: str = ""

    @classmethod
    def parse(cls, raw: str) -> "RefAnchor":
        text = str(raw or "").strip()
        if not text.startswith("ref:"):
            raise ValueError(f"레퍼런스 앵커가 아니다: {raw!r} — {_ANCHOR_HELP}")
        head, *parts = text[4:].split("#")
        out = cls(head)
        for part in filter(None, parts):
            if re.fullmatch(r"p\d+", part):
                out.page = int(part[1:])
            elif part.startswith("sec:") and part[4:].isdigit():
                out.section = int(part[4:])
            elif part.startswith("blk:"):
                out.block_id = part[4:]
            elif part.startswith("pin:"):
                out.pin_id = part[4:]
            else:
                raise ValueError(f"앵커 조각 '#{part}' 를 모른다 — {_ANCHOR_HELP}")
        return out

    def render(self) -> str:
        out = f"ref:{self.ref_id}"
        if self.page:
            out += f"#p{self.page}"
        if self.section:
            out += f"#sec:{self.section}"
        if self.block_id:
            out += f"#blk:{self.block_id}"
        if self.pin_id:
            out += f"#pin:{self.pin_id}"
        return out

    @property
    def whole(self) -> bool:
        return not (self.page or self.section or self.block_id or self.pin_id)


def _trigrams(text: str) -> set[str]:
    t = re.sub(r"\s+", "", text)
    return {t[i:i + 3] for i in range(max(0, len(t) - 2))}


def _similar(a: str, b: str) -> float:
    x, y = _trigrams(a), _trigrams(b)
    return len(x & y) / max(1, len(x | y))


class RefTools:
    def __init__(self, wb: Workbench, store: Optional[WorkspaceStore] = None, *, session_id: str = "",
                 conversation_id: str = "") -> None:
        self.wb = wb
        self.store = store
        self.session_id = session_id
        self.conversation_id = conversation_id

    @staticmethod
    def handles(name: str) -> bool:
        return name.startswith("rf_")

    def call(self, name: str, args: dict[str, Any]) -> str:
        for alias, real in RF_ARG_ALIASES.get(name, {}).items():
            if alias in args and real not in args:
                args[real] = args.pop(alias)
        args.pop("toolSummary", None)
        fn = getattr(self, "_" + name, None)
        if fn is None:
            raise ValueError(f"알 수 없는 레퍼런스 도구: {name}")
        return fn(**args)

    # --- 공용 ----------------------------------------------------------------------------------------

    def _ref(self, ref_id: str = "") -> RefBook:
        rid = str(ref_id or "").strip()
        if rid.startswith("ref:"):
            rid = rid[4:].split("#")[0]
        if not rid:
            if len(self.wb.refs) == 1:
                return next(iter(self.wb.refs.values()))
            raise ValueError(f"ref 를 지정한다 (켜진 레퍼런스: {', '.join(self.wb.refs) or '없음'}).")
        ref = self.wb.refs.get(rid)
        if ref is None:
            raise ValueError(f"켜진 레퍼런스가 아니다: {rid} (켜진 것: {', '.join(self.wb.refs) or '없음'}). rf_map 을 본다.")
        return ref

    def _blocks(self, ref: RefBook, anchor: RefAnchor) -> list[dict[str, Any]]:
        if anchor.pin_id:
            pin = ref.pin(anchor.pin_id)
            if pin is None:
                raise ValueError(f"핀 {anchor.pin_id} 가 없다 (켜진 핀: {', '.join(str(p.get('pinId')) for p in ref.pins) or '없음'}).")
            return ref.pin_blocks(pin)
        if anchor.block_id:
            block = ref.block(anchor.block_id)
            if block is None:
                raise ValueError(f"덩어리 {anchor.block_id} 가 없다 — rf_outline 으로 id 를 확인한다.")
            return [block]
        if anchor.section:
            secs = ref.sections()
            if not 1 <= anchor.section <= len(secs):
                raise ValueError(f"섹션 {anchor.section} 이 없다 (1~{len(secs)}).")
            sec = secs[anchor.section - 1]
            return ref.blocks[sec["start"]:sec["end"]]
        if anchor.page:
            blocks = ref.blocks_of_page(anchor.page)
            if not blocks:
                raise ValueError(f"{anchor.page}쪽에 추출된 글이 없다 (전체 {ref.page_count}쪽).")
            return blocks
        return list(ref.blocks)

    def _read_state(self, ref_id: str) -> tuple[set[str], set[str]]:
        if self.store is None:
            return set(), set()
        blocks: set[str] = set()
        pins: set[str] = set()
        for rec in self.store.ref_reads(session_id=self.session_id, conversation_ids={self.conversation_id} - {""}):
            if rec.get("refId") == ref_id:
                blocks.update(str(b) for b in rec.get("blocks") or [])
                pins.update(str(p) for p in rec.get("pins") or [])
        return blocks, pins

    def _pending(self) -> list[dict[str, Any]]:
        if self.store is None or not self.session_id:
            return []
        return [r for r in self.store.interpretations(session_id=self.session_id) if r.get("refId") in self.wb.refs]

    def _section_of(self, ref: RefBook) -> dict[str, int]:
        out: dict[str, int] = {}
        for sec in ref.sections():
            for b in ref.blocks[sec["start"]:sec["end"]]:
                out[str(b.get("id"))] = sec["no"]
        return out

    # --- 지도 · 개요 · 읽기 · 찾기 ---------------------------------------------------------------------

    def _rf_map(self, **_: Any) -> str:
        if not self.wb.refs:
            return "켜진 레퍼런스가 없다."
        rows = ["[레퍼런스 지도 — 패턴(결정)만 가져온다 · 사실 근거 아님]"]
        pending = self._pending()
        for rid, ref in self.wb.refs.items():
            kinds: dict[str, int] = {}
            for b in ref.blocks:
                kinds[str(b.get("kind"))] = kinds.get(str(b.get("kind")), 0) + 1
            rows.append(f"■ ref:{rid} — {ref.title} ({ref.kind} · {ref.page_count}쪽 · 덩어리 {len(ref.blocks)} · 층위 세트 {ref.layer_set})")
            rows.append("  덩어리 종류: " + " · ".join(f"{k} {v}" for k, v in sorted(kinds.items())))
            secs = ref.sections()
            for sec in secs[:14]:
                rows.append(f"  §{sec['no']} p{sec['page']} {'  ' * (min(sec['level'], 3) - 1)}{sec['title']} (덩어리 {sec['end'] - sec['start']})")
            if len(secs) > 14:
                rows.append(f"  … 섹션 {len(secs) - 14}개 더 — rf_outline(ref=\"{rid}\", offset=…)")
            if ref.pins:
                rows.append(f"  핀 {len(ref.pins)}개 (사용자가 짚은 초점 — 먼저 읽는다):")
                for pin in ref.pins:
                    tag = f" [{pin.get('layer')}]" if pin.get("layer") else ""
                    note = f" — 메모: {_clip(str(pin.get('note')), 60)}" if pin.get("note") else ""
                    rows.append(f"   · ref:{rid}#pin:{pin.get('pinId')}{tag} {pin.get('label') or ''} (p{pin.get('page') or '?'}){note}")
            report_layers = (ref.layer_report or {}).get("layers") or []
            if report_layers:
                rows.append("  저장된 층위 측정:")
                for layer in report_layers:
                    vals = ", ".join(f"{k}={v}" for k, v in list((layer.get("values") or {}).items())[:5])
                    rows.append(f"   · {layer.get('id')} {layer.get('name')}: {vals or '(정성 — 지표 없음, 읽고 판단)'}")
            rows.append("  합의: " + self._consensus_line(ref, pending))
            read_blocks, read_pins = self._read_state(rid)
            pins_note = f" · 핀 {len(read_pins & {str(p.get('pinId')) for p in ref.pins})}/{len(ref.pins)}" if ref.pins else ""
            rows.append(f"  읽은 범위: 덩어리 {len(read_blocks & {str(b.get('id')) for b in ref.blocks})}/{len(ref.blocks)}{pins_note}")
        rows.append("다음: rf_consensus(합의 확인) → rf_read(핀 · 범위) → rf_interpret(합의 없는 층위) → 바꾸는 요청이면 wb_propose(follows)")
        return "\n".join(rows)

    def _consensus_line(self, ref: RefBook, pending: list[dict[str, Any]]) -> str:
        parts = []
        for card in ref.consensus:
            parts.append(f"{card.get('layer')}={ADOPTIONS.get(str(card.get('adoption')), card.get('adoption'))}(확정)")
        for rec in pending:
            if rec.get("refId") == ref.ref_id:
                parts.append(f"{rec.get('layer')}={ADOPTIONS.get(str(rec.get('adoption')), rec.get('adoption'))}(제안)")
        off = sorted(k for k, v in ref.layers.items() if not v)
        if off:
            parts.append("끔: " + ", ".join(off))
        return " · ".join(parts) or "아직 없음 (해석 카드를 제안해 합의를 만든다)"

    def _rf_outline(self, ref: str = "", section: str = "", page: str = "", offset: int = 0, **_: Any) -> str:
        book = self._ref(ref)
        secs = book.sections()
        want_sec = int(str(section).lstrip("§")) if str(section or "").lstrip("§").isdigit() else None
        want_page = int(str(page).lstrip("p")) if str(page or "").lstrip("p").isdigit() else None
        rows_all: list[str] = []
        for sec in secs:
            if want_sec is not None and sec["no"] != want_sec:
                continue
            blocks = book.blocks[sec["start"]:sec["end"]]
            if want_page is not None:
                blocks = [b for b in blocks if int(b.get("page") or 1) == want_page]
                if not blocks:
                    continue
            rows_all.append(f"§{sec['no']} p{sec['page']} {sec['title']}  (rf_read ref:{book.ref_id}#sec:{sec['no']})")
            for b in blocks:
                rows_all.append(f"   ref:{book.ref_id}#blk:{b.get('id')} ({b.get('kind')} · p{b.get('page') or 1}) — "
                                f"{_clip(str(b.get('text') or ''), 70)}")
        if not rows_all:
            return "(조건에 맞는 덩어리가 없다 — 이미지 · 스캔본이면 핀 영역의 글을 본다)"
        start = max(0, int(offset or 0))
        page_rows = rows_all[start:start + OUTLINE_ROWS]
        head = f"[개요] ref:{book.ref_id} — {book.title} · 섹션 {len(secs)} · 덩어리 {len(book.blocks)} · 줄 {start + 1}–{start + len(page_rows)}/{len(rows_all)}"
        tail = ""
        if start + OUTLINE_ROWS < len(rows_all):
            tail = f"\n… {len(rows_all) - start - OUTLINE_ROWS}줄 더 — rf_outline(ref=\"{book.ref_id}\", offset={start + OUTLINE_ROWS})"
        return head + "\n" + "\n".join(page_rows) + tail

    def _rf_read(self, anchor: str = "", offset: int = 0, **_: Any) -> str:
        parsed = RefAnchor.parse(anchor)
        ref = self._ref(parsed.ref_id)
        blocks = self._blocks(ref, parsed)
        start = max(0, int(offset or 0))
        shown: list[dict[str, Any]] = []
        rows: list[str] = []
        used = 0
        pin_ids: list[str] = []
        if parsed.pin_id and start == 0:
            pin = ref.pin(parsed.pin_id) or {}
            layer = f" · 층위 태그 {pin.get('layer')}" if pin.get("layer") else ""
            note = f"\n(사용자 메모: {pin.get('note')})" if pin.get("note") else ""
            body = str(pin.get("text") or "") or "\n".join(str(b.get("text") or "") for b in blocks)
            rows.append(f"── ref:{ref.ref_id}#pin:{parsed.pin_id} [{pin.get('label') or ''}] (p{pin.get('page') or '?'}{layer}){note}\n{body}")
            rows.append(f"(이 핀과 겹치는 덩어리: {', '.join(str(b.get('id')) for b in blocks) or '없음'})")
            pin_ids.append(parsed.pin_id)
            used = len(rows[0])
            shown = blocks  # 핀을 읽으면 겹치는 덩어리도 읽은 것으로 친다
        else:
            for b in blocks[start:]:
                text = html_to_text(str(b.get("html") or "")) or str(b.get("text") or "") or "(비어 있음)"
                piece = f"── ref:{ref.ref_id}#blk:{b.get('id')} ({b.get('kind')} · p{b.get('page') or 1})\n{text}"
                if shown and used + len(piece) > READ_BUDGET:
                    break
                rows.append(piece)
                shown.append(b)
                used += len(piece)
        if not rows:
            rows.append("(읽을 덩어리가 없다)")
        end = start + (0 if parsed.pin_id else len(shown))
        tail = ""
        if not parsed.pin_id and end < len(blocks):
            tail = (f"\n… 이 범위의 덩어리 {len(blocks) - end}개가 남았다 — rf_read(anchor=\"{parsed.render()}\", offset={end}). "
                    "다 읽지 않았으면 해석 · 보고에 '읽은 범위'를 밝힌다.")
        if self.store is not None:
            self.store.record_ref_read(session_id=self.session_id, conversation_id=self.conversation_id, ref_id=ref.ref_id,
                                       blocks=[str(b.get("id")) for b in shown], pins=pin_ids, anchor=parsed.render())
        head = f"{_LEAK_HEADER}\n[{parsed.render()} · 덩어리 {start + 1}–{max(start + 1, end)}/{len(blocks)}]" if not parsed.pin_id \
            else f"{_LEAK_HEADER}\n[{parsed.render()}]"
        return head + "\n" + "\n".join(rows) + tail

    def _rf_find(self, query: str = "", kind: str = "", ref: str = "", page: str = "", **_: Any) -> str:
        if not (query or kind or page):
            raise ValueError("query · kind · page 중 하나는 준다.")
        rx = None
        if query:
            try:
                rx = re.compile(str(query), re.I)
            except re.error:
                rx = re.compile(re.escape(str(query)), re.I)
        want_page = int(str(page).lstrip("p")) if str(page or "").lstrip("p").isdigit() else None
        books = [self._ref(ref)] if ref else list(self.wb.refs.values())
        hits: list[str] = []
        for book in books:
            sec_of = self._section_of(book)
            for b in book.blocks:
                if kind and str(b.get("kind")) != str(kind):
                    continue
                if want_page is not None and int(b.get("page") or 1) != want_page:
                    continue
                text = str(b.get("text") or "")
                if rx is not None:
                    m = rx.search(text)
                    if not m:
                        continue
                    lo = max(0, m.start() - 30)
                    snippet = "…" + text[lo:m.end() + 50] + "…"
                else:
                    snippet = _clip(text, 80)
                hits.append(f"ref:{book.ref_id}#blk:{b.get('id')} (§{sec_of.get(str(b.get('id')), '?')} · {b.get('kind')} · "
                            f"p{b.get('page') or 1}) — {snippet}")
        if not hits:
            return "찾지 못했다. (rf_outline 으로 구성을 본다)"
        more = f"\n… 외 {len(hits) - 30}건" if len(hits) > 30 else ""
        return f"[레퍼런스 찾기 — {len(hits)}건]\n" + "\n".join(hits[:30]) + more

    def _rf_coverage(self, ref: str = "", **_: Any) -> str:
        books = [self._ref(ref)] if ref else list(self.wb.refs.values())
        if not books:
            return "켜진 레퍼런스가 없다."
        pending = self._pending()
        rows = []
        for book in books:
            read_blocks, read_pins = self._read_state(book.ref_id)
            ids = [str(b.get("id")) for b in book.blocks]
            got = len(read_blocks & set(ids))
            rows.append(f"■ ref:{book.ref_id} — 덩어리 {got}/{len(ids)} ({got * 100 // max(1, len(ids))}%)")
            unread_secs = []
            partial_secs = []
            for sec in book.sections():
                sec_ids = {str(b.get("id")) for b in book.blocks[sec["start"]:sec["end"]]}
                n = len(sec_ids & read_blocks)
                if n == 0:
                    unread_secs.append(f"§{sec['no']} {sec['title']}")
                elif n < len(sec_ids):
                    partial_secs.append(f"§{sec['no']} {n}/{len(sec_ids)}")
            if partial_secs:
                rows.append("  일부만 읽은 섹션: " + ", ".join(partial_secs[:10]))
            if unread_secs:
                rows.append(f"  안 읽은 섹션 {len(unread_secs)}개: " + ", ".join(unread_secs[:10]) + (" …" if len(unread_secs) > 10 else ""))
            if book.pins:
                unread_pins = [str(p.get("pinId")) for p in book.pins if str(p.get("pinId")) not in read_pins]
                rows.append(f"  핀 {len(book.pins) - len(unread_pins)}/{len(book.pins)} 읽음"
                            + (f" — 안 읽은 핀: {', '.join(unread_pins)}" if unread_pins else ""))
            rows.append("  합의: " + self._consensus_line(book, pending))
        return "\n".join(rows)

    # --- 측정 · 비교 ----------------------------------------------------------------------------------

    def _measure(self, anchor: str) -> tuple[dict[str, Any], str]:
        anchor = str(anchor or "").strip()
        if anchor.startswith("ref:"):
            parsed = RefAnchor.parse(anchor)
            ref = self._ref(parsed.ref_id)
            stored = (ref.layer_report or {}).get("metrics")
            if parsed.whole and isinstance(stored, dict) and stored:
                return dict(stored), ref.layer_set
            blocks = self._blocks(ref, parsed)
            htmls = [str(b.get("html") or "") for b in blocks]
            if parsed.pin_id and not any(htmls):
                htmls = [str((ref.pin(parsed.pin_id) or {}).get("text") or "")]
            return patterns.measure(htmls, sorted({str(b.get("kind")) for b in blocks if b.get("kind")})), ref.layer_set
        _, htmls = self.wb.read(anchor)
        kinds = sorted({p.block_kind for p in self.wb.doc.places.values() if p.block_kind}) if self.wb.doc is not None else []
        return patterns.measure(htmls, kinds), "document"

    def _rf_measure(self, anchor: str = "", layers: str = "", **_: Any) -> str:
        metrics, default_set = self._measure(anchor)
        return patterns.render(metrics, str(layers or default_set), title=str(anchor))

    def _rf_contrast(self, a: str = "", b: str = "", layers: str = "", **_: Any) -> str:
        ma, set_a = self._measure(a)
        mb, _ = self._measure(b)
        return patterns.compare(ma, mb, str(layers or set_a), str(a), str(b))

    # --- 해석 · 합의 ----------------------------------------------------------------------------------

    def _rf_interpret(self, cards: Any = None, **_: Any) -> str:
        if isinstance(cards, str):
            try:
                cards = json.loads(cards)
            except ValueError as exc:
                raise ValueError(f"cards 를 JSON 배열로 보낸다: {exc}") from exc
        if isinstance(cards, dict):
            cards = [cards]
        if not cards:
            raise ValueError("cards 가 비었다.")
        known = patterns.layer_ids("document") | patterns.layer_ids("uiux")
        pending = {(r.get("refId"), r.get("layer"), r.get("scope")): r for r in self._pending()}
        rows = ["[해석 카드 검증]"]
        saved = 0
        for i, raw in enumerate(cards, 1):
            errors, warnings = [], []
            if not isinstance(raw, dict):
                rows.append(f"✗ 카드 {i}: 객체가 아니다.")
                continue
            layer = str(raw.get("layer") or "").split(":")[-1].strip()
            scope_raw = str(raw.get("scope") or (f"ref:{raw.get('ref')}" if raw.get("ref") else ""))
            try:
                scope = RefAnchor.parse(scope_raw) if scope_raw else RefAnchor(self._ref("").ref_id)
                ref = self._ref(scope.ref_id)
                scope_blocks = {str(b.get("id")) for b in self._blocks(ref, scope)}
            except ValueError as exc:
                rows.append(f"✗ 카드 {i}: 범위 — {exc}")
                continue
            adoption = str(raw.get("adoption") or "follow").strip()
            reading = str(raw.get("reading") or "").strip()
            evidence = [str(x) for x in raw.get("evidence") or []]
            if layer not in known:
                errors.append(f"층위 '{layer}' 는 레지스트리에 없다 ({', '.join(sorted(known))}).")
            elif layer not in patterns.layer_ids(ref.layer_set):
                warnings.append(f"층위 {layer} 는 이 레퍼런스의 세트({ref.layer_set})가 아니다.")
            if adoption not in ADOPTIONS:
                errors.append(f"adoption 은 {', '.join(ADOPTIONS)} 중 하나.")
            if len(reading) < 12:
                errors.append("reading 이 비었거나 너무 짧다 — 이 범위가 어떤 결정을 했는지 위치 · 측정값을 근거로 쓴다.")
            if adoption != "exclude" and not evidence:
                errors.append("evidence 가 비었다 — 근거 앵커(ref:…#blk:… · #pin:…)를 적는다.")
            read_blocks, read_pins = self._read_state(ref.ref_id)
            for ev in evidence:
                try:
                    ev_anchor = RefAnchor.parse(ev)
                    ev_blocks = {str(b.get("id")) for b in self._blocks(self._ref(ev_anchor.ref_id), ev_anchor)}
                except ValueError as exc:
                    errors.append(f"근거 {ev}: {exc}")
                    continue
                if ev_anchor.ref_id != ref.ref_id:
                    errors.append(f"근거 {ev} 가 카드의 레퍼런스({ref.ref_id}) 밖이다.")
                    continue
                if not scope.whole and not (ev_blocks & scope_blocks) and ev_anchor.pin_id != scope.pin_id:
                    errors.append(f"근거 {ev} 가 카드 범위({scope.render()}) 밖이다 — 범위를 넓히거나 범위 안 근거를 쓴다.")
                if not (ev_blocks & read_blocks) and not (ev_anchor.pin_id and ev_anchor.pin_id in read_pins):
                    errors.append(f"근거 {ev} 를 읽은 기록이 없다 — rf_read 로 먼저 읽는다.")
            alternatives = []
            for alt in raw.get("alternatives") or []:
                if not isinstance(alt, dict) or not str(alt.get("reading") or "").strip():
                    continue
                if _similar(str(alt.get("reading")), reading) > 0.8:
                    warnings.append("대안 해석이 본 해석과 거의 같다 — 정말 갈리는 해석만 낸다.")
                    continue
                alternatives.append({"reading": str(alt.get("reading")).strip(), "evidence": [str(x) for x in alt.get("evidence") or []]})
            if errors:
                rows.append(f"✗ 카드 {i} ({layer} · {scope.render()}): " + " / ".join(errors))
                continue
            metrics, _ = self._measure(scope.render())
            values = next((v for layer_def, v in patterns.by_layer(metrics, ref.layer_set) if layer_def.get("id") == layer), {})
            prev = pending.get((ref.ref_id, layer, scope.render()))
            card = {
                "session": self.session_id, "conv": self.conversation_id, "refId": ref.ref_id,
                "cardId": str((prev or {}).get("cardId") or raw.get("cardId") or f"icard_{uuid.uuid4().hex[:8]}"),
                "layer": layer, "scope": scope.render(), "adoption": adoption, "reading": reading, "evidence": evidence,
                "alternatives": alternatives, "measures": values, "status": "proposed",
            }
            if self.store is not None:
                self.store.add_interpretation(card)
            saved += 1
            note = f" · 대안 {len(alternatives)}" if alternatives else ""
            rows.append(f"✓ {card['cardId']} — {layer} {ADOPTIONS[adoption]} · {scope.render()}{note}"
                        + (" (덮어씀)" if prev else "") + ("\n   ⚠ " + " / ".join(warnings) if warnings else ""))
        rows.append(packs.message("reference:messages.json", "interpret.saved", saved=saved, total=len(cards)))
        return "\n".join(rows)

    def _rf_consensus(self, ref: str = "", **_: Any) -> str:
        books = [self._ref(ref)] if ref else list(self.wb.refs.values())
        if not books:
            return "켜진 레퍼런스가 없다."
        pending = self._pending()
        rows = [packs.message("reference:messages.json", "consensus.head")]
        for book in books:
            rows.append(f"■ ref:{book.ref_id} — {book.title}")
            if not book.consensus and not any(r.get("refId") == book.ref_id for r in pending):
                rows.append("  카드 없음 — 요청에 필요한 층위를 rf_read 로 읽고 rf_interpret 로 제안한다.")
            for card in book.consensus:
                rows.append(f"  [확정] {card.get('cardId')} {card.get('layer')} {ADOPTIONS.get(str(card.get('adoption')), card.get('adoption'))} "
                            f"· {card.get('scope')} — {_clip(str(card.get('reading') or ''), 140)}")
            for rec in pending:
                if rec.get("refId") == book.ref_id:
                    alts = f" (대안 {len(rec.get('alternatives') or [])})" if rec.get("alternatives") else ""
                    rows.append(f"  [제안] {rec.get('cardId')} {rec.get('layer')} {ADOPTIONS.get(str(rec.get('adoption')), rec.get('adoption'))} "
                                f"· {rec.get('scope')} — {_clip(str(rec.get('reading') or ''), 140)}{alts}")
            off = sorted(k for k, v in book.layers.items() if not v)
            if off:
                rows.append(f"  사용자가 끈 층위(따르지 않음): {', '.join(off)}")
        return "\n".join(rows)


def cards_for(wb: Workbench, store: Optional[WorkspaceStore], session_id: str) -> dict[str, dict[str, Any]]:
    """후보 검증용: cardId → 카드 (확정 + 이 세션의 제안). 사용자가 끈 층위는 가상의 따르지 않음 카드로 넣는다."""
    out: dict[str, dict[str, Any]] = {}
    for rid, ref in wb.refs.items():
        for card in ref.consensus:
            out[str(card.get("cardId"))] = {**card, "refId": rid, "status": "confirmed"}
        for layer, on in ref.layers.items():
            if not on:
                out[f"off:{rid}:{layer}"] = {"cardId": f"off:{rid}:{layer}", "refId": rid, "layer": layer,
                                             "scope": f"ref:{rid}", "adoption": "exclude", "status": "confirmed"}
    if store is not None and session_id:
        for rec in store.interpretations(session_id=session_id):
            if rec.get("refId") in wb.refs:
                out.setdefault(str(rec.get("cardId")), rec)
    return out
