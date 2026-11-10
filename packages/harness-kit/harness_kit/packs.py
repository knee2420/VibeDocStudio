"""하네스 팩 읽기 — 영역별 규칙 글 · 도구 명세 · 레지스트리 · 어휘 · 임계값은 코드가 아니라 팩 파일에 있다.

팩 루트: 환경 변수 `VIBE_HARNESS_PACKS` → 기본값 `<repo>/packages/harness-packs`.
참조 문자열은 `"<팩>:<상대 경로>"` 이다 (예: `"reference:rules/procedure.md"`).

파일은 수정 시각을 보고 다시 읽는다 — 서버를 다시 띄우지 않아도 팩을 고치면 다음 호출부터 반영된다.
"""
from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any, Optional

_DEFAULT_ROOT = Path(__file__).resolve().parents[2] / "harness-packs"
_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def root() -> Path:
    env = os.environ.get("VIBE_HARNESS_PACKS")
    return Path(env) if env else _DEFAULT_ROOT


def path(ref: str) -> Path:
    """`"pack:rel/path"` → 파일 경로. 팩 밖으로 나가는 경로는 받지 않는다."""
    pack, sep, rel = ref.partition(":")
    if not sep or not pack or not rel:
        raise ValueError(f"팩 참조 형식은 '<팩>:<경로>' 다: {ref!r}")
    base = (root() / pack).resolve()
    target = (base / rel).resolve()
    if base not in target.parents and target != base:
        raise ValueError(f"팩 밖 경로다: {ref!r}")
    return target


def _load(ref: str, parse) -> Any:
    p = path(ref)
    try:
        mtime = p.stat().st_mtime
    except OSError as exc:
        raise FileNotFoundError(f"하네스 팩 파일이 없다: {ref} ({p})") from exc
    key = f"{parse.__name__}:{p}"
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] == mtime:
            return hit[1]
    value = parse(p)
    with _lock:
        _cache[key] = (mtime, value)
    return value


def _read_text(p: Path) -> str:
    return p.read_bytes().decode("utf-8")


def _read_json(p: Path) -> Any:
    return json.loads(p.read_bytes().decode("utf-8"))


def text(ref: str) -> str:
    return _load(ref, _read_text)


def data(ref: str) -> Any:
    return _load(ref, _read_json)


def manifest(pack: str) -> dict[str, Any]:
    return data(f"{pack}:pack.json")


def packs() -> list[str]:
    return sorted(p.name for p in root().iterdir() if (p / "pack.json").is_file())


def compose(name: str, pack: str = "core") -> str:
    """조립 순서(`pack.json` 의 compose[name])대로 조각 글을 이어 붙인다."""
    recipe = manifest(pack).get("compose", {}).get(name)
    if recipe is None:
        raise KeyError(f"'{pack}' 팩에 조립 '{name}' 이 없다")
    return "".join(text(ref) for ref in recipe)


def message(ref: str, key: str, /, **values: Any) -> str:
    """메시지 템플릿 (`"core:messages.json"`, `"sources.nudgeHead"`) — `{이름}` 자리에 값을 넣는다."""
    node: Any = data(ref)
    for part in key.split("."):
        node = node[part]
    return node.format(**values) if values else node


def tool_specs(pack: str, file: Optional[str] = None) -> list[dict[str, Any]]:
    """팩의 도구 명세 (모델에게 그대로 간다). file 을 주지 않으면 팩이 선언한 도구 파일 전부."""
    files = [file] if file else [t["file"] for t in manifest(pack).get("tools", [])]
    out: list[dict[str, Any]] = []
    for f in files:
        out.extend(dict(spec) for spec in data(f"{pack}:{f}"))
    return out


def tool_aliases(pack: str) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for t in manifest(pack).get("tools", []):
        if t.get("aliases"):
            out.update(data(f"{pack}:{t['aliases']}"))
    return out


def tool_sources() -> dict[str, str]:
    """도구 이름 → 출처(editor · references · resources). 출처별 열람 집계가 쓴다 — 새 팩의 도구도 선언만으로 집계된다."""
    out: dict[str, str] = {}
    for pack in packs():
        for t in manifest(pack).get("tools", []):
            for spec in data(f"{pack}:{t['file']}"):
                out[str(spec.get("name"))] = str(t.get("source") or pack)
    return out


def compile_rx(entry: dict[str, Any]) -> "re.Pattern[str]":
    """어휘의 정규식 항목 `{pattern, flags}` → 컴파일."""
    flags = 0
    for ch in entry.get("flags", ""):
        flags |= {"i": re.I, "m": re.M, "s": re.S, "x": re.X}[ch]
    return re.compile(entry["pattern"], flags)
