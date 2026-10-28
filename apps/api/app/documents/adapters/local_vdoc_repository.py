"""`data/knowledge/documents/` 아래 `.vdoc` 작업 문서 저장소 어댑터."""
from __future__ import annotations

import shutil
from pathlib import Path

from app.core.storage import read_json, safe_segment, write_json

from ..errors import VDocDocumentNotFoundError
from ..models import VDocAggregateRecord, VDocSummaryRecord


class LocalVDocDocumentRepository:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir

    def _doc_file(self, doc_id: str) -> Path:
        safe_id = safe_segment(doc_id)
        return self._root / safe_id / "document.vdoc.json"

    def list_summaries(self) -> list[VDocSummaryRecord]:
        if not self._root.exists():
            return []
        summaries: list[VDocSummaryRecord] = []
        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir():
                continue
            payload = read_json(entry / "document.vdoc.json")
            if not isinstance(payload, dict):
                continue
            summaries.append(
                VDocSummaryRecord(
                    doc_id=str(payload.get("docId", entry.name)),
                    title=str(payload.get("title", entry.name)),
                    status=str(payload.get("status", "Draft")),
                    updated_at=str(payload.get("updatedAt", "")),
                    page_count=len(payload.get("pages", [])),
                    slot_count=len(payload.get("slots", {})),
                )
            )
        return summaries

    def get(self, doc_id: str) -> VDocAggregateRecord:
        path = self._doc_file(doc_id)
        payload = read_json(path)
        if not isinstance(payload, dict):
            raise VDocDocumentNotFoundError(f"Document not found: {doc_id}")
        return VDocAggregateRecord(doc_id=doc_id, payload=payload)

    def save(self, record: VDocAggregateRecord) -> VDocAggregateRecord:
        path = self._doc_file(record.doc_id)
        write_json(path, record.payload)
        return record

    def delete(self, doc_id: str) -> None:
        safe_id = safe_segment(doc_id)
        doc_dir = self._root / safe_id
        if not doc_dir.exists():
            raise VDocDocumentNotFoundError(f"Document not found: {safe_id}")
        shutil.rmtree(doc_dir)
