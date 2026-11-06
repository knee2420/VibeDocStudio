"""덱을 디스크에 쓴다 — 기계용 JSON 과 사람 · 에이전트용 마크다운을 함께.

    <deck>/deck.json              매니페스트 (스키마 · 원본 · 프로필 · 통계 · 품질 요약)
    <deck>/index.md               루트 인덱스: 지도 · 목차 · 자산 목록 · 라우팅 표 · 가로축
    <deck>/sections/SEC-NN.md     로컬 인덱스: 카드 목록
    <deck>/cards/C-SS-NN.md       카드
    <deck>/archive/<문서>/NNN_<제목>.md   0층 조각 (grep 대상)
    <deck>/{segments,cards,sections,assets,toc,routing,quality}.json

JSON 은 도구(`knowledge.*`)가 읽고, 마크다운은 사람이 읽거나 파일 도구만 가진 에이전트가 읽는다.
두 표현은 같은 빌드에서 함께 나오므로 어긋나지 않는다.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

from .assemble import DeckBuild, TocNode
from .contracts import SCHEMA_VERSION, Card, Segment, SourceDoc

#: 아카이브 파일에서 본문이 시작하는 줄 (프론트매터 7줄 다음)
ARCHIVE_BODY_LINE = 8


def slugify(text: str, limit: int = 48) -> str:
    slug = re.sub(r"[^\w가-힣]+", "-", text.strip().lower()).strip("-")
    return (slug or "untitled")[:limit]


def assign_archive_paths(docs: list[SourceDoc], segmented: dict[int, tuple[list[Segment], list[str]]]) -> None:
    for doc in docs:
        segs, _ = segmented.get(doc.doc_no, ([], []))
        doc_slug = f"{doc.doc_no:03d}_{slugify(Path(doc.rel_path).with_suffix('').as_posix().replace('/', '_'), 60)}"
        for seg in segs:
            seg.archive_path = f"archive/{doc_slug}/{seg.seq:03d}_{slugify(seg.title, 40)}.md"
            seg.archive_body_line = ARCHIVE_BODY_LINE


def _dump(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_deck(deck_dir: Path, build: DeckBuild, manifest: dict[str, Any], quality: dict[str, Any]) -> None:
    """빌드 결과를 임시 폴더에 다 쓴 뒤 한 번에 바꿔 끼운다 (읽는 쪽이 반쯤 쓴 덱을 보지 않게)."""
    staging = deck_dir.with_name(deck_dir.name + ".building")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    card_by_segment = {c.segment_id: c for c in build.cards}
    for seg in build.segments:
        card = card_by_segment.get(seg.segment_id)
        front = "\n".join([
            "---",
            f"segment: {seg.segment_id}",
            f"card: {card.card_id if card else ''}",
            f"source: {seg.anchor.source}",
            f"lines: {seg.anchor.line_start}-{seg.anchor.line_end}" + (f" (p.{seg.anchor.page})" if seg.anchor.page else ""),
            f"heading: {' > '.join(seg.heading_path)[:200]}",
            "---",
        ])
        _write(staging / seg.archive_path, f"{front}\n{seg.text}\n")

    _dump(staging / "segments.json", [s.to_dict() for s in build.segments])
    _dump(staging / "cards.json", [c.to_dict() for c in build.cards])
    _dump(staging / "sections.json", [s.to_dict() for s in build.sections])
    _dump(staging / "assets.json", [a.to_dict() for a in build.assets])
    _dump(staging / "toc.json", [n.to_dict() for n in build.toc])
    _dump(staging / "routing.json", build.routing)
    _dump(staging / "quality.json", quality)
    _dump(staging / "deck.json", {**manifest, "schema": SCHEMA_VERSION})

    cards_by_id = {c.card_id: c for c in build.cards}
    for card in build.cards:
        _write(staging / "cards" / f"{card.card_id}.md", render_card(card, cards_by_id))
    for sec in build.sections:
        _write(staging / "sections" / f"{sec.section_id}.md", render_section(sec, cards_by_id))
    _write(staging / "index.md", render_root(manifest, build, quality))

    backup = deck_dir.with_name(deck_dir.name + ".old")
    if backup.exists():
        shutil.rmtree(backup)
    if deck_dir.exists():
        deck_dir.replace(backup)
    staging.replace(deck_dir)
    if backup.exists():
        shutil.rmtree(backup, ignore_errors=True)


# --- 마크다운 렌더 ----------------------------------------------------------------


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_card(card: Card, cards_by_id: dict[str, Card]) -> str:
    lines = [
        "---",
        f"id: {card.card_id}",
        f"section: {card.section_id}",
        f"source: {card.anchor.source}",
        f"lines: {card.anchor.line_start}-{card.anchor.line_end}",
        f"depth: {card.depth}",
        "---",
        f"# {card.card_id} {card.title}",
        "",
        f"> {' > '.join(card.heading_path)}",
        "",
        "## summary",
        card.summary or "(요약 없음)",
        "",
    ]
    if card.elements:
        lines += ["## elements", "| 요소 | 내용 | 줄 |", "|---|---|---|"]
        for el in card.elements:
            lines.append(f"| {_cell(el.name)} | {_cell(el.detail)} | {el.line or ''} |")
        lines.append("")
    if card.asset_ids:
        lines += ["## 자산", ", ".join(card.asset_ids), ""]
    if card.keywords or card.aliases:
        lines += ["## 키워드", ", ".join([*card.keywords, *card.aliases]), ""]
    if card.questions:
        lines += ["## 이 카드로 답할 수 있는 질문", *[f"- {q}" for q in card.questions], ""]
    if card.links_out:
        lines += ["## 밖으로"]
        for cid in card.links_out:
            other = cards_by_id.get(cid)
            lines.append(f"- [{cid}]({cid}.md) {other.title if other else ''}")
        lines.append("")
    lines += ["## 원문", f"- [{card.anchor.label()}](../{card.archive_path})", ""]
    return "\n".join(lines)


def render_section(sec, cards_by_id: dict[str, Card]) -> str:  # noqa: ANN001
    lines = [
        "---",
        f"id: {sec.section_id}",
        f"source: {sec.source}",
        f"cards: {len(sec.card_ids)}",
        "---",
        f"# {sec.section_id} {sec.title}",
        "",
        sec.description,
        "",
        f"키워드: {', '.join(sec.keywords)}" if sec.keywords else "",
        f"관련 섹션(가로축): {', '.join(sec.related)}" if sec.related else "",
        "",
        "| 카드 | 제목 | 요약 | 줄 |",
        "|---|---|---|---|",
    ]
    for cid in sec.card_ids:
        card = cards_by_id[cid]
        lines.append(
            f"| [{cid}](../cards/{cid}.md) | {_cell(card.title)} | {_cell(card.summary[:140])} | "
            f"{card.anchor.line_start}-{card.anchor.line_end} |"
        )
    return "\n".join(lines) + "\n"


def _toc_lines(nodes: list[TocNode], depth: int = 0, out: list[str] | None = None, max_heading_level: int = 3) -> list[str]:
    out = out if out is not None else []
    for node in nodes:
        if node.node_type == "heading" and node.level > max_heading_level:
            continue
        pad = "  " * depth
        if node.node_type == "dir":
            out.append(f"{pad}- 📁 {node.title}/")
        elif node.node_type == "doc":
            out.append(f"{pad}- 📄 {node.title} — `{node.source}` → {node.section_id}")
        else:
            out.append(f"{pad}- {node.title} → {node.card_id}")
        _toc_lines(node.children, depth + 1, out, max_heading_level)
    return out


def render_root(manifest: dict[str, Any], build: DeckBuild, quality: dict[str, Any]) -> str:
    stats = manifest.get("stats", {})
    lines = [
        "---",
        f"schema: {SCHEMA_VERSION}",
        f"deck: {manifest.get('deckId')}",
        f"title: {manifest.get('title')}",
        f"built: {manifest.get('builtAt')}",
        f"depth: {manifest.get('depth')}",
        "---",
        f"# {manifest.get('title')}",
        "",
        f"원본 {stats.get('files', 0)}개 · 섹션 {stats.get('sections', 0)} · 카드 {stats.get('cards', 0)} · "
        f"표 {stats.get('tables', 0)} · 그림 {stats.get('figures', 0)} · 코드 {stats.get('codeBlocks', 0)}",
        "",
        "## 사용법",
        "지도(섹션) → 섹션 인덱스 → 카드 → 원문 순서로 내려간다. 정확한 용어는 archive/ 를 grep 하고,",
        "찾은 줄이 속한 카드를 다시 확인해 범위를 좁힌다. 답에는 카드 id 와 원문 줄을 출처로 남긴다.",
        "",
        "## 지도 (섹션)",
        "| 섹션 | 제목 | 원본 | 카드 | 설명 |",
        "|---|---|---|---|---|",
    ]
    for sec in build.sections:
        lines.append(f"| [{sec.section_id}](sections/{sec.section_id}.md) | {_cell(sec.title)} | `{sec.source}` | "
                     f"{len(sec.card_ids)} | {_cell(sec.description[:120])} |")
    lines += ["", "## 목차 (원문 순서)", *_toc_lines(build.toc), ""]
    if build.assets:
        lines += ["## 자산 목록 (표 · 그림 · 코드)", "| id | 종류 | 캡션 | 열/대상 | 카드 |", "|---|---|---|---|---|"]
        for asset in build.assets:
            if asset.kind == "code" and len(build.assets) > 200:
                continue  # 코드 블록이 아주 많으면 루트에서는 표 · 그림만 보인다 (knowledge.assets 로 전체 조회)
            extra = ", ".join(asset.columns[:6]) if asset.kind == "table" else (asset.target or ", ".join(asset.columns))
            if asset.kind == "table":
                extra = f"{extra} ({asset.rows}행)"
            lines.append(f"| {asset.asset_id} | {asset.kind} | {_cell(asset.caption[:80])} | {_cell(extra[:80])} | {asset.card_id} |")
        lines.append("")
    if build.routing:
        lines += ["## 라우팅 표 (키워드 → 카드)"]
        for kw, ids in list(build.routing.items())[:120]:
            lines.append(f"- {kw}: {', '.join(ids)}")
        lines.append("")
    related = [(s.section_id, s.related) for s in build.sections if s.related]
    if related:
        lines += ["## 가로축 (섹션 ↔ 섹션)"]
        for sid, rel in related:
            lines.append(f"- {sid} ↔ {', '.join(rel)}")
        lines.append("")
    gates = quality.get("gates", {})
    if gates:
        lines += ["## 품질", *[f"- {name}: {'통과' if g.get('pass') else '미달'} ({g.get('value')})" for name, g in gates.items()], ""]
    return "\n".join(lines)
