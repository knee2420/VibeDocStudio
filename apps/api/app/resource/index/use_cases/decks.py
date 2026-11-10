"""덱 목록 · 조회 유스케이스 (색인 자체는 `IndexJobRunner`)."""
from __future__ import annotations

import time
from typing import Any, Optional

from ..models import KnowledgeDeck
from ..pipeline.reader import DeckReader
from ..ports import DeckFiles, DeckRegistry


class DeckNotFoundError(KeyError):
    pass


class KnowledgeDeckService:
    def __init__(self, registry: DeckRegistry, files: DeckFiles) -> None:
        self._registry = registry
        self._files = files
        self._readers: dict[str, DeckReader] = {}

    def list_decks(self, project_id: str) -> list[KnowledgeDeck]:
        return self._registry.list_decks(project_id)

    def get(self, project_id: str, deck_id: str) -> KnowledgeDeck:
        deck = self._registry.get_deck(project_id, deck_id)
        if deck is None:
            raise DeckNotFoundError(deck_id)
        return deck

    def toggle(self, project_id: str, deck_id: str, is_checked: bool) -> KnowledgeDeck:
        deck = self.get(project_id, deck_id)
        deck.is_checked = is_checked
        deck.updated_at = int(time.time() * 1000)
        self._registry.upsert_deck(project_id, deck)
        return deck

    def select_sections(self, project_id: str, deck_id: str, section_ids: Optional[list[str]]) -> KnowledgeDeck:
        """AI 가 쓸 섹션만 남긴다. None · 빈 목록 · 전부 = 제한 없음."""
        deck = self.get(project_id, deck_id)
        known: Optional[set[str]] = None
        reader = self._readers.get(deck_id) or DeckReader(self._files.deck_dir(deck_id))
        if reader.exists:
            known = {s["sectionId"] for s in reader.sections_overview()}
        chosen = [s for s in dict.fromkeys(section_ids or []) if known is None or s in known]
        deck.selected_sections = [] if known is not None and set(chosen) >= known else chosen
        deck.updated_at = int(time.time() * 1000)
        self._registry.upsert_deck(project_id, deck)
        return deck

    def delete(self, project_id: str, deck_id: str) -> bool:
        deleted = self._registry.delete_deck(project_id, deck_id)
        if deleted:
            self._readers.pop(deck_id, None)
            self._files.remove(deck_id)
        return deleted

    def import_legacy(self, project_id: str, data: dict[str, Any]) -> KnowledgeDeck:
        """예전 `.deck.json`(목차만 있는 덱)을 목록에 올린다. 본체가 없으니 도구는 쓸 수 없다 — 재색인을 권한다."""
        deck = KnowledgeDeck.from_dict(data)
        deck.id = KnowledgeDeck().id
        deck.project_id = project_id
        deck.status = "ready"
        deck.error = "목차만 가져왔습니다. 원본 경로로 재색인하면 카드 · 원문 탐색을 쓸 수 있습니다."
        deck.updated_at = int(time.time() * 1000)
        self._registry.upsert_deck(project_id, deck)
        return deck

    # --- 본체 조회 (화면) ------------------------------------------------------------

    def reader(self, deck_id: str) -> DeckReader:
        reader = self._readers.get(deck_id)
        if reader is None:
            reader = DeckReader(self._files.deck_dir(deck_id))
            self._readers[deck_id] = reader
        if not reader.exists:
            raise DeckNotFoundError(f"색인 본체가 없습니다: {deck_id}")
        return reader

    def overview(self, deck_id: str) -> dict[str, Any]:
        reader = self.reader(deck_id)
        manifest = reader.manifest()
        return {
            "deckId": deck_id,
            "manifest": {k: manifest.get(k) for k in ("title", "depth", "model", "stats", "builtAt", "buildSeconds", "usage", "profile", "language")},
            "sections": reader.sections_overview(),
            "quality": reader.quality(),
            "assets": reader.assets(limit=400),
        }

    def card(self, deck_id: str, card_id: str) -> dict[str, Any]:
        return self.reader(deck_id).card_detail(card_id)

    def search(self, deck_id: str, query: str, mode: str = "lookup") -> dict[str, Any]:
        reader = self.reader(deck_id)
        return reader.grep(query) if mode == "grep" else reader.lookup(query)

    def toc(self, deck_id: str, section_id: Optional[str] = None) -> dict[str, Any]:
        return self.reader(deck_id).toc(section_id, max_level=4, max_lines=2000)
