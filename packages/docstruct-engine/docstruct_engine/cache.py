"""Deterministic disk cache layout for docstruct intermediate artifacts."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Optional

from .ir.model import PageIR


def file_src_hash(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(65536):
            h.update(chunk)
    return h.hexdigest()[:16]


def doc_cache_dir(cache_root: str | Path, src_hash: str) -> Path:
    root = Path(cache_root)
    d = (root / src_hash) if root.name == "docstruct" else (root / "docstruct" / src_hash)
    d.mkdir(parents=True, exist_ok=True)
    return d


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path) -> Optional[Any]:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_page_ir(cache_dir: Path, page_ir: PageIR) -> Path:
    out = cache_dir / f"p{page_ir.pageIndex}.ir.json"
    out.write_text(page_ir.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return out


def load_page_ir(cache_dir: Path, page_index: int) -> Optional[PageIR]:
    p = cache_dir / f"p{page_index}.ir.json"
    if not p.is_file():
        return None
    return PageIR.model_validate_json(p.read_text(encoding="utf-8"))


def append_read_record(cache_dir: Path, page_index: int, record: dict[str, Any]) -> Path:
    """Append-only audit log for VLM / OCR reads (`p<N>.reads.json`)."""
    p = cache_dir / f"p{page_index}.reads.json"
    existing = read_json(p)
    records: list[dict[str, Any]] = list(existing) if isinstance(existing, list) else []
    records.append(record)
    write_json(p, records)
    return p


def read_records(cache_dir: Path, page_index: int) -> list[dict[str, Any]]:
    raw = read_json(cache_dir / f"p{page_index}.reads.json")
    return list(raw) if isinstance(raw, list) else []

