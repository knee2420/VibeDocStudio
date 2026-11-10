"""`knowledge.*` 서버 도구 — Composer 가 덱을 첨부하면 assistant 가 이 도구들을 모델에 알려 준다.

도구는 서버에서 실행된다 (덱 본체가 서버에 있고, 수천 장 카드 · 원문 grep 을 브라우저로 옮길 수 없다).
assistant 도메인은 이 모듈을 import 하지 않는다 — 컨테이너가 `ServerToolbox` 포트로 꽂아 준다.

범위(scope): 이번 메시지에 첨부된 덱 id 들. 도구는 범위 밖의 덱을 읽지 않는다.
덱 id 뒤에 `#SEC-01,SEC-03` 이 붙으면 사용자가 RM 에서 고른 섹션만 보인다 (나머지 섹션은 없는 것처럼).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Optional

from harness_kit import packs

from ..pipeline.reader import DeckReader
from ..ports import DeckFiles

_DECK = {"type": "string", "description": "덱 id. 첨부된 덱이 하나면 생략"}


def split_scope_ref(ref: str) -> tuple[str, Optional[set[str]]]:
    """`deck_x#SEC-01,SEC-03` → ("deck_x", {"SEC-01", "SEC-03"}). 섹션 표시가 없으면 (deck_x, None)."""
    deck_id, _, secs = str(ref).partition("#")
    chosen = {x.strip() for x in secs.split(",") if x.strip()}
    return deck_id, (chosen or None)

#: knowledge.* 도구 명세 — 하네스 resource 팩 (index)
SPECS: list[dict[str, Any]] = packs.tool_specs("resource", "index/tools.json")
_NAMES = {s["name"] for s in SPECS}
#: 근거 종류 (프론트 `EvidenceLocator.kind` 와 같은 값)
EVIDENCE_KCARD = "kcard"


class KnowledgeToolbox:
    """assistant 의 `ServerToolbox` 포트 구현."""

    def __init__(self, files: DeckFiles, skill_dir: Optional[Path] = None,
                 deck_exists: Optional[Callable[[str], bool]] = None) -> None:
        self._files = files
        self._skill_dir = skill_dir
        self._readers: dict[str, DeckReader] = {}
        self._deck_exists = deck_exists

    # --- 포트 ----------------------------------------------------------------------

    def specs(self) -> list[dict[str, Any]]:
        return [dict(s) for s in SPECS]

    def handles(self, name: str) -> bool:
        return name in _NAMES

    def context_kind(self) -> str:
        return "deck"

    def skill_text(self) -> str:
        if not self._skill_dir:
            return ""
        path = self._skill_dir / "SKILL.md"
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            return ""
        return re.sub(r"^---\n.*?\n---\n", "", raw, flags=re.S).strip()

    def brief(self, deck_id: str) -> Optional[str]:
        reader = self._reader(deck_id)
        if reader is None:
            return None
        _, sections = split_scope_ref(deck_id)
        text = reader.brief()
        if sections:
            text += f"\n(사용자가 고른 섹션만 쓴다: {', '.join(sorted(sections))} — 나머지 섹션은 이 대화의 범위가 아니다)"
        return text

    def describe(self, name: str, args: dict[str, Any]) -> str:
        """도구 카드 한 줄 요약."""
        short = {
            "knowledge.toc": lambda a: f"목차 {a.get('sectionId') or ''}".strip(),
            "knowledge.lookup": lambda a: f"색인 찾기: {a.get('query', '')}",
            "knowledge.grep": lambda a: f"원문 grep: {a.get('pattern', '')}",
            "knowledge.section": lambda a: f"섹션 {a.get('sectionId', '')}",
            "knowledge.cards": lambda a: f"카드 {', '.join(a.get('cardIds') or [])}",
            "knowledge.assets": lambda a: f"자산 {a.get('kind') or ''} {a.get('query') or ''}".strip(),
            "knowledge.source": lambda a: f"원문 {a.get('cardId', '')}",
        }
        try:
            return short[name](args)
        except Exception:
            return name

    def run(self, name: str, args: dict[str, Any], scope: list[str]) -> Any:
        if name not in _NAMES:
            raise KeyError(f"알 수 없는 도구: {name}")
        if not scope:
            raise PermissionError("이 대화에 첨부된 지식 덱이 없습니다. Resource Manager 에서 덱을 첨부하세요.")
        deck_ids = self._resolve_decks(args.get("deckId"), scope, allow_all=name in ("knowledge.lookup", "knowledge.grep", "knowledge.assets"))
        if len(deck_ids) > 1:
            return {"byDeck": [{"deckId": split_scope_ref(ref)[0], **self._run_one(name, args, ref)} for ref in deck_ids]}
        return {"deckId": split_scope_ref(deck_ids[0])[0], **self._run_one(name, args, deck_ids[0])}

    # --- 내부 ----------------------------------------------------------------------

    def _reader(self, ref: str) -> Optional[DeckReader]:
        """덱 읽기 — `ref` 에 섹션 표시가 있으면 그 섹션만 보이는 창을 준다."""
        deck_id, sections = split_scope_ref(ref)
        reader = self._readers.get(deck_id)
        if reader is None:
            reader = DeckReader(self._files.deck_dir(deck_id))
            self._readers[deck_id] = reader
        if not reader.exists:
            return None
        return reader.scoped(sections)

    def _resolve_decks(self, requested: Any, scope: list[str], *, allow_all: bool) -> list[str]:
        by_id = {split_scope_ref(ref)[0]: ref for ref in scope}
        if requested:
            ref = by_id.get(split_scope_ref(str(requested))[0])
            if ref is None:
                raise PermissionError(f"첨부되지 않은 덱입니다: {requested} (첨부: {', '.join(by_id)})")
            return [ref]
        if len(scope) == 1 or allow_all:
            return list(scope)
        raise ValueError(f"덱이 여러 개 첨부됐습니다. deckId 를 지정하세요: {', '.join(by_id)}")

    def _run_one(self, name: str, args: dict[str, Any], deck_id: str) -> dict[str, Any]:
        reader = self._reader(deck_id)
        if reader is None:
            raise FileNotFoundError(f"덱이 아직 색인되지 않았습니다: {deck_id}")
        if name == "knowledge.toc":
            return reader.toc(args.get("sectionId"), max_level=int(args.get("maxLevel") or 3))
        if name == "knowledge.lookup":
            return reader.lookup(str(args.get("query") or ""))
        if name == "knowledge.grep":
            return reader.grep(str(args.get("pattern") or ""), regex=bool(args.get("regex")), section_id=args.get("sectionId"))
        if name == "knowledge.section":
            return reader.section(str(args.get("sectionId") or ""))
        if name == "knowledge.cards":
            ids = args.get("cardIds") or ([args["cardId"]] if args.get("cardId") else [])
            return {"cards": reader.cards([str(x) for x in ids])}
        if name == "knowledge.assets":
            return reader.assets(args.get("kind"), str(args.get("query") or ""))
        if name == "knowledge.source":
            lf, lt = args.get("lineFrom"), args.get("lineTo")
            return reader.source(str(args.get("cardId") or ""), line_from=int(lf) if lf else None, line_to=int(lt) if lt else None)
        raise KeyError(name)

    # --- 하네스 근거 묶음 (ServerToolbox 포트) --------------------------------------------

    def _card_locator(self, deck_id: str, card_id: str, *, tier: str = "direct", max_chars: int = 2200) -> Optional[dict[str, Any]]:
        reader = self._reader(deck_id)
        if reader is None:
            return None
        cards = reader.cards([card_id], max_elements=12)
        if not cards or "error" in cards[0]:
            return None
        card = cards[0]
        src = reader.source(card_id, max_chars=max_chars)
        source_path, _, rng = card["source"].partition("#")
        lines = None
        if rng.startswith("L") and "-L" in rng:
            a, b = rng[1:].split("-L", 1)
            lines = [int(a), int(b)]
        sha = next((s.get("sha") for s in reader.manifest().get("sources", []) if s.get("path") == source_path), None)
        elements = "; ".join(f"{e['name']}: {e.get('detail', '')}" for e in card["elements"][:8])
        excerpt = f"[{card['title']}] {card['summary']}\n요소: {elements}\n원문:\n{src['text']}"
        return {
            "kind": EVIDENCE_KCARD, "refId": f"{deck_id}:{card_id}", "label": f"{card_id} {card['title']}",
            "deckId": deck_id, "cardId": card_id, "sourcePath": source_path, "lines": lines, "sourceSha": sha,
            "excerpt": excerpt, "tier": tier,
        }

    def resolve_evidence(self, locators: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for loc in locators:
            deck_id, card_id = loc.get("deckId"), loc.get("cardId")
            if (not deck_id or not card_id) and ":" in str(loc.get("refId", "")):
                deck_id, card_id = str(loc["refId"]).split(":", 1)
            if not deck_id or not card_id:
                continue
            item = self._card_locator(str(deck_id), str(card_id), tier=str(loc.get("tier") or "direct"))
            if item:
                out.append(item)
        return out

    def suggest_evidence(self, scope: list[str], query: str, limit: int = 4) -> list[dict[str, Any]]:
        scored: list[tuple[float, str, str]] = []
        for ref in scope:
            reader = self._reader(ref)  # 고른 섹션 안에서만 추천
            if reader is None:
                continue
            for cand in reader.lookup(query, limit=limit)["candidates"]:
                scored.append((float(cand["score"]), split_scope_ref(ref)[0], cand["cardId"]))
        out = []
        for _, deck_id, card_id in sorted(scored, reverse=True)[:limit]:
            item = self._card_locator(deck_id, card_id, tier="suggested", max_chars=1600)
            if item:
                out.append(item)
        return out
