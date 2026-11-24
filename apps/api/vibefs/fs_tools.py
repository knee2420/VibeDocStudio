"""볼트 샌드박스 파일시스템 · 디렉토리 운영 도구(`vf_*`) — Raw 터미널 없이 터미널급 디렉토리 관리.

설계 원칙:
1. 물리적 샌드박스: 활성 볼트 루트(`vaultRoot`) 밖으로는 절대 탈출 불가 (`..` · 절대경로 · 드라이브 문자 · 탈출 심볼릭 링크 차단).
2. 시스템 보호: `.git`, `.vibe`, `.vibe-trash`, `.agents`, `node_modules` 등 시스템 경로 쓰기/삭제 금지.
3. 스코프 · 권한 존중: `readOnly` 또는 `plan` 모드에서는 변경 거부; 사용자가 `@폴더(대상)`을 명시하면 그 폴더 하위만 쓰기 허용.
4. 무손실 안전장치: 영구 삭제(`rm -rf`) 없음 — 모든 삭제는 `.vibe-trash/<batchId>/` 로 이동.
5. 원자적 트랜잭션 & 1클릭 되돌리기: 모든 변경 연산이 저널(`fs_journal.jsonl`)에 역연산(rollback)을 남기고, `vf_batch` 중간 실패 시 자동 롤백.

`app` 패키지를 import 하지 않는다 (vibefs MCP 서버 프로세스 경량 유지).
"""
from __future__ import annotations

import difflib
import json
import os
import re
import shutil
import tempfile
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Optional

from harness_kit import packs

from .fslock import vault_write_lock
from .store import WorkspaceStore

VF_TOOL_SPECS: list[dict[str, Any]] = packs.data("vault-fs:tools.json")

JOURNAL_FILE = "fs_journal.jsonl"
TRASH_DIR = ".vibe-trash"
PROTECTED_SEGMENTS = frozenset({".git", ".vibe", TRASH_DIR, ".agents", "node_modules", "__pycache__"})
BINARY_WRITE_BLOCK_EXTS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".pdf",
    ".zip", ".tar", ".gz", ".7z", ".rar", ".exe", ".dll", ".so", ".dylib",
    ".mp3", ".mp4", ".mov", ".avi", ".wav", ".woff", ".woff2", ".ttf", ".otf",
})
STRUCTURED_WRITE_BLOCK_EXTS = frozenset({".outline"})
MAX_WRITE_BYTES = 2 * 1024 * 1024
MAX_BATCH_OPS = 200


def _fmt_size(n: int) -> str:
    if n < 1024:
        return f"{n}B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f}KB"
    if n < 1024 * 1024 * 1024:
        return f"{n / (1024 * 1024):.1f}MB"
    return f"{n / (1024 * 1024 * 1024):.2f}GB"


def normalize_vault_rel(raw: Any, *, allow_empty: bool = False) -> str:
    """볼트 상대 경로 정규화 및 탈출·위험 문자 차단."""
    text = str(raw or "").strip().replace("\\", "/")
    if "\x00" in text:
        raise ValueError("경로에 NUL 문자를 넣을 수 없습니다.")
    if re.match(r"^[a-zA-Z]:", text):
        raise ValueError(f"절대 경로(드라이브 문자)는 허용되지 않습니다: {text}")
    if text.startswith("/"):
        if allow_empty and text == "/":
            return ""
        raise ValueError(f"볼트 상대 경로만 허용됩니다 (선행 '/' 금지): {text}")
    parts = [p for p in text.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise ValueError(f"상위 디렉토리 탈출('..')은 허용되지 않습니다: {text}")
    if not parts:
        if allow_empty:
            return ""
        raise ValueError("경로가 비어 있습니다.")
    return "/".join(parts)


def assert_not_protected(rel: str) -> None:
    if not rel:
        raise ValueError("볼트 루트 자체를 변경하거나 삭제할 수 없습니다.")
    parts = rel.split("/")
    for seg in parts:
        if seg in PROTECTED_SEGMENTS:
            raise ValueError(f"보호된 시스템 경로('{seg}')는 수정·삭제할 수 없습니다: {rel}")


def resolve_inside(vault_root: Path, rel: str) -> Path:
    """볼트 루트 내부로 실제 경로를 해석하고 심볼릭 링크 탈출을 차단한다."""
    root = vault_root.resolve()
    target = (root / rel) if rel else root
    # 존재하지 않는 경로는 가장 가까운 기존 조상의 resolve 결과를 검증한다
    probe = target
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    resolved_probe = probe.resolve()
    try:
        resolved_probe.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"볼트 경계 밖 경로 접근이 차단되었습니다: {rel}") from exc
    if target.exists():
        resolved_target = target.resolve()
        try:
            resolved_target.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"볼트 경계 밖을 가리키는 심볼릭 링크는 허용되지 않습니다: {rel}") from exc
    return target


def _atomic_write_text(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".vf-", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(content)
        os.replace(tmp, target)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem if path.is_file() or path.suffix else path.name
    suffix = path.suffix if path.suffix else ""
    for i in range(2, 1000):
        candidate = path.with_name(f"{stem}_{i}{suffix}")
        if not candidate.exists():
            return candidate
    return path.with_name(f"{stem}_{uuid.uuid4().hex[:6]}{suffix}")


def _is_hidden_rel(rel: str) -> bool:
    return any(seg.startswith(".") for seg in rel.split("/") if seg)


class FsJournal:
    """세션별 볼트 FS 변경 배치 저널 (`<state_dir>/fs_journal.jsonl`)."""

    def __init__(self, state_dir: str) -> None:
        self.path = os.path.join(state_dir, JOURNAL_FILE)

    def append(self, record: dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    def _read_all(self) -> list[dict[str, Any]]:
        if not os.path.exists(self.path):
            return []
        rows: list[dict[str, Any]] = []
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(obj, dict):
                        rows.append(obj)
        except OSError:
            return []
        return rows

    def list_batches(
        self,
        *,
        session_id: Optional[str] = None,
        since: float = 0.0,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        by_id: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for row in self._read_all():
            ev = row.get("ev")
            bid = str(row.get("batchId") or "")
            if not bid:
                continue
            if ev == "batch":
                if session_id and row.get("sessionId") != session_id:
                    continue
                if bid not in by_id:
                    order.append(bid)
                by_id[bid] = dict(row)
            elif ev == "undo" and bid in by_id:
                by_id[bid]["undone"] = True
                by_id[bid]["undoneAt"] = row.get("undoneAt")
        out = [by_id[bid] for bid in reversed(order) if float(by_id[bid].get("createdAt") or 0) >= since]
        return out[:limit]

    def get_batch(self, batch_id: str) -> Optional[dict[str, Any]]:
        found: Optional[dict[str, Any]] = None
        for row in self._read_all():
            if str(row.get("batchId") or "") != batch_id:
                continue
            if row.get("ev") == "batch":
                found = dict(row)
            elif row.get("ev") == "undo" and found is not None:
                found["undone"] = True
                found["undoneAt"] = row.get("undoneAt")
        return found

    def mark_undone(self, batch_id: str, session_id: str = "") -> None:
        self.append({"ev": "undo", "batchId": batch_id, "sessionId": session_id, "undoneAt": time.time()})


def to_public_batch_summary(batch: dict[str, Any]) -> dict[str, Any]:
    return {
        "batchId": str(batch.get("batchId") or ""),
        "summary": str(batch.get("summary") or ""),
        "opCount": int(batch.get("opCount") or len(batch.get("ops") or [])),
        "ops": list(batch.get("ops") or []),
        "createdAt": float(batch.get("createdAt") or 0),
        "undone": bool(batch.get("undone")),
    }


class VaultFsTools:
    """볼트 샌드박스 디렉토리·파일 연산 도구 (`vf_*`)."""

    def __init__(
        self,
        store: WorkspaceStore,
        session_id: str = "",
        *,
        conversation_id: str = "",
        vault_root_override: Optional[str] = None,
        read_only_override: Optional[bool] = None,
        target_folders_override: Optional[list[str]] = None,
    ) -> None:
        self.store = store
        self.session_id = session_id
        self.conversation_id = conversation_id
        self._vault_root_override = vault_root_override
        self._read_only_override = read_only_override
        self._target_folders_override = target_folders_override
        self.journal = FsJournal(store.dir)

    @staticmethod
    def handles(name: str) -> bool:
        return name.startswith("vf_")

    def _state(self) -> dict[str, Any]:
        return self.store.workbench_for(self.session_id) or {}

    def _context(self, *, write: bool) -> tuple[Path, list[str]]:
        state = self._state()
        raw_root = self._vault_root_override if self._vault_root_override is not None else str(state.get("vaultRoot") or "")
        if not raw_root:
            raise ValueError("로컬 볼트가 연결되어 있지 않아 디렉토리 도구를 사용할 수 없습니다.")
        root = Path(raw_root).resolve()
        if not root.is_dir():
            raise ValueError(f"볼트 루트 디렉토리가 존재하지 않습니다: {root}")
        read_only = self._read_only_override if self._read_only_override is not None else bool(state.get("readOnly"))
        mode = str(state.get("mode") or "")
        if write:
            if read_only:
                raise ValueError("읽기 전용(RO) 볼트에서는 디렉토리·파일을 변경할 수 없습니다.")
            if mode == "plan":
                raise ValueError("계획만(plan) 모드에서는 변경할 수 없습니다. vf_batch(dryRun=true) 또는 읽기 도구만 사용하세요.")
        raw_targets = self._target_folders_override if self._target_folders_override is not None else state.get("targetFolders")
        targets: list[str] = []
        if isinstance(raw_targets, list):
            for t in raw_targets:
                norm = normalize_vault_rel(t, allow_empty=True)
                targets.append(norm)
        return root, targets

    def _assert_in_target_scope(self, rel: str, target_folders: list[str]) -> None:
        if not target_folders:
            return
        if "" in target_folders:
            return
        for tf in target_folders:
            if rel == tf or rel.startswith(tf + "/"):
                return
        allowed = ", ".join(target_folders)
        raise ValueError(f"지정된 대상 폴더({allowed}) 밖은 수정할 수 없습니다: {rel}")

    #: 볼트를 바꾸는 도구 — 프로세스 사이 잠금 안에서 실행한다 (세션 여럿이 같은 볼트에 동시에 쓸 때 묶음 · 저널이 끼어들지 않게)
    WRITE_TOOLS = frozenset({"vf_mkdir", "vf_move", "vf_rename", "vf_copy", "vf_write", "vf_patch", "vf_trash", "vf_batch", "vf_undo"})

    def call(self, name: str, args: dict[str, Any]) -> str:
        fn = getattr(self, f"_{name}", None)
        if not name.startswith("vf_") or fn is None:
            raise ValueError(f"알 수 없는 볼트 FS 도구: {name}")
        if name in self.WRITE_TOOLS:
            with vault_write_lock(self.store.dir):
                return fn(**(args or {}))
        return fn(**(args or {}))

    # --- 읽기 · 현황 파악 --------------------------------------------------------------------

    def _vf_stat(self, path: str = "", **_: Any) -> str:
        root, _ = self._context(write=False)
        rel = normalize_vault_rel(path, allow_empty=True)
        target = resolve_inside(root, rel)
        if not target.exists():
            raise ValueError(f"경로가 존재하지 않습니다: {rel or '/'}")
        st = target.stat()
        mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))
        if target.is_file():
            return f"[파일] {rel}\n크기: {_fmt_size(st.st_size)} ({st.st_size}B) · 수정: {mtime} · 확장자: {target.suffix or '(없음)'}"
        direct_dirs: list[str] = []
        direct_files: list[str] = []
        ext_counts: Counter[str] = Counter()
        total_bytes = 0
        total_files = 0
        total_dirs = 0
        for entry in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                direct_dirs.append(entry.name + "/")
            elif entry.is_file():
                direct_files.append(f"{entry.name} ({_fmt_size(entry.stat().st_size)})")
        for cur_root, dirs, files in os.walk(target):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            total_dirs += len(dirs)
            for fname in files:
                if fname.startswith("."):
                    continue
                total_files += 1
                fpath = Path(cur_root) / fname
                try:
                    total_bytes += fpath.stat().st_size
                except OSError:
                    pass
                ext_counts[fpath.suffix.lower() or "(없음)"] += 1
        ext_summary = ", ".join(f"{k}:{v}" for k, v in ext_counts.most_common(8)) or "(없음)"
        lines = [
            f"[폴더] {rel or '/'}",
            f"하위 폴더: {total_dirs}개 · 파일: {total_files}개 · 합계: {_fmt_size(total_bytes)} · 수정: {mtime}",
            f"확장자 분포: {ext_summary}",
        ]
        if direct_dirs:
            lines.append(f"직속 폴더({len(direct_dirs)}): {', '.join(direct_dirs[:30])}")
        if direct_files:
            lines.append(f"직속 파일({len(direct_files)}): {', '.join(direct_files[:30])}")
        return "\n".join(lines)

    def _vf_du(self, path: str = "", depth: int = 2, **_: Any) -> str:
        root, _ = self._context(write=False)
        rel = normalize_vault_rel(path, allow_empty=True)
        target = resolve_inside(root, rel)
        if not target.is_dir():
            raise ValueError(f"폴더가 아닙니다: {rel or '/'}")
        max_depth = max(1, min(int(depth or 2), 5))
        stats: dict[str, list[int]] = {}  # folder_rel -> [bytes, file_count]
        base_depth = len(rel.split("/")) if rel else 0
        for cur_root, dirs, files in os.walk(target):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            cur_rel = Path(cur_root).relative_to(root).as_posix()
            if cur_rel == ".":
                cur_rel = ""
            file_bytes = 0
            file_cnt = 0
            for fname in files:
                if fname.startswith("."):
                    continue
                file_cnt += 1
                try:
                    file_bytes += (Path(cur_root) / fname).stat().st_size
                except OSError:
                    pass
            # 자신과 모든 상위 폴더에 합산
            parts = cur_rel.split("/") if cur_rel else []
            for d_idx in range(base_depth, len(parts) + 1):
                anc = "/".join(parts[:d_idx])
                if d_idx - base_depth <= max_depth:
                    bucket = stats.setdefault(anc, [0, 0])
                    bucket[0] += file_bytes
                    bucket[1] += file_cnt
        if not stats:
            stats[rel] = [0, 0]
        rows = [f"[디스크 사용량] {rel or '/'} (depth={max_depth})"]
        for folder_rel in sorted(stats.keys()):
            b, c = stats[folder_rel]
            rows.append(f"- {folder_rel or '/'} : {_fmt_size(b)} · 파일 {c}개")
        return "\n".join(rows[:120])

    def _vf_history(self, limit: int = 10, **_: Any) -> str:
        self._context(write=False)
        batches = self.journal.list_batches(session_id=self.session_id or None, limit=max(1, min(int(limit or 10), 50)))
        if not batches:
            return "이 세션에서 실행한 볼트 디렉토리·파일 변경 이력이 없습니다."
        lines = [f"[볼트 FS 변경 이력] 최근 {len(batches)}건"]
        for b in batches:
            ts = time.strftime("%H:%M:%S", time.localtime(float(b.get("createdAt") or 0)))
            status = "되돌림 완료" if b.get("undone") else "적용됨"
            lines.append(f"- {b['batchId']} ({ts} · {status}) {b.get('summary') or ''} [{b.get('opCount', 0)}건]")
        return "\n".join(lines)

    # --- 단건 쓰기 도구 (모두 _run_batch 로 통일해 저널 + Undo 보장) -------------------------

    def _vf_mkdir(self, paths: Optional[list[str]] = None, path: str = "", **_: Any) -> str:
        items = list(paths or [])
        if path:
            items.append(path)
        if not items:
            raise ValueError("생성할 폴더 경로(`paths` 또는 `path`)가 필요합니다.")
        ops = [{"op": "mkdir", "path": p} for p in items]
        return self._run_batch(ops, dry_run=False, summary=f"폴더 생성 {len(ops)}건")

    def _vf_move(self, src: str = "", dst: str = "", onConflict: str = "error", **_: Any) -> str:
        return self._run_batch([{"op": "move", "src": src, "dst": dst, "onConflict": onConflict}], dry_run=False, summary=f"이동: {src} -> {dst}")

    def _vf_rename(self, path: str = "", newName: str = "", **_: Any) -> str:
        return self._run_batch([{"op": "rename", "path": path, "newName": newName}], dry_run=False, summary=f"이름 변경: {path} -> {newName}")

    def _vf_copy(self, src: str = "", dst: str = "", onConflict: str = "error", **_: Any) -> str:
        return self._run_batch([{"op": "copy", "src": src, "dst": dst, "onConflict": onConflict}], dry_run=False, summary=f"복제: {src} -> {dst}")

    def _vf_write(self, path: str = "", content: str = "", mode: str = "create", **_: Any) -> str:
        return self._run_batch([{"op": "write", "path": path, "content": content, "mode": mode}], dry_run=False, summary=f"파일 쓰기({mode}): {path}")

    def _vf_patch(
        self,
        path: str = "",
        find: str = "",
        replace: str = "",
        regex: bool = False,
        replaceAll: bool = False,
        dryRun: bool = False,
        **_: Any,
    ) -> str:
        return self._run_batch(
            [{"op": "patch", "path": path, "find": find, "replace": replace, "regex": bool(regex), "replaceAll": bool(replaceAll)}],
            dry_run=bool(dryRun),
            summary=f"텍스트 치환: {path}",
        )

    def _vf_trash(self, paths: Optional[list[str]] = None, path: str = "", **_: Any) -> str:
        items = list(paths or [])
        if path:
            items.append(path)
        if not items:
            raise ValueError("휴지통으로 보낼 경로(`paths` 또는 `path`)가 필요합니다.")
        ops = [{"op": "trash", "path": p} for p in items]
        return self._run_batch(ops, dry_run=False, summary=f"휴지통 이동 {len(ops)}건")

    def _vf_batch(
        self,
        ops: Optional[list[dict[str, Any]]] = None,
        dryRun: bool = False,
        summary: str = "",
        **_: Any,
    ) -> str:
        if not isinstance(ops, list) or not ops:
            raise ValueError("실행할 연산 목록(`ops`)이 비어 있습니다.")
        if len(ops) > MAX_BATCH_OPS:
            raise ValueError(f"한 배치의 최대 연산 수({MAX_BATCH_OPS}건)를 초과했습니다.")
        return self._run_batch(ops, dry_run=bool(dryRun), summary=summary or f"일괄 작업 {len(ops)}건")

    # --- 원자적 배치 실행 & 롤백 엔진 --------------------------------------------------------

    def _preflight_op(self, root: Path, targets: list[str], raw_op: dict[str, Any]) -> dict[str, Any]:
        kind = str(raw_op.get("op") or "").strip().lower()
        if kind not in ("mkdir", "move", "rename", "copy", "write", "patch", "trash"):
            raise ValueError(f"지원하지 않는 연산입니다: {kind}")

        if kind == "mkdir":
            rel = normalize_vault_rel(raw_op.get("path"))
            assert_not_protected(rel)
            self._assert_in_target_scope(rel, targets)
            resolve_inside(root, rel)
            return {"op": "mkdir", "path": rel}

        if kind == "move":
            src = normalize_vault_rel(raw_op.get("src"))
            dst = normalize_vault_rel(raw_op.get("dst"))
            assert_not_protected(src)
            assert_not_protected(dst)
            self._assert_in_target_scope(src, targets)
            self._assert_in_target_scope(dst, targets)
            resolve_inside(root, src)
            resolve_inside(root, dst)
            if dst == src or dst.startswith(src + "/"):
                raise ValueError(f"폴더를 자기 자신 또는 하위 폴더로 이동할 수 없습니다: {src} -> {dst}")
            conflict = str(raw_op.get("onConflict") or "error")
            if conflict not in ("error", "skip", "rename"):
                raise ValueError(f"잘못된 onConflict 값: {conflict}")
            return {"op": "move", "src": src, "dst": dst, "onConflict": conflict}

        if kind == "rename":
            src = normalize_vault_rel(raw_op.get("path"))
            new_name = str(raw_op.get("newName") or "").strip()
            if not new_name or "/" in new_name or "\\" in new_name or new_name in (".", "..") or "\x00" in new_name:
                raise ValueError(f"유효하지 않은 새 이름입니다: {new_name}")
            parent = "/".join(src.split("/")[:-1])
            dst = f"{parent}/{new_name}" if parent else new_name
            assert_not_protected(src)
            assert_not_protected(dst)
            self._assert_in_target_scope(src, targets)
            self._assert_in_target_scope(dst, targets)
            resolve_inside(root, src)
            resolve_inside(root, dst)
            return {"op": "rename", "src": src, "dst": dst}

        if kind == "copy":
            src = normalize_vault_rel(raw_op.get("src"))
            dst = normalize_vault_rel(raw_op.get("dst"))
            assert_not_protected(src)
            assert_not_protected(dst)
            self._assert_in_target_scope(dst, targets)
            resolve_inside(root, src)
            resolve_inside(root, dst)
            if dst == src or dst.startswith(src + "/"):
                raise ValueError(f"폴더를 자기 자신 또는 하위 폴더로 복제할 수 없습니다: {src} -> {dst}")
            conflict = str(raw_op.get("onConflict") or "error")
            if conflict not in ("error", "skip", "rename"):
                raise ValueError(f"잘못된 onConflict 값: {conflict}")
            return {"op": "copy", "src": src, "dst": dst, "onConflict": conflict}

        if kind == "write":
            rel = normalize_vault_rel(raw_op.get("path"))
            assert_not_protected(rel)
            self._assert_in_target_scope(rel, targets)
            target = resolve_inside(root, rel)
            if target.suffix.lower() in BINARY_WRITE_BLOCK_EXTS:
                raise ValueError(f"바이너리 확장자에는 텍스트 쓰기가 금지됩니다: {rel}")
            if target.suffix.lower() in STRUCTURED_WRITE_BLOCK_EXTS:
                raise ValueError(packs.message("outline:messages.json", "rawWriteBlocked"))
            content = str(raw_op.get("content") or "")
            if len(content.encode("utf-8")) > MAX_WRITE_BYTES:
                raise ValueError(f"파일 쓰기 상한({_fmt_size(MAX_WRITE_BYTES)})을 초과했습니다: {rel}")
            mode = str(raw_op.get("mode") or "create")
            if mode not in ("create", "overwrite", "append"):
                raise ValueError(f"잘못된 write mode: {mode}")
            return {"op": "write", "path": rel, "content": content, "mode": mode}

        if kind == "patch":
            rel = normalize_vault_rel(raw_op.get("path"))
            assert_not_protected(rel)
            self._assert_in_target_scope(rel, targets)
            target = resolve_inside(root, rel)
            if target.suffix.lower() in BINARY_WRITE_BLOCK_EXTS:
                raise ValueError(f"바이너리 파일에는 텍스트 치환이 금지됩니다: {rel}")
            if target.suffix.lower() in STRUCTURED_WRITE_BLOCK_EXTS:
                raise ValueError(packs.message("outline:messages.json", "rawWriteBlocked"))
            find = str(raw_op.get("find") or "")
            if not find:
                raise ValueError("치환할 문자열(`find`)이 비어 있습니다.")
            replace = str(raw_op.get("replace") or "")
            return {
                "op": "patch",
                "path": rel,
                "find": find,
                "replace": replace,
                "regex": bool(raw_op.get("regex")),
                "replaceAll": bool(raw_op.get("replaceAll")),
            }

        # trash
        rel = normalize_vault_rel(raw_op.get("path"))
        assert_not_protected(rel)
        self._assert_in_target_scope(rel, targets)
        resolve_inside(root, rel)
        return {"op": "trash", "path": rel}

    def _run_batch(self, raw_ops: list[dict[str, Any]], *, dry_run: bool, summary: str) -> str:
        root, targets = self._context(write=not dry_run)
        validated = [self._preflight_op(root, targets, op) for op in raw_ops]

        if dry_run:
            return self._render_dry_run(root, validated, summary)

        batch_id = f"fsb-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        rollback: list[dict[str, Any]] = []
        executed_lines: list[str] = []
        diff_snippets: list[str] = []

        try:
            for spec in validated:
                line, diff = self._exec_one(root, batch_id, spec, rollback)
                executed_lines.append(line)
                if diff:
                    diff_snippets.append(diff)
        except Exception as exc:
            # 중간 실패 시 이미 실행된 연산을 역순 롤백해 원자성 보장
            rollback_errs = self._apply_rollback(root, rollback)
            rb_note = f" (자동 롤백 완료)" if not rollback_errs else f" (롤백 경고: {'; '.join(rollback_errs)})"
            raise ValueError(f"배치 실행 중 오류로 중단되었습니다: {exc}{rb_note}") from exc

        record = {
            "ev": "batch",
            "batchId": batch_id,
            "sessionId": self.session_id,
            "vaultRoot": str(root),
            "summary": summary,
            "opCount": len(executed_lines),
            "ops": executed_lines,
            "rollback": rollback,
            "createdAt": time.time(),
            "undone": False,
        }
        self.journal.append(record)
        out = [f"[완료 · batchId={batch_id}] {summary} ({len(executed_lines)}건)"]
        out.extend(f"- {ln}" for ln in executed_lines[:40])
        if len(executed_lines) > 40:
            out.append(f"… 외 {len(executed_lines) - 40}건")
        if diff_snippets:
            out.append("\n".join(diff_snippets[:3]))
        out.append(f"(되돌리기: vf_undo(batchId=\"{batch_id}\"))")
        return "\n".join(out)

    def _render_dry_run(self, root: Path, specs: list[dict[str, Any]], summary: str) -> str:
        lines = [f"[미리보기 · dryRun] {summary} ({len(specs)}건 — 실제 디스크 변경 없음)"]
        for spec in specs:
            op = spec["op"]
            if op == "mkdir":
                exists = resolve_inside(root, spec["path"]).exists()
                lines.append(f"- mkdir {spec['path']}" + (" (이미 존재)" if exists else ""))
            elif op in ("move", "rename", "copy"):
                src_p = resolve_inside(root, spec["src"])
                dst_p = resolve_inside(root, spec["dst"])
                if not src_p.exists():
                    lines.append(f"- {op} {spec['src']} -> {spec['dst']} [경고: 원본 없음]")
                elif dst_p.exists() and op != "move":
                    lines.append(f"- {op} {spec['src']} -> {spec['dst']} [충돌: 대상 존재]")
                else:
                    lines.append(f"- {op} {spec['src']} -> {spec['dst']}")
            elif op == "write":
                p = resolve_inside(root, spec["path"])
                state = "기존 파일" if p.exists() else "신규 파일"
                lines.append(f"- write({spec['mode']}) {spec['path']} ({state}, {len(spec['content'])}자)")
            elif op == "patch":
                p = resolve_inside(root, spec["path"])
                if not p.is_file():
                    lines.append(f"- patch {spec['path']} [경고: 파일 없음]")
                else:
                    before = p.read_text(encoding="utf-8", errors="replace")
                    after, count = self._compute_patch(before, spec)
                    diff = "".join(difflib.unified_diff(
                        before.splitlines(keepends=True), after.splitlines(keepends=True),
                        fromfile=f"a/{spec['path']}", tofile=f"b/{spec['path']}", n=2,
                    ))
                    lines.append(f"- patch {spec['path']} ({count}곳 치환)\n{diff[:1200]}")
            elif op == "trash":
                p = resolve_inside(root, spec["path"])
                lines.append(f"- trash {spec['path']}" + (" (휴지통 이동 예정)" if p.exists() else " [경고: 대상 없음]"))
        return "\n".join(lines)

    def _compute_patch(self, text: str, spec: dict[str, Any]) -> tuple[str, int]:
        find = spec["find"]
        repl = spec["replace"]
        if spec.get("regex"):
            count_limit = 0 if spec.get("replaceAll") else 1
            after, count = re.subn(find, repl, text, count=count_limit)
            return after, count
        if spec.get("replaceAll"):
            count = text.count(find)
            return text.replace(find, repl), count
        if find not in text:
            return text, 0
        return text.replace(find, repl, 1), 1

    def _ensure_parent_dirs(self, root: Path, target: Path, rollback: list[dict[str, Any]]) -> None:
        missing: list[Path] = []
        cur = target.parent
        while cur != root and not cur.exists():
            missing.append(cur)
            cur = cur.parent
        for d in reversed(missing):
            d.mkdir(exist_ok=True)
            rollback.append({"kind": "rmdir_if_empty", "path": d.relative_to(root).as_posix()})

    def _exec_one(
        self,
        root: Path,
        batch_id: str,
        spec: dict[str, Any],
        rollback: list[dict[str, Any]],
    ) -> tuple[str, str]:
        op = spec["op"]

        if op == "mkdir":
            target = resolve_inside(root, spec["path"])
            if target.exists():
                if not target.is_dir():
                    raise ValueError(f"같은 이름의 파일이 이미 존재합니다: {spec['path']}")
                return f"mkdir {spec['path']} (이미 존재)", ""
            missing: list[Path] = []
            cur = target
            while cur != root and not cur.exists():
                missing.append(cur)
                cur = cur.parent
            for d in reversed(missing):
                d.mkdir(exist_ok=True)
                rollback.append({"kind": "rmdir_if_empty", "path": d.relative_to(root).as_posix()})
            return f"mkdir {spec['path']}", ""

        if op in ("move", "rename"):
            src_p = resolve_inside(root, spec["src"])
            if not src_p.exists():
                raise ValueError(f"원본이 존재하지 않습니다: {spec['src']}")
            dst_p = resolve_inside(root, spec["dst"])
            # 대상이 기존 폴더이고 원본이 다른 이름이면 그 폴더 안으로 이동 (`mv a.txt dir/` 동작)
            if op == "move" and dst_p.is_dir():
                dst_p = resolve_inside(root, f"{spec['dst']}/{src_p.name}")
            conflict = spec.get("onConflict", "error")
            if dst_p.exists():
                if conflict == "skip":
                    return f"{op} {spec['src']} -> {dst_p.relative_to(root).as_posix()} (충돌 건너뜀)", ""
                if conflict == "rename":
                    dst_p = _unique_path(dst_p)
                else:
                    raise ValueError(f"대상 경로가 이미 존재합니다: {dst_p.relative_to(root).as_posix()}")
            self._ensure_parent_dirs(root, dst_p, rollback)
            final_rel = dst_p.relative_to(root).as_posix()
            shutil.move(str(src_p), str(dst_p))
            rollback.append({"kind": "move_back", "src": final_rel, "dst": spec["src"]})
            return f"{op} {spec['src']} -> {final_rel}", ""

        if op == "copy":
            src_p = resolve_inside(root, spec["src"])
            if not src_p.exists():
                raise ValueError(f"복제 원본이 존재하지 않습니다: {spec['src']}")
            dst_p = resolve_inside(root, spec["dst"])
            if dst_p.is_dir() and src_p.is_file():
                dst_p = resolve_inside(root, f"{spec['dst']}/{src_p.name}")
            conflict = spec.get("onConflict", "error")
            if dst_p.exists():
                if conflict == "skip":
                    return f"copy {spec['src']} -> {dst_p.relative_to(root).as_posix()} (충돌 건너뜀)", ""
                if conflict == "rename":
                    dst_p = _unique_path(dst_p)
                else:
                    raise ValueError(f"복제 대상이 이미 존재합니다: {dst_p.relative_to(root).as_posix()}")
            self._ensure_parent_dirs(root, dst_p, rollback)
            final_rel = dst_p.relative_to(root).as_posix()
            if src_p.is_dir():
                shutil.copytree(src_p, dst_p)
                rollback.append({"kind": "remove_tree", "path": final_rel})
            else:
                shutil.copy2(src_p, dst_p)
                rollback.append({"kind": "remove_file", "path": final_rel})
            return f"copy {spec['src']} -> {final_rel}", ""

        if op == "write":
            target = resolve_inside(root, spec["path"])
            mode = spec["mode"]
            if target.exists():
                if target.is_dir():
                    raise ValueError(f"같은 이름의 폴더가 존재합니다: {spec['path']}")
                if mode == "create":
                    raise ValueError(f"파일이 이미 존재합니다 (덮어쓰려면 mode='overwrite'): {spec['path']}")
                prev = target.read_text(encoding="utf-8", errors="replace")
                next_content = (prev + spec["content"]) if mode == "append" else spec["content"]
                _atomic_write_text(target, next_content)
                rollback.append({"kind": "restore_text", "path": spec["path"], "content": prev})
                return f"write({mode}) {spec['path']} ({len(next_content)}자)", ""
            self._ensure_parent_dirs(root, target, rollback)
            _atomic_write_text(target, spec["content"])
            rollback.append({"kind": "remove_file", "path": spec["path"]})
            return f"write({mode}) {spec['path']} (신규 {len(spec['content'])}자)", ""

        if op == "patch":
            target = resolve_inside(root, spec["path"])
            if not target.is_file():
                raise ValueError(f"치환할 파일이 존재하지 않습니다: {spec['path']}")
            prev = target.read_text(encoding="utf-8", errors="replace")
            after, count = self._compute_patch(prev, spec)
            if count == 0:
                raise ValueError(f"파일에서 일치하는 문자열을 찾지 못했습니다: {spec['path']}")
            _atomic_write_text(target, after)
            rollback.append({"kind": "restore_text", "path": spec["path"], "content": prev})
            diff = "".join(difflib.unified_diff(
                prev.splitlines(keepends=True), after.splitlines(keepends=True),
                fromfile=f"a/{spec['path']}", tofile=f"b/{spec['path']}", n=2,
            ))
            return f"patch {spec['path']} ({count}곳 치환)", diff[:1200]

        if op == "trash":
            src_p = resolve_inside(root, spec["path"])
            if not src_p.exists():
                raise ValueError(f"휴지통으로 보낼 대상이 존재하지 않습니다: {spec['path']}")
            trash_rel = f"{TRASH_DIR}/{batch_id}/{spec['path']}"
            trash_p = root / trash_rel
            trash_p.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_p), str(trash_p))
            rollback.append({"kind": "restore_trash", "trashRel": trash_rel, "origRel": spec["path"]})
            return f"trash {spec['path']} -> {trash_rel}", ""

        raise ValueError(f"알 수 없는 연산: {op}")

    def _apply_rollback(self, root: Path, rollback: list[dict[str, Any]]) -> list[str]:
        errors: list[str] = []
        for step in reversed(rollback):
            kind = step.get("kind")
            try:
                if kind == "move_back":
                    src_p = resolve_inside(root, step["src"])
                    dst_p = resolve_inside(root, step["dst"])
                    if src_p.exists():
                        dst_p.parent.mkdir(parents=True, exist_ok=True)
                        shutil.move(str(src_p), str(dst_p))
                elif kind == "restore_trash":
                    trash_p = (root / step["trashRel"]).resolve()
                    trash_p.relative_to(root.resolve())
                    orig_p = resolve_inside(root, step["origRel"])
                    if trash_p.exists():
                        orig_p.parent.mkdir(parents=True, exist_ok=True)
                        shutil.move(str(trash_p), str(orig_p))
                elif kind == "restore_text":
                    target = resolve_inside(root, step["path"])
                    _atomic_write_text(target, str(step.get("content") or ""))
                elif kind == "remove_file":
                    target = resolve_inside(root, step["path"])
                    if target.is_file():
                        target.unlink()
                elif kind == "remove_tree":
                    target = resolve_inside(root, step["path"])
                    if target.is_dir():
                        shutil.rmtree(target)
                elif kind == "rmdir_if_empty":
                    target = resolve_inside(root, step["path"])
                    if target.is_dir() and not any(target.iterdir()):
                        target.rmdir()
            except Exception as exc:
                errors.append(f"{kind}:{exc}")
        return errors

    def _vf_undo(self, batchId: str = "", **_: Any) -> str:
        root, _ = self._context(write=True)
        bid = str(batchId or "").strip()
        if not bid:
            recent = [b for b in self.journal.list_batches(session_id=self.session_id or None, limit=20) if not b.get("undone")]
            if not recent:
                raise ValueError("되돌릴 수 있는 볼트 FS 변경 배치가 없습니다.")
            batch = recent[0]
            bid = str(batch["batchId"])
        else:
            batch = self.journal.get_batch(bid)
            if batch is None:
                raise ValueError(f"배치 ID를 찾을 수 없습니다: {bid}")
            if batch.get("undone"):
                raise ValueError(f"이미 되돌린 배치입니다: {bid}")

        batch_root = Path(str(batch.get("vaultRoot") or root)).resolve()
        if batch_root != root:
            raise ValueError("다른 볼트의 배치는 되돌릴 수 없습니다.")

        errors = self._apply_rollback(root, list(batch.get("rollback") or []))
        if errors:
            raise ValueError(f"되돌리기 중 일부 오류가 발생했습니다: {'; '.join(errors)}")
        self.journal.mark_undone(bid, session_id=self.session_id)
        return f"[되돌리기 완료 · batchId={bid}] {batch.get('summary') or ''} ({batch.get('opCount', 0)}건 복원)"
