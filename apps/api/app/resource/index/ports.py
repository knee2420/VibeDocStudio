"""knowledge 도메인 포트 — 유스케이스는 이 계약만 알고, 저장 위치 · LLM 공급자는 adapters 가 정한다.

작업 큐(`IndexJobRunner`)는 지금 프로세스 안의 스레드 풀이다. 여러 서버로 늘릴 때는
`JobStore` 를 공유 저장소(DB · Redis)로 바꾸고 워커를 별도 프로세스로 띄우면 된다 —
작업 단위가 멱등(조각 해시 캐시)이라 두 번 돌아도 결과가 같다.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, Protocol

from .models import IndexJob, KnowledgeDeck
from .pipeline.enrich import CardEnricher, EnrichmentCache


class DeckRegistry(Protocol):
    def list_decks(self, project_id: str) -> list[KnowledgeDeck]: ...

    def get_deck(self, project_id: str, deck_id: str) -> Optional[KnowledgeDeck]: ...

    def find_deck(self, deck_id: str) -> Optional[KnowledgeDeck]: ...

    def upsert_deck(self, project_id: str, deck: KnowledgeDeck) -> None: ...

    def delete_deck(self, project_id: str, deck_id: str) -> bool: ...


class DeckFiles(Protocol):
    """덱 본체 폴더의 위치."""

    def deck_dir(self, deck_id: str) -> Path: ...

    def remove(self, deck_id: str) -> None: ...


class JobStore(Protocol):
    def save(self, job: IndexJob) -> None: ...

    def get(self, job_id: str) -> Optional[IndexJob]: ...

    def list_unfinished(self) -> list[IndexJob]: ...

    def append_event(self, job_id: str, event: dict[str, Any]) -> None: ...

    def events(self, job_id: str, after: int = 0) -> list[dict[str, Any]]: ...


class EnricherFactory(Protocol):
    """작업마다 LLM 실행기를 만든다 (실행 정책의 현재 모델을 따른다). LLM 이 꺼져 있으면 None."""

    def __call__(self) -> Optional[CardEnricher]: ...


__all__ = [
    "CardEnricher",
    "DeckFiles",
    "DeckRegistry",
    "EnricherFactory",
    "EnrichmentCache",
    "JobStore",
]
