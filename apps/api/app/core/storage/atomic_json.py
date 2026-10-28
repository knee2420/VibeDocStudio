"""원자적 파일 쓰기(임시 파일 → os.replace)와 JSON 입출력."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

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
    """JSON을 원자적으로 기록한다 (임시 파일 기록 + fsync 후 교체)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = _lock_for(path)
    with lock:
        fd, temp_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            _replace_with_retry(temp_path, path)
        finally:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)


def read_json(path: Path, default: Any = None) -> Any:
    """JSON을 읽는다. 파일이 없으면 default를 반환한다."""
    if not path.exists():
        return default
    lock = _lock_for(path)
    with lock:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
