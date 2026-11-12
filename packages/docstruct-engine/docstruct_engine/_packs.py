"""하네스 팩 어휘·메시지 경량 로더 (`docstruct-engine` 전용, `harness_kit` 무의존)."""
from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any

_DEFAULT_ROOT = Path(__file__).resolve().parents[2] / "harness-packs"
_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def root() -> Path:
    env = os.environ.get("VIBE_HARNESS_PACKS")
    return Path(env) if env else _DEFAULT_ROOT


def path(ref: str) -> Path:
    """`"pack:rel/path"` → 파일 경로. 팩 밖으로 나가는 경로는 거부한다."""
    pack, sep, rel = ref.partition(":")
    if not sep or not pack or not rel:
        raise ValueError(f"pack ref must be '<pack>:<path>': {ref!r}")
    base = (root() / pack).resolve()
    target = (base / rel).resolve()
    if base not in target.parents and target != base:
        raise ValueError(f"path escapes pack root: {ref!r}")
    return target


def data(ref: str) -> Any:
    p = path(ref)
    try:
        mtime = p.stat().st_mtime
    except OSError as exc:
        raise FileNotFoundError(f"harness pack file missing: {ref} ({p})") from exc
    key = f"json:{p}"
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] == mtime:
            return hit[1]
    value = json.loads(p.read_bytes().decode("utf-8"))
    with _lock:
        _cache[key] = (mtime, value)
    return value


def message(ref: str, key: str, /, **values: Any) -> str:
    node: Any = data(ref)
    for part in key.split("."):
        node = node[part]
    return node.format(**values) if values else node


def compile_rx(entry: dict[str, Any]) -> re.Pattern[str]:
    flags = 0
    for ch in entry.get("flags", ""):
        flags |= {"i": re.I, "m": re.M, "s": re.S, "x": re.X}[ch]
    return re.compile(entry["pattern"], flags)

