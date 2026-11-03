"""원자적 파일 쓰기(임시 파일 → os.replace)와 JSON 입출력."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

_path_locks_guard = threading.Lock()
# 재진입 가능해야 `locked_path` 안에서 `read_json`/`write_json` 을 다시 부를 수 있다.
_path_locks: dict[Path, threading.RLock] = {}


def _lock_for(path: Path) -> threading.RLock:
    key = path.resolve()
    with _path_locks_guard:
        return _path_locks.setdefault(key, threading.RLock())


@contextmanager
def locked_path(path: Path) -> Iterator[None]:
    """읽기 → 수정 → 쓰기 한 묶음을 같은 경로의 다른 갱신과 직렬화한다.

    `write_json` 의 잠금은 교체 순간만 지키므로, 두 요청이 같은 파일을 동시에 읽고
    고쳐 쓰면 한쪽 변경이 사라진다. 갱신 유스케이스는 이 구간 안에서 읽고 쓴다.
    """
    with _lock_for(path):
        yield


def _replace_with_retry(src: Path, dst: Path, max_attempts: int = 6) -> None:
    for attempt in range(max_attempts):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == max_attempts - 1:
                raise
            time.sleep(0.01 * (2**attempt))


def write_json(path: Path, payload: Any, *, indent: int | None = 2) -> None:
    """JSON을 원자적으로 기록한다 (임시 파일 기록 + fsync 후 교체).

    자주 다시 쓰는 큰 문서는 `indent=None` 으로 직렬화 비용과 크기를 줄인다.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = _lock_for(path)
    with lock:
        fd, temp_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(
                    payload,
                    handle,
                    ensure_ascii=False,
                    indent=indent,
                    separators=None if indent is not None else (",", ":"),
                )
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
