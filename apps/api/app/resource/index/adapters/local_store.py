"""로컬 파일 기반 저장 어댑터 — 덱 목록 · 덱 폴더 · 색인 작업 · 보강 캐시.

    data/knowledge/decks/registry/<project>.json   덱 목록 (화면용 요약)
    data/knowledge/decks/<deck_id>/                덱 본체 (pipeline.writer 가 쓴다)
    data/knowledge/jobs/<job_id>/job.json          작업 상태 (재시작 후 이어 돌리기)
    data/knowledge/jobs/<job_id>/events.jsonl      진행 이벤트 (SSE 재생)
    cache/knowledge/enrich/<aa>/<key>.json         LLM 보강 결과 (조각 해시 키 — 지워도 다시 만든다)

예전 위치(`state/projects/<project>/knowledge_decks.json`)의 목록은 처음 읽을 때 옮겨 온다.
"""
from __future__ import annotations

import json
import shutil
import threading
from pathlib import Path
from typing import Any, Optional

from app.core.storage.atomic_json import locked_path, read_json, write_json
from app.core.storage.ids import safe_segment

from ..models import IndexJob, KnowledgeDeck


class LocalDeckRegistry:
    def __init__(self, root: Path, legacy_projects_dir: Optional[Path] = None) -> None:
        self._dir = root / "registry"
        self._legacy = legacy_projects_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, project_id: str) -> Path:
        return self._dir / f"{safe_segment(project_id)}.json"

    def list_decks(self, project_id: str) -> list[KnowledgeDeck]:
        path = self._path(project_id)
        data = read_json(path, default=None)
        if data is None and self._legacy is not None:
            legacy = self._legacy / safe_segment(project_id) / "knowledge_decks.json"
            data = read_json(legacy, default=None)
            if isinstance(data, list):
                write_json(path, data)
        if not isinstance(data, list):
            return []
        return [KnowledgeDeck.from_dict(d) for d in data if isinstance(d, dict)]

    def _save(self, project_id: str, decks: list[KnowledgeDeck]) -> None:
        write_json(self._path(project_id), [d.to_dict() for d in decks])

    def get_deck(self, project_id: str, deck_id: str) -> Optional[KnowledgeDeck]:
        return next((d for d in self.list_decks(project_id) if d.id == deck_id), None)

    def find_deck(self, deck_id: str) -> Optional[KnowledgeDeck]:
        for path in sorted(self._dir.glob("*.json")):
            for raw in read_json(path, default=[]) or []:
                if isinstance(raw, dict) and raw.get("id") == deck_id:
                    return KnowledgeDeck.from_dict(raw)
        return None

    def upsert_deck(self, project_id: str, deck: KnowledgeDeck) -> None:
        with locked_path(self._path(project_id)):
            decks = self.list_decks(project_id)
            for i, d in enumerate(decks):
                if d.id == deck.id:
                    decks[i] = deck
                    break
            else:
                decks.insert(0, deck)
            self._save(project_id, decks)

    def delete_deck(self, project_id: str, deck_id: str) -> bool:
        with locked_path(self._path(project_id)):
            decks = self.list_decks(project_id)
            kept = [d for d in decks if d.id != deck_id]
            if len(kept) == len(decks):
                return False
            self._save(project_id, kept)
            return True


class FsDeckFiles:
    def __init__(self, root: Path) -> None:
        self._root = root
        root.mkdir(parents=True, exist_ok=True)

    def deck_dir(self, deck_id: str) -> Path:
        return self._root / safe_segment(deck_id)

    def remove(self, deck_id: str) -> None:
        for suffix in ("", ".building", ".old"):
            target = self._root / f"{safe_segment(deck_id)}{suffix}"
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)


class LocalJobStore:
    def __init__(self, root: Path) -> None:
        self._root = root
        self._lock = threading.Lock()
        root.mkdir(parents=True, exist_ok=True)

    def _dir(self, job_id: str) -> Path:
        return self._root / safe_segment(job_id)

    def save(self, job: IndexJob) -> None:
        write_json(self._dir(job.job_id) / "job.json", job.to_dict())

    def get(self, job_id: str) -> Optional[IndexJob]:
        data = read_json(self._dir(job_id) / "job.json", default=None)
        return IndexJob.from_dict(data) if isinstance(data, dict) else None

    def list_unfinished(self) -> list[IndexJob]:
        out: list[IndexJob] = []
        for path in sorted(self._root.glob("*/job.json")):
            data = read_json(path, default=None)
            if isinstance(data, dict):
                job = IndexJob.from_dict(data)
                if not job.terminal:
                    out.append(job)
        return out

    def append_event(self, job_id: str, event: dict[str, Any]) -> None:
        path = self._dir(job_id) / "events.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    def events(self, job_id: str, after: int = 0) -> list[dict[str, Any]]:
        path = self._dir(job_id) / "events.jsonl"
        if not path.exists():
            return []
        out: list[dict[str, Any]] = []
        with self._lock, path.open("r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                if idx < after or not line.strip():
                    continue
                try:
                    out.append(json.loads(line))
                except ValueError:
                    continue
        return out


class FileEnrichmentCache:
    def __init__(self, root: Path) -> None:
        self._root = root
        root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self._root / key[:2] / f"{key}.json"

    def get(self, key: str) -> Optional[dict[str, Any]]:
        data = read_json(self._path(key), default=None)
        return data if isinstance(data, dict) else None

    def put(self, key: str, value: dict[str, Any]) -> None:
        write_json(self._path(key), value, indent=None)
