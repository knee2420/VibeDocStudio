"""프로젝트별 Staged 변경안 대기열 저장소 (`data/knowledge/projects/<project>/staging.json`).

변경안은 승인 전까지 문서에 닿지 않지만, 새로고침 · 탭 닫기 · 서버 일괄 채우기 결과를 넘어 살아 있어야 한다.
프론트가 대기열 전체를 보내 갈아 끼우고(`replace`), 서버 작업은 뒤에 덧붙인다(`append`).
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from app.core.storage import locked_path, read_json, safe_segment, write_json

_STAGING_FILE = "staging.json"


class LocalStagingStore:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir
        # 일괄 채우기 워커들이 동시에 덧붙인다 — 경로 잠금은 파일이 생기기 전후로 키가 갈릴 수 있어 자체 잠금을 쓴다
        self._lock = threading.RLock()

    def _file(self, project_id: str) -> Path:
        return self._root / safe_segment(project_id) / _STAGING_FILE

    def list(self, project_id: str) -> list[dict[str, Any]]:
        data = read_json(self._file(project_id), default=[])
        return [c for c in data if isinstance(c, dict)] if isinstance(data, list) else []

    def replace(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        path = self._file(project_id)
        with self._lock, locked_path(path):
            write_json(path, changes, indent=None)
        return changes

    def append(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        path = self._file(project_id)
        with self._lock, locked_path(path):
            current = self.list(project_id)
            known = {c.get("diffId") for c in current}
            merged = current + [c for c in changes if c.get("diffId") not in known]
            write_json(path, merged, indent=None)
        return merged

    def remove(self, project_id: str, diff_ids: list[str]) -> list[dict[str, Any]]:
        path = self._file(project_id)
        with self._lock, locked_path(path):
            kept = [c for c in self.list(project_id) if c.get("diffId") not in set(diff_ids)]
            write_json(path, kept, indent=None)
        return kept

    def merge(self, project_id: str, changes: list[dict[str, Any]], removed: list[str]) -> list[dict[str, Any]]:
        """화면 대기열을 반영하되, 화면이 아직 못 본 서버 쪽 변경안(일괄 작업이 덧붙인 것)은 남긴다."""
        path = self._file(project_id)
        with self._lock, locked_path(path):
            drop = set(removed)
            incoming = {c.get("diffId"): c for c in changes}
            kept = [c for c in self.list(project_id) if c.get("diffId") not in drop and c.get("diffId") not in incoming]
            merged = [*changes, *kept]
            write_json(path, merged, indent=None)
        return merged
