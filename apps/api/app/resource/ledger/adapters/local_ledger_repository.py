"""`LedgerRepository` 구현 — `data/knowledge/resource_ledger/<projectId>.json`.

원장은 사용자가 고른 자료와 체크 상태라서 잃어도 되는 `state/` 가 아니라 `data/` 에 둔다.
예전 위치(`state/projects/<projectId>/resources.json`)에만 있으면 처음 읽을 때 새 위치로 옮겨 적는다
(옛 파일은 지우지 않는다).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator, Optional

from app.core.storage.atomic_json import locked_path, read_json, write_json
from app.core.storage.ids import is_safe_segment

from ..models import ResourceSession

logger = logging.getLogger(__name__)


def _read(path: Path) -> object:
    """깨진 파일은 없는 것으로 본다 (원장 하나가 깨져도 화면은 빈 원장으로 열린다)."""
    try:
        return read_json(path, default=None)
    except (OSError, ValueError):
        logger.warning("[resource] 원장 파일을 읽지 못했습니다: %s", path)
        return None


class LocalLedgerRepository:
    def __init__(self, root_dir: Path, legacy_projects_dir: Optional[Path] = None) -> None:
        self._dir = root_dir
        self._legacy = legacy_projects_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, project_id: str) -> Optional[Path]:
        # 안전하지 않은 id(경로 조각)는 저장하지 않는다 — 빈 원장으로 응답한다
        return self._dir / f"{project_id}.json" if is_safe_segment(project_id) else None

    def get_session(self, project_id: str) -> ResourceSession:
        path = self._path(project_id)
        if path is None:
            return ResourceSession(project_id=project_id, items=[])
        data = _read(path)
        if data is None and self._legacy is not None:
            legacy = self._legacy / project_id / "resources.json"
            data = _read(legacy)
            if isinstance(data, dict):
                write_json(path, data)
                logger.info("[resource] 원장을 옛 위치에서 옮겼습니다: %s → %s", legacy, path)
        if not isinstance(data, dict):
            return ResourceSession(project_id=project_id, items=[])
        try:
            return ResourceSession.from_dict(data)
        except (TypeError, ValueError, AttributeError):
            logger.warning("[resource] 원장 파일을 읽지 못해 빈 원장으로 엽니다: %s", path)
            return ResourceSession(project_id=project_id, items=[])

    def save_session(self, session: ResourceSession) -> None:
        path = self._path(session.project_id)
        if path is None:
            return
        with locked_path(path):
            write_json(path, session.to_dict())

    def iter_sessions(self) -> Iterator[ResourceSession]:
        seen: set[str] = set()
        for path in sorted(self._dir.glob("*.json")):
            seen.add(path.stem)
            yield self.get_session(path.stem)
        if self._legacy is not None and self._legacy.exists():
            for legacy in sorted(self._legacy.glob("*/resources.json")):
                if legacy.parent.name not in seen:
                    yield self.get_session(legacy.parent.name)
