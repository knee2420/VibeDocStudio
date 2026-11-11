"""`data/knowledge/references/` 아래 레퍼런스 라이브러리 저장소."""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Optional

from app.core.storage import read_json, safe_segment, write_json

from ..models import ProjectBinding, ReferenceItem, ReferencePin

_ARTIFACTS = ("extraction", "layers", "layout")


class LocalReferenceLibrary:
    def __init__(self, root_dir: Path) -> None:
        self.root = Path(root_dir)
        self.items_dir = self.root / "items"
        self.bindings_dir = self.root / "bindings"
        self.items_dir.mkdir(parents=True, exist_ok=True)
        self.bindings_dir.mkdir(parents=True, exist_ok=True)

    # --- 항목 -------------------------------------------------------------------------------

    def _dir(self, ref_id: str) -> Path:
        return self.items_dir / safe_segment(ref_id)

    def list_items(self) -> list[ReferenceItem]:
        out: list[ReferenceItem] = []
        for folder in sorted(self.items_dir.iterdir()) if self.items_dir.exists() else []:
            raw = read_json(folder / "ref.json") if folder.is_dir() else None
            if isinstance(raw, dict) and raw.get("refId"):
                out.append(ReferenceItem.from_dict(raw))
        return sorted(out, key=lambda it: it.created_at)

    def get_item(self, ref_id: str) -> Optional[ReferenceItem]:
        raw = read_json(self._dir(ref_id) / "ref.json")
        return ReferenceItem.from_dict(raw) if isinstance(raw, dict) and raw.get("refId") else None

    def save_item(self, item: ReferenceItem) -> None:
        folder = self._dir(item.ref_id)
        folder.mkdir(parents=True, exist_ok=True)
        write_json(folder / "ref.json", item.to_dict())

    def delete_item(self, ref_id: str) -> bool:
        folder = self._dir(ref_id)
        if not folder.exists():
            return False
        shutil.rmtree(folder)
        return True

    # --- 원본 -------------------------------------------------------------------------------

    def write_source(self, ref_id: str, extension: str, data: bytes) -> None:
        folder = self._dir(ref_id)
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("source.*"):
            old.unlink()
        ext = extension.lower().lstrip(".") or "bin"
        (folder / f"source.{safe_segment(ext)}").write_bytes(data)

    def read_source(self, ref_id: str) -> Optional[tuple[bytes, str]]:
        found = next(iter(sorted(self._dir(ref_id).glob("source.*"))), None) if self._dir(ref_id).exists() else None
        return (found.read_bytes(), found.name) if found else None

    # --- 파생 결과 · 핀 ----------------------------------------------------------------------

    def save_artifact(self, ref_id: str, name: str, payload: Any) -> None:
        if name not in _ARTIFACTS:
            raise ValueError(f"알 수 없는 산출물 '{name}'")
        write_json(self._dir(ref_id) / f"{name}.json", payload)

    def load_artifact(self, ref_id: str, name: str) -> Any:
        if name not in _ARTIFACTS:
            raise ValueError(f"알 수 없는 산출물 '{name}'")
        return read_json(self._dir(ref_id) / f"{name}.json")

    def load_pins(self, ref_id: str) -> list[ReferencePin]:
        raw = read_json(self._dir(ref_id) / "pins.json", default=[])
        return [ReferencePin.from_dict(p) for p in raw or [] if isinstance(p, dict) and p.get("pinId")]

    def save_pins(self, ref_id: str, pins: list[ReferencePin]) -> None:
        write_json(self._dir(ref_id) / "pins.json", [p.to_dict() for p in pins])

    # --- 프로젝트 연결 -------------------------------------------------------------------------

    def load_binding(self, project_id: str) -> ProjectBinding:
        return ProjectBinding.from_dict(project_id, read_json(self.bindings_dir / f"{safe_segment(project_id)}.json"))

    def save_binding(self, binding: ProjectBinding) -> None:
        write_json(self.bindings_dir / f"{safe_segment(binding.project_id)}.json", binding.to_dict())

    def list_bindings(self) -> list[ProjectBinding]:
        return [self.load_binding(p.stem) for p in sorted(self.bindings_dir.glob("*.json"))]
