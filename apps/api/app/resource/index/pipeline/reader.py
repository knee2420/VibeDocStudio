"""덱 읽기 — `knowledge.*` 도구와 화면이 함께 쓰는 조회 계층.

탐색 비용을 줄이는 핵심은 grep 결과를 **카드 단위로 묶어** 돌려주는 것이다.
grep 이 30줄을 찾아도 모델이 받는 것은 "카드 4장에 몰려 있다 + 각 카드의 제목 · 대표 줄"이고,
모델은 그중 필요한 카드만 연다 (grep → 색인 확인 → 추림).
"""
from __future__ import annotations

import json
import math
import re
import threading
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from .contracts import Asset, Card, Section
from .extract import tokenize

#: lookup 에서 필드별 가중치 — 제목 · 별칭 · 요소 이름이 본문 요약보다 강한 신호다
_FIELD_WEIGHTS = {"title": 3.0, "path": 1.5, "aliases": 3.0, "keywords": 2.0, "questions": 2.0, "elements": 2.0,
                  "summary": 1.0, "details": 0.7, "assets": 1.5}


@dataclass
class _Loaded:
    stamp: float
    manifest: dict[str, Any]
    cards: list[Card]
    by_id: dict[str, Card]
    sections: list[Section]
    sec_by_id: dict[str, Section]
    assets: list[Asset]
    toc: list[dict[str, Any]]
    routing: dict[str, list[str]]
    quality: dict[str, Any]
    #: 카드 id → 조각 본문 줄 (원문 줄 번호 기준)
    texts: dict[str, list[str]]
    index: dict[str, dict[str, Counter]]
    idf: dict[str, float]


def _stem(tok: str) -> str:
    if re.fullmatch(r"[a-z][a-z0-9\-]+", tok) and len(tok) > 4:
        for suf in ("ing", "es", "s", "ed"):
            if tok.endswith(suf) and len(tok) - len(suf) >= 3:
                return tok[: -len(suf)]
    return tok


def _toks(text: str) -> list[str]:
    return [_stem(t) for t in tokenize(text)]


class DeckReader:
    """덱 폴더 하나를 읽는다. `deck.json` 이 바뀌면(재색인) 다시 읽는다."""

    def __init__(self, deck_dir: Path) -> None:
        self.deck_dir = deck_dir
        self._lock = threading.Lock()
        self._loaded: Optional[_Loaded] = None

    @property
    def exists(self) -> bool:
        return (self.deck_dir / "deck.json").exists()

    def _load(self) -> _Loaded:
        stamp = (self.deck_dir / "deck.json").stat().st_mtime
        with self._lock:
            if self._loaded and self._loaded.stamp == stamp:
                return self._loaded
            read = lambda name: json.loads((self.deck_dir / name).read_text(encoding="utf-8"))  # noqa: E731
            cards = [Card.from_dict(c) for c in read("cards.json")]
            sections = [Section.from_dict(s) for s in read("sections.json")]
            assets = [Asset.from_dict(a) for a in read("assets.json")]
            texts: dict[str, list[str]] = {}
            for card in cards:
                path = self.deck_dir / card.archive_path
                try:
                    body = path.read_text(encoding="utf-8").split("\n")
                except OSError:
                    body = []
                # 프론트매터 7줄 다음이 본문
                texts[card.card_id] = body[7:] if len(body) > 7 else []
            assets_by_card: dict[str, list[Asset]] = defaultdict(list)
            for a in assets:
                assets_by_card[a.card_id].append(a)
            index: dict[str, dict[str, Counter]] = {}
            df: Counter = Counter()
            for card in cards:
                fields = {
                    "title": Counter(_toks(card.title)),
                    "path": Counter(_toks(" ".join(card.heading_path))),
                    "aliases": Counter(_toks(" ".join(card.aliases))),
                    "keywords": Counter(_toks(" ".join(card.keywords))),
                    "questions": Counter(_toks(" ".join(card.questions))),
                    "elements": Counter(_toks(" ".join(e.name for e in card.elements))),
                    "summary": Counter(_toks(card.summary)),
                    "details": Counter(_toks(" ".join(e.detail for e in card.elements))),
                    "assets": Counter(_toks(" ".join(f"{a.caption} {' '.join(a.columns)} {' '.join(a.row_keys)}"
                                                     for a in assets_by_card.get(card.card_id, [])))),
                }
                index[card.card_id] = fields
                seen: set[str] = set()
                for counter in fields.values():
                    seen.update(counter.keys())
                df.update(seen)
            n = max(len(cards), 1)
            idf = {tok: math.log(1 + (n - d + 0.5) / (d + 0.5)) for tok, d in df.items()}
            self._loaded = _Loaded(
                stamp=stamp,
                manifest=read("deck.json"),
                cards=cards,
                by_id={c.card_id: c for c in cards},
                sections=sections,
                sec_by_id={s.section_id: s for s in sections},
                assets=assets,
                toc=read("toc.json"),
                routing=read("routing.json"),
                quality=read("quality.json"),
                texts=texts,
                index=index,
                idf=idf,
            )
            return self._loaded

    # --- 지도 ------------------------------------------------------------------

    def manifest(self) -> dict[str, Any]:
        return self._load().manifest

    def quality(self) -> dict[str, Any]:
        return self._load().quality

    def brief(self, max_chars: int = 7000) -> str:
        """Composer 첨부에 들어가는 지도 요약 — 첫 턴에 도구 없이 범위를 잡게 한다."""
        d = self._load()
        st = d.manifest.get("stats", {})
        lines = [
            f"덱: {d.manifest.get('title')} (deckId={d.manifest.get('deckId')}, depth={d.manifest.get('depth')})",
            f"원본 {st.get('files')} · 섹션 {st.get('sections')} · 카드 {st.get('cards')} · 표 {st.get('tables')} · 그림 {st.get('figures')} · 코드 {st.get('codeBlocks')}",
            "섹션 지도 (id | 제목 | 원본 | 카드 수 | 키워드):",
        ]
        for sec in d.sections:
            lines.append(f"{sec.section_id} | {sec.title} | {sec.source} | {len(sec.card_ids)} | {', '.join(sec.keywords[:5])}")
        text = "\n".join(lines)
        if len(text) > max_chars:
            text = text[:max_chars] + "\n…(섹션이 더 있다 — knowledge.toc 로 전체 목차를 본다)"
        return text

    def toc(self, section_id: Optional[str] = None, max_level: int = 3, max_lines: int = 500) -> dict[str, Any]:
        d = self._load()
        out: list[str] = []

        def walk(nodes: list[dict[str, Any]], depth: int) -> None:
            for node in nodes:
                if len(out) >= max_lines:
                    return
                if section_id and node.get("type") != "dir" and node.get("sectionId") and node.get("sectionId") != section_id \
                        and node.get("type") == "doc":
                    continue
                if node.get("type") == "heading" and node.get("level", 1) > max_level:
                    continue
                pad = "  " * depth
                kind = node.get("type")
                if kind == "dir":
                    out.append(f"{pad}{node['title']}/")
                elif kind == "doc":
                    out.append(f"{pad}[{node.get('sectionId')}] {node['title']} ({node.get('source')})")
                else:
                    out.append(f"{pad}- {node['title']} → {node.get('cardId', '')}")
                walk(node.get("children") or [], depth + 1)

        walk(d.toc, 0)
        return {"toc": "\n".join(out), "truncated": len(out) >= max_lines, "sections": len(d.sections), "cards": len(d.cards)}

    def section(self, section_id: str) -> dict[str, Any]:
        d = self._load()
        sec = d.sec_by_id.get(section_id)
        if not sec:
            raise KeyError(f"없는 섹션: {section_id}")
        return {
            "sectionId": sec.section_id,
            "title": sec.title,
            "source": sec.source,
            "keywords": sec.keywords,
            "related": [{"sectionId": r, "title": d.sec_by_id[r].title} for r in sec.related if r in d.sec_by_id],
            "cards": [
                {"cardId": cid, "title": d.by_id[cid].title, "summary": d.by_id[cid].summary[:180],
                 "lines": f"{d.by_id[cid].anchor.line_start}-{d.by_id[cid].anchor.line_end}",
                 "assets": d.by_id[cid].asset_ids[:6]}
                for cid in sec.card_ids
            ],
        }

    def cards(self, card_ids: list[str], *, max_elements: int = 24) -> list[dict[str, Any]]:
        d = self._load()
        out: list[dict[str, Any]] = []
        assets = {a.asset_id: a for a in d.assets}
        for cid in card_ids[:6]:
            card = d.by_id.get(cid)
            if not card:
                out.append({"cardId": cid, "error": "없는 카드"})
                continue
            out.append({
                "cardId": card.card_id,
                "section": f"{card.section_id} {d.sec_by_id[card.section_id].title}",
                "title": card.title,
                "path": " > ".join(card.heading_path),
                "summary": card.summary,
                "elements": [e.to_dict() for e in card.elements[:max_elements]],
                "assets": [{"id": a.asset_id, "kind": a.kind, "caption": a.caption, "columns": a.columns, "rows": a.rows}
                           for a in (assets[x] for x in card.asset_ids if x in assets) if a.kind != "code"][:8],
                "linksOut": [{"cardId": x, "title": d.by_id[x].title} for x in card.links_out if x in d.by_id],
                "source": card.anchor.label(),
            })
        return out

    def assets(self, kind: Optional[str] = None, query: str = "", limit: int = 30) -> dict[str, Any]:
        d = self._load()
        items = [a for a in d.assets if not kind or a.kind == kind]
        q = set(_toks(query))
        if q:
            scored = []
            for a in items:
                hay = set(_toks(f"{a.caption} {a.summary} {' '.join(a.columns)} {' '.join(a.row_keys)} {d.by_id[a.card_id].title}"))
                hit = len(q & hay)
                if hit:
                    scored.append((hit, a))
            items = [a for _, a in sorted(scored, key=lambda x: -x[0])]
        return {
            "total": len(items),
            "assets": [
                {"id": a.asset_id, "kind": a.kind, "caption": a.caption, "summary": a.summary[:160], "columns": a.columns,
                 "rows": a.rows, "rowKeys": a.row_keys[:12], "target": a.target, "cardId": a.card_id,
                 "source": a.anchor.label()}
                for a in items[:limit]
            ],
        }

    # --- 찾기 ------------------------------------------------------------------

    def lookup(self, query: str, limit: int = 8) -> dict[str, Any]:
        """대충 물어도 맞는 카드를 고른다 — 제목 · 별칭 · 요소 · 예상 질문 · 표의 행 이름까지 본다."""
        d = self._load()
        q = _toks(query)
        raw_terms = [t.lower() for t in re.findall(r"--[\w-]+|/[\w-]+|`([^`]+)`", query) if t]
        scores: list[tuple[float, str, list[str]]] = []
        for cid, fields in d.index.items():
            total = 0.0
            why: list[str] = []
            for fname, counter in fields.items():
                part = 0.0
                for tok in q:
                    tf = counter.get(tok, 0)
                    if not tf and len(tok) >= 4:
                        # 한국어 합성어 · 접두 일치 (`샌드박스모드` ↔ `샌드박스`)
                        tf = sum(v for k, v in counter.items() if len(k) >= 3 and (k.startswith(tok) or tok.startswith(k)))
                        tf = min(tf, 2) * 0.5
                    if tf:
                        part += d.idf.get(tok, 1.0) * tf / (tf + 1.0)
                if part:
                    total += _FIELD_WEIGHTS[fname] * part
                    why.append(fname)
            card = d.by_id[cid]
            for term in raw_terms:
                if any(term == e.name.lower() for e in card.elements) or term in card.title.lower():
                    total += 6.0
                    why.append("exact")
            if total > 0:
                scores.append((total, cid, why))
        scores.sort(key=lambda x: -x[0])
        top = scores[:limit]
        by_section = Counter(d.by_id[cid].section_id for _, cid, _ in scores[:30])
        return {
            "query": query,
            "candidates": [
                {"cardId": cid, "score": round(s, 2), "title": d.by_id[cid].title,
                 "section": d.by_id[cid].section_id, "summary": d.by_id[cid].summary[:160], "matched": sorted(set(why))}
                for s, cid, why in top
            ],
            "sections": [{"sectionId": sid, "title": d.sec_by_id[sid].title, "candidates": n} for sid, n in by_section.most_common(5)],
        }

    def grep(self, pattern: str, *, regex: bool = False, section_id: Optional[str] = None,
             max_cards: int = 10, lines_per_card: int = 3) -> dict[str, Any]:
        d = self._load()
        try:
            rx = re.compile(pattern if regex else re.escape(pattern), re.I)
        except re.error as exc:
            raise ValueError(f"정규식 오류: {exc}") from exc
        per_card: dict[str, list[tuple[int, str]]] = defaultdict(list)
        total = 0
        for card in d.cards:
            if section_id and card.section_id != section_id:
                continue
            for off, line in enumerate(d.texts.get(card.card_id, [])):
                if rx.search(line):
                    total += 1
                    per_card[card.card_id].append((card.anchor.line_start + off, line.strip()))
        title_hit = {cid for cid in per_card if rx.search(d.by_id[cid].title)}
        ranked = sorted(per_card.items(), key=lambda kv: (kv[0] not in title_hit, -len(kv[1]), kv[0]))
        sections = Counter(d.by_id[cid].section_id for cid in per_card)
        return {
            "pattern": pattern,
            "totalHits": total,
            "cardsHit": len(per_card),
            "sections": [{"sectionId": sid, "title": d.sec_by_id[sid].title, "cards": n} for sid, n in sections.most_common(8)],
            "results": [
                {"cardId": cid, "title": d.by_id[cid].title, "section": d.by_id[cid].section_id, "hits": len(hits),
                 "lines": [{"line": ln, "text": text[:220]} for ln, text in hits[:lines_per_card]],
                 "source": d.by_id[cid].anchor.source}
                for cid, hits in ranked[:max_cards]
            ],
            "truncated": len(ranked) > max_cards,
        }

    def source(self, card_id: str, *, line_from: Optional[int] = None, line_to: Optional[int] = None,
               max_chars: int = 6000) -> dict[str, Any]:
        d = self._load()
        card = d.by_id.get(card_id)
        if not card:
            raise KeyError(f"없는 카드: {card_id}")
        body = d.texts.get(card_id, [])
        start = card.anchor.line_start
        lo = max(line_from or start, start)
        hi = min(line_to or card.anchor.line_end, card.anchor.line_end)
        out: list[str] = []
        size = 0
        for off, line in enumerate(body):
            ln = start + off
            if ln < lo or ln > hi:
                continue
            row = f"L{ln}: {line}"
            if size + len(row) > max_chars:
                out.append("…(잘림 — lineFrom/lineTo 로 나머지를 읽는다)")
                break
            out.append(row)
            size += len(row) + 1
        return {"cardId": card_id, "source": card.anchor.source, "lines": f"{lo}-{hi}", "text": "\n".join(out)}

    def card_titles(self) -> dict[str, str]:
        d = self._load()
        return {c.card_id: c.title for c in d.cards}

    def sections_overview(self) -> list[dict[str, Any]]:
        d = self._load()
        return [{"sectionId": s.section_id, "title": s.title, "source": s.source, "cardIds": s.card_ids,
                 "keywords": s.keywords[:6], "description": s.description} for s in d.sections]

    def full_document(self, card_id: str) -> dict[str, Any]:
        """카드가 속한 원본 문서 전체를 아카이브 세그먼트들로부터 복원한다."""
        d = self._load()
        card = d.by_id.get(card_id)
        if not card or not card.archive_path:
            return {}
        card_file = self.deck_dir / card.archive_path
        section_dir = card_file.parent
        if not section_dir.exists() or not section_dir.is_dir():
            return {}
        md_files = sorted([p for p in section_dir.iterdir() if p.is_file() and p.suffix.lower() == ".md"])
        total_lines: list[str] = []
        for p in md_files:
            try:
                raw_lines = p.read_text(encoding="utf-8").split("\n")
                # 프론트매터 7줄 다음이 본문
                body = raw_lines[7:] if len(raw_lines) > 7 else raw_lines
                total_lines.extend(body)
            except OSError:
                continue
        return {
            "source": card.anchor.source,
            "totalLines": len(total_lines),
            "lines": [f"L{idx + 1}: {line}" for idx, line in enumerate(total_lines)],
            "highlight": [card.anchor.line_start, card.anchor.line_end],
        }

    def card_detail(self, card_id: str) -> dict[str, Any]:
        """화면의 카드 미리보기 — 카드 전체 + 원문 조각 및 전체 원본 문서 복원."""
        found = self.cards([card_id], max_elements=48)
        detail = found[0] if found else {"cardId": card_id, "error": "없는 카드"}
        if "error" not in detail:
            d = self._load()
            card = d.by_id[card_id]
            detail["keywords"] = card.keywords
            detail["aliases"] = card.aliases
            detail["questions"] = card.questions
            detail["depth"] = card.depth
            detail["sourceText"] = self.source(card_id, max_chars=12000)["text"]
            full_doc = self.full_document(card_id)
            if full_doc and full_doc.get("lines"):
                detail["fullDocument"] = "\n".join(full_doc["lines"])
                detail["highlightRange"] = full_doc["highlight"]
                detail["totalDocumentLines"] = full_doc["totalLines"]

            # 원문이 PDF 인 경우의 서빙 URL 및 하이라이트 페이지/박스 연동
            source_name = getattr(card.anchor, "source", "") or ""
            anchor_page = getattr(card.anchor, "page", None)
            is_pdf = source_name.lower().endswith(".pdf") or anchor_page is not None
            if is_pdf:
                detail["isPdf"] = True
                detail["pdfPage"] = anchor_page or 1
                detail["pdfBox"] = getattr(card.anchor, "box", None)
                # 원본 PDF 파일 탐색
                pdf_file = None
                candidates = [
                    self.deck_dir / "sources" / source_name,
                    self.deck_dir / source_name,
                ]
                for c in candidates:
                    if c.exists() and c.is_file():
                        pdf_file = c
                        break
                if not pdf_file:
                    for sp in d.manifest.get("sourcePaths", []):
                        p = Path(sp)
                        if p.name == source_name or (p.is_file() and p.suffix.lower() == ".pdf"):
                            if p.exists():
                                pdf_file = p
                                break
                if pdf_file and pdf_file.exists():
                    detail["pdfUrl"] = f"/api/resources/raw-file?path={pdf_file.resolve().as_posix()}"

            # 같은 원본 문서(source)를 공유하는 동일 문서 내 카드들의 하이라이트 구간들
            siblings = []
            for other_card in d.cards:
                if other_card.anchor.source == card.anchor.source:
                    siblings.append({
                        "cardId": other_card.card_id,
                        "title": other_card.title,
                        "lines": [other_card.anchor.line_start, other_card.anchor.line_end],
                        "page": other_card.anchor.page,
                        "box": getattr(other_card.anchor, "box", None),
                        "isCurrent": other_card.card_id == card_id,
                    })
            detail["siblings"] = siblings
        return detail

    def scoped(self, sections: Optional[set[str]]) -> "DeckReader":
        """고른 섹션만 보이는 읽기 창 (RM 섹션 체크박스). 비면 덱 전체."""
        if not sections:
            return self
        return _ScopedReader(self, frozenset(sections))


class _ScopedReader(DeckReader):
    """원래 덱을 그대로 두고, 고른 섹션의 카드 · 자산 · 원문 · 목차만 보이게 거른다.

    모든 조회가 `_load()` 를 거치므로 여기서 한 번 걸러 두면 toc · lookup · grep · cards · source · brief 가 같이 좁혀진다.
    고르지 않은 섹션의 카드는 "없는 카드" 로 보인다.
    """

    def __init__(self, base: DeckReader, sections: frozenset[str]) -> None:
        super().__init__(base.deck_dir)
        self._base = base
        self._sections = sections
        self._view: Optional[_Loaded] = None

    @property
    def exists(self) -> bool:
        return self._base.exists

    def _load(self) -> _Loaded:
        full = self._base._load()
        with self._lock:
            if self._view is not None and self._view.stamp == full.stamp:
                return self._view
            keep = self._sections
            cards = [c for c in full.cards if c.section_id in keep]
            ids = {c.card_id for c in cards}
            sections = [s for s in full.sections if s.section_id in keep]
            assets = [a for a in full.assets if a.card_id in ids]
            manifest = dict(full.manifest)
            stats = dict(manifest.get("stats") or {})
            stats.update({"sections": len(sections), "cards": len(cards),
                          "tables": sum(1 for a in assets if a.kind == "table"),
                          "figures": sum(1 for a in assets if a.kind == "figure"),
                          "codeBlocks": sum(1 for a in assets if a.kind == "code")})
            manifest["stats"] = stats
            manifest["scopedSections"] = sorted(keep)
            self._view = _Loaded(
                stamp=full.stamp,
                manifest=manifest,
                cards=cards,
                by_id={c.card_id: c for c in cards},
                sections=sections,
                sec_by_id={s.section_id: s for s in sections},
                assets=assets,
                toc=_prune_toc(full.toc, keep),
                routing={k: [x for x in v if x in ids] for k, v in full.routing.items() if any(x in ids for x in v)},
                quality=full.quality,
                texts={k: v for k, v in full.texts.items() if k in ids},
                index={k: v for k, v in full.index.items() if k in ids},
                idf=full.idf,
            )
            return self._view


def _prune_toc(nodes: list[dict[str, Any]], keep: frozenset[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for node in nodes:
        sid = node.get("sectionId")
        if node.get("type") == "doc" and sid and sid not in keep:
            continue
        children = _prune_toc(node.get("children") or [], keep)
        if node.get("type") == "dir" and not children:
            continue
        out.append({**node, "children": children} if node.get("children") is not None else node)
    return out
