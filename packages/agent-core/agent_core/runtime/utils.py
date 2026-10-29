"""Agent Runtime 내부 독립 유틸리티 (원자적 입출력 및 식별자 발급).

외부 웹 프레임워크나 애플리케이션 저장소 계층에 의존하지 않고 패키지가 독립 작동하도록 보장합니다.
"""
from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)

RUN_PREFIX = "run"
AGREEMENT_PREFIX = "agr"

_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_.\-]{1,128}$")
_path_locks_guard = threading.Lock()
_path_locks: dict[Path, threading.Lock] = {}


def _lock_for(path: Path) -> threading.Lock:
    key = path.resolve()
    with _path_locks_guard:
        return _path_locks.setdefault(key, threading.Lock())


def _replace_with_retry(src: Path, dst: Path, max_attempts: int = 6) -> None:
    for attempt in range(max_attempts):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == max_attempts - 1:
                raise
            time.sleep(0.01 * (2**attempt))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = _lock_for(path)
    with lock:
        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            _replace_with_retry(temporary, path)
        finally:
            if temporary.exists():
                try:
                    temporary.unlink()
                except OSError:
                    pass


def read_json(path: Path) -> Any:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, ensure_ascii=False)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    if not path.exists():
        return
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped:
                yield json.loads(stripped)


def new_id(prefix: str) -> str:
    milliseconds = int(time.time() * 1000)
    return f"{prefix}-{milliseconds:011x}-{uuid.uuid4().hex[:8]}"


def safe_segment(value: str) -> str:
    candidate = (value or "").strip()
    if candidate in {".", ".."} or not bool(_SAFE_SEGMENT.match(candidate)):
        raise ValueError(f"Unsafe path segment: {value!r}")
    return candidate
