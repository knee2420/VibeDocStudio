"""1층 · 2층 조립 — 카드 · 섹션 · 자산 · 목차(TOC) · 라우팅 표 · 가로축.

입력은 조각과 (있으면) LLM 보강 결과, 출력은 디스크에 쓰기 직전의 덱 전체다.
여기는 결정적이다: 같은 입력이면 같은 출력 (id · 순서 · 키워드).
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any, Optional

from .contracts import Asset, Card, Element, ScopeProfile, Section, Segment, SourceDoc
from .extract import (
    clean_term,
    extract,
    first_line_containing,
    grounded,
    strip_md,
    tokenize,
)

#: 문서 하나가 이보다 많은 조각을 내면 최상위 제목 단위로 섹션을 나눈다
MAX_CARDS_PER_SECTION = 40
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_MD_LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s#]+)(#[^)\s]*)?\)")


@dataclass
class TocNode:
    title: str
    level: int
    node_type: str  # dir | doc | heading
    source: str = ""
    card_id: str = ""
    section_id: str = ""
    line: Optional[int] = None
    children: list["TocNode"] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"title": self.title, "level": self.level, "type": self.node_type}
        for key, val in (("source", self.source), ("cardId", self.card_id), ("sectionId", self.section_id), ("line", self.line)):
            if val:
                out[key] = val
        if self.children:
            out["children"] = [c.to_dict() for c in self.children]
        return out


@dataclass
class DeckBuild:
    segments: list[Segment]
    cards: list[Card]
    sections: list[Section]
    assets: list[Asset]
    toc: list[TocNode]
    routing: dict[str, list[str]]
    #: 문서별 정규화 줄 (아카이브 쓰기 · 목차 줄 매핑에 쓴다)
    doc_lines: dict[int, list[str]]


def _section_groups(doc: SourceDoc, segments: list[Segment]) -> list[tuple[str, list[Segment]]]:
    if len(segments) <= MAX_CARDS_PER_SECTION:
        return [(doc.title or PurePosixPath(doc.rel_path).stem, segments)]
    groups: list[tuple[str, list[Segment]]] = []
    for seg in segments:
        top = seg.heading_path[0] if seg.heading_path else doc.title
        key = seg.heading_path[1] if len(seg.heading_path) > 1 and seg.heading_path[0] == doc.title else top
        if groups and groups[-1][0] == key and len(groups[-1][1]) < MAX_CARDS_PER_SECTION:
            groups[-1][1].append(seg)
        else:
            groups.append((key, [seg]))
    # 한 장짜리 그룹이 줄줄이 생기지 않게 작은 그룹은 앞 그룹에 붙인다
    merged: list[tuple[str, list[Segment]]] = []
    for title, segs in groups:
        if merged and len(segs) < 3 and len(merged[-1][1]) + len(segs) <= MAX_CARDS_PER_SECTION:
            merged[-1][1].extend(segs)
        else:
            merged.append((title, segs))
    return merged


def build_deck(
    docs: list[SourceDoc],
    segmented: dict[int, tuple[list[Segment], list[str]]],
    profile: ScopeProfile,
    enrichments: Optional[dict[str, dict[str, Any]]] = None,
) -> DeckBuild:
    enrichments = enrichments or {}
    cards: list[Card] = []
    sections: list[Section] = []
    assets: list[Asset] = []
    all_segments: list[Segment] = []
    doc_lines: dict[int, list[str]] = {}
    terms_by_card: dict[str, list[str]] = {}

    sec_no = 0
    for doc in docs:
        segs, lines = segmented.get(doc.doc_no, ([], []))
        doc_lines[doc.doc_no] = lines
        if not segs:
            continue
        for title, group in _section_groups(doc, segs):
            sec_no += 1
            section_id = f"SEC-{sec_no:02d}"
            card_ids: list[str] = []
            for c_no, seg in enumerate(group, start=1):
                card_id = f"C-{sec_no:02d}-{c_no:02d}"
                ex = extract(seg, asset_prefix=f"{sec_no:02d}-{c_no:02d}")
                for asset in ex.assets:
                    asset.card_id = card_id
                card = Card(
                    card_id=card_id,
                    section_id=section_id,
                    segment_id=seg.segment_id,
                    title=seg.title,
                    heading_path=seg.heading_path,
                    summary=ex.summary,
                    elements=ex.elements,
                    keywords=[],
                    questions=[],
                    anchor=seg.anchor,
                    archive_path=seg.archive_path,
                    asset_ids=[a.asset_id for a in ex.assets],
                )
                _apply_enrichment(card, seg, enrichments.get(seg.segment_id))
                cards.append(card)
                assets.extend(ex.assets)
                card_ids.append(card_id)
                terms_by_card[card_id] = ex.terms
                all_segments.append(seg)
            sections.append(Section(section_id=section_id, title=title, source=doc.rel_path, card_ids=card_ids))

    seg_by_id = {s.segment_id: s for s in all_segments}
    _assign_keywords(cards, seg_by_id, terms_by_card)
    _assign_links(cards, docs, seg_by_id)
    _describe_sections(sections, cards)
    _relate_sections(sections)
    toc = _build_toc(docs, sections, cards, doc_lines)
    # 길잡이 말 = 원문이 강조한 용어(코드 · 굵은 글씨 · 옵션) + 제목에 나온 말
    term_tokens: set[str] = set()
    for card in cards:
        term_tokens.update(k for k in (clean_term(t) for t in terms_by_card.get(card.card_id, [])) if k)
        term_tokens.update(tokenize(" ".join(card.heading_path)))
        term_tokens.update(a.lower() for a in card.aliases)
    routing = _routing_table(cards, term_tokens)
    return DeckBuild(all_segments, cards, sections, assets, toc, routing, doc_lines)


# --- LLM 보강 병합 ----------------------------------------------------------------


def _apply_enrichment(card: Card, seg: Segment, data: Optional[dict[str, Any]]) -> None:
    if not data:
        return
    card.depth = "enriched"
    summary = str(data.get("summary") or "").strip()
    if summary:
        card.summary = summary[:600]
    title = str(data.get("title") or "").strip()
    if title and len(title) <= 80 and not card.title.endswith(")"):
        # 원래 제목은 앵커 · 목차와 맞아야 하므로 바꾸지 않고 별칭에 넣는다
        card.aliases.append(title)
    llm_elements: list[Element] = []
    dropped = 0
    for raw in data.get("elements") or []:
        name = str((raw or {}).get("name") or "").strip()
        detail = str((raw or {}).get("detail") or "").strip()
        if not name:
            continue
        if not grounded(name, seg.text):
            dropped += 1
            continue
        llm_elements.append(Element(name=name[:100], detail=detail[:300], line=first_line_containing(seg, name), origin="llm"))
    card.dropped_elements = dropped
    # 규칙 추출(표 · 정의 · 명령어)이 앞선다 — LLM 요소는 빠진 것만 채운다
    seen = {e.name.lower() for e in card.elements}
    for el in llm_elements:
        if el.name.lower() not in seen:
            card.elements.append(el)
            seen.add(el.name.lower())
    card.elements = card.elements[:48]
    card.aliases.extend(str(a).strip()[:60] for a in data.get("aliases") or [] if str(a).strip())
    card.questions = [str(q).strip()[:200] for q in data.get("questions") or [] if str(q).strip()][:5]
    card.keywords = [str(k).strip()[:40] for k in data.get("keywords") or [] if str(k).strip()][:12]
    card.aliases = list(dict.fromkeys(card.aliases))[:10]


# --- 키워드 (TF-IDF) ------------------------------------------------------------


def _card_tokens(card: Card, seg: Segment, terms: list[str]) -> Counter:
    counts: Counter = Counter()
    for tok in tokenize(seg.text):
        counts[tok] += 1
    for tok in tokenize(" ".join(card.heading_path)):
        counts[tok] += 4
    for term in terms:
        key = clean_term(term)
        if key:
            counts[key] += 3
    for el in card.elements:
        for tok in tokenize(el.name):
            counts[tok] += 2
    return counts


def _assign_keywords(cards: list[Card], seg_by_id: dict[str, Segment], terms_by_card: dict[str, list[str]]) -> None:
    per_card = {c.card_id: _card_tokens(c, seg_by_id[c.segment_id], terms_by_card.get(c.card_id, [])) for c in cards}
    df: Counter = Counter()
    for counts in per_card.values():
        df.update(counts.keys())
    n = max(len(cards), 1)
    for card in cards:
        counts = per_card[card.card_id]
        total = sum(counts.values()) or 1
        scored = sorted(
            ((tok, (cnt / total) * math.log((1 + n) / (1 + df[tok])) + 0.0001 * cnt) for tok, cnt in counts.items()),
            key=lambda x: (-x[1], x[0]),
        )
        auto = [tok for tok, _ in scored if df[tok] < max(3, n * 0.6)][:10]
        merged = list(dict.fromkeys([*card.keywords, *auto]))
        card.keywords = merged[:14]


# --- 연결 (밖으로) ---------------------------------------------------------------


def _assign_links(cards: list[Card], docs: list[SourceDoc], seg_by_id: dict[str, Segment]) -> None:
    by_source: dict[str, list[Card]] = defaultdict(list)
    for card in cards:
        by_source[card.anchor.source].append(card)
    doc_paths = [d.rel_path for d in docs]
    # 1) 원문에 적힌 링크 → 그 문서의 첫 카드 (또는 제목이 앵커와 맞는 카드)
    for card in cards:
        seg = seg_by_id[card.segment_id]
        base = PurePosixPath(card.anchor.source).parent
        for target, frag in _MD_LINK.findall(seg.text):
            if re.match(r"^[a-z]+:", target):
                continue
            resolved = _resolve_rel(base, target, doc_paths)
            if not resolved or resolved == card.anchor.source:
                continue
            targets = by_source.get(resolved) or []
            chosen = targets[0] if targets else None
            if frag and targets:
                slug = frag.lstrip("#").replace("-", " ").lower()
                chosen = next((t for t in targets if slug and slug in t.title.lower()), chosen)
            if chosen and chosen.card_id not in card.links_out:
                card.links_out.append(chosen.card_id)
    # 2) 키워드가 겹치는 다른 섹션의 카드 (가로축) — 상위 3개
    kw_sets = {c.card_id: set(k.lower() for k in c.keywords[:10]) for c in cards}
    for card in cards:
        mine = kw_sets[card.card_id]
        if not mine:
            continue
        scored: list[tuple[float, str]] = []
        for other in cards:
            if other.section_id == card.section_id:
                continue
            theirs = kw_sets[other.card_id]
            inter = len(mine & theirs)
            if inter < 2:
                continue
            scored.append((inter / len(mine | theirs), other.card_id))
        for score, cid in sorted(scored, reverse=True)[:3]:
            if score >= 0.15 and cid not in card.links_out:
                card.links_out.append(cid)


def _resolve_rel(base: PurePosixPath, target: str, doc_paths: list[str]) -> Optional[str]:
    parts: list[str] = []
    for part in (base / target).parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part not in (".", ""):
            parts.append(part)
    cand = "/".join(parts)
    stems = [cand, cand.rstrip("/") + ".md", cand.rstrip("/") + ".mdx", cand.rstrip("/") + "/index.md", cand.rstrip("/") + "/index.mdx"]
    for stem in stems:
        if stem in doc_paths:
            return stem
    # 사이트 경로(`/docs/guides/x`)처럼 확장자 없이 끝부분만 맞는 경우
    tail = target.strip("/").split("/")[-1]
    if tail:
        hits = [p for p in doc_paths if PurePosixPath(p).stem == tail or PurePosixPath(p).parent.name == tail]
        if len(hits) == 1:
            return hits[0]
    return None


# --- 섹션 설명 · 가로축 ------------------------------------------------------------


def _describe_sections(sections: list[Section], cards: list[Card]) -> None:
    by_id = {c.card_id: c for c in cards}
    for sec in sections:
        members = [by_id[cid] for cid in sec.card_ids]
        counts: Counter = Counter()
        for card in members:
            counts.update(k.lower() for k in card.keywords[:8])
        sec.keywords = [k for k, _ in counts.most_common(10)]
        first = members[0].summary if members else ""
        sec.description = strip_md(first)[:200]


def _relate_sections(sections: list[Section]) -> None:
    for sec in sections:
        mine = set(sec.keywords[:8])
        scored = []
        for other in sections:
            if other.section_id == sec.section_id:
                continue
            inter = mine & set(other.keywords[:8])
            if len(inter) >= 2:
                scored.append((len(inter), other.section_id))
        sec.related = [sid for _, sid in sorted(scored, reverse=True)[:4]]


# --- 목차 (TOC) -----------------------------------------------------------------


def _build_toc(docs: list[SourceDoc], sections: list[Section], cards: list[Card], doc_lines: dict[int, list[str]]) -> list[TocNode]:
    cards_by_source: dict[str, list[Card]] = defaultdict(list)
    for card in cards:
        cards_by_source[card.anchor.source].append(card)
    sec_by_source: dict[str, list[Section]] = defaultdict(list)
    for sec in sections:
        sec_by_source[sec.source].append(sec)

    root: list[TocNode] = []
    dirs: dict[str, TocNode] = {}

    def dir_node(path: PurePosixPath) -> Optional[TocNode]:
        if str(path) in ("", "."):
            return None
        key = str(path)
        if key in dirs:
            return dirs[key]
        parent = dir_node(path.parent)
        node = TocNode(title=path.name, level=len(path.parts), node_type="dir", source=key)
        dirs[key] = node
        (parent.children if parent else root).append(node)
        return node

    for doc in docs:
        doc_cards = cards_by_source.get(doc.rel_path)
        if not doc_cards:
            continue
        rel = PurePosixPath(doc.rel_path)
        parent = dir_node(rel.parent) if len(rel.parts) > 1 else None
        first_sec = sec_by_source[doc.rel_path][0].section_id
        doc_node = TocNode(title=doc.title or rel.stem, level=len(rel.parts), node_type="doc", source=doc.rel_path,
                           card_id=doc_cards[0].card_id, section_id=first_sec)
        (parent.children if parent else root).append(doc_node)
        lines = doc_lines.get(doc.doc_no, [])
        stack: list[tuple[int, TocNode]] = []
        in_fence = False
        for idx, line in enumerate(lines):
            if line.lstrip().startswith(("```", "~~~")):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            m = _HEADING.match(line)
            if not m or len(m.group(1)) > 4:
                continue
            level = len(m.group(1))
            line_no = idx + 1
            owner = next((c for c in doc_cards if c.anchor.line_start <= line_no <= c.anchor.line_end), None)
            node = TocNode(title=strip_md(m.group(2))[:120], level=level, node_type="heading", source=doc.rel_path,
                           card_id=owner.card_id if owner else "", section_id=owner.section_id if owner else "", line=line_no)
            while stack and stack[-1][0] >= level:
                stack.pop()
            (stack[-1][1].children if stack else doc_node.children).append(node)
            stack.append((level, node))
    return root


# --- 라우팅 표 --------------------------------------------------------------------


def _routing_table(cards: list[Card], term_tokens: set[str], limit: int = 160) -> dict[str, list[str]]:
    postings: dict[str, list[str]] = defaultdict(list)
    for card in cards:
        for kw in card.keywords[:10]:
            postings[kw.lower()].append(card.card_id)
        for alias in card.aliases[:4]:
            postings[alias.lower()].append(card.card_id)
    n = max(len(cards), 1)
    cap = max(8, n // 6)
    # 강조된 용어를 먼저, 그 안에서는 적은 카드를 가리키는(변별력 있는) 말을 먼저
    ranked = sorted(
        ((kw, list(dict.fromkeys(ids))) for kw, ids in postings.items() if len(set(ids)) <= cap),
        key=lambda kv: (kv[0] not in term_tokens, len(kv[1]) == 1, len(kv[1]), kv[0]),
    )
    chosen = sorted(ranked[:limit], key=lambda kv: kv[0])
    return {kw: ids[:8] for kw, ids in chosen}
