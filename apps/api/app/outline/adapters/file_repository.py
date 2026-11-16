"""`data/knowledge/outline/` 아래 WorkingOutline 저장소 어댑터."""
from __future__ import annotations

import shutil
from pathlib import Path

from app.core.storage import locked_path, read_json, safe_segment, write_json

from ..mappers import working_outline_from_dict, working_outline_to_dict
from ..models import WorkingOutlineRecord

_WORKING_FILE = "working.outline.json"


class LocalWorkingOutlineRepository:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir

    def _file_path(self, project_id: str) -> Path:
        return self._root / safe_segment(project_id) / _WORKING_FILE

    def get(self, project_id: str) -> WorkingOutlineRecord | None:
        payload = read_json(self._file_path(project_id))
        if not isinstance(payload, dict):
            return None
        return working_outline_from_dict(payload)

    def save(self, record: WorkingOutlineRecord) -> WorkingOutlineRecord:
        target = self._file_path(record.project_id)
        with locked_path(target):
            write_json(target, working_outline_to_dict(record), indent=None)
        return record

    def delete(self, project_id: str) -> bool:
        folder = self._root / safe_segment(project_id)
        if not folder.exists():
            return False
        shutil.rmtree(folder, ignore_errors=True)
        return True
