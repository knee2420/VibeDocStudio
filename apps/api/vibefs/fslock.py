"""볼트 FS 쓰기 잠금 — 프로세스 사이 (agy 세션마다 vibefs MCP 프로세스가 따로 뜬다).

기준점 세션 여럿이 같은 볼트에 동시에 쓰면 `vf_*` 묶음(실행 + 저널 기록)과 되돌리기가 서로 끼어들 수 있다.
상태 폴더의 `fs.lock` 파일을 OS 잠금으로 잡아 한 번에 한 묶음만 실행한다. 같은 프로세스 안 스레드는 RLock 이 먼저 줄 세운다.
기다림 상한을 넘기면 도구 오류로 알린다 (모델이 잠시 뒤 다시 시도하거나 사용자에게 알린다).
"""
from __future__ import annotations

import os
import threading
import time
from contextlib import contextmanager
from typing import Iterator

LOCK_FILE = "fs.lock"
#: 다른 작업의 쓰기를 기다리는 상한 (초)
LOCK_TIMEOUT_SECONDS = 10.0
_POLL_SECONDS = 0.05

_THREAD_LOCK = threading.RLock()


class VaultBusyError(ValueError):
    """다른 작업이 볼트에 쓰는 중 — 상한 안에 잠금을 얻지 못했다."""


def _try_lock(fh) -> bool:
    if os.name == "nt":
        import msvcrt

        try:
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False
    import fcntl

    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def _unlock(fh) -> None:
    if os.name == "nt":
        import msvcrt

        try:
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
        return
    import fcntl

    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass


@contextmanager
def vault_write_lock(state_dir: str, timeout: float = LOCK_TIMEOUT_SECONDS) -> Iterator[None]:
    """`with vault_write_lock(dir):` — 프로세스 사이 · 스레드 사이 쓰기 잠금."""
    deadline = time.monotonic() + max(0.0, timeout)
    if not _THREAD_LOCK.acquire(timeout=max(0.0, timeout)):
        raise VaultBusyError("다른 작업이 볼트에 쓰는 중입니다. 잠시 뒤 다시 시도하세요.")
    try:
        os.makedirs(state_dir, exist_ok=True)
        with open(os.path.join(state_dir, LOCK_FILE), "a+b") as fh:
            while not _try_lock(fh):
                if time.monotonic() >= deadline:
                    raise VaultBusyError("다른 작업이 볼트에 쓰는 중입니다. 잠시 뒤 다시 시도하세요.")
                time.sleep(_POLL_SECONDS)
            try:
                yield
            finally:
                _unlock(fh)
    finally:
        _THREAD_LOCK.release()
