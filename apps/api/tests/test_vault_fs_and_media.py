"""볼트 샌드박스 디렉토리 운영(`vf_*`) · 멀티모달 미디어 첨부 · API/MCP 연동 테스트.

단독(단위) 테스트:
- TC-U01: 경로 샌드박스 보안 (탈출 · 절대경로 · NUL · 보호 경로 차단)
- TC-U02: 현황 조회 (`vf_stat`, `vf_du`)
- TC-U03: `vf_mkdir` 중첩 생성 + 멱등성 + `vf_undo` 원복
- TC-U04: `vf_move` (폴더로 이동 · 충돌 정책 error/skip/rename · 자기 하위 차단) + `vf_rename` + `vf_undo`
- TC-U05: `vf_copy` (파일 & 재귀 폴더 트리) + `vf_undo`
- TC-U06: `vf_write` (`create`/`overwrite`/`append`, 바이너리 차단) + `vf_patch` (`dryRun`/정규식) + `vf_undo`
- TC-U07: `vf_trash` 소프트 삭제 (`.vibe-trash/`) + `vf_undo` 100% 복원
- TC-U08: `vf_batch` 복합 트랜잭션 (`dryRun` 미리보기 -> 실행 -> `vf_history` -> `vf_undo`)
- TC-U09: `vf_batch` 중간 실패 시 자동 원자적 롤백
- TC-U10: 권한 · 스코프 가드 (`readOnly`, `mode="plan"`, `targetFolders`)

연동 테스트:
- TC-I01: `vibefs.server.Server` MCP `tools/list` + `call("vf_batch")` -> `call("vf_undo")`
- TC-I02: FastAPI `/api/vaults/{id}/upload` -> `/api/assistant/sessions/{sid}/messages` 멀티모달 이미지 전달 (base64 & vaultPath)
- TC-I03: `AcpClient.prompt(..., images=[...])` 멀티모달 JSON-RPC 블록 직렬화
- TC-I04: `AssistantService` + `WorkspaceService` + HTTP `/fs-batches` & `/undo` + SSE `fs_batches` 이벤트 엔드투엔드
"""
from __future__ import annotations

import base64
import json
import threading
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.assistant.models import ContextItem
from app.assistant.use_cases.assistant_service import AssistantService
from app.assistant.workspace.service import ResourceWorkspace
from app.llm.adapters.acp_client import AcpClient
from app.llm.adapters.text_engines import OfflineConversation
from app.llm.models import EngineChoice, Lane
from app.llm.policy import RuntimeExecutionPolicy
from app.main import create_app
from vibefs.fs_tools import TRASH_DIR, VF_TOOL_SPECS, FsJournal, VaultFsTools
from vibefs.server import Server as VibefsServer
from vibefs.store import WorkspaceStore

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _policy() -> RuntimeExecutionPolicy:
    return RuntimeExecutionPolicy(
        primary_provider="offline",
        fallback_provider="offline",
        google_api_model="offline",
        google_api_timeout_seconds=30,
        agent_cli_model="offline",
        agent_cli_timeout_seconds=30,
        agent_cli_bin="agy",
    )


def _make_fs(
    tmp_path: Path,
    *,
    session_id: str = "sess-1",
    read_only: bool = False,
    mode: str = "agent",
    target_folders: list[str] | None = None,
) -> tuple[Path, WorkspaceStore, VaultFsTools]:
    vault_root = tmp_path / "vault"
    state_dir = tmp_path / "state"
    vault_root.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)
    store = WorkspaceStore(str(state_dir))
    store.set_workbench(
        session_id,
        {
            "vaultId": "v1",
            "vaultRoot": str(vault_root),
            "readOnly": read_only,
            "mode": mode,
            "targetFolders": target_folders or [],
        },
    )
    return vault_root, store, VaultFsTools(store, session_id)


# --- 단독(단위) 테스트 ---------------------------------------------------------------------


def test_tc_u01_sandbox_security_blocks_escapes_and_protected_paths(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / ".git").mkdir()
    (vault_root / ".git" / "config").write_text("secret", encoding="utf-8")

    for bad in ("../escape.txt", "a/../../escape.txt", "/etc/passwd", "C:/Windows/win.ini", "a\x00b.txt"):
        with pytest.raises(ValueError):
            tools.call("vf_mkdir", {"path": bad})

    for protected in (".git/hooks", ".vibe/meta.json", ".vibe-trash/old", ".agents/rule.md", "node_modules/pkg"):
        with pytest.raises(ValueError):
            tools.call("vf_write", {"path": protected, "content": "x"})

    with pytest.raises(ValueError):
        tools.call("vf_trash", {"path": ".git/config"})
    assert (vault_root / ".git" / "config").exists()


def test_tc_u02_stat_and_du(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / "docs" / "sub").mkdir(parents=True)
    (vault_root / "docs" / "a.md").write_text("hello world", encoding="utf-8")
    (vault_root / "docs" / "sub" / "b.json").write_text('{"k":1}', encoding="utf-8")

    stat_dir = tools.call("vf_stat", {"path": "docs"})
    assert "[폴더] docs" in stat_dir
    assert "파일: 2개" in stat_dir
    assert ".md:1" in stat_dir and ".json:1" in stat_dir

    stat_file = tools.call("vf_stat", {"path": "docs/a.md"})
    assert "[파일] docs/a.md" in stat_file
    assert "11B" in stat_file

    du = tools.call("vf_du", {"path": "", "depth": 3})
    assert "[디스크 사용량]" in du
    assert "- docs : " in du
    assert "- docs/sub : " in du


def test_tc_u03_mkdir_and_undo(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    res = tools.call("vf_mkdir", {"paths": ["여행/도쿄/참고", "여행/도쿄/사진"]})
    assert "batchId=" in res
    assert (vault_root / "여행" / "도쿄" / "참고").is_dir()
    assert (vault_root / "여행" / "도쿄" / "사진").is_dir()

    # 멱등성 확인
    again = tools.call("vf_mkdir", {"path": "여행/도쿄/참고"})
    assert "이미 존재" in again

    # 첫 번째 생성 배치 되돌리기
    batches = tools.journal.list_batches(session_id="sess-1")
    first_id = batches[-1]["batchId"]
    undo_msg = tools.call("vf_undo", {"batchId": first_id})
    assert "되돌리기 완료" in undo_msg
    assert not (vault_root / "여행").exists()


def test_tc_u04_move_conflicts_rename_and_undo(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / "inbox").mkdir()
    (vault_root / "archive").mkdir()
    (vault_root / "inbox" / "note.md").write_text("v1", encoding="utf-8")
    (vault_root / "archive" / "note.md").write_text("existing", encoding="utf-8")

    # 충돌 error
    with pytest.raises(ValueError, match="이미 존재"):
        tools.call("vf_move", {"src": "inbox/note.md", "dst": "archive", "onConflict": "error"})

    # 충돌 skip
    skip_msg = tools.call("vf_move", {"src": "inbox/note.md", "dst": "archive", "onConflict": "skip"})
    assert "건너뜀" in skip_msg
    assert (vault_root / "inbox" / "note.md").exists()

    # 충돌 rename -> archive/note_2.md
    ren_msg = tools.call("vf_move", {"src": "inbox/note.md", "dst": "archive", "onConflict": "rename"})
    assert "archive/note_2.md" in ren_msg
    assert not (vault_root / "inbox" / "note.md").exists()
    assert (vault_root / "archive" / "note_2.md").read_text(encoding="utf-8") == "v1"

    # 자기 하위 폴더로 이동 차단
    with pytest.raises(ValueError, match="자기 자신"):
        tools.call("vf_move", {"src": "archive", "dst": "archive/sub"})

    # rename
    tools.call("vf_rename", {"path": "archive/note_2.md", "newName": "final.md"})
    assert (vault_root / "archive" / "final.md").exists()

    # 두 번 연속 undo -> 원래 inbox/note.md 복귀
    tools.call("vf_undo", {})
    assert (vault_root / "archive" / "note_2.md").exists()
    tools.call("vf_undo", {})
    assert (vault_root / "inbox" / "note.md").read_text(encoding="utf-8") == "v1"


def test_tc_u05_copy_tree_and_undo(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / "tpl" / "inner").mkdir(parents=True)
    (vault_root / "tpl" / "inner" / "a.txt").write_text("tpl-body", encoding="utf-8")

    tools.call("vf_copy", {"src": "tpl", "dst": "project_a"})
    assert (vault_root / "project_a" / "inner" / "a.txt").read_text(encoding="utf-8") == "tpl-body"

    tools.call("vf_undo", {})
    assert not (vault_root / "project_a").exists()
    assert (vault_root / "tpl" / "inner" / "a.txt").exists()


def test_tc_u06_write_patch_and_undo(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)

    # 바이너리 확장자 쓰기 금지
    with pytest.raises(ValueError, match="바이너리"):
        tools.call("vf_write", {"path": "pic.png", "content": "bad"})

    tools.call("vf_write", {"path": "notes/plan.md", "content": "Alpha 1\nAlpha 2\n", "mode": "create"})
    assert (vault_root / "notes" / "plan.md").read_text(encoding="utf-8") == "Alpha 1\nAlpha 2\n"

    # dryRun 미리보기 -> 디스크 무변경
    dry = tools.call("vf_patch", {"path": "notes/plan.md", "find": r"Alpha (\d)", "replace": r"Beta \1", "regex": True, "replaceAll": True, "dryRun": True})
    assert "dryRun" in dry and "2곳 치환" in dry
    assert (vault_root / "notes" / "plan.md").read_text(encoding="utf-8") == "Alpha 1\nAlpha 2\n"

    # 실제 치환 -> undo 시 원문 복원
    tools.call("vf_patch", {"path": "notes/plan.md", "find": r"Alpha (\d)", "replace": r"Beta \1", "regex": True, "replaceAll": True})
    assert (vault_root / "notes" / "plan.md").read_text(encoding="utf-8") == "Beta 1\nBeta 2\n"

    tools.call("vf_undo", {})
    assert (vault_root / "notes" / "plan.md").read_text(encoding="utf-8") == "Alpha 1\nAlpha 2\n"


def test_tc_u07_soft_trash_and_restore_undo(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / "old").mkdir()
    (vault_root / "old" / "draft.md").write_text("keep me", encoding="utf-8")

    msg = tools.call("vf_trash", {"path": "old"})
    assert TRASH_DIR in msg
    assert not (vault_root / "old").exists()
    assert any((vault_root / TRASH_DIR).rglob("draft.md"))

    tools.call("vf_undo", {})
    assert (vault_root / "old" / "draft.md").read_text(encoding="utf-8") == "keep me"


def test_tc_u08_batch_dry_run_execute_history_and_undo(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / "raw_1.md").write_text("one", encoding="utf-8")
    (vault_root / "raw_2.md").write_text("two", encoding="utf-8")
    (vault_root / "temp.txt").write_text("obsolete", encoding="utf-8")

    ops = [
        {"op": "mkdir", "path": "organized/notes"},
        {"op": "move", "src": "raw_1.md", "dst": "organized/notes"},
        {"op": "move", "src": "raw_2.md", "dst": "organized/notes"},
        {"op": "write", "path": "organized/INDEX.md", "content": "# Index\n", "mode": "create"},
        {"op": "trash", "path": "temp.txt"},
    ]

    preview = tools.call("vf_batch", {"ops": ops, "dryRun": True, "summary": "폴더 정리"})
    assert "dryRun" in preview
    assert (vault_root / "raw_1.md").exists() and not (vault_root / "organized").exists()

    done = tools.call("vf_batch", {"ops": ops, "dryRun": False, "summary": "폴더 정리"})
    assert "[완료 · batchId=" in done
    assert (vault_root / "organized" / "notes" / "raw_1.md").exists()
    assert (vault_root / "organized" / "INDEX.md").exists()
    assert not (vault_root / "temp.txt").exists()

    hist = tools.call("vf_history", {"limit": 5})
    assert "폴더 정리" in hist and "적용됨" in hist

    tools.call("vf_undo", {})
    assert (vault_root / "raw_1.md").read_text(encoding="utf-8") == "one"
    assert (vault_root / "raw_2.md").read_text(encoding="utf-8") == "two"
    assert (vault_root / "temp.txt").read_text(encoding="utf-8") == "obsolete"
    assert not (vault_root / "organized").exists()


def test_tc_u09_batch_atomicity_rolls_back_on_mid_failure(tmp_path: Path) -> None:
    vault_root, _, tools = _make_fs(tmp_path)
    (vault_root / "a.txt").write_text("orig", encoding="utf-8")

    ops = [
        {"op": "mkdir", "path": "staged_dir"},
        {"op": "move", "src": "a.txt", "dst": "staged_dir/a.txt"},
        {"op": "move", "src": "does_not_exist.txt", "dst": "staged_dir/x.txt"},
    ]
    with pytest.raises(ValueError, match="자동 롤백 완료"):
        tools.call("vf_batch", {"ops": ops, "summary": "실패 테스트"})

    # 자동 롤백으로 원본 위치 유지 & 중간 생성 폴더 제거 확인
    assert (vault_root / "a.txt").read_text(encoding="utf-8") == "orig"
    assert not (vault_root / "staged_dir").exists()
    assert tools.journal.list_batches(session_id="sess-1") == []


def test_tc_u10_permissions_readonly_plan_and_target_folder_scope(tmp_path: Path) -> None:
    # readOnly 차단
    _, _, ro_tools = _make_fs(tmp_path / "ro", read_only=True)
    with pytest.raises(ValueError, match="읽기 전용"):
        ro_tools.call("vf_mkdir", {"path": "x"})

    # plan 모드 차단 (단 dryRun/stat 은 허용)
    p_root, _, plan_tools = _make_fs(tmp_path / "plan", mode="plan")
    (p_root / "f.txt").write_text("ok", encoding="utf-8")
    assert "[파일] f.txt" in plan_tools.call("vf_stat", {"path": "f.txt"})
    assert "dryRun" in plan_tools.call("vf_batch", {"ops": [{"op": "mkdir", "path": "newdir"}], "dryRun": True})
    with pytest.raises(ValueError, match="계획만"):
        plan_tools.call("vf_mkdir", {"path": "newdir"})

    # targetFolders 스코프 제한
    t_root, _, scoped_tools = _make_fs(tmp_path / "scoped", target_folders=["work/allowed"])
    (t_root / "work" / "allowed").mkdir(parents=True)
    (t_root / "other").mkdir(parents=True)
    with pytest.raises(ValueError, match="대상 폴더"):
        scoped_tools.call("vf_write", {"path": "other/bad.md", "content": "nope"})
    ok_msg = scoped_tools.call("vf_write", {"path": "work/allowed/good.md", "content": "yes"})
    assert "[완료" in ok_msg
    assert (t_root / "work" / "allowed" / "good.md").exists()


# --- 연동 테스트 --------------------------------------------------------------------------


def test_tc_i01_vibefs_mcp_server_exposes_and_executes_vf_tools(tmp_path: Path) -> None:
    vault_root = tmp_path / "vault"
    state_dir = tmp_path / "state"
    vault_root.mkdir()
    state_dir.mkdir()
    (vault_root / "memo.md").write_text("hello", encoding="utf-8")

    server = VibefsServer(str(state_dir), session_id="mcp-s1")
    server.store.set_workbench("mcp-s1", {"vaultId": "v1", "vaultRoot": str(vault_root), "mode": "agent"})

    tool_names = {spec["name"] for spec in VF_TOOL_SPECS}
    assert {"vf_stat", "vf_du", "vf_mkdir", "vf_move", "vf_rename", "vf_copy", "vf_write", "vf_patch", "vf_trash", "vf_batch", "vf_undo", "vf_history"} <= tool_names

    out = server.call(
        "vf_batch",
        {"summary": "MCP 배치", "ops": [{"op": "mkdir", "path": "sub"}, {"op": "move", "src": "memo.md", "dst": "sub"}]},
        {},
    )
    assert "[완료" in out
    assert (vault_root / "sub" / "memo.md").exists()

    undo = server.call("vf_undo", {}, {})
    assert "되돌리기 완료" in undo
    assert (vault_root / "memo.md").exists()


def test_tc_i02_multimodal_upload_and_assistant_message_roundtrip(tmp_path: Path) -> None:
    """볼트 바이너리 업로드 -> AssistantService 멀티모달 이미지 추출(dataBase64 & vaultPath) -> OfflineConversation 수신."""
    vault_root = tmp_path / "vault"
    state_dir = tmp_path / "state"
    vault_root.mkdir()
    state_dir.mkdir()
    (vault_root / "_attachments").mkdir()
    (vault_root / "_attachments" / "shot.png").write_bytes(PNG_1X1)

    class _StubProvider:
        def __init__(self) -> None:
            self.engines: list[OfflineConversation] = []

        def resolve(self, provider: str | None, model: str | None) -> EngineChoice:
            return EngineChoice(provider="offline", model="offline-test")

        def open_conversation(self, choice: EngineChoice, *, lane: Lane, resume: Any = None, session_id: str | None = None, system_prompt: str | None = None):
            eng = OfflineConversation(choice)
            self.engines.append(eng)
            return eng

        def warmup(self, targets: Any) -> None:
            pass

        def available_models(self, provider: str) -> list[dict[str, str]]:
            return [{"id": "offline-test", "name": "Offline"}]

        def status(self) -> dict[str, Any]:
            return {}

        def shutdown(self) -> None:
            pass

    ws = ResourceWorkspace(state_dir=state_dir, sandbox_dir=tmp_path / "sbx", vault_roots=lambda vid: str(vault_root) if vid == "v1" else None)
    provider = _StubProvider()
    svc = AssistantService(provider, _policy(), "offline-test", workspace=ws)  # type: ignore[arg-type]
    sess = svc.create_session()
    sid = sess["sessionId"]

    wb_ctx = ContextItem(kind="workbench", ref_id="wb:state", label="작업대", content=json.dumps({"vaultId": "v1"}))
    # Case 1: 프론트 직접 base64 첨부
    img_b64 = ContextItem(
        kind="image",
        ref_id="img:pasted",
        label="pasted.png",
        handle="@이미지1",
        role="reference",
        mime_type="image/png",
        data_base64=base64.b64encode(PNG_1X1).decode("ascii"),
    )
    # Case 2: 볼트 경로만 전달 (서버가 vaultRoot 내부에서 안전하게 읽어 멀티모달 블록 생성)
    img_vault = ContextItem(
        kind="image",
        ref_id="vault:_attachments/shot.png",
        label="shot.png",
        handle="@이미지2",
        role="reference",
        mime_type="image/png",
        vault_path="_attachments/shot.png",
    )

    events = list(svc.send_message(sid, text="@이미지1 @이미지2 비교해줘", contexts=[wb_ctx, img_b64, img_vault], tools=[], mode="agent"))
    deltas = "".join(e.get("text", "") for e in events if e.get("type") == "text_delta")
    assert "[첨부 이미지 2장]" in deltas
    assert len(provider.engines[0].last_images) == 2
    assert provider.engines[0].last_images[0]["mimeType"] == "image/png"
    assert provider.engines[0].last_images[1]["data"] == base64.b64encode(PNG_1X1).decode("ascii")
    # 텍스트 프롬프트에 raw base64 문자열이 덤프되지 않았는지 확인
    assert base64.b64encode(PNG_1X1).decode("ascii") not in provider.engines[0].turns[0]


def test_tc_i03_acp_client_serializes_multimodal_image_blocks() -> None:
    captured: list[tuple[str, dict[str, Any]]] = []
    client = object.__new__(AcpClient)

    def _fake_request(method: str, params: dict[str, Any], timeout: float | None = None) -> dict[str, Any]:
        captured.append((method, params))
        return {"result": {"stopReason": "end_turn"}}

    client.request = _fake_request  # type: ignore[method-assign]
    b64 = base64.b64encode(PNG_1X1).decode("ascii")
    client.prompt("acp-s1", "이 이미지 레이아웃 분석해줘", images=[{"mimeType": "image/png", "data": b64}])

    assert len(captured) == 1
    method, params = captured[0]
    assert method == "session/prompt"
    assert params["sessionId"] == "acp-s1"
    assert params["prompt"] == [
        {"type": "text", "text": "이 이미지 레이아웃 분석해줘"},
        {"type": "image", "data": b64, "mimeType": "image/png"},
    ]


def test_tc_i04_assistant_service_emits_fs_batches_and_supports_http_undo(tmp_path: Path) -> None:
    """엔진 턴 중 vf_batch 실행 -> SSE `fs_batches` 이벤트 방출 -> list_fs_batches -> undo_fs_batch 원복."""
    vault_root = tmp_path / "vault"
    state_dir = tmp_path / "state"
    vault_root.mkdir()
    state_dir.mkdir()
    (vault_root / "work").mkdir()
    (vault_root / "work" / "a.md").write_text("alpha", encoding="utf-8")

    ws = ResourceWorkspace(state_dir=state_dir, sandbox_dir=tmp_path / "sbx", vault_roots=lambda vid: str(vault_root) if vid == "v1" else None)

    class _FsMutatingEngine:
        choice = EngineChoice(provider="offline", model="offline-fs")

        def __init__(self, sid: str) -> None:
            self.sid = sid

        def run_turn(self, text: str, cancel: threading.Event, *, images: Any = None):
            # 턴 실행 중 vibefs MCP 서버가 vf_batch 를 수행한 상황 재현
            fs = VaultFsTools(ws.store, self.sid)
            fs.call("vf_batch", {"summary": "작업 폴더 정리", "ops": [{"op": "mkdir", "path": "work/done"}, {"op": "move", "src": "work/a.md", "dst": "work/done"}]})
            yield {"type": "text_delta", "text": "정리 완료"}
            yield {"type": "turn_done", "usage": {}, "durationMs": 5}

        def export_state(self) -> dict[str, Any]:
            return {}

        def close(self) -> None:
            pass

    class _Provider:
        def resolve(self, provider: str | None, model: str | None) -> EngineChoice:
            return EngineChoice(provider="offline", model="offline-fs")

        def open_conversation(self, choice: EngineChoice, *, lane: Lane, resume: Any = None, session_id: str | None = None, system_prompt: str | None = None):
            return _FsMutatingEngine(session_id or "")

        def warmup(self, targets: Any) -> None:
            pass

        def available_models(self, provider: str) -> list[dict[str, str]]:
            return []

        def status(self) -> dict[str, Any]:
            return {}

        def shutdown(self) -> None:
            pass

    svc = AssistantService(_Provider(), _policy(), "offline-fs", workspace=ws)  # type: ignore[arg-type]
    sid = svc.create_session()["sessionId"]
    wb_ctx = ContextItem(
        kind="workbench",
        ref_id="wb:state",
        label="작업대",
        content=json.dumps({"vaultId": "v1", "targetFolders": ["work"]}),
    )
    events = list(svc.send_message(sid, text="@폴더1 정리해줘", contexts=[wb_ctx], tools=[], mode="agent"))

    fs_events = [e for e in events if e.get("type") == "fs_batches"]
    assert len(fs_events) == 1
    batch = fs_events[0]["batches"][0]
    assert batch["summary"] == "작업 폴더 정리"
    assert batch["undone"] is False
    assert (vault_root / "work" / "done" / "a.md").exists()

    # 목록 조회 + 1클릭 되돌리기 API 메서드 연동
    listed = svc.list_fs_batches(sid)
    assert len(listed) == 1 and listed[0]["batchId"] == batch["batchId"]

    undo_res = svc.undo_fs_batch(sid, batch["batchId"])
    assert undo_res["ok"] is True
    assert (vault_root / "work" / "a.md").read_text(encoding="utf-8") == "alpha"
    assert not (vault_root / "work" / "done").exists()
    assert svc.list_fs_batches(sid)[0]["undone"] is True


def test_tc_i05_fastapi_upload_and_fs_batch_routes_registered() -> None:
    """FastAPI 앱에 신규 /fs-batches · /undo 및 기존 /vaults/{id}/upload 라우트가 정상 마운트되어 있는지 검증."""
    fastapi_app = create_app()
    openapi_paths = set((fastapi_app.openapi().get("paths") or {}).keys())
    assert "/api/assistant/sessions/{session_id}/fs-batches" in openapi_paths
    assert "/api/assistant/sessions/{session_id}/fs-batches/{batch_id}/undo" in openapi_paths
    assert "/api/vaults/{vault_id}/upload" in openapi_paths

    # 미존재 세션에 대한 /fs-batches 는 404 반환 (에러 핸들러 연동 확인)
    with TestClient(fastapi_app) as client:
        res = client.get("/api/assistant/sessions/non-existent-session/fs-batches")
        assert res.status_code == 404
