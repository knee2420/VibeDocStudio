"""리소스 작업 공간 — Composer 세션에 RM 자료를 "마운트" 하고, agy 가 직접 돌아다니게 한다.

흐름:
1. 프론트가 체크된 자료 목록을 `resource-mount` 첨부 하나로 보낸다 (본문 · 스니펫 없이 경로만).
2. 서버가 세션 마운트를 `mounts.json` 에 쓰고, 첨부 본문을 지도(폴더 · 파일 수 · 동일본 · 허브 파일)로 바꾼다.
3. agy 가 vibefs MCP 도구로 위치를 찾고 내장 `read_file` 로 줄 범위를 읽는다. 훅이 쓰기 · 터미널을 막고
   마운트 밖 읽기를 막으며, 읽은 범위를 `reads.jsonl` 에 남긴다.
4. 턴이 끝나면 서버가 읽은 범위(커버리지)를 계산해 보여 주고, "전체" 를 요구한 작업이면 남은 파일을 이어 읽게 한다.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

from .index import MountItem, WorkspaceIndex
from .mapper import build_map
from .sandbox import prepare_sandbox
from .workbench import Workbench
from .store import Coverage, WorkspaceStore, coverage

logger = logging.getLogger(__name__)

MOUNT_KIND = "resource-mount"
#: 프론트가 매 메시지 보내는 작업대 상태 (열린 문서 · 범위 · 활성 레퍼런스와 핀 · 선택 칸)
WORKBENCH_KIND = "workbench"
#: 이 버전보다 낮은 agy 는 작업 폴더 훅 · 플러그인 MCP 동작을 확인하지 않았다
MIN_AGY_VERSION = (1, 5, 0)
_CASUAL_EXCLUSIONS = re.compile(r"전체적|전반적|모든\s*면|모든\s*각도|모든\s*관점")
_FULL_READ_EXPLICIT = re.compile(
    r"(?:전수\s*(?:조사|검사|확인)|"
    r"(?:모든|전체|전부)\s*(?:파일|문서|자료)|"
    r"(?:빠짐없이|빠짐\s*없이|하나도\s*빠짐없이|샅샅이|통째로?)\s*(?:다\s*)?(?:읽|확인|검토|비교)|"
    r"(?:파일|문서|자료)(?:들을?|를?)\s*(?:모두|전부|다)\s*(?:읽|확인|검토))"
)
#: "Decision 들을 읽고" · "결정 카드들 정리해줘" · "회의록들을 비교해" — 묶음 전체를 다루는 요청 (읽기 · 종합 동사)
_SET_VERBS = r"(?:읽|확인|검토|비교|분석|정리|요약|종합|모아|훑|살펴|추려|표로|묶어|대조)"
_CATEGORY_PLURAL_READ = re.compile(
    r"(?P<target>[a-zA-Z0-9가-힣_-]+)\s?들(?:을|를|의|에서|이|은|는)?\s*(?:다|전부|모두|싹)?\s*(?:을\s*)?" + _SET_VERBS
)
#: "모든 결정 카드" · "전체 회의록" — 명시적 전체 + 대상
_ALL_OF_TARGET = re.compile(r"(?:모든|전체)\s+(?P<target>[a-zA-Z0-9가-힣_-]{2,})")
_NOT_TARGETS = {"이", "그", "저", "것", "우리", "저희", "너희", "사람", "분", "여러분", "이것", "그것", "파일", "문서", "자료", "내용"}


def strip_recap(text: str) -> str:
    """[이전 대화 요약 …] … [/이전 대화 요약] 블록을 제거한다."""
    if not text:
        return ""
    return re.sub(
        r"\[(?:이전|지난)\s*대화\s*요약[^\]]*\].*?\[/(?:이전|지난)\s*대화\s*요약\]",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()


def detect_full_read_intent(text: str) -> tuple[bool, Optional[str]]:
    """전체 읽기 의도 및 대상 카테고리/범위 추출."""
    if not text:
        return False, None
    clean = strip_recap(text)
    clean = re.sub(r"\[.*?\]", "", clean)
    if _CASUAL_EXCLUSIONS.search(clean) and not _FULL_READ_EXPLICIT.search(clean):
        return False, None
    for pattern in (_CATEGORY_PLURAL_READ, _ALL_OF_TARGET):
        for m in pattern.finditer(clean):
            target = m.group("target")
            if len(target) > 2:
                target = re.sub(r"(에서|으로|에게|로|을|를|은|는|이|가|의|과|와)$", "", target)
            if target not in _NOT_TARGETS:
                return True, target
    if _FULL_READ_EXPLICIT.search(clean):
        return True, None
    return False, None


def wants_full_read(text: str) -> bool:
    return detect_full_read_intent(text)[0]


@dataclass
class MountState:
    signature: str
    index: WorkspaceIndex


class ResourceWorkspace:
    def __init__(self, *, state_dir: Path, sandbox_dir: Path, python_exe: str = sys.executable,
                 agy_executable: Optional[str] = None, transport: str = "acp",
                 documents_root: Optional[Path] = None, references_root: Optional[Path] = None) -> None:
        self.state_dir = Path(state_dir)
        #: 작업 문서 저장소 (`data/knowledge/documents/<docId>/document.vdoc.json`)
        self.documents_root = Path(documents_root) if documents_root else None
        #: 레퍼런스 라이브러리 항목 폴더 (`data/knowledge/references/items/<refId>/`)
        self.references_root = Path(references_root) if references_root else None
        self.sandbox_dir = Path(sandbox_dir)
        self.python_exe = python_exe
        self.agy_executable = agy_executable
        self.transport = (transport or "acp").lower()
        self.store = WorkspaceStore(str(self.state_dir))
        self._indexes: dict[str, tuple[float, WorkspaceIndex]] = {}
        self._lock = threading.Lock()
        self.agy_version: Optional[str] = None
        self.version_ok: Optional[bool] = None

    # --- 기동 --------------------------------------------------------------------

    def prepare(self, include_plugin: Optional[bool] = None) -> None:
        """예열 풀보다 먼저: 샌드박스 `.agents/` 설정 · 오래된 원장 정리 · agy 버전 확인(뒤에서)."""
        if include_plugin is None:
            include_plugin = (self.transport == "stream")
        changed = prepare_sandbox(self.sandbox_dir, self.state_dir, self.python_exe, include_plugin=include_plugin)
        if changed:
            logger.info("[workspace] agy 작업 폴더 설정을 썼습니다: %s", ", ".join(changed))
        try:
            self.store.prune()
        except OSError:
            pass
        if self.agy_executable:
            threading.Thread(target=self._check_version, name="agy-version", daemon=True).start()

    def _check_version(self) -> None:
        try:
            out = subprocess.run([self.agy_executable or "agy", "--version"], capture_output=True, text=True,
                                 timeout=30, creationflags=0x08000000 if sys.platform == "win32" else 0).stdout.strip()
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("[workspace] agy 버전 확인 실패: %s", exc)
            return
        self.agy_version = out
        nums = tuple(int(x) for x in re.findall(r"\d+", out)[:3])
        self.version_ok = bool(nums) and nums >= MIN_AGY_VERSION
        if not self.version_ok:
            logger.warning("[workspace] agy %s — 작업 폴더 훅 · MCP 는 1.5 이상에서 확인했습니다. 쓰기 차단이 안 될 수 있습니다.", out)
        else:
            logger.info("[workspace] agy %s", out)

    def status(self) -> dict[str, Any]:
        return {"agyVersion": self.agy_version, "versionOk": self.version_ok,
                "mounts": [{"session": m.session_id, "items": len(m.items), "conversations": m.conversation_ids}
                           for m in self.store.mounts()]}

    def mcp_server_spec(self, session_id: str) -> list[dict[str, Any]]:
        """ACP session/new 시 전달할 vibefs MCP 서버 사양."""
        here = Path(__file__).resolve().parent
        return [
            {
                "name": "vibefs",
                "command": self.python_exe.replace("\\", "/"),
                "args": [
                    "-I",
                    str((here / "vibefs_server.py").resolve()).replace("\\", "/"),
                    "--state",
                    str(self.state_dir.resolve()).replace("\\", "/"),
                    # 이 MCP 서버를 이 세션의 마운트에 고정한다 (다른 세션 자료가 섞이지 않게). env 보다 확실한 인자로 넘긴다.
                    "--session",
                    session_id,
                ],
                "env": [{"name": "VIBE_WORKSPACE_SESSION", "value": session_id}],
            }
        ]

    # --- 마운트 --------------------------------------------------------------------

    @staticmethod
    def parse_payload(content: str) -> tuple[list[MountItem], list[str], dict[str, str]]:
        try:
            raw = json.loads(content or "[]")
        except ValueError:
            return [], [], {}
        if isinstance(raw, list):
            items = [MountItem.from_dict(r) for r in raw if isinstance(r, dict)]
            return [i for i in items if i], [], {}
        if not isinstance(raw, dict):
            return [], [], {}
        id_map = {str(k): str(v) for k, v in (raw.get("idMap") or {}).items()}
        roots_raw = raw.get("roots") or []
        files_raw = raw.get("files") or []
        items_raw = raw.get("items") or []
        roots: list[str] = []
        parsed_items: list[MountItem] = []
        if roots_raw or files_raw:
            for r in roots_raw:
                if isinstance(r, dict):
                    m = MountItem.from_dict(r)
                    if m:
                        m.kind = "dir"
                        parsed_items.append(m)
                        roots.append(m.path)
            for f in files_raw:
                if isinstance(f, dict):
                    m = MountItem.from_dict(f)
                    if m:
                        m.kind = "file"
                        parsed_items.append(m)
        else:
            for r in items_raw:
                if isinstance(r, dict):
                    m = MountItem.from_dict(r)
                    if m:
                        parsed_items.append(m)
        return parsed_items, roots, id_map

    @staticmethod
    def parse_items(content: str) -> list[MountItem]:
        return ResourceWorkspace.parse_payload(content)[0]

    def mount(
        self,
        session_id: str,
        items: list[MountItem],
        conversation_id: Optional[str] = None,
        roots: Optional[list[str]] = None,
        id_map: Optional[dict[str, str]] = None,
    ) -> MountState:
        mount = self.store.set_mount(session_id, items, conversation_id, roots=roots, id_map=id_map)
        return MountState(mount.signature, self.index(mount.signature, items, id_map=id_map))

    def unmount(self, session_id: str) -> None:
        self.store.drop(session_id)

    def bind(self, session_id: str, conversation_id: Optional[str]) -> None:
        self.store.bind_conversation(session_id, conversation_id)

    def index(self, signature: str, items: list[MountItem], id_map: Optional[dict[str, str]] = None) -> WorkspaceIndex:
        with self._lock:
            cached = self._indexes.get(signature)
            if cached and time.time() - cached[0] < 30:
                return cached[1]
        started = time.monotonic()
        built = WorkspaceIndex.build(items, id_map=id_map)
        logger.info("[workspace] 색인: 파일 %d개 · %.2fs", len(built.files), time.monotonic() - started)
        with self._lock:
            self._indexes = {signature: (time.time(), built)}
        return built

    def roots_for(self, session_id: str) -> list[str]:
        mount = self.store.mount_for(session_id)
        if not mount:
            return []
        if mount.roots:
            return list(mount.roots)
        sig = mount.signature
        ix = self.index(sig, mount.items, id_map=mount.id_map)
        return list(ix.roots)

    # --- 작업대 (에디터 · 레퍼런스 · 이력) ----------------------------------------------------

    def _doc_path(self, doc_id: str, root: Optional[Path]) -> Optional[str]:
        if not doc_id or root is None:
            return None
        safe = re.sub(r"[^\w.-]", "_", doc_id)
        path = root / safe / "document.vdoc.json"
        return str(path) if path.is_file() else None

    def _ref_dir(self, ref_id: str, root: Optional[Path]) -> Optional[str]:
        if not ref_id or root is None:
            return None
        safe = re.sub(r"[^\w.-]", "_", ref_id)
        path = root / safe
        return str(path) if (path / "ref.json").is_file() else None

    def _fixture_root(self, value: Any, label: str) -> Optional[Path]:
        if not value:
            return None
        try:
            path = Path(str(value)).resolve()
            path.relative_to(self.state_dir.resolve().parent.parent)
            return path
        except (OSError, ValueError):
            logger.warning("[workspace] 작업대 %s 거부: %s", label, value)
            return None

    def set_workbench(self, session_id: str, content: str) -> Optional[Workbench]:
        """프론트의 작업대 첨부 → 문서 · 레퍼런스 경로를 풀어 세션 작업대로 저장한다 (vibefs 가 읽는다)."""
        try:
            raw = json.loads(content or "{}")
        except ValueError:
            return None
        if not isinstance(raw, dict):
            return None
        # 평가 픽스처는 state 아래 자기 폴더를 쓴다 (그 밖의 경로는 받지 않는다)
        root = self._fixture_root(raw.get("documentsRoot"), "documentsRoot") or self.documents_root
        ref_root = self._fixture_root(raw.get("referencesRoot"), "referencesRoot") or self.references_root
        scope = raw.get("scope") or {}
        state = {
            "docId": raw.get("docId"),
            "docPath": None if scope.get("mode") == "off" else self._doc_path(str(raw.get("docId") or ""), root),
            "scope": scope,
            "selection": list(raw.get("selection") or []),
            # 레퍼런스는 라이브러리 폴더를 가리킨다 (vdoc 이 아니다). pinIds 가 없으면(None) 핀 전부, 목록이면 그 핀만.
            "references": [
                {"refId": r.get("refId"), "title": r.get("title"), "dir": self._ref_dir(str(r.get("refId") or ""), ref_root),
                 "pinIds": None if r.get("pinIds") is None else [str(x) for x in r.get("pinIds") or []],
                 "layers": {str(k): bool(v) for k, v in (r.get("layers") or {}).items()}}
                for r in (raw.get("references") or []) if isinstance(r, dict) and r.get("refId")
            ],
        }
        self.store.set_workbench(session_id, state)
        return Workbench.from_state(state)

    def clear_workbench(self, session_id: str) -> None:
        self.store.set_workbench(session_id, None)

    def brief(self, state: MountState) -> str:
        ix = state.index
        return (
            "[리소스 작업 공간 — 사용자가 Resource Manager 에서 체크한 자료가 마운트됐다]\n"
            + build_map(ix)
            + "\n(파일 목록 전체는 ws_tree · 이름은 ws_glob · 내용은 ws_grep · 후보 목록은 ws_collect 로 찾고, 원문은 read_file 로 읽는다)"
        )

    def coverage(
        self,
        state: MountState,
        conversation_ids: list[str],
        windows: list[tuple[float, float]],
        subset: Optional[Iterable[str]] = None,
    ) -> Coverage:
        reads = self.store.reads(conversation_ids=conversation_ids, windows=windows)
        return coverage(state.index, reads, subset=subset)

    def shutdown_session(self, session_id: str) -> None:
        self.unmount(session_id)


def nudge_message(cov: Coverage, limit: int = 30) -> str:
    """'전체' 를 요구한 작업인데 덜 읽고 끝냈을 때 이어 읽게 하는 메시지."""
    return (
        "[작업 공간 확인] 사용자는 빠짐없이 확인하라고 했는데, 마운트된 자료 중 아직 읽지 않은 파일이 있다.\n"
        + cov.render(limit=limit)
        + "\n사용자 요청 범위(특정 폴더 · 종류를 말했다면 그 안)에 드는 파일 중 안 읽은 것을 read_file 로 읽고"
        " (동일본은 하나만 · 양이 많으면 invoke_subagent 로 폴더별로 나눠도 된다) 앞의 답을 보완하라."
        " 남은 파일이 요청 범위 밖이면 더 읽지 말고 '나머지는 요청 범위 밖' 이라고 한 줄로 밝히고 끝내라."
    )
