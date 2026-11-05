"""로컬 파일 기반 리소스 세션 저장소 어댑터."""
from __future__ import annotations

import json
from pathlib import Path

from app.core.config import get_settings
from app.resources.models import ResourceSession
from app.resources.ports import ResourceRepository


class LocalResourceRepository(ResourceRepository):
    """state/projects/{project_id}/resources.json 파일에 리소스 세션을 영속화합니다."""

    def __init__(self, base_state_dir: Path | None = None) -> None:
        if base_state_dir is None:
            settings = get_settings()
            base_state_dir = settings.storage.state
        self._projects_dir = base_state_dir / "projects"
        self._projects_dir.mkdir(parents=True, exist_ok=True)

    def _get_path(self, project_id: str) -> Path:
        proj_dir = self._projects_dir / project_id
        proj_dir.mkdir(parents=True, exist_ok=True)
        return proj_dir / "resources.json"

    def get_session(self, project_id: str) -> ResourceSession:
        path = self._get_path(project_id)
        if not path.exists():
            return ResourceSession(project_id=project_id, items=[])
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return ResourceSession.from_dict(data)
        except Exception:
            return ResourceSession(project_id=project_id, items=[])

    def save_session(self, session: ResourceSession) -> None:
        path = self._get_path(session.project_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(session.to_dict(), f, ensure_ascii=False, indent=2)

