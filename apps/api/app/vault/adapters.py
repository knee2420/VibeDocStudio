"""로컬 디스크 기반 Vault 저장소 어댑터 (`app.vault.adapters`).

- 앱 전역 설정(`config/vaults.json`) · 기본 내장 볼트(`vaults/default-vault/`) · 전역 상태(`state/app-state.json`)는
  주입된 `vault_home_dir` (기본: `apps/playground/data/`) 안에만 기록한다.
- 볼트 귀속 세션(`.vibe/workspace.json`) 및 파생 캐시(`.vibe/metadata-cache.json`)는 각 볼트 루트 안 `.vibe/`에 보관한다.
- 기존 정규 프로젝트 디렉터리(`data/knowledge`, `state`, `cache`)는 Deny-list로 마운트를 원천 차단한다.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from watchfiles import Change, watch

from app.core.errors import (
    ConflictError,
    ForbiddenOperationError,
    NotFoundError,
    ValidationError,
)
from app.core.storage import read_json, write_json

from .schemas import (
    VaultAppState,
    VaultDeleteResponse,
    VaultFileResponse,
    VaultMetadataCachePayload,
    VaultNodeDto,
    VaultPathMappingDto,
    VaultRenameResponse,
    VaultSessionPayload,
    VaultSummary,
    VaultTreeResponse,
)

logger = logging.getLogger(__name__)

DEFAULT_VAULT_ID = "default-vault"
DEFAULT_VAULT_NAME = "VibeDoc Vault"
VIBE_META_DIR = ".vibe"
WORKSPACE_SESSION_FILE = "workspace.json"
METADATA_CACHE_FILE = "metadata-cache.json"

# 탐색기 트리 및 워처에서 제외하는 숨김/시스템 디렉터리
IGNORED_DIR_NAMES: frozenset[str] = frozenset(
    {
        VIBE_META_DIR,
        ".obsidian",
        ".git",
        ".hg",
        ".svn",
        ".venv",
        "venv",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".ruff_cache",
        ".turbo",
    }
)

IGNORED_FILE_NAMES: frozenset[str] = frozenset(
    {
        ".DS_Store",
        "Thumbs.db",
        "desktop.ini",
    }
)

TEXT_EXTENSIONS: frozenset[str] = frozenset(
    {
        "md",
        "markdown",
        "outline",
        "vdoc",
        "ref",
        "vsyntax",
        "vstyle",
        "json",
        "txt",
        "yaml",
        "yml",
        "toml",
        "csv",
        "ts",
        "tsx",
        "js",
        "jsx",
        "py",
        "css",
        "html",
        "xml",
        "svg",
    }
)

MAX_INLINE_TEXT_BYTES = 512 * 1024  # 512 KB 이하 텍스트만 /tree?includeContents=true 에 동봉
SELF_ECHO_TTL_SEC = 1.8

_INVALID_SEGMENT_RE = re.compile(r'[<>:"\\|?*\x00-\x1f]')
_SLUG_RE = re.compile(r"[^a-zA-Z0-9_-]+")


def normalize_rel_path(raw: str) -> str:
    cleaned = raw.replace("\\", "/").strip()
    cleaned = re.sub(r"/+", "/", cleaned).strip("/")
    return cleaned


def validate_rel_path(raw: str, *, allow_empty: bool = False) -> str:
    norm = normalize_rel_path(raw)
    if not norm:
        if allow_empty:
            return ""
        raise ValidationError("경로가 비어 있습니다.")
    parts = norm.split("/")
    for part in parts:
        if part in ("", ".", ".."):
            raise ValidationError(f"허용되지 않는 경로 세그먼트입니다: {raw}")
        if _INVALID_SEGMENT_RE.search(part):
            raise ValidationError(f"파일/폴더 이름에 사용할 수 없는 문자가 있습니다: {part}")
        if part in IGNORED_DIR_NAMES:
            raise ForbiddenOperationError(f"시스템/숨김 경로는 직접 조작할 수 없습니다: {part}")
    return norm


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _atomic_write_text(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        tmp.write_text(content, encoding="utf-8", newline="\n")
        os.replace(tmp, target)
    except Exception:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise


def _atomic_write_bytes(target: Path, data: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, target)
    except Exception:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise


MAX_UPLOAD_BYTES = 50 * 1024 * 1024
_ILLEGAL_NAME_CHARS = set('\\/:*?"<>|')


def _safe_upload_name(raw_name: str) -> str:
    """업로드된 파일 이름에서 경로와 쓸 수 없는 문자를 걷어낸다. 남는 게 없으면 `file`."""
    base = raw_name.replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = "".join(" " if (ch in _ILLEGAL_NAME_CHARS or ord(ch) < 32) else ch for ch in base)
    cleaned = " ".join(cleaned.split()).strip(" .")
    return cleaned or "file"


def _node_dto_from_path(root: Path, target: Path) -> VaultNodeDto:
    rel = target.relative_to(root).as_posix()
    parent_rel = "" if "/" not in rel else rel.rsplit("/", 1)[0]
    st = target.stat()
    ctime_ms = int(st.st_ctime * 1000)
    mtime_ms = int(st.st_mtime * 1000)
    name = target.name
    if target.is_dir():
        return VaultNodeDto(
            path=rel,
            name=name,
            parentPath=parent_rel,
            kind="folder",
            ctime=ctime_ms,
            mtime=mtime_ms,
        )
    dot = name.rfind(".")
    if dot > 0:
        ext = name[dot + 1 :].lower()
        stem = name[:dot]
    else:
        ext = ""
        stem = name
    return VaultNodeDto(
        path=rel,
        name=name,
        parentPath=parent_rel,
        kind="file",
        extension=ext,
        stem=stem,
        size=st.st_size,
        ctime=ctime_ms,
        mtime=mtime_ms,
    )


def _slugify_id(text: str) -> str:
    slug = _SLUG_RE.sub("-", text.strip().lower()).strip("-")
    return slug[:48] or f"vault-{int(time.time())}"


def _open_in_os_file_manager(target: Path, *, select_in_parent: bool) -> None:
    """OS 네이티브 파일 탐색기에서 파일/폴더를 열거나 선택한다."""
    native_path = os.fspath(target)
    if sys.platform == "win32":
        if select_in_parent:
            subprocess.Popen(["explorer.exe", "/select,", native_path])
        else:
            os.startfile(native_path)  # type: ignore[attr-defined]
        return
    if sys.platform == "darwin":
        cmd = ["open", "-R", native_path] if select_in_parent else ["open", native_path]
        subprocess.Popen(cmd)
        return
    open_dir = target if target.is_dir() else target.parent
    subprocess.Popen(["xdg-open", os.fspath(open_dir)])


class LocalVaultRepository:
    """로컬 파일시스템 Vault 레지스트리 · CRUD · `.vibe/` 세션 · 실시간 감시 어댑터."""

    def __init__(
        self,
        vault_home_dir: Path,
        denied_roots: tuple[Path, ...] = (),
    ) -> None:
        self._home = vault_home_dir.resolve()
        self._config_dir = self._home / "config"
        self._vaults_dir = self._home / "vaults"
        self._state_dir = self._home / "state"
        self._registry_file = self._config_dir / "vaults.json"
        self._app_state_file = self._state_dir / "app-state.json"
        self._denied_roots = tuple(p.resolve() for p in denied_roots)

        self._lock = threading.RLock()
        self._shutdown = threading.Event()
        self._revisions: dict[str, int] = {}
        # (vault_id, rel_path) -> (timestamp_monotonic, client_id)
        self._recent_writes: dict[tuple[str, str], tuple[float, str]] = {}

        self._ensure_home()

    def _ensure_home(self) -> None:
        self._config_dir.mkdir(parents=True, exist_ok=True)
        self._vaults_dir.mkdir(parents=True, exist_ok=True)
        self._state_dir.mkdir(parents=True, exist_ok=True)
        default_dir = self._vaults_dir / DEFAULT_VAULT_ID
        default_dir.mkdir(parents=True, exist_ok=True)
        (default_dir / VIBE_META_DIR).mkdir(parents=True, exist_ok=True)

        if not self._registry_file.exists():
            write_json(
                self._registry_file,
                {
                    "version": 1,
                    "vaults": [
                        {
                            "id": DEFAULT_VAULT_ID,
                            "name": DEFAULT_VAULT_NAME,
                            "rootPath": str(default_dir),
                            "isDefault": True,
                        }
                    ],
                },
            )

    def _bump_revision(self, vault_id: str) -> int:
        with self._lock:
            nxt = self._revisions.get(vault_id, 0) + 1
            self._revisions[vault_id] = nxt
            return nxt

    def _record_local_write(self, vault_id: str, rel_paths: list[str], client_id: str | None) -> None:
        now = time.monotonic()
        cid = client_id or "__api__"
        with self._lock:
            # 오래된 기록 정리
            expired = [k for k, (ts, _) in self._recent_writes.items() if now - ts > SELF_ECHO_TTL_SEC * 2]
            for k in expired:
                self._recent_writes.pop(k, None)
            for rel in rel_paths:
                norm = normalize_rel_path(rel)
                if norm:
                    self._recent_writes[(vault_id, norm)] = (now, cid)

    def _is_self_echo(self, vault_id: str, rel_path: str, subscriber_client_id: str | None) -> bool:
        now = time.monotonic()
        norm = normalize_rel_path(rel_path)
        with self._lock:
            rec = self._recent_writes.get((vault_id, norm))
            if not rec:
                return False
            ts, writer_cid = rec
            if now - ts > SELF_ECHO_TTL_SEC:
                return False
            if subscriber_client_id and writer_cid == subscriber_client_id:
                return True
            return False

    def _assert_mount_allowed(self, target_dir: Path) -> None:
        resolved = target_dir.resolve()
        for denied in self._denied_roots:
            if resolved == denied or _is_within(resolved, denied) or _is_within(denied, resolved):
                raise ForbiddenOperationError(
                    f"기존 정규 프로젝트 시스템 경로({denied})는 Vault로 마운트할 수 없습니다."
                )

    def _read_registry_raw(self) -> list[dict[str, Any]]:
        self._ensure_home()
        raw = read_json(self._registry_file, default={"version": 1, "vaults": []})
        vaults = raw.get("vaults", [])
        if not isinstance(vaults, list):
            return []
        return [v for v in vaults if isinstance(v, dict) and v.get("id") and v.get("rootPath")]

    def _write_registry_raw(self, vaults: list[dict[str, Any]]) -> None:
        write_json(self._registry_file, {"version": 1, "vaults": vaults})

    def list_vaults(self) -> list[VaultSummary]:
        with self._lock:
            rows = self._read_registry_raw()
            out: list[VaultSummary] = []
            for row in rows:
                root = Path(str(row["rootPath"]))
                out.append(
                    VaultSummary(
                        id=str(row["id"]),
                        name=str(row.get("name") or row["id"]),
                        rootPath=str(root),
                        isDefault=bool(row.get("isDefault", False)),
                        exists=root.exists() and root.is_dir(),
                    )
                )
            return out

    def get_vault_summary(self, vault_id: str) -> VaultSummary:
        for v in self.list_vaults():
            if v.id == vault_id:
                return v
        raise NotFoundError(f"Vault를 찾을 수 없습니다: {vault_id}")

    def _get_vault_root(self, vault_id: str) -> Path:
        summary = self.get_vault_summary(vault_id)
        root = Path(summary.rootPath).resolve()
        if not root.exists() or not root.is_dir():
            raise NotFoundError(f"Vault 로컬 경로가 존재하지 않습니다: {root}")
        self._assert_mount_allowed(root)
        return root

    def _resolve_inside(self, root: Path, rel_path: str, *, allow_empty: bool = False) -> tuple[str, Path]:
        norm = validate_rel_path(rel_path, allow_empty=allow_empty)
        if not norm:
            return "", root
        target = (root / norm).resolve()
        if not _is_within(target, root):
            raise ForbiddenOperationError(f"Vault 루트 바깥 경로 접근은 금지됩니다: {rel_path}")
        return norm, target

    def create_or_mount_vault(
        self,
        name: str,
        root_path: str | None = None,
        explicit_id: str | None = None,
    ) -> VaultSummary:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError("Vault 이름이 비어 있습니다.")

        with self._lock:
            rows = self._read_registry_raw()
            existing_ids = {str(r["id"]) for r in rows}

            base_id = _slugify_id(explicit_id or clean_name)
            vault_id = base_id
            suffix = 2
            while vault_id in existing_ids:
                vault_id = f"{base_id}-{suffix}"
                suffix += 1

            if root_path and root_path.strip():
                target_dir = Path(root_path.strip()).expanduser().resolve()
                self._assert_mount_allowed(target_dir)
                if not target_dir.exists():
                    raise NotFoundError(f"지정한 로컬 폴더가 존재하지 않습니다: {target_dir}")
                if not target_dir.is_dir():
                    raise ValidationError(f"폴더 경로가 아닙니다: {target_dir}")
                # 이미 동일 경로가 등록돼 있으면 기존 항목 반환
                for r in rows:
                    if Path(str(r["rootPath"])).resolve() == target_dir:
                        return self.get_vault_summary(str(r["id"]))
            else:
                target_dir = (self._vaults_dir / vault_id).resolve()
                self._assert_mount_allowed(target_dir)
                target_dir.mkdir(parents=True, exist_ok=True)

            (target_dir / VIBE_META_DIR).mkdir(parents=True, exist_ok=True)
            rows.append(
                {
                    "id": vault_id,
                    "name": clean_name,
                    "rootPath": str(target_dir),
                    "isDefault": False,
                }
            )
            self._write_registry_raw(rows)
            return VaultSummary(
                id=vault_id,
                name=clean_name,
                rootPath=str(target_dir),
                isDefault=False,
                exists=True,
            )

    def unregister_vault(self, vault_id: str) -> None:
        if vault_id == DEFAULT_VAULT_ID:
            raise ForbiddenOperationError("기본 Vault는 등록 해제할 수 없습니다.")
        with self._lock:
            rows = self._read_registry_raw()
            filtered = [r for r in rows if str(r["id"]) != vault_id]
            if len(filtered) == len(rows):
                raise NotFoundError(f"Vault를 찾을 수 없습니다: {vault_id}")
            self._write_registry_raw(filtered)

            state = self.get_app_state()
            if state.activeVaultId == vault_id:
                self.save_app_state(VaultAppState(activeVaultId=DEFAULT_VAULT_ID, theme=state.theme))

    def get_app_state(self) -> VaultAppState:
        raw = read_json(self._app_state_file, default=None)
        if isinstance(raw, dict):
            try:
                state = VaultAppState.model_validate(raw)
                valid_ids = {v.id for v in self.list_vaults()}
                if state.activeVaultId in valid_ids:
                    return state
            except Exception:
                pass
        return VaultAppState(activeVaultId=DEFAULT_VAULT_ID, theme="dark")

    def save_app_state(self, state: VaultAppState) -> VaultAppState:
        # 등록된 볼트 ID 검증
        self.get_vault_summary(state.activeVaultId)
        write_json(self._app_state_file, state.model_dump())
        return state

    def get_tree(self, vault_id: str, *, include_contents: bool = True) -> VaultTreeResponse:
        summary = self.get_vault_summary(vault_id)
        root = self._get_vault_root(vault_id)
        entries: list[VaultNodeDto] = []
        files: dict[str, str] = {}

        for dirpath, dirnames, filenames in os.walk(root):
            # 무시 폴더는 아예 탐색하지 않음
            dirnames[:] = sorted(
                d for d in dirnames if d not in IGNORED_DIR_NAMES and not d.startswith(".")
            )
            cur_dir = Path(dirpath)
            if cur_dir != root:
                entries.append(_node_dto_from_path(root, cur_dir))
            for fname in sorted(filenames):
                if fname in IGNORED_FILE_NAMES or fname.startswith("."):
                    continue
                fpath = cur_dir / fname
                try:
                    if not fpath.is_file():
                        continue
                    dto = _node_dto_from_path(root, fpath)
                except OSError:
                    continue
                entries.append(dto)
                if (
                    include_contents
                    and dto.extension in TEXT_EXTENSIONS
                    and (dto.size or 0) <= MAX_INLINE_TEXT_BYTES
                ):
                    try:
                        files[dto.path] = fpath.read_text(encoding="utf-8")
                    except (OSError, UnicodeDecodeError):
                        pass

        return VaultTreeResponse(
            vault=summary,
            entries=entries,
            files=files,
            revision=self._revisions.get(vault_id, 0),
        )

    def seed_vault(
        self,
        vault_id: str,
        entries: list[tuple[str, str]],
        *,
        only_if_empty: bool = True,
        client_id: str | None = None,
    ) -> tuple[bool, int]:
        root = self._get_vault_root(vault_id)
        if only_if_empty:
            tree = self.get_tree(vault_id, include_contents=False)
            if len(tree.entries) > 0:
                return False, 0

        written_paths: list[str] = []
        for raw_path, content in entries:
            norm, target = self._resolve_inside(root, raw_path)
            if target.exists():
                continue
            _atomic_write_text(target, content)
            written_paths.append(norm)

        if written_paths:
            self._record_local_write(vault_id, written_paths, client_id)
            self._bump_revision(vault_id)
        return True, len(written_paths)

    def read_file(self, vault_id: str, rel_path: str) -> VaultFileResponse:
        root = self._get_vault_root(vault_id)
        _, target = self._resolve_inside(root, rel_path)
        if not target.exists() or not target.is_file():
            raise NotFoundError(f"파일을 찾을 수 없습니다: {rel_path}")
        try:
            content = target.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValidationError(f"UTF-8 텍스트 파일이 아닙니다: {rel_path}") from exc
        return VaultFileResponse(node=_node_dto_from_path(root, target), content=content)

    def resolve_raw_file(self, vault_id: str, rel_path: str) -> Path:
        root = self._get_vault_root(vault_id)
        _, target = self._resolve_inside(root, rel_path)
        if not target.exists() or not target.is_file():
            raise NotFoundError(f"파일을 찾을 수 없습니다: {rel_path}")
        return target

    def create_file(
        self,
        vault_id: str,
        rel_path: str,
        content: str = "",
        *,
        client_id: str | None = None,
    ) -> VaultNodeDto:
        root = self._get_vault_root(vault_id)
        norm, target = self._resolve_inside(root, rel_path)
        if target.exists():
            raise ConflictError(f"이미 존재하는 경로입니다: {norm}")
        _atomic_write_text(target, content)
        self._record_local_write(vault_id, [norm], client_id)
        self._bump_revision(vault_id)
        return _node_dto_from_path(root, target)

    def write_file(
        self,
        vault_id: str,
        rel_path: str,
        content: str,
        *,
        client_id: str | None = None,
        expected_mtime: int | None = None,
    ) -> VaultNodeDto:
        root = self._get_vault_root(vault_id)
        norm, target = self._resolve_inside(root, rel_path)
        if target.exists() and target.is_dir():
            raise ValidationError(f"폴더 경로에는 텍스트를 쓸 수 없습니다: {norm}")
        if expected_mtime is not None and target.exists():
            current_mtime = int(target.stat().st_mtime * 1000)
            if abs(current_mtime - expected_mtime) > 2:
                raise ConflictError(f"파일이 외부에서 변경되었습니다: {norm}")
        _atomic_write_text(target, content)
        self._record_local_write(vault_id, [norm], client_id)
        self._bump_revision(vault_id)
        return _node_dto_from_path(root, target)

    def upload_binary(
        self,
        vault_id: str,
        folder_rel: str,
        file_name: str,
        data: bytes,
        *,
        client_id: str | None = None,
    ) -> VaultNodeDto:
        """바이너리 파일(이미지·PDF 등)을 폴더에 새로 저장한다. 같은 이름이 있으면 `이름 1.ext` 처럼 번호를 붙인다."""
        if len(data) > MAX_UPLOAD_BYTES:
            raise ValidationError(f"파일이 너무 큽니다 (최대 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB): {file_name}")
        root = self._get_vault_root(vault_id)
        folder_norm, folder = self._resolve_inside(root, folder_rel, allow_empty=True)
        if folder.exists() and not folder.is_dir():
            raise ValidationError(f"폴더가 아닙니다: {folder_norm}")
        name = _safe_upload_name(file_name)
        dot = name.rfind(".")
        stem, ext = (name[:dot], name[dot:]) if dot > 0 else (name, "")
        with self._lock:
            candidate = name
            counter = 1
            while (folder / candidate).exists():
                candidate = f"{stem} {counter}{ext}"
                counter += 1
            rel = f"{folder_norm}/{candidate}" if folder_norm else candidate
            norm, target = self._resolve_inside(root, rel)
            _atomic_write_bytes(target, data)
        self._record_local_write(vault_id, [norm], client_id)
        self._bump_revision(vault_id)
        return _node_dto_from_path(root, target)

    def create_folder(
        self,
        vault_id: str,
        rel_path: str,
        *,
        client_id: str | None = None,
    ) -> VaultNodeDto:
        root = self._get_vault_root(vault_id)
        norm, target = self._resolve_inside(root, rel_path)
        if target.exists() and target.is_file():
            raise ConflictError(f"같은 이름의 파일이 이미 존재합니다: {norm}")
        target.mkdir(parents=True, exist_ok=True)
        self._record_local_write(vault_id, [norm], client_id)
        self._bump_revision(vault_id)
        return _node_dto_from_path(root, target)

    def _collect_subtree_rel_paths(self, root: Path, base: Path) -> list[str]:
        rel_base = base.relative_to(root).as_posix()
        if base.is_file():
            return [rel_base]
        paths = [rel_base]
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(d for d in dirnames if d not in IGNORED_DIR_NAMES)
            cur = Path(dirpath)
            if cur != base:
                paths.append(cur.relative_to(root).as_posix())
            for fname in sorted(filenames):
                if fname not in IGNORED_FILE_NAMES:
                    paths.append((cur / fname).relative_to(root).as_posix())
        return paths

    def rename_entry(
        self,
        vault_id: str,
        old_path: str,
        new_name_or_path: str,
        *,
        client_id: str | None = None,
    ) -> VaultRenameResponse:
        root = self._get_vault_root(vault_id)
        norm_old, src = self._resolve_inside(root, old_path)
        if not src.exists():
            raise NotFoundError(f"대상을 찾을 수 없습니다: {norm_old}")

        cleaned_new = normalize_rel_path(new_name_or_path)
        if "/" in cleaned_new:
            target_rel = cleaned_new
        else:
            parent_rel = "" if "/" not in norm_old else norm_old.rsplit("/", 1)[0]
            target_rel = f"{parent_rel}/{cleaned_new}" if parent_rel else cleaned_new

        norm_new, dst = self._resolve_inside(root, target_rel)
        if norm_old == norm_new:
            return VaultRenameResponse(oldPath=norm_old, newPath=norm_new, affectedMap=[])

        if src.is_dir() and _is_within(dst, src):
            raise ValidationError("폴더를 자기 자신 또는 하위 폴더로 이동할 수 없습니다.")
        if dst.exists() and dst.resolve() != src.resolve():
            raise ConflictError(f"이미 존재하는 대상 경로입니다: {norm_new}")

        before_paths = self._collect_subtree_rel_paths(root, src)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))

        affected: list[VaultPathMappingDto] = []
        touched: list[str] = []
        prefix = f"{norm_old}/"
        for old_p in before_paths:
            if old_p == norm_old:
                new_p = norm_new
            elif old_p.startswith(prefix):
                new_p = f"{norm_new}/{old_p[len(prefix):]}"
            else:
                continue
            affected.append(VaultPathMappingDto(oldPath=old_p, newPath=new_p))
            touched.extend([old_p, new_p])

        self._record_local_write(vault_id, touched, client_id)
        self._bump_revision(vault_id)
        return VaultRenameResponse(oldPath=norm_old, newPath=norm_new, affectedMap=affected)

    def move_entry(
        self,
        vault_id: str,
        source_path: str,
        target_folder_path: str,
        *,
        client_id: str | None = None,
    ) -> VaultRenameResponse:
        root = self._get_vault_root(vault_id)
        norm_src, src = self._resolve_inside(root, source_path)
        if not src.exists():
            raise NotFoundError(f"이동할 대상을 찾을 수 없습니다: {norm_src}")

        norm_folder, folder = self._resolve_inside(root, target_folder_path, allow_empty=True)
        if norm_folder and (not folder.exists() or not folder.is_dir()):
            raise NotFoundError(f"대상 폴더가 존재하지 않습니다: {norm_folder}")

        dest_rel = f"{norm_folder}/{src.name}" if norm_folder else src.name
        return self.rename_entry(vault_id, norm_src, dest_rel, client_id=client_id)

    def duplicate_entry(
        self,
        vault_id: str,
        source_path: str,
        *,
        client_id: str | None = None,
    ) -> VaultNodeDto:
        root = self._get_vault_root(vault_id)
        norm_src, src = self._resolve_inside(root, source_path)
        if not src.exists():
            raise NotFoundError(f"복제할 대상을 찾을 수 없습니다: {norm_src}")

        parent = src.parent
        if src.is_file():
            stem_name = src.stem
            ext = src.suffix
            idx = 1
            while True:
                cand = parent / f"{stem_name} {idx}{ext}"
                if not cand.exists():
                    break
                idx += 1
            shutil.copy2(src, cand)
            rel_created = cand.relative_to(root).as_posix()
            self._record_local_write(vault_id, [rel_created], client_id)
            self._bump_revision(vault_id)
            return _node_dto_from_path(root, cand)

        idx = 1
        while True:
            cand = parent / f"{src.name} {idx}"
            if not cand.exists():
                break
            idx += 1
        shutil.copytree(src, cand, ignore=shutil.ignore_patterns(*IGNORED_DIR_NAMES, *IGNORED_FILE_NAMES))
        touched = self._collect_subtree_rel_paths(root, cand)
        self._record_local_write(vault_id, touched, client_id)
        self._bump_revision(vault_id)
        return _node_dto_from_path(root, cand)

    def delete_entry(
        self,
        vault_id: str,
        rel_path: str,
        *,
        client_id: str | None = None,
    ) -> VaultDeleteResponse:
        root = self._get_vault_root(vault_id)
        norm, target = self._resolve_inside(root, rel_path)
        if not target.exists():
            raise NotFoundError(f"삭제할 대상을 찾을 수 없습니다: {norm}")
        affected = self._collect_subtree_rel_paths(root, target)
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        self._record_local_write(vault_id, affected, client_id)
        self._bump_revision(vault_id)
        return VaultDeleteResponse(deletedPaths=affected)

    def reveal_in_os_explorer(self, vault_id: str, rel_path: str = "") -> Path:
        root = self._get_vault_root(vault_id)
        norm, target = self._resolve_inside(root, rel_path, allow_empty=True)
        if not target.exists():
            raise NotFoundError(f"탐색기에서 열 대상을 찾을 수 없습니다: {norm or root.name}")
        _open_in_os_file_manager(target, select_in_parent=bool(norm))
        return target

    # --- 볼트 귀속 `.vibe/` 세션 & 파생 캐시 ---

    def _vibe_meta_path(self, vault_id: str, filename: str) -> Path:
        root = self._get_vault_root(vault_id)
        meta_dir = root / VIBE_META_DIR
        meta_dir.mkdir(parents=True, exist_ok=True)
        return meta_dir / filename

    def read_workspace_session(self, vault_id: str) -> VaultSessionPayload:
        path = self._vibe_meta_path(vault_id, WORKSPACE_SESSION_FILE)
        raw = read_json(path, default=None)
        if isinstance(raw, dict):
            try:
                return VaultSessionPayload.model_validate(raw)
            except Exception:
                pass
        return VaultSessionPayload()

    def write_workspace_session(self, vault_id: str, payload: VaultSessionPayload) -> VaultSessionPayload:
        path = self._vibe_meta_path(vault_id, WORKSPACE_SESSION_FILE)
        next_payload = payload.model_copy(update={"updatedAt": int(time.time() * 1000)})
        write_json(path, next_payload.model_dump())
        return next_payload

    def read_metadata_cache(self, vault_id: str) -> VaultMetadataCachePayload:
        path = self._vibe_meta_path(vault_id, METADATA_CACHE_FILE)
        raw = read_json(path, default=None)
        if isinstance(raw, dict):
            try:
                return VaultMetadataCachePayload.model_validate(raw)
            except Exception:
                pass
        return VaultMetadataCachePayload()

    def write_metadata_cache(self, vault_id: str, payload: VaultMetadataCachePayload) -> VaultMetadataCachePayload:
        path = self._vibe_meta_path(vault_id, METADATA_CACHE_FILE)
        next_payload = payload.model_copy(update={"updatedAt": int(time.time() * 1000)})
        write_json(path, next_payload.model_dump())
        return next_payload

    # --- 실시간 파일시스템 워처 (watchfiles → SSE 이벤트 스트림) ---

    def iter_watch_events(
        self,
        vault_id: str,
        stop_event: threading.Event,
        *,
        subscriber_client_id: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        root = self._get_vault_root(vault_id)
        combined_stop = threading.Event()

        def _bridge_stop() -> None:
            while not combined_stop.is_set():
                if stop_event.is_set() or self._shutdown.is_set():
                    combined_stop.set()
                    break
                time.sleep(0.15)

        stopper = threading.Thread(target=_bridge_stop, name=f"vault-watch-stop-{vault_id}", daemon=True)
        stopper.start()

        yield {"type": "connected", "vaultId": vault_id, "rootPath": str(root)}

        def _watch_filter(_change: Change, raw_path: str) -> bool:
            try:
                rel = Path(raw_path).resolve().relative_to(root).as_posix()
            except ValueError:
                return False
            parts = rel.split("/")
            for part in parts:
                if part in IGNORED_DIR_NAMES or part in IGNORED_FILE_NAMES or part.startswith("."):
                    return False
            return True

        try:
            for changes in watch(
                root,
                watch_filter=_watch_filter,
                stop_event=combined_stop,
                debounce=250,
                step=100,
                rust_timeout=500,
            ):
                if combined_stop.is_set():
                    break
                # 한 묶음 안의 변경을 경로별로 합친다. 원자적 저장(임시 파일 → 교체)은 같은 경로에
                # deleted + added 를 순서 없이 남기는데, 그대로 보내면 다른 창이 파일을 지웠다가
                # 다시 만들어 열린 탭이 닫힌다. 판단은 묶음이 끝난 뒤 파일의 실제 상태로 한다.
                kinds_by_path: dict[str, set[Change]] = {}
                for change_kind, raw_path in changes:
                    kinds_by_path.setdefault(raw_path, set()).add(change_kind)

                for raw_path, kinds in kinds_by_path.items():
                    target = Path(raw_path)
                    try:
                        rel = target.resolve().relative_to(root).as_posix()
                    except ValueError:
                        continue
                    if self._is_self_echo(vault_id, rel, subscriber_client_id):
                        continue

                    if not target.exists():
                        yield {
                            "type": "delete",
                            "path": rel,
                            "origin": "external",
                        }
                        continue

                    try:
                        dto = _node_dto_from_path(root, target)
                    except OSError:
                        continue

                    content: str | None = None
                    if (
                        dto.kind == "file"
                        and dto.extension in TEXT_EXTENSIONS
                        and (dto.size or 0) <= MAX_INLINE_TEXT_BYTES
                    ):
                        try:
                            content = target.read_text(encoding="utf-8")
                        except (OSError, UnicodeDecodeError):
                            content = None

                    ev_type = "create" if kinds == {Change.added} else "modify"
                    yield {
                        "type": ev_type,
                        "node": dto.model_dump(),
                        "path": dto.path,
                        "content": content,
                        "mtime": dto.mtime,
                        "origin": "external",
                    }
        finally:
            combined_stop.set()

    def shutdown(self) -> None:
        self._shutdown.set()
