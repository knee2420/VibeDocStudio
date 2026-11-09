"""`data/knowledge/projects/` 아래 `.vproj` 다중 문서 프로젝트 및 참조 덱 저장소 어댑터."""
from __future__ import annotations

import shutil
from collections.abc import Callable, Iterable
from pathlib import Path

from app.core.storage import locked_path, read_json, safe_segment, write_json

from ..errors import VProjectNotFoundError
from ..mappers import manifest_from_dict, manifest_to_dict
from ..models import VProjectManifestRecord

_MANIFEST_FILE = "project.vproj.json"


class LocalVProjectRepository:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir

    def _project_file(self, project_id: str) -> Path:
        return self._root / safe_segment(project_id) / _MANIFEST_FILE

    def _read(self, project_id: str) -> VProjectManifestRecord:
        payload = read_json(self._project_file(project_id))
        if not isinstance(payload, dict):
            raise VProjectNotFoundError(f"Project not found: {project_id}")
        return manifest_from_dict(payload)

    def _write(self, record: VProjectManifestRecord) -> VProjectManifestRecord:
        write_json(self._project_file(record.project_id), manifest_to_dict(record))
        return record

    def is_empty(self) -> bool:
        return not self._root.exists() or not any(d.is_dir() for d in self._root.iterdir())

    def seed(self, records: Iterable[VProjectManifestRecord]) -> None:
        """부트스트랩 단계에서 한 번, 빈 저장소에 초기 프로젝트를 심는다."""
        for record in records:
            self._write(record)

    def list_projects(self) -> list[VProjectManifestRecord]:
        if not self._root.exists():
            return []
        records: list[VProjectManifestRecord] = []
        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir():
                continue
            payload = read_json(entry / _MANIFEST_FILE)
            if isinstance(payload, dict):
                records.append(manifest_from_dict(payload))
        return records

    def get(self, project_id: str) -> VProjectManifestRecord:
        return self._read(project_id)

    def save(self, record: VProjectManifestRecord) -> VProjectManifestRecord:
        with locked_path(self._project_file(record.project_id)):
            return self._write(record)

    def update(
        self,
        project_id: str,
        mutate: Callable[[VProjectManifestRecord], VProjectManifestRecord],
    ) -> VProjectManifestRecord:
        """읽기 → 변경 → 쓰기를 한 잠금 구간에서 수행해 동시 갱신 유실을 막는다."""
        with locked_path(self._project_file(project_id)):
            current = self._read(project_id)
            updated = mutate(current)
            if updated is current:
                return current
            return self._write(updated)

    def delete(self, project_id: str) -> None:
        safe_id = safe_segment(project_id)
        proj_dir = self._root / safe_id
        if not proj_dir.exists():
            raise VProjectNotFoundError(f"Project not found: {safe_id}")
        shutil.rmtree(proj_dir)
