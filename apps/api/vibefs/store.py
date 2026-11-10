"""작업 공간 상태 파일 — API · 훅 · MCP 서버가 함께 읽고 쓴다 (표준 라이브러리만).

`<state>/assistant/workspace/`
    mounts.json        세션별 마운트 (RM 에서 체크한 자료) · 그 세션의 agy 대화 id
    reads.jsonl        읽은 범위 원장 (PostToolUse 훅이 `read_file` 마다 한 줄)
    hook.jsonl         훅 결정 기록 (허용 · 차단 · 경로 보정) — 동작 확인용
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from .index import MountItem, WorkspaceIndex, norm, read_range

MOUNTS_FILE = "mounts.json"
WORKBENCH_FILE = "workbench.json"
READS_FILE = "reads.jsonl"
HOOK_LOG_FILE = "hook.jsonl"
#: 레퍼런스 읽은 범위 원장 (rf_read 가 실제로 보여 준 덩어리 · 핀)
REF_READS_FILE = "ref_reads.jsonl"
#: AI 가 낸 해석 카드 (사용자 확정 전 제안)
INTERPRETATIONS_FILE = "interpretations.jsonl"
#: 이 시간보다 오래 갱신되지 않은 마운트는 무시한다 (API 가 비정상 종료돼 남은 것)
MOUNT_TTL_SECONDS = 6 * 3600


def _atomic_write(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".mounts-", dir=os.path.dirname(path))
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    for attempt in range(20):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:  # Windows: 다른 프로세스(vibefs · 훅)가 잠깐 읽는 중
            time.sleep(min(0.02 * (attempt + 1), 0.2))
    os.replace(tmp, path)


#: 같은 프로세스 안의 여러 세션(스레드)이 mounts.json · workbench.json 을 동시에 읽고-고치고-쓰지 않게 한다
_WRITE_LOCK = threading.RLock()


def _locked(fn):
    def wrapper(*args, **kwargs):
        with _WRITE_LOCK:
            return fn(*args, **kwargs)
    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    return wrapper


def append_jsonl(path: str, record: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


@dataclass
class Mount:
    session_id: str
    items: list[MountItem]
    conversation_ids: list[str]
    updated_at: float
    roots: list[str] = field(default_factory=list)
    id_map: dict[str, str] = field(default_factory=dict)

    @property
    def signature(self) -> str:
        return "|".join(sorted(norm(i.path) for i in self.items))


class WorkspaceStore:
    def __init__(self, state_dir: str) -> None:
        self.dir = state_dir

    def path(self, name: str) -> str:
        return os.path.join(self.dir, name)

    # --- 마운트 --------------------------------------------------------------------

    def _load(self) -> dict[str, Any]:
        try:
            with open(self.path(MOUNTS_FILE), encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def mounts(self) -> list[Mount]:
        now = time.time()
        out = []
        for sid, raw in (self._load().get("sessions") or {}).items():
            if now - float(raw.get("updatedAt") or 0) > MOUNT_TTL_SECONDS:
                continue
            roots = list(raw.get("roots") or [])
            id_map = dict(raw.get("idMap") or {})
            items = [m for m in (MountItem.from_dict(x) for x in raw.get("items") or []) if m]
            out.append(Mount(sid, items, list(raw.get("conversationIds") or []), float(raw.get("updatedAt") or 0), roots=roots, id_map=id_map))
        return out

    @_locked
    def set_mount(
        self,
        session_id: str,
        items: list[MountItem],
        conversation_id: Optional[str] = None,
        roots: Optional[list[str]] = None,
        id_map: Optional[dict[str, str]] = None,
    ) -> Mount:
        data = self._load()
        sessions = data.setdefault("sessions", {})
        prev = sessions.get(session_id) or {}
        conv = list(prev.get("conversationIds") or [])
        if conversation_id and conversation_id not in conv:
            conv.append(conversation_id)
        roots_list = list(roots if roots is not None else prev.get("roots") or [])
        id_map_dict = dict(id_map if id_map is not None else prev.get("idMap") or {})
        sessions[session_id] = {
            "items": [i.to_dict() for i in items],
            "roots": roots_list,
            "idMap": id_map_dict,
            "conversationIds": conv,
            "updatedAt": time.time(),
        }
        _atomic_write(self.path(MOUNTS_FILE), data)
        return Mount(session_id, items, conv, time.time(), roots=roots_list, id_map=id_map_dict)

    @_locked
    def bind_conversation(self, session_id: str, conversation_id: Optional[str]) -> None:
        if not conversation_id:
            return
        data = self._load()
        raw = (data.get("sessions") or {}).get(session_id)
        if raw is None:
            return
        conv = list(raw.get("conversationIds") or [])
        if conversation_id in conv:
            return
        conv.append(conversation_id)
        raw["conversationIds"] = conv
        raw["updatedAt"] = time.time()
        _atomic_write(self.path(MOUNTS_FILE), data)

    @_locked
    def drop(self, session_id: str) -> None:
        data = self._load()
        if session_id in (data.get("sessions") or {}):
            del data["sessions"][session_id]
            _atomic_write(self.path(MOUNTS_FILE), data)

    # --- 작업대 (에디터 문서 · 범위 · 레퍼런스 · 이력 위치) --------------------------------------

    def set_workbench(self, session_id: str, state: Optional[dict[str, Any]]) -> None:
        """세션이 보고 있는 작업대. vibefs 서버(별도 프로세스)가 호출마다 다시 읽는다."""
        with _WRITE_LOCK:
            self._set_workbench(session_id, state)

    def _set_workbench(self, session_id: str, state: Optional[dict[str, Any]]) -> None:
        path = self.path(WORKBENCH_FILE)
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            data = {}
        if state is None:
            if session_id not in data:
                return
            data.pop(session_id, None)
        else:
            data[session_id] = {**state, "updatedAt": time.time()}
        _atomic_write(path, data)

    def workbench_for(self, session_id: Optional[str]) -> Optional[dict[str, Any]]:
        if not session_id:
            return None
        try:
            with open(self.path(WORKBENCH_FILE), encoding="utf-8") as fh:
                return (json.load(fh) or {}).get(session_id)
        except (OSError, ValueError):
            return None

    def mount_for(self, conversation_id: Optional[str], session_id: Optional[str] = None) -> Optional[Mount]:
        """agy 대화 id(또는 세션 id) → 그 세션의 마운트.

        예전에는 대화 id 를 모르면(첫 턴 · 서브에이전트) 살아 있는 모든 마운트를 합쳤다. 그러면 다른 세션(다른 사용자 ·
        평가 세션)의 자료가 섞여 보였다 (lab 실측: 실제 볼트 세션에 평가 볼트 파일이 나타남). 이제는 섞지 않는다:
        1) 세션 id 가 맞는 마운트  2) 대화 id 가 맞는 마운트  3) 가장 최근에 갱신된 마운트 하나.
        """
        mounts = self.mounts()
        if not mounts:
            return None
        if session_id:
            for mount in mounts:
                if mount.session_id == session_id:
                    return mount
        if conversation_id:
            for mount in mounts:
                if conversation_id in mount.conversation_ids:
                    return mount
        return max(mounts, key=lambda m: m.updated_at)

    # --- 읽은 범위 ---------------------------------------------------------------------

    def record_read(self, conversation_id: str, path: str, start: Any, end: Any, ok: bool, extra: Optional[dict] = None) -> None:
        append_jsonl(self.path(READS_FILE), {"ts": time.time(), "conv": conversation_id or "", "path": path,
                                             "start": start, "end": end, "ok": ok, **(extra or {})})

    def reads(self, *, conversation_ids: Optional[Iterable[str]] = None, since: float = 0.0,
              windows: Optional[list[tuple[float, float]]] = None) -> list[dict[str, Any]]:
        """원장 읽기. 대화 id 가 맞거나, 대화 id 를 모르는 줄은 주어진 실행 구간(`windows`) 안에 있으면 포함한다."""
        wanted = set(conversation_ids or [])
        known = {c for m in self.mounts() for c in m.conversation_ids}
        out = []
        try:
            fh = open(self.path(READS_FILE), encoding="utf-8")
        except OSError:
            return out
        with fh:
            for line in fh:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                ts = float(rec.get("ts") or 0)
                if ts < since or not rec.get("ok", True):
                    continue
                conv = rec.get("conv") or ""
                if conv in wanted or (conv not in known and windows and any(a <= ts <= b for a, b in windows)):
                    out.append(rec)
        return out

    def record_ref_read(self, *, session_id: str, conversation_id: str, ref_id: str, blocks: Iterable[str],
                        pins: Iterable[str] = (), anchor: str = "") -> None:
        append_jsonl(self.path(REF_READS_FILE), {"ts": time.time(), "session": session_id or "", "conv": conversation_id or "",
                                                 "refId": ref_id, "blocks": list(blocks), "pins": list(pins), "anchor": anchor})

    def ref_reads(self, *, session_id: str = "", conversation_ids: Optional[Iterable[str]] = None,
                  since: float = 0.0) -> list[dict[str, Any]]:
        """레퍼런스 읽은 범위 — 이 세션(또는 이 대화들)에서 · 이 시각 이후."""
        wanted = set(conversation_ids or [])
        return [rec for rec in _tail_jsonl(self.path(REF_READS_FILE), max_bytes=2 * 1024 * 1024)
                if float(rec.get("ts") or 0) >= since
                and ((session_id and rec.get("session") == session_id) or (rec.get("conv") or "") in wanted)]

    def add_interpretation(self, record: dict[str, Any]) -> None:
        append_jsonl(self.path(INTERPRETATIONS_FILE), {"ts": time.time(), **record})

    def interpretations(self, *, session_id: str, since: float = 0.0) -> list[dict[str, Any]]:
        """이 세션에서 AI 가 낸 해석 카드 (같은 cardId 는 마지막 것)."""
        latest: dict[str, dict[str, Any]] = {}
        for rec in _tail_jsonl(self.path(INTERPRETATIONS_FILE), max_bytes=2 * 1024 * 1024):
            if rec.get("session") == session_id and float(rec.get("ts") or 0) >= since and rec.get("cardId"):
                latest[str(rec["cardId"])] = rec
        return sorted(latest.values(), key=lambda r: float(r.get("ts") or 0))

    def mcp_calls(self, *, conversation_ids: Optional[Iterable[str]] = None, since: float = 0.0) -> list[dict[str, Any]]:
        """vibefs 도구 호출 기록 (`hook.jsonl` 의 ev=mcp) — 이 대화 · 이 시각 이후. 출처별 열람 집계에 쓴다."""
        wanted = set(conversation_ids or [])
        return [
            {"tool": str(rec.get("tool") or ""), "args": rec.get("args") or {}, "ts": float(rec.get("ts") or 0)}
            for rec in _tail_jsonl(self.path(HOOK_LOG_FILE), max_bytes=1024 * 1024)
            if rec.get("ev") == "mcp" and float(rec.get("ts") or 0) >= since and (rec.get("conv") or "") in wanted
        ]

    def log_hook(self, record: dict[str, Any]) -> None:
        append_jsonl(self.path(HOOK_LOG_FILE), {"ts": time.time(), **record})

    def tool_failure_reason(self, conversation_ids: Iterable[str], tool: str, since: float,
                            path_hint: str = "") -> Optional[str]:
        """방금 실패한 agy 도구의 사유 — 훅이 막았으면 그 사유, read_file 이 실패했으면 그 오류.

        ACP 는 실패한 도구를 `status: failed` 로만 알려 주고 사유를 싣지 않는다 (agy 1.5.3 실측).
        훅 로그의 대화 id 는 ACP 세션 id 와 같다.
        """
        convs = {c for c in conversation_ids if c}
        hint = os.path.basename(path_hint.replace("\\", "/").rstrip("/")) if path_hint else ""

        def matches(rec: dict[str, Any]) -> bool:
            if float(rec.get("ts") or 0) < since:
                return False
            if convs and rec.get("conv") and rec.get("conv") not in convs:
                return False
            return True

        for rec in reversed(_tail_jsonl(self.path(HOOK_LOG_FILE))):
            if rec.get("ev") == "pre" and rec.get("decision") == "deny" and rec.get("tool") == tool and matches(rec):
                path = str((rec.get("args") or {}).get("Path") or "")
                if not hint or not path or os.path.basename(path.replace("\\", "/")) == hint:
                    return str(rec.get("reason") or "작업 공간 가드가 막았다.")
        if tool == "read_file":
            for rec in reversed(_tail_jsonl(self.path(READS_FILE))):
                if not rec.get("ok", True) and matches(rec):
                    path = str(rec.get("path") or "")
                    if not hint or os.path.basename(path.replace("\\", "/")) == hint:
                        return f"읽기 실패: {rec.get('error') or '알 수 없는 오류'}"
        return None

    def prune(self, max_age_seconds: float = 7 * 86400) -> None:
        """오래된 원장 줄을 지운다 (API 시작 때)."""
        cutoff = time.time() - max_age_seconds
        for name in (READS_FILE, HOOK_LOG_FILE):
            path = self.path(name)
            try:
                with open(path, encoding="utf-8") as fh:
                    keep = [ln for ln in fh if _ts(ln) >= cutoff]
            except OSError:
                continue
            with open(path, "w", encoding="utf-8") as fh:
                fh.writelines(keep)


def _tail_jsonl(path: str, max_bytes: int = 256 * 1024) -> list[dict[str, Any]]:
    """JSONL 파일의 끝부분만 읽는다 (원장이 커져도 최근 기록 조회는 가볍게)."""
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - max_bytes))
            chunk = fh.read().decode("utf-8", "replace")
    except OSError:
        return []
    lines = chunk.splitlines()
    if size > max_bytes and lines:
        lines = lines[1:]  # 잘린 첫 줄
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def _ts(line: str) -> float:
    try:
        return float(json.loads(line).get("ts") or 0)
    except (ValueError, AttributeError):
        return 0.0


# --- 커버리지 -------------------------------------------------------------------------

@dataclass
class Coverage:
    total: int
    full: list[str]
    partial: list[tuple[str, int, int]]  # (rel, 읽은 줄 수, 전체 줄 수)
    unread: list[str]
    read_lines: int
    total_lines: int
    unique_total: int = 0
    unique_full: int = 0

    def summary(self) -> dict[str, Any]:
        return {
            "files": self.total,
            "fullyRead": len(self.full),
            "partiallyRead": len(self.partial),
            "unread": len(self.unread),
            "linesRead": self.read_lines,
            "linesTotal": self.total_lines,
            "uniqueTotal": self.unique_total or self.total,
            "uniqueFullyRead": self.unique_full or len(self.full),
        }

    def render(self, limit: int = 40) -> str:
        pct = (100 * self.read_lines // self.total_lines) if self.total_lines else 0
        out = [f"읽은 범위: 텍스트 파일 {self.total}개 중 전부 읽음 {len(self.full)} · 일부 {len(self.partial)} · 안 읽음 {len(self.unread)}"
               f"  (줄 기준 {self.read_lines:,}/{self.total_lines:,} = {pct}%)"]
        if self.partial:
            out.append("일부만 읽은 파일 (읽은 줄/전체):")
            out += [f"- {rel} ({got}/{tot})" for rel, got, tot in self.partial[:limit]]
        if self.unread:
            out.append("안 읽은 파일:")
            out += [f"- {rel}" for rel in self.unread[:limit]]
            if len(self.unread) > limit:
                out.append(f"- … 외 {len(self.unread) - limit}개 (ws_coverage 로 다시 확인)")
        return "\n".join(out)


def coverage(index: WorkspaceIndex, reads: list[dict[str, Any]], subset: Optional[Iterable[str]] = None) -> Coverage:
    """원장의 `read_file` 범위를 파일별 구간으로 합쳐 다 읽었는지 계산한다. 동일본은 하나만 읽어도 읽은 것으로 친다."""
    spans: dict[str, list[tuple[int, int]]] = {}
    for rec in reads:
        entry = index.get(str(rec.get("path") or ""))
        if entry is None or not entry.is_text:
            continue
        s, e = read_range(rec.get("start"), rec.get("end"), entry.lines)
        spans.setdefault(entry.md5 or entry.key, []).append((s, e))
    full, partial, unread = [], [], []
    read_lines = total_lines = 0
    files = index.text_files()
    if subset is not None:
        subset_set = {str(s).lower() for s in subset}
        files = [
            e
            for e in files
            if e.rel.lower() in subset_set
            or e.key.lower() in subset_set
            or e.abs_path.lower() in subset_set
            or norm(e.abs_path).lower() in subset_set
            or e.stem.lower() in subset_set
            or os.path.basename(e.abs_path).lower() in subset_set
        ]
    for entry in files:
        total_lines += entry.lines
        got = _covered(spans.get(entry.md5 or entry.key, []))
        got = min(got, entry.lines)
        read_lines += got
        if entry.lines == 0 or got >= entry.lines:
            if entry.md5 in spans or entry.key in spans or entry.lines == 0:
                full.append(entry.rel)
            else:
                unread.append(entry.rel)
        elif got > 0:
            partial.append((entry.rel, got, entry.lines))
        else:
            unread.append(entry.rel)
    unique_keys = {e.md5 or e.key for e in files}
    unique_full_keys = {e.md5 or e.key for e in files if e.rel in full and (e.md5 in spans or e.key in spans or e.lines == 0)}
    return Coverage(len(files), full, partial, unread, read_lines, total_lines, len(unique_keys), len(unique_full_keys))


def _covered(spans: list[tuple[int, int]]) -> int:
    total = 0
    last = 0
    for s, e in sorted(spans):
        if e <= last:
            continue
        total += e - max(s, last + 1) + 1
        last = e
    return total
