"""유스케이스: 프로젝트의 Staged 변경안 대기열 (승인 전 AI 변경안) 저장 · 조회."""
from __future__ import annotations

from typing import Any

from ..ports import StagingStorePort


class StagingQueueUseCase:
    def __init__(self, store: StagingStorePort) -> None:
        self._store = store

    def list(self, project_id: str) -> list[dict[str, Any]]:
        return self._store.list(project_id)

    def replace(self, project_id: str, changes: list[dict[str, Any]], removed: list[str] | None = None) -> list[dict[str, Any]]:
        valid = [c for c in changes if isinstance(c, dict) and c.get("diffId")]
        if removed is None:
            return self._store.replace(project_id, valid)
        return self._store.merge(project_id, valid, [str(r) for r in removed])

    def append(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self._store.append(project_id, [c for c in changes if isinstance(c, dict) and c.get("diffId")])
