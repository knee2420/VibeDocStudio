"""agy 작업 폴더 훅 — 읽기 전용 가드(PreToolUse) · 읽은 범위 원장(PostToolUse).

    python -I vibefs/__main__.py hook pre  --state <state/assistant/workspace>
    python -I vibefs/__main__.py hook post --state <state/assistant/workspace>

agy 1.5.3 실측:
- `--mode plan` 은 `--disable-slash-commands` 와 같이 쓰면 효과가 없고, `--dangerously-skip-permissions` 로는
  파일 쓰기가 그대로 된다. 그래서 원본 보호는 이 훅이 맡는다 (`decision: deny`).
- 작업 폴더 밖 파일도 `read_file` 로 읽힌다. 그래서 "마운트 안만 읽기" 도 이 훅이 강제한다.
- 줄 범위 없는 `read_file` 은 앞 800줄만 보여 준다 (원장 계산은 `index.read_range`).

훅은 도구 호출마다 뜨므로 가볍게: 파일 내용을 읽지 않고 마운트 목록 · 경로만 본다.
"""
from __future__ import annotations

import difflib
import json
import os
import sys
import traceback
from typing import Optional

from harness_kit import packs

from .index import _roots, _walk_files, norm
from .store import WorkspaceStore

#: 허용하는 agy 도구 · 거부 사유 · vibefs 서버 표식은 하네스 core 팩(`sandbox/policy.json`)에 있다.
#: agy 가 스스로 읽는 자기 상태 폴더 (MCP 도구 설명 · 서브에이전트 작업 기록)
AGY_HOME = os.path.join(os.path.expanduser("~"), ".gemini", "antigravity-cli")
#: MCP 도구 이름 형식 (agy 1.5.3 실측):
#: - stream-json 모드: name="call_mcp_tool", args={"ServerName": "vibefs_vibefs", "ToolName": "ws_glob", ...}
#: - ACP 모드:         name="mcp_vibefs_ws_glob", args=도구 인자 그대로
MCP_NAME_PREFIX = "mcp_"
SUGGEST_LIMIT = 3


def is_vibefs_tool(name: str) -> bool:
    """ACP 식 MCP 도구 이름(`mcp_vibefs_ws_glob`)이 vibefs 서버의 것인가."""
    lowered = name.lower()
    if not lowered.startswith(MCP_NAME_PREFIX):
        return False
    server = lowered[len(MCP_NAME_PREFIX):].split("_", 1)[0]
    return server == _policy()["mcpServerMark"]


#: 작업 공간 정책 (허용 도구 · 거부 사유) — 하네스 core 팩
_POLICY = "core:sandbox/policy.json"


def _policy() -> dict:
    return packs.data(_POLICY)


def _msg(key: str, **values) -> str:
    return packs.message(_POLICY, f"messages.{key}", **values)


class Mounted:
    """마운트 한 벌의 경로 집합 (내용은 읽지 않는다)."""

    def __init__(self, items, roots: Optional[list[str]] = None) -> None:
        self.files: dict[str, str] = {}
        self.dirs: list[str] = []  # 비교용 (norm)
        self._dir_paths: list[str] = []  # 원래 표기 (돌려줄 경로의 대소문자를 지킨다)
        self.alias_to_root: dict[str, str] = {}
        bases = []
        for item in items:
            path = os.path.abspath(item.path)
            if getattr(item, "kind", "file") == "dir" or os.path.isdir(path):
                norm_p = norm(path)
                if norm_p not in self.dirs:
                    self.dirs.append(norm_p)
                    self._dir_paths.append(path)
                bases.append(path)
                if getattr(item, "alias", None):
                    self.alias_to_root[item.alias.lower()] = path
            elif os.path.isfile(path):
                self.files[norm(path)] = path
                bases.append(os.path.dirname(path))
        if roots:
            self.roots = sorted(set(os.path.abspath(r) for r in roots))
        else:
            self.roots = _roots(bases)
        for r in self.roots:
            bname = os.path.basename(r)
            if bname:
                self.alias_to_root.setdefault(bname.lower(), r)

    def contains(self, path: str) -> bool:
        key = norm(path)
        return key in self.files or any(key == d or key.startswith(d + os.sep) for d in self.dirs)

    def resolve(self, raw: str) -> str | None:
        """모델이 준 경로(상대 경로 · `/` 구분 · 파일 이름만) → 마운트 안 절대 경로. 못 찾으면 None."""
        cleaned = raw.strip().strip('"').replace("/", os.sep)
        if os.path.isabs(cleaned):
            return cleaned if self.contains(cleaned) and os.path.exists(cleaned) else None
        # 1. alias 접두사 (e.g. discussions/26.10.06/decisions/D01.md)
        if os.sep in cleaned:
            alias, _, sub = cleaned.partition(os.sep)
            if alias.lower() in self.alias_to_root:
                root = self.alias_to_root[alias.lower()]
                cand = os.path.join(root, sub)
                if self.contains(cand) and os.path.isfile(cand):
                    return os.path.abspath(cand)
        # 2. 각 root 기준 상대 경로
        for root in self.roots:
            candidate = os.path.join(root, cleaned.lstrip("." + os.sep))
            if self.contains(candidate) and os.path.isfile(candidate):
                return os.path.abspath(candidate)
        # 3. 꼬리 비교
        tail = os.path.normcase(os.path.normpath(cleaned)).split(os.sep)
        tail = [t for t in tail if t not in ("", ".", "..")]
        if not tail:
            return None
        matches = [p for k, p in self._all() if k.split(os.sep)[-len(tail):] == tail]
        return matches[0] if len(matches) == 1 else None

    def _all(self):
        yield from self.files.items()
        for d in self._dir_paths:
            for p in _walk_files(d):
                yield norm(p), p

    def display(self, path: str) -> str:
        """절대 경로 → `별칭/하위 경로` (모델이 다시 쓰기 쉬운 짧은 경로)."""
        for alias, root in self.alias_to_root.items():
            if _inside(path, root):
                rel = os.path.relpath(path, root).replace(os.sep, "/")
                return f"{os.path.basename(root)}/{rel}"
        return path

    def suggest(self, raw: str, limit: int = SUGGEST_LIMIT) -> list[str]:
        """없는 경로 → 마운트 안에서 이름이 가장 비슷한 실제 파일들 (절대 경로)."""
        wanted = os.path.basename(raw.replace("/", os.sep).rstrip(os.sep))
        if not wanted:
            return []
        stem = os.path.splitext(wanted)[0].lower()
        names: dict[str, list[str]] = {}
        for _, p in self._all():
            names.setdefault(os.path.splitext(os.path.basename(p))[0].lower(), []).append(p)
        picked: list[str] = []
        # 1) 이름이 그대로 같은 파일 (폴더만 틀린 경우)  2) 이름이 비슷한 파일  3) 이름 조각이 들어 있는 파일
        candidates = list(names.get(stem, []))
        for close in difflib.get_close_matches(stem, list(names), n=limit * 2, cutoff=0.5):
            candidates.extend(names[close])
        tokens = [t for t in stem.replace("_", " ").replace("-", " ").split() if len(t) >= 2]
        if tokens:
            for key, paths in names.items():
                if all(t in key for t in tokens):
                    candidates.extend(paths)
        for p in candidates:
            if p not in picked:
                picked.append(p)
            if len(picked) >= limit:
                break
        return picked


def _missing_reason(raw: str, mounted: "Mounted") -> str:
    hints = mounted.suggest(raw)
    if hints:
        listed = " · ".join(f"{mounted.display(p)} (절대 경로: {p})" for p in hints)
        return f"없는 파일이다: {raw}. 이름이 비슷한 실제 파일: {listed}. 이 중 맞는 경로로 다시 read_file 하라."
    roots = " · ".join(os.path.basename(r) for r in mounted.roots)
    return f"없는 파일이다: {raw}. 비슷한 이름도 찾지 못했다. vibefs 도구(ws_glob · ws_tree · ws_collect)로 실제 경로를 먼저 확인하라 (루트: {roots})."


def _inside(path: str, base: str) -> bool:
    key, root = norm(path), norm(base)
    return key == root or key.startswith(root + os.sep)


def decide(payload: dict, store: WorkspaceStore) -> dict:
    call = payload.get("toolCall") or {}
    name = str(call.get("name") or "")
    args = dict(call.get("args") or {})
    conv = str(payload.get("conversationId") or "")
    if is_vibefs_tool(name):
        return {"decision": "allow"}
    policy = _policy()
    if name.lower().startswith(MCP_NAME_PREFIX):
        return {"decision": "deny", "reason": _msg("otherMcpTool", name=name)}
    if name not in set(policy["allowedTools"]):
        reason = policy["denyReasons"].get(name) or _msg("toolDefault", name=name)
        return {"decision": "deny", "reason": reason}
    if name == "call_mcp_tool":
        server = str(args.get("ServerName") or "")
        if policy["mcpServerMark"] not in server.lower():
            return {"decision": "deny", "reason": _msg("otherMcpServer", server=server)}
        return {"decision": "allow"}
    if name != "read_file":
        return {"decision": "allow"}
    raw = str(args.get("Path") or "")
    if raw and os.path.isabs(raw) and _inside(raw, AGY_HOME):
        return {"decision": "allow"}
    mount = store.mount_for(conv or None)
    if mount is None or not mount.items:
        return {"decision": "deny", "reason": _msg("noMount")}
    mounted = Mounted(mount.items, roots=getattr(mount, "roots", None))
    if not raw:
        return {"decision": "deny", "reason": _msg("noPath")}
    if os.path.isabs(raw) and mounted.contains(raw) and os.path.isfile(raw):
        return {"decision": "allow"}
    fixed = mounted.resolve(raw)
    if fixed:
        return {"decision": "allow", "overwrite": {"Path": fixed}, "_fixed": True}
    inside = os.path.isabs(raw) and mounted.contains(raw)
    if inside or not os.path.isabs(raw):
        # 마운트 안(또는 상대 경로)인데 파일이 없다 — 모델이 경로를 추측했거나 다시 쓰다 틀렸다. 실제 후보를 알려 준다.
        return {"decision": "deny", "reason": _missing_reason(raw, mounted)}
    if "/.agents/" in raw.replace("\\", "/"):
        return {"decision": "deny", "reason": _msg("agentsDir")}
    hints = mounted.suggest(raw)
    tail = _msg("outsideHint", hints=" · ".join(mounted.display(p) for p in hints)) if hints else ""
    return {"decision": "deny", "reason": _msg("outside", path=raw, hint=tail, roots=" · ".join(os.path.basename(r) for r in mounted.roots))}


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    mode = args[0] if args else "pre"
    state_dir = args[args.index("--state") + 1] if "--state" in args else os.getcwd()
    store = WorkspaceStore(state_dir)
    raw = sys.stdin.buffer.read().decode("utf-8", "replace")
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except ValueError:
        payload = {}
    call = payload.get("toolCall") or {}
    name = str(call.get("name") or "")
    args = dict(call.get("args") or {})
    conv = str(payload.get("conversationId") or "")
    if mode == "post":
        try:
            if name == "read_file":
                path = str(args.get("Path") or "")
                if path and not (os.path.isabs(path) and _inside(path, AGY_HOME)):
                    store.record_read(conv, path, args.get("StartLine"), args.get("EndLine"), ok=not payload.get("error"),
                                      extra={"error": str(payload.get("error") or "")[:200]} if payload.get("error") else None)
        except Exception:
            store.log_hook({"ev": "post_error", "trace": traceback.format_exc()[-1200:]})
        sys.stdout.write("{}")
        return 0
    try:
        decision = decide(payload, store)
    except Exception:
        decision = {"decision": "deny", "reason": _msg("guardError")}
        store.log_hook({"ev": "pre_error", "tool": name, "trace": traceback.format_exc()[-1200:]})
    fixed = decision.pop("_fixed", False)
    try:
        store.log_hook({"ev": "pre", "tool": name, "conv": conv, "decision": decision["decision"],
                        "args": {k: (str(v)[:300]) for k, v in args.items() if k not in ("Content", "CodeContent")},
                        **({"fixedPath": decision.get("overwrite", {}).get("Path")} if fixed else {}),
                        **({"reason": decision["reason"]} if decision["decision"] == "deny" else {})})
    except Exception:
        pass
    # ASCII 이스케이프로 내보낸다 — 파이프 인코딩(cp949 · utf-8)과 상관없이 agy 가 같은 글자로 읽는다
    sys.stdout.write(json.dumps(decision, ensure_ascii=True))
    return 0


