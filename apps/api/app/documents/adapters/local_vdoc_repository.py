"""`data/knowledge/documents/` 아래 `.vdoc` 작업 문서 저장소 어댑터.

문서 폴더 하나에 본문(`document.vdoc.json`)과 목록용 요약(`summary.json`)을 함께 둔다.
목록 조회는 요약만 읽으므로 문서가 커져도 비용이 늘지 않는다.
"""
from __future__ import annotations

import json
import shutil
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

from app.core.storage import locked_path, read_json, safe_segment, write_json

from ..errors import VDocDocumentNotFoundError
from ..models import VDocAggregateRecord, VDocSummaryRecord

_DOCUMENT_FILE = "document.vdoc.json"
_SUMMARY_FILE = "summary.json"
_REVISIONS_FILE = "revisions.jsonl"
_VERSIONS_DIR = "versions"
_VERSIONS_INDEX = "index.json"


class LocalVDocDocumentRepository:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir

    def _doc_dir(self, doc_id: str) -> Path:
        return self._root / safe_segment(doc_id)

    def _doc_file(self, doc_id: str) -> Path:
        return self._doc_dir(doc_id) / _DOCUMENT_FILE

    def _read(self, doc_id: str) -> VDocAggregateRecord:
        payload = read_json(self._doc_file(doc_id))
        if not isinstance(payload, dict):
            raise VDocDocumentNotFoundError(f"Document not found: {doc_id}")
        return VDocAggregateRecord(doc_id=doc_id, payload=payload)

    def _write(self, record: VDocAggregateRecord) -> VDocAggregateRecord:
        doc_dir = self._doc_dir(record.doc_id)
        # 본문은 매 편집마다 다시 쓰므로 들여쓰기 없이 직렬화한다.
        write_json(doc_dir / _DOCUMENT_FILE, record.payload, indent=None)
        write_json(doc_dir / _SUMMARY_FILE, asdict(record.summary()))
        return record

    def exists(self, doc_id: str) -> bool:
        return self._doc_file(doc_id).is_file()

    def list_summaries(self) -> list[VDocSummaryRecord]:
        if not self._root.exists():
            return []
        summaries: list[VDocSummaryRecord] = []
        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir():
                continue
            cached = read_json(entry / _SUMMARY_FILE)
            if isinstance(cached, dict):
                summaries.append(VDocSummaryRecord(**cached))
                continue
            # 요약 파일이 없던 시절 문서: 본문을 한 번 읽어 요약을 만들어 둔다.
            payload = read_json(entry / _DOCUMENT_FILE)
            if isinstance(payload, dict):
                summary = VDocAggregateRecord(doc_id=entry.name, payload=payload).summary()
                write_json(entry / _SUMMARY_FILE, asdict(summary))
                summaries.append(summary)
        return summaries

    def get(self, doc_id: str) -> VDocAggregateRecord:
        return self._read(doc_id)

    def save(self, record: VDocAggregateRecord) -> VDocAggregateRecord:
        with locked_path(self._doc_file(record.doc_id)):
            return self._write(record)

    def update(
        self,
        doc_id: str,
        mutate: Callable[[VDocAggregateRecord], VDocAggregateRecord],
    ) -> VDocAggregateRecord:
        with locked_path(self._doc_file(doc_id)):
            current = self._read(doc_id)
            updated = mutate(current)
            if updated is current:
                return current
            return self._write(updated)

    def delete(self, doc_id: str) -> None:
        doc_dir = self._doc_dir(doc_id)
        if not doc_dir.exists():
            raise VDocDocumentNotFoundError(f"Document not found: {doc_id}")
        shutil.rmtree(doc_dir)

    # --- 개정 이력 -------------------------------------------------------------

    def _revisions_file(self, doc_id: str) -> Path:
        return self._doc_dir(doc_id) / _REVISIONS_FILE

    def append_revision(self, doc_id: str, entry: dict) -> None:
        path = self._revisions_file(doc_id)
        with locked_path(path):
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def replace_last_revision(self, doc_id: str, entry: dict) -> None:
        path = self._revisions_file(doc_id)
        with locked_path(path):
            lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
            lines = [ln for ln in lines if ln.strip()]
            if lines:
                lines[-1] = json.dumps(entry, ensure_ascii=False)
            else:
                lines = [json.dumps(entry, ensure_ascii=False)]
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # --- 버전 (문서 전체 보관) --------------------------------------------------

    def _versions_dir(self, doc_id: str) -> Path:
        return self._doc_dir(doc_id) / _VERSIONS_DIR

    def _read_index(self, doc_id: str) -> list[dict]:
        data = read_json(self._versions_dir(doc_id) / _VERSIONS_INDEX)
        return [v for v in data if isinstance(v, dict)] if isinstance(data, list) else []

    def list_versions(self, doc_id: str) -> list[dict]:
        return self._read_index(doc_id)

    def add_version(self, doc_id: str, entry: dict, payload: dict) -> None:
        vdir = self._versions_dir(doc_id)
        index_path = vdir / _VERSIONS_INDEX
        with locked_path(index_path):
            vdir.mkdir(parents=True, exist_ok=True)
            write_json(vdir / f"{safe_segment(entry['id'])}.vdoc.json", payload, indent=None)
            write_json(index_path, [*self._read_index(doc_id), entry])

    def get_version_payload(self, doc_id: str, version_id: str) -> dict | None:
        payload = read_json(self._versions_dir(doc_id) / f"{safe_segment(version_id)}.vdoc.json")
        return payload if isinstance(payload, dict) else None

    def update_version(self, doc_id: str, version_id: str, patch: dict) -> dict | None:
        index_path = self._versions_dir(doc_id) / _VERSIONS_INDEX
        with locked_path(index_path):
            index = self._read_index(doc_id)
            hit = None
            for i, v in enumerate(index):
                if v.get("id") == version_id:
                    hit = index[i] = {**v, **patch}
            if hit is not None:
                write_json(index_path, index)
            return hit

    def delete_version(self, doc_id: str, version_id: str) -> bool:
        vdir = self._versions_dir(doc_id)
        index_path = vdir / _VERSIONS_INDEX
        with locked_path(index_path):
            index = self._read_index(doc_id)
            kept = [v for v in index if v.get("id") != version_id]
            if len(kept) == len(index):
                return False
            write_json(index_path, kept)
            (vdir / f"{safe_segment(version_id)}.vdoc.json").unlink(missing_ok=True)
            return True

    def list_revisions(self, doc_id: str, limit: int = 200) -> list[dict]:
        path = self._revisions_file(doc_id)
        if not path.exists():
            return []
        with locked_path(path):
            lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
        out: list[dict] = []
        for line in reversed(lines):
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
            if len(out) >= limit:
                break
        return out
