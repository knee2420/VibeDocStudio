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
