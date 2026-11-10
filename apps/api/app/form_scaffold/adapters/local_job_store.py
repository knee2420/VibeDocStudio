"""로컬 파일 시스템 기반 PDF 스캐폴딩 작업 저장소 어댑터."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Optional

from app.core.storage.atomic_json import read_json, write_json
from app.core.storage.ids import safe_segment

from ..models import ScaffoldJob


class LocalScaffoldJobStore:
    def __init__(self, root: Path) -> None:
        self._root = root
        self._lock = threading.Lock()
        root.mkdir(parents=True, exist_ok=True)

    def _dir(self, job_id: str) -> Path:
        return self._root / safe_segment(job_id)

    def save(self, job: ScaffoldJob) -> None:
        with self._lock:
            write_json(self._dir(job.job_id) / "job.json", job.to_dict(include_payload=True))

    def get(self, job_id: str) -> Optional[ScaffoldJob]:
        data = read_json(self._dir(job_id) / "job.json", default=None)
        return ScaffoldJob.from_dict(data) if isinstance(data, dict) else None

    def list_jobs(self, *, target_doc_id: Optional[str] = None, limit: int = 30) -> list[ScaffoldJob]:
        jobs: list[ScaffoldJob] = []
        for path in sorted(self._root.glob("*/job.json"), reverse=True):
            data = read_json(path, default=None)
            if not isinstance(data, dict):
                continue
            job = ScaffoldJob.from_dict(data)
            if target_doc_id and job.target_doc_id != target_doc_id:
                continue
            jobs.append(job)
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def list_unfinished(self) -> list[ScaffoldJob]:
        return [j for j in self.list_jobs(limit=100) if not j.terminal]

    def save_source_pdf(self, job_id: str, pdf_bytes: bytes) -> None:
        job_dir = self._dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)
        (job_dir / "source.pdf").write_bytes(pdf_bytes)

    def load_source_pdf(self, job_id: str) -> bytes:
        path = self._dir(job_id) / "source.pdf"
        return path.read_bytes()

    def append_event(self, job_id: str, event: dict[str, Any]) -> None:
        path = self._dir(job_id) / "events.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    def events(self, job_id: str, after: int = 0) -> list[dict[str, Any]]:
        path = self._dir(job_id) / "events.jsonl"
        if not path.exists():
            return []
        out: list[dict[str, Any]] = []
        with self._lock, path.open("r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                if idx < after or not line.strip():
                    continue
                try:
                    out.append(json.loads(line))
                except ValueError:
                    continue
        return out

