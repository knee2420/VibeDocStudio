"""품질 게이트 — 색인이 "제대로" 됐는지 숫자로 판정한다.

게이트가 미달이면 덱은 `ready` 이지만 경고를 단다 (사용자가 범위 · 깊이를 다시 고를 수 있게).
"""
from __future__ import annotations

from typing import Any

from .assemble import DeckBuild
from .contracts import ScopeProfile, SourceDoc
from .ingest import IngestReport


def _gate(value: float, threshold: float, *, higher_is_better: bool = True, fmt: str = "{:.2f}") -> dict[str, Any]:
    ok = value >= threshold if higher_is_better else value <= threshold
    return {"pass": ok, "value": fmt.format(value), "threshold": fmt.format(threshold)}


def evaluate(build: DeckBuild, docs: list[SourceDoc], ingest: IngestReport, profile: ScopeProfile) -> dict[str, Any]:
    cards = build.cards
    n_cards = max(len(cards), 1)

    # 1) 커버리지: 원문 문자 중 조각에 들어간 비율 (빈 줄 제외)
    total_chars = sum(len("".join(ln.strip() for ln in build.doc_lines.get(d.doc_no, []))) for d in docs) or 1
    covered = sum(len("".join(ln.strip() for ln in s.text.split("\n"))) for s in build.segments)
    coverage = min(covered / total_chars, 1.0)

    # 2) 조각 크기가 경계 안에 드는 비율
    sizes = [len(s.text) for s in build.segments]
    in_bounds = sum(1 for n in sizes if n <= profile.max_segment_chars * 1.3) / max(len(sizes), 1)

    # 3) 앵커: 카드의 줄 범위가 원문 안에 있는가
    lines_by_source = {d.rel_path: len(build.doc_lines.get(d.doc_no, [])) for d in docs}
    bad_anchor = sum(
        1 for c in cards
        if c.anchor.line_start < 1 or c.anchor.line_end < c.anchor.line_start or c.anchor.line_end > lines_by_source.get(c.anchor.source, 0)
    )

    # 4) 연결: 끊긴 링크 · 고아 카드(들어오고 나가는 연결이 모두 없는 카드)
    ids = {c.card_id for c in cards}
    broken = sum(1 for c in cards for cid in c.links_out if cid not in ids)
    inbound = {cid for c in cards for cid in c.links_out}
    orphans = sum(1 for c in cards if not c.links_out and c.card_id not in inbound)

    # 5) 요소 밀도 · 근거 확인
    elements = sum(len(c.elements) for c in cards)
    dropped = sum(c.dropped_elements for c in cards)
    enriched = sum(1 for c in cards if c.depth == "enriched")
    grounded_ratio = 1.0 - dropped / max(dropped + sum(1 for c in cards for e in c.elements if e.origin == "llm"), 1)

    # 6) 자산: 표에 캡션 · 열이 있는가, 그림에 설명이 있는가
    tables = [a for a in build.assets if a.kind == "table"]
    figures = [a for a in build.assets if a.kind == "figure"]
    tables_ok = sum(1 for a in tables if a.columns and a.caption) / max(len(tables), 1)
    figures_ok = sum(1 for a in figures if a.caption and a.caption != a.target) / max(len(figures), 1)

    gates = {
        "coverage": _gate(coverage, 0.97),
        "segmentSize": _gate(in_bounds, 0.95),
        "anchors": _gate(bad_anchor, 0, higher_is_better=False, fmt="{:.0f}"),
        "brokenLinks": _gate(broken, 0, higher_is_better=False, fmt="{:.0f}"),
        "elementDensity": _gate(elements / n_cards, 1.5),
    }
    if tables:
        gates["tableLabels"] = _gate(tables_ok, 0.9)
    if figures:
        gates["figureLabels"] = _gate(figures_ok, 0.8)
    if enriched:
        gates["grounding"] = _gate(grounded_ratio, 0.85)
    return {
        "gates": gates,
        "passed": all(g["pass"] for g in gates.values()),
        "metrics": {
            "coverage": round(coverage, 4),
            "segments": len(build.segments),
            "cards": len(cards),
            "enrichedCards": enriched,
            "elements": elements,
            "elementsPerCard": round(elements / n_cards, 2),
            "droppedLlmElements": dropped,
            "orphanCards": orphans,
            "brokenLinks": broken,
            "badAnchors": bad_anchor,
            "tables": len(tables),
            "figures": len(figures),
            "codeBlocks": sum(1 for a in build.assets if a.kind == "code"),
            "segmentChars": {"min": min(sizes) if sizes else 0, "max": max(sizes) if sizes else 0,
                             "mean": round(sum(sizes) / max(len(sizes), 1))},
        },
        "skipped": ingest.skipped,
        "unindexedImages": ingest.images[:200],
    }
