"""리소스 작업 공간: 색인 · vibefs 도구 · 읽기 전용 훅 · 읽은 범위 · MCP 서버 · Composer 연결."""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterator

import pytest

from app.assistant.models import ContextItem
from app.assistant.use_cases.assistant_service import AssistantService, _Session
from app.assistant.workspace import (
    ResourceWorkspace,
    detect_full_read_intent,
    strip_recap,
    wants_full_read,
)
from app.assistant.workspace.citations import extract_citations, verify_citations
from app.llm.models import EngineChoice
from vibefs.hook import Mounted, decide
from vibefs.index import MountItem, WorkspaceIndex, read_range
from vibefs.sandbox import ENTRY as VIBEFS_ENTRY
from vibefs.sandbox import build_files, hook_command, prepare_sandbox
from vibefs.store import WorkspaceStore, coverage
from vibefs.tools import WorkspaceTools


@pytest.fixture()
def vault(tmp_path: Path) -> Path:
    root = tmp_path / "vault"
    (root / "회의 A" / "decisions").mkdir(parents=True)
    (root / "회의 B" / "templates").mkdir(parents=True)
    (root / "회의 C" / "templates").mkdir(parents=True)
    (root / "outside").mkdir()
    (root / "회의 A" / "decisions" / "결정 05.md").write_text(
        "---\n유형: 할일\n상태: 결정 사항\n요약: 북극성은 작업 시간 1/10\n상위:\n  - \"[[북극성 정의]]\"\n---\n"
        "# 결정 05\n## 1. 결정 내용\n근거는 [[템플릿 가이드|가이드]] 와 [[없는 노트]].\n"
        "| 링크 | 설명 |\n| --- | --- |\n| [[카드 템플릿\\|카드]] | 표 안 링크 |\n",
        encoding="utf-8",
    )
    guide = ["# 템플릿 가이드"] + [f"줄 {i}" for i in range(2, 2001)]
    guide[1499] = "줄 1500: 핵심 규칙 ORCA-42"
    (root / "회의 B" / "템플릿 가이드.md").write_text("\n".join(guide), encoding="utf-8")
    card = "---\n유형: 메모\n---\n# 카드 템플릿\n- 결정 한 문장\n"
    (root / "회의 B" / "templates" / "카드 템플릿.md").write_text(card, encoding="utf-8")
    (root / "회의 C" / "templates" / "카드 템플릿.md").write_text(card, encoding="utf-8")
    (root / "outside" / "북극성 정의.md").write_text("# 북극성 정의\nZEBRA-7\n", encoding="utf-8")
    return root


def _items(vault: Path) -> list[MountItem]:
    return [
        MountItem(str(vault / "회의 A" / "decisions" / "결정 05.md"), "file_d05", "결정 05"),
        MountItem(str(vault / "회의 B"), "dir_b", "회의 B"),
        MountItem(str(vault / "회의 C" / "templates" / "카드 템플릿.md"), "file_card_c", "카드"),
    ]


# --- 색인 · 도구 ------------------------------------------------------------------------

def test_index_reads_frontmatter_headings_links_and_duplicates(vault: Path) -> None:
    ix = WorkspaceIndex.build(_items(vault))
    assert len(ix.files) == 4 and ix.roots == [str(vault)]
    d05 = ix.get("회의 A/decisions/결정 05.md")
    assert d05 is not None and d05.resource_id == "file_d05"
    assert d05.frontmatter["유형"] == "할일" and d05.frontmatter["상위"] == ["[[북극성 정의]]"]
    assert [h.text for h in d05.headings] == ["결정 05", "1. 결정 내용"]
    links = {link.target: link for link in d05.links}
    assert links["템플릿 가이드"].resolved == ix.get("회의 B/템플릿 가이드.md").key
    assert links["카드 템플릿"].resolved is not None  # 표 안 `[[이름\|별칭]]` 도 풀린다
    assert links["북극성 정의"].resolved is None and links["북극성 정의"].outside.endswith("북극성 정의.md")
    assert links["없는 노트"].resolved is None and links["없는 노트"].outside is None
    assert [len(g) for g in ix.duplicates()] == [2]
    assert ix.get(str(vault / "outside" / "북극성 정의.md")) is None


def test_tools_find_and_reject_unknown_arguments(vault: Path) -> None:
    tools = WorkspaceTools(WorkspaceIndex.build(_items(vault)))
    grep = tools.call("ws_grep", {"pattern": "orca-42"})
    assert "1500: 줄 1500: 핵심 규칙 ORCA-42" in grep and str(vault / "회의 B" / "템플릿 가이드.md") in grep
    assert "1500-2000" not in tools.call("ws_outline", {"path": "결정 05.md"})
    outline = tools.call("ws_outline", {"path": "템플릿 가이드.md"})
    assert "2000줄" in outline and "800줄까지" in outline
    links = tools.call("ws_links", {"path": "회의 A/decisions/결정 05.md"})
    assert "마운트 밖" in links and "템플릿 가이드.md" in links
    assert "백링크 1개" in tools.call("ws_links", {"path": "템플릿 가이드.md"})
    assert "×2" in tools.call("ws_duplicates", {})
    assert "결정 사항" in tools.call("ws_find", {"field": "상태"})
    assert "결정 05.md" in tools.call("ws_find", {"field": "유형", "value": "할일"})
    with pytest.raises(ValueError, match="ByteOffset"):
        tools.call("ws_grep", {"pattern": "x", "ByteOffset": 3})
    tree = tools.call("ws_tree", {"depth": 1})
    assert "회의 A/" in tree and "회의 B/" in tree


def test_read_range_matches_agy_window() -> None:
    assert read_range(None, None, 3000) == (1, 800)  # 범위 없이 읽으면 앞 800줄
    assert read_range(1495, 1505, 3000) == (1495, 1505)
    assert read_range(100, None, 3000) == (100, 899)
    assert read_range(1, 5000, 3000) == (1, 800)  # 한 번에 800줄까지
    assert read_range(1, 50, 6) == (1, 6)


def test_coverage_counts_ranges_and_duplicates(vault: Path) -> None:
    ix = WorkspaceIndex.build(_items(vault))
    guide = str(vault / "회의 B" / "템플릿 가이드.md")
    reads = [
        {"path": guide, "start": None, "end": None},
        {"path": guide, "start": 700, "end": 1200},
        {"path": "회의 B/templates/카드 템플릿.md", "start": 1, "end": 50},
    ]
    cov = coverage(ix, reads)
    assert cov.total == 4
    assert sorted(cov.full) == ["회의 B/templates/카드 템플릿.md", "회의 C/templates/카드 템플릿.md"]  # 동일본 함께
    assert cov.partial == [("회의 B/템플릿 가이드.md", 1200, 2000)]
    assert cov.unread == ["회의 A/decisions/결정 05.md"]


# --- 훅 (읽기 전용 가드 · 원장) -----------------------------------------------------------------

def _store(tmp_path: Path, vault: Path, conv: str = "conv-1") -> WorkspaceStore:
    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_mount("asst-1", _items(vault), conv)
    return store


def _call(name: str, args: dict, conv: str = "conv-1") -> dict:
    return {"toolCall": {"name": name, "args": args}, "conversationId": conv}


def test_guard_blocks_writes_terminal_and_outside_reads(tmp_path: Path, vault: Path) -> None:
    store = _store(tmp_path, vault)
    d05 = str(vault / "회의 A" / "decisions" / "결정 05.md")
    for name, args in [("write_file", {"Path": d05, "Content": "x"}), ("edit_file", {"Path": d05}),
                       ("run_command", {"CommandLine": "dir"}), ("browser_open", {}), ("search_web", {"q": "x"})]:
        assert decide(_call(name, args), store)["decision"] == "deny", name
    assert decide(_call("call_mcp_tool", {"ServerName": "rea", "ToolName": "x"}), store)["decision"] == "deny"
    assert decide(_call("call_mcp_tool", {"ServerName": "vibefs_vibefs", "ToolName": "ws_tree"}), store)["decision"] == "allow"
    assert decide(_call("read_file", {"Path": d05, "StartLine": 1}), store)["decision"] == "allow"
    inside_dir = str(vault / "회의 B" / "템플릿 가이드.md")
    assert decide(_call("read_file", {"Path": inside_dir}), store)["decision"] == "allow"
    outside = decide(_call("read_file", {"Path": str(vault / "outside" / "북극성 정의.md")}), store)
    assert outside["decision"] == "deny" and "마운트 밖" in outside["reason"]
    # 상대 경로 · `/` 구분 · 파일 이름만 → 마운트 안 절대 경로로 고쳐 준다
    fixed = decide(_call("read_file", {"Path": "회의 A/decisions/결정 05.md"}), store)
    assert fixed["decision"] == "allow" and fixed["overwrite"]["Path"] == d05
    assert decide(_call("read_file", {"Path": "템플릿 가이드.md"}), store)["overwrite"]["Path"] == inside_dir
    # 모르는 대화(서브에이전트)도 마운트 하나면 그 마운트로 본다
    assert decide(_call("read_file", {"Path": d05}, conv="sub-9"), store)["decision"] == "allow"
    # agy 자기 상태 폴더(MCP 도구 설명 등)는 읽게 둔다
    agy_home = str(Path.home() / ".gemini" / "antigravity-cli" / "mcp" / "vibefs_vibefs" / "ws_tree.json")
    assert decide(_call("read_file", {"Path": agy_home}), store)["decision"] == "allow"


def test_guard_without_mount_denies_reads(tmp_path: Path, vault: Path) -> None:
    store = WorkspaceStore(str(tmp_path / "empty"))
    assert decide(_call("read_file", {"Path": str(vault / "회의 B" / "템플릿 가이드.md")}), store)["decision"] == "deny"


def _run_hook(mode: str, state: Path, payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    proc = subprocess.run([sys.executable, "-I", str(VIBEFS_ENTRY), "hook", mode, "--state", str(state)],
                          input=raw, capture_output=True, timeout=30)
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    return proc.stdout.decode("ascii")


def test_hook_script_end_to_end(tmp_path: Path, vault: Path) -> None:
    store = _store(tmp_path, vault)
    state = Path(store.dir)
    d05 = str(vault / "회의 A" / "decisions" / "결정 05.md")
    out = json.loads(_run_hook("pre", state, _call("write_file", {"Path": d05, "Content": "x"})))
    assert out["decision"] == "deny" and "읽기 전용" in out["reason"]
    out = json.loads(_run_hook("pre", state, _call("read_file", {"Path": "회의 A/decisions/결정 05.md"})))
    assert out == {"decision": "allow", "overwrite": {"Path": d05}}
    assert _run_hook("post", state, _call("read_file", {"Path": d05, "StartLine": 1, "EndLine": 9})) == "{}"
    reads = store.reads(conversation_ids=["conv-1"])
    assert [(r["start"], r["end"], r["ok"]) for r in reads] == [(1, 9, True)]
    log = [json.loads(line) for line in (state / "hook.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [e["decision"] for e in log if e["ev"] == "pre"] == ["deny", "allow"] and log[-1]["fixedPath"] == d05


def test_reads_attribute_unknown_conversations_by_window(tmp_path: Path, vault: Path) -> None:
    store = _store(tmp_path, vault)
    now = time.time()
    store.record_read("conv-1", "a", 1, 2, ok=True)
    store.record_read("sub-agent", "b", 1, 2, ok=True)
    store.record_read("conv-1", "c", 1, 2, ok=False)
    assert [r["path"] for r in store.reads(conversation_ids=["conv-1"])] == ["a"]
    assert [r["path"] for r in store.reads(conversation_ids=["conv-1"], windows=[(now - 5, now + 5)])] == ["a", "b"]


# --- MCP 서버 · 샌드박스 ------------------------------------------------------------------------

def test_vibefs_mcp_server_speaks_json_rpc(tmp_path: Path, vault: Path) -> None:
    store = _store(tmp_path, vault)
    proc = subprocess.Popen([sys.executable, "-I", str(VIBEFS_ENTRY), "mcp", "--state", store.dir],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def rpc(mid: int, method: str, params: dict) -> dict:
        assert proc.stdin and proc.stdout
        proc.stdin.write((json.dumps({"jsonrpc": "2.0", "id": mid, "method": method, "params": params}, ensure_ascii=False) + "\n").encode())
        proc.stdin.flush()
        return json.loads(proc.stdout.readline().decode("utf-8"))

    try:
        assert rpc(1, "initialize", {"protocolVersion": "2025-06-18"})["result"]["serverInfo"]["name"] == "vibefs"
        names = {t["name"] for t in rpc(2, "tools/list", {})["result"]["tools"]}
        assert {"ws_tree", "ws_grep", "ws_outline", "ws_links", "ws_coverage"} <= names
        meta = {"antigravity.google/root_conversation_id": "conv-1"}
        grep = rpc(3, "tools/call", {"name": "ws_grep", "arguments": {"pattern": "ORCA"}, "_meta": meta})["result"]
        assert not grep.get("isError") and "ORCA-42" in grep["content"][0]["text"]
        bad = rpc(4, "tools/call", {"name": "ws_grep", "arguments": {"pattern": "x", "ByteOffset": 1}})["result"]
        assert bad["isError"] and "ByteOffset" in bad["content"][0]["text"]
        store.record_read("conv-1", str(vault / "회의 A" / "decisions" / "결정 05.md"), 1, 50, ok=True)
        cov = rpc(5, "tools/call", {"name": "ws_coverage", "arguments": {}, "_meta": meta})["result"]["content"][0]["text"]
        assert "전부 읽음 1" in cov
    finally:
        proc.kill()


def test_prepare_sandbox_writes_agy_config(tmp_path: Path) -> None:
    sandbox, state = tmp_path / "sandbox", tmp_path / "ws"
    changed = prepare_sandbox(sandbox, state, sys.executable)
    assert set(changed) == set(build_files(sys.executable, state))
    hooks = json.loads((sandbox / ".agents" / "hooks.json").read_text(encoding="utf-8"))["vibedoc-workspace"]
    # 경로에 공백이 있고 짧은 경로를 못 구하면 `__main__.py" hook pre` 처럼 따옴표가 끼므로 따옴표를 빼고 본다
    assert hooks["PreToolUse"][0]["matcher"] == "*" and "__main__.py hook pre" in hooks["PreToolUse"][0]["hooks"][0]["command"].replace('"', "")
    assert hooks["PostToolUse"][0]["matcher"] == "read_file"
    mcp = json.loads((sandbox / ".agents" / "plugins" / "vibefs" / "mcp_config.json").read_text(encoding="utf-8"))
    assert mcp["mcpServers"]["vibefs"]["args"][1].endswith("vibefs/__main__.py") and mcp["mcpServers"]["vibefs"]["args"][2] == "mcp"
    assert prepare_sandbox(sandbox, state, sys.executable) == []  # 같으면 건드리지 않는다


@pytest.mark.skipif(sys.platform != "win32", reason="agy 는 Windows 에서 훅을 `cmd /c` 로 실행한다")
def test_hook_command_survives_cmd_quote_stripping_with_spaced_paths(tmp_path: Path) -> None:
    # 회귀: 경로에 공백이 있으면 훅 명령에 따옴표가 들어가고, agy 가 그걸 `cmd /c "...\"...\"..."` 로 띄워
    # 훅이 exit 1 로 죽었다 → agy 가 모든 도구를 사유 없이 막았다.
    state = tmp_path / "공백 있는 상태"
    state.mkdir()
    command = hook_command(sys.executable, "pre", state)
    payload = json.dumps({"toolCall": {"name": "mcp_vibefs_ws_collect", "args": {"query": "x"}}, "conversationId": "t"})
    # 목록으로 넘기면 Python 도 agy(Go) 와 똑같이 `cmd /c "<명령>"` 으로 감싸고 안쪽 따옴표를 `\"` 로 바꾼다.
    result = subprocess.run(["cmd", "/c", command], input=payload.encode(), capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr.decode("mbcs", "replace")
    assert json.loads(result.stdout.decode("utf-8"))["decision"] == "allow"


# --- Composer 연결 ------------------------------------------------------------------------------

class _FakeEngine:
    def __init__(self, script: list[str], on_turn=None) -> None:
        self.choice = EngineChoice("agy_cli", "fake")
        self.turns: list[str] = []
        self._script = list(script)
        self._on_turn = on_turn

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        self.turns.append(text)
        if self._on_turn:
            self._on_turn(len(self.turns), text)
        yield {"type": "text_delta", "text": self._script.pop(0) if self._script else "끝."}
        yield {"type": "turn_done", "usage": {"input_tokens": 1}, "durationMs": 1}

    def export_state(self) -> dict[str, Any]:
        return {"agy_conversation_id": "conv-1"}

    def close(self) -> None:
        pass


def _service(tmp_path: Path, engine: _FakeEngine) -> tuple[AssistantService, ResourceWorkspace]:
    ws = ResourceWorkspace(state_dir=tmp_path / "ws", sandbox_dir=tmp_path / "sandbox")
    service = AssistantService(engines=SimpleNamespace(), policy=SimpleNamespace(), inline_model="m", workspace=ws)  # type: ignore[arg-type]
    service._sessions["s1"] = _Session(session_id="s1", engine=engine)  # type: ignore[arg-type]
    return service, ws


def _mount_ctx(vault: Path) -> ContextItem:
    return ContextItem(kind="resource-mount", ref_id="rm:checked-resources", label="체크된 리소스",
                       content=json.dumps({"items": [i.to_dict() for i in _items(vault)]}, ensure_ascii=False))


def test_composer_mounts_resources_and_reports_coverage(tmp_path: Path, vault: Path) -> None:
    engine = _FakeEngine(["읽었다."])
    service, ws = _service(tmp_path, engine)
    events = list(service.send_message("s1", text="결정 05 를 요약해", contexts=[_mount_ctx(vault)], tools=[]))
    prompt = engine.turns[0]
    assert "작업대 규칙" in prompt and "파일 4개" in prompt and "ws_grep" in prompt
    assert "핵심 규칙 ORCA-42" not in prompt  # 본문은 미리 넣지 않는다
    mount = ws.store.mount_for("conv-1")
    assert mount is not None and mount.session_id == "s1" and "conv-1" in mount.conversation_ids
    cov = next(e for e in events if e["type"] == "workspace_coverage")
    assert cov["files"] == 4 and cov["unread"] == 4
    assert events[-1]["type"] == "turn_done" and events[-1]["stopReason"] == "end_turn"

    # 같은 마운트의 다음 메시지에는 지도 · 규칙을 다시 붙이지 않는다
    list(service.send_message("s1", text="고마워", contexts=[_mount_ctx(vault)], tools=[]))
    assert "리소스 작업 공간 규칙" not in engine.turns[-1] and "ws_overview" in engine.turns[-1]

    # RM 체크를 모두 풀면 마운트를 내린다
    list(service.send_message("s1", text="이제 됐어", contexts=[], tools=[]))
    assert ws.store.mount_for("conv-1") is None


def test_full_read_request_nudges_until_limit(tmp_path: Path, vault: Path) -> None:
    ws_ref = [None]

    def on_turn(turn_idx, text):
        # 턴이 돌 때마다 파일을 하나씩 읽어 진행 상태를 만든다
        if turn_idx == 2 and ws_ref[0]:
            ws_ref[0].store.record_read("conv-1", str(vault / "회의 A" / "decisions" / "결정 05.md"), 1, 50, ok=True)
        elif turn_idx == 3 and ws_ref[0]:
            ws_ref[0].store.record_read("conv-1", str(vault / "회의 B" / "templates" / "카드 템플릿.md"), 1, 50, ok=True)

    engine = _FakeEngine(["일부만 읽었다.", "더 읽었다.", "마저 읽었다."], on_turn=on_turn)
    service, ws = _service(tmp_path, engine)
    ws_ref[0] = ws
    events = list(service.send_message("s1", text="자료 전체를 빠짐없이 확인해", contexts=[_mount_ctx(vault)], tools=[]))
    assert len(engine.turns) == 3  # 첫 턴 + 이어 읽기 2번 (상한)
    assert "아직 읽지 않은 파일" in engine.turns[1] and "결정 05.md" in engine.turns[1]
    warnings = [e for e in events if e["type"] == "status" and e["state"] == "warning"]
    assert len(warnings) == 2 and events[-1]["stopReason"] == "end_turn"

    # 다 읽었으면 이어 읽기를 시키지 않는다
    for entry in WorkspaceIndex.build(_items(vault)).text_files():
        ws.store.record_read("conv-1", entry.abs_path, 1, 800, ok=True)
        ws.store.record_read("conv-1", entry.abs_path, 801, 1600, ok=True)
        ws.store.record_read("conv-1", entry.abs_path, 1601, 2400, ok=True)
    before = len(engine.turns)
    list(service.send_message("s1", text="전체 다시 확인해", contexts=[_mount_ctx(vault)], tools=[]))
    assert len(engine.turns) == before + 1


def test_spinning_nudge_prevented_when_no_new_reads(tmp_path: Path, vault: Path) -> None:
    # 재촉 후 추가로 읽은 파일이 없으면 재촉을 즉시 중단한다 (1번 재촉 후 중단)
    engine = _FakeEngine(["일부만 읽었다.", "더 읽었지만 파일은 안 읽었다.", "또 안 읽었다."])
    service, ws = _service(tmp_path, engine)
    events = list(service.send_message("s1", text="자료 전체를 빠짐없이 확인해", contexts=[_mount_ctx(vault)], tools=[]))
    assert len(engine.turns) == 2  # 첫 턴 + 1회 재촉 후 새로 읽은 것 없으므로 중단
    assert events[-1]["stopReason"] == "end_turn"


def test_strip_recap_and_intent_detection():
    # 1. 요약 블록 제거
    recap = "[이전 대화 요약: 사용자가 모든 파일을 전수 조사하라고 지시함][/이전 대화 요약]\n회의 결과를 한 줄로 요약해줘."
    assert strip_recap(recap) == "회의 결과를 한 줄로 요약해줘."
    assert not wants_full_read(recap)

    # 2. '각 항목' 은 전수 조사로 오발동하지 않음
    assert not wants_full_read("각 항목의 요약을 작성해줘")
    assert not wants_full_read("전체적인 분위기를 파악해줘")

    # 3. '자료종류+복수형+읽다/비교' 감지 및 대상 추출
    intent, target = detect_full_read_intent("decision들을 읽고 표를 작성해줘")
    assert intent is True
    assert target == "decision"
    assert wants_full_read("decision들을 읽고 표를 작성해줘") is True

    intent2, target2 = detect_full_read_intent("회의록들을 빠짐없이 확인해라")
    assert intent2 is True
    assert wants_full_read("회의록들을 빠짐없이 확인해라") is True


def test_ws_grep_byte_budget_preserves_next_page_notice(vault: Path):
    ix = WorkspaceIndex.build(_items(vault))
    tools = WorkspaceTools(ix)
    # 한글 및 긴 검색 결과가 9000 바이트를 넘는 경우에도 다음 쪽 안내가 잘리지 않고 보존되는지 확인
    res = tools.call("ws_grep", {"pattern": "줄"})
    assert "줄 더 있다" in res
    assert "ws_grep(pattern=" in res
    assert not res.endswith("… (결과가 길어 잘랐다 — path · glob · offset 으로 좁혀 다시 불러라)")


def test_citations_with_index_mapping_and_broken_links(vault: Path):
    ix = WorkspaceIndex.build(_items(vault))
    text = (
        "결과는 [결정 05](vdoc:resource/file_d05#L1-L10) 에 근거하며, "
        "가이드는 [상대링크](회의 B/템플릿 가이드.md#L1500-L1510) 를 참조한다."
    )
    citations = extract_citations(text)
    assert len(citations) == 2
    assert citations[0].target == "file_d05"
    assert citations[1].is_broken_syntax is True

    d05_path = str(vault / "회의 A" / "decisions" / "결정 05.md")
    guide_path = str(vault / "회의 B" / "템플릿 가이드.md")
    reads = [
        {"path": d05_path, "start": 1, "end": 20},
        {"path": guide_path, "start": 1400, "end": 1600},
    ]

    verified, warnings = verify_citations(citations, reads, index=ix)
    # file_d05 -> d05_path 매핑되어 검증 성공
    assert verified[0].is_verified is True
    # 상대경로 링크에 대한 깨진 링크 문법 경고 및 vdoc 권장 제안
    assert verified[1].is_verified is True
    assert any("깨진 링크 문법" in w for w in warnings)


def test_root_mount_alias_resolution_and_subset_coverage(vault: Path):
    items = [
        MountItem(str(vault / "회의 B"), "rm_b", "회의 B", kind="dir", alias="discussions"),
        MountItem(str(vault / "회의 A" / "decisions" / "결정 05.md"), "file_d05", "결정 05", kind="file"),
    ]
    ix = WorkspaceIndex.build(items)
    mounted = Mounted(items, roots=ix.roots)

    # alias 가 붙은 경로 해석 확인
    resolved = mounted.resolve("discussions/템플릿 가이드.md")
    assert resolved == str(vault / "회의 B" / "템플릿 가이드.md")

    # subset coverage 확인 (800줄 윈도우 분할 반영)
    reads = [
        {"path": resolved, "start": 1, "end": 800},
        {"path": resolved, "start": 801, "end": 1600},
        {"path": resolved, "start": 1601, "end": 2000},
    ]
    subset = {"discussions/템플릿 가이드.md"}
    cov = coverage(ix, reads, subset=subset)
    assert cov.total == 1
    assert len(cov.full) == 1
    assert cov.full[0] == "discussions/템플릿 가이드.md"


def test_parse_payload_with_roots_files_and_id_map(vault: Path):
    payload = json.dumps({
        "roots": [{"id": "r1", "path": str(vault / "회의 B"), "title": "회의 B"}],
        "files": [{"id": "f1", "path": str(vault / "회의 A" / "decisions" / "결정 05.md"), "title": "결정 05"}],
        "idMap": {str(vault / "회의 B" / "템플릿 가이드.md"): "custom_res_guide"},
    })
    items, roots, id_map = ResourceWorkspace.parse_payload(payload)
    assert len(items) == 2
    assert roots == [str(vault / "회의 B")]
    assert id_map[str(vault / "회의 B" / "템플릿 가이드.md")] == "custom_res_guide"

    ix = WorkspaceIndex.build(items, id_map=id_map)
    guide_entry = ix.get("템플릿 가이드.md")
    assert guide_entry is not None
    assert guide_entry.resource_id == "custom_res_guide"


# --- ACP 도구 이름 · 없는 경로 후보 · 실패 사유 (엔진 개선 후 lab 실측에서 나온 문제) ---------------------

def test_guard_allows_acp_style_vibefs_tool_names(tmp_path: Path, vault: Path) -> None:
    """ACP 모드에서 agy 는 MCP 도구를 `mcp_<서버>_<도구>` 이름으로 부른다 — 이것이 막혀 지도 · 목록 도구가 전부 무용지물이었다."""
    store = _store(tmp_path, vault)
    for name in ("mcp_vibefs_ws_glob", "mcp_vibefs_ws_tree", "mcp_vibefs_ws_overview", "mcp_vibefs_ws_collect"):
        assert decide(_call(name, {"pattern": "*"}), store)["decision"] == "allow", name
    other = decide(_call("mcp_rea_open_binary", {}), store)
    assert other["decision"] == "deny" and "vibefs" in other["reason"]
    assert decide(_call("mcp_vibefsx_ws_glob", {}), store)["decision"] == "deny"


def test_guard_denies_missing_paths_with_real_candidates(tmp_path: Path, vault: Path) -> None:
    store = _store(tmp_path, vault)
    guide = str(vault / "회의 B" / "템플릿 가이드.md")
    # 루트 안 절대 경로인데 파일이 없다 (폴더를 틀리게 기억) → 차단 + 실제 파일 후보
    wrong_folder = str(vault / "회의 B" / "templates" / "템플릿 가이드.md")
    out = decide(_call("read_file", {"Path": wrong_folder}), store)
    assert out["decision"] == "deny" and "없는 파일" in out["reason"] and guide in out["reason"]
    # 비슷한 이름 (한 글자 틀림) → 후보에 실제 파일
    typo = decide(_call("read_file", {"Path": str(vault / "회의 B" / "템플릿 가이드라인.md")}), store)
    assert typo["decision"] == "deny" and guide in typo["reason"]
    # 아무 단서도 없는 이름 → vibefs 도구로 확인하라는 안내
    none = decide(_call("read_file", {"Path": str(vault / "회의 B" / "zzz.md")}), store)
    assert none["decision"] == "deny" and "ws_glob" in none["reason"]
    # 작업 공간 설정 파일
    rules = decide(_call("read_file", {"Path": str(tmp_path / "sandbox" / ".agents" / "rules" / "vibedoc.md")}), store)
    assert rules["decision"] == "deny" and "설정 파일" in rules["reason"]
    # 실제로 있는 파일은 그대로 허용
    assert decide(_call("read_file", {"Path": guide}), store) == {"decision": "allow"}


def test_tool_failure_reason_comes_from_hook_log_and_read_ledger(tmp_path: Path, vault: Path) -> None:
    store = _store(tmp_path, vault)
    since = time.time() - 1
    store.log_hook({"ev": "pre", "tool": "mcp_vibefs_ws_tree", "conv": "conv-1", "decision": "deny",
                    "args": {"path": "x"}, "reason": "막힌 이유 A"})
    store.log_hook({"ev": "pre", "tool": "read_file", "conv": "other", "decision": "deny",
                    "args": {"Path": "C:/x/a.md"}, "reason": "다른 대화의 사유"})
    store.record_read("conv-1", "C:/x/없는.md", 1, 50, ok=False, extra={"error": "file does not exist"})
    assert store.tool_failure_reason(["conv-1"], "mcp_vibefs_ws_tree", since) == "막힌 이유 A"
    # 다른 대화의 차단은 이 대화의 사유가 아니다
    assert store.tool_failure_reason(["conv-1"], "read_file", since, path_hint="C:/x/a.md") is None
    # 훅은 통과했지만 읽기가 실패한 경우 → 읽기 원장의 오류 (경로 구분자가 달라도 파일 이름으로 맞춘다)
    win_path = "C:" + chr(92) + "x" + chr(92) + "없는.md"
    assert "file does not exist" in (store.tool_failure_reason(["conv-1"], "read_file", since, path_hint=win_path) or "")
    assert store.tool_failure_reason(["conv-1"], "mcp_vibefs_ws_tree", time.time() + 10) is None  # 시간 창 밖


def test_vibefs_server_results_carry_resource_ids_for_folder_mounts(tmp_path: Path, vault: Path) -> None:
    """폴더 단위 마운트에서도 vibefs 결과에 resourceId 가 붙어야 모델이 링크를 지어내지 않는다."""
    store = WorkspaceStore(str(tmp_path / "ws"))
    guide = str(vault / "회의 B" / "템플릿 가이드.md")
    store.set_mount("asst-1", [MountItem(str(vault / "회의 B"), "dir_b", "회의 B", kind="dir")], "conv-1",
                    id_map={guide: "file_guide_01"})
    proc = subprocess.Popen([sys.executable, "-I", str(VIBEFS_ENTRY), "mcp", "--state", store.dir],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert proc.stdin and proc.stdout
        msg = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
               "params": {"name": "ws_glob", "arguments": {"pattern": "*가이드*"},
                          "_meta": {"antigravity.google/root_conversation_id": "conv-1"}}}
        proc.stdin.write((json.dumps(msg, ensure_ascii=False) + "\n").encode())
        proc.stdin.flush()
        text = json.loads(proc.stdout.readline().decode("utf-8"))["result"]["content"][0]["text"]
        assert "resourceId=file_guide_01" in text
    finally:
        proc.kill()


class _FailingToolEngine(_FakeEngine):
    """ACP 처럼 실패한 도구를 사유 없이 `state: error` 로 보내는 엔진."""

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        self.turns.append(text)
        if self._on_turn:
            self._on_turn(len(self.turns), text)
        yield {"type": "agent_tool", "callId": "t1", "name": "mcp_vibefs_ws_tree", "state": "running", "params": {"path": "x"}}
        yield {"type": "agent_tool", "callId": "t1", "name": "mcp_vibefs_ws_tree", "state": "error", "params": {}, "error": ""}
        yield {"type": "text_delta", "text": "끝."}
        yield {"type": "turn_done", "usage": {}, "durationMs": 1}


def test_composer_fills_failed_tool_reason_from_hook_log(tmp_path: Path, vault: Path) -> None:
    def deny_during_turn(_n: int, _text: str) -> None:
        ws.store.log_hook({"ev": "pre", "tool": "mcp_vibefs_ws_tree", "conv": "conv-1", "decision": "deny",
                           "args": {"path": "x"}, "reason": "훅이 막은 이유"})

    engine = _FailingToolEngine([], on_turn=deny_during_turn)
    service, ws = _service(tmp_path, engine)
    events = list(service.send_message("s1", text="트리 보여줘", contexts=[_mount_ctx(vault)], tools=[]))
    failed = [e for e in events if e["type"] == "agent_tool" and e["state"] == "error"]
    assert len(failed) == 1 and failed[0]["error"] == "훅이 막은 이유"


def test_mounts_never_mix_across_sessions(tmp_path: Path, vault: Path) -> None:
    """대화 id 를 모를 때 모든 마운트를 합치면 다른 세션 자료가 섞여 보였다 (lab 실측). 섞지 않는다."""
    store = WorkspaceStore(str(tmp_path / "ws"))
    other = tmp_path / "other"
    other.mkdir()
    (other / "남의 파일.md").write_text("# 다른 세션 자료\n", encoding="utf-8")
    store.set_mount("asst-old", [MountItem(str(other), "", "other", kind="dir")], "conv-old")
    time.sleep(0.01)
    store.set_mount("asst-new", _items(vault), None)
    picked = store.mount_for(None)
    assert picked is not None and picked.session_id == "asst-new"  # 최신 하나 — 합치지 않는다
    assert all("other" not in i.path for i in picked.items)
    assert store.mount_for("conv-old").session_id == "asst-old"
    assert store.mount_for("모르는-대화", session_id="asst-old").session_id == "asst-old"  # MCP 서버는 세션 id 로 고정


def test_vibefs_server_binds_conversation_to_its_session(tmp_path: Path, vault: Path) -> None:
    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_mount("asst-1", _items(vault), None)
    proc = subprocess.Popen([sys.executable, "-I", str(VIBEFS_ENTRY), "mcp", "--state", store.dir, "--session", "asst-1"],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert proc.stdin and proc.stdout
        msg = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
               "params": {"name": "ws_overview", "arguments": {}, "_meta": {"antigravity.google/root_conversation_id": "conv-x"}}}
        proc.stdin.write((json.dumps(msg) + "\n").encode())
        proc.stdin.flush()
        proc.stdout.readline()
    finally:
        proc.kill()
    # 이제 훅(대화 id 만 아는 쪽)도 같은 마운트를 찾는다
    assert store.mount_for("conv-x").session_id == "asst-1"


# --- 묶음 요청 의도 · 군집 정밀도 (실제 볼트 평가에서 18장 중 3장만 읽던 원인) ---------------------------

@pytest.mark.parametrize("text, target", [
    ("리소스의 Decision 들을 읽고 공통 형식과 차이를 정리해서 표준을 제안해줘", "Decision"),
    ("Decision들 정리해줘", "Decision"),
    ("모든 회의록에서 액션 아이템 뽑아줘", "회의록"),
])
def test_set_synthesis_requests_are_detected_with_their_target(text: str, target: str) -> None:
    assert detect_full_read_intent(text) == (True, target)


@pytest.mark.parametrize("text", ["회의록 전체적으로 요약해줘", "이것들을 정리해줘", "요금제에 대해 지금 유효한 결정이 뭐야?"])
def test_non_set_requests_are_not_detected(text: str) -> None:
    assert detect_full_read_intent(text)[0] is False


def test_decision_cluster_separates_cards_drafts_and_scaffolds(tmp_path: Path) -> None:
    from vibefs import mapper

    root = tmp_path / "v"
    files = {
        "discussions/26.10.14/decisions/Decision 01 — 서식은 템플릿으로 먼저 준다 (템플릿 고정).md": "---\n상태: 결정 사항\n---\n# D1\n",
        "discussions/26.10.14/decisions/Decision 02 — 레퍼런스.md": "---\n상태: 결정 사항\n---\n# D2\n",
        "ws/26.10.14 공유회/A5.outputs/D1_서식은_템플릿으로.md": "---\n상태: 검토 중\n---\n# D1 속기\n",
        "ws/26.10.14 공유회/A4.meta/rec/templates/decision_card_template.md": "# 틀\n",
        "ws/26.10.14 공유회/A4.meta/rec/examples/sample_decision_output.md": "# Decision 09 예시\n",
    }
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    ix = WorkspaceIndex.build([MountItem(str(root), "", "v", kind="dir")])
    name, primary, drafts, scaffolds = mapper.target_entries(ix, "Decision")
    assert name == "결정 카드"
    assert sorted(e.rel.rsplit("/", 1)[-1][:11] for e in primary) == ["Decision 01", "Decision 02"]
    assert [e.rel.rsplit("/", 1)[-1] for e in drafts] == ["D1_서식은_템플릿으로.md"]
    listing = mapper.collect(ix, "결정 카드")
    assert "본 대상 2개" in listing and "초안 · 검토 중 1개" in listing
    assert "decision_card_template" not in listing  # 서식은 결정 카드 군집에 끼지 않는다


def test_composer_sends_workbench_map_once_then_short_status(tmp_path: Path) -> None:
    """workbench 첨부 → 세션 작업대 저장(vibefs 의 wb_* 가 읽는다) + 첫 턴엔 지도, 다음 턴엔 짧은 현황."""
    docs = tmp_path / "documents"
    (docs / "d1").mkdir(parents=True)
    (docs / "d1" / "document.vdoc.json").write_text(json.dumps({
        "docId": "d1", "title": "보고서", "pages": [{"pageId": "p1", "blocks": [{"blockId": "b", "kind": "text", "slotId": "s"}]}],
        "slots": {"s": {"slotId": "s", "label": "요약", "content": "<p></p>"}}}, ensure_ascii=False), encoding="utf-8")
    engine = _FakeEngine(["봤다.", "또 봤다."])
    ws = ResourceWorkspace(state_dir=tmp_path / "ws", sandbox_dir=tmp_path / "sandbox", documents_root=docs)
    service = AssistantService(engines=SimpleNamespace(), policy=SimpleNamespace(), inline_model="m", workspace=ws)  # type: ignore[arg-type]
    service._sessions["s1"] = _Session(session_id="s1", engine=engine)  # type: ignore[arg-type]
    ctx = ContextItem(kind="workbench", ref_id="wb:state", label="작업대",
                      content=json.dumps({"docId": "d1", "scope": {"mode": "document"}, "selection": ["s"], "references": []}))
    list(service.send_message("s1", text="빈 칸 알려줘", contexts=[ctx], tools=[]))
    list(service.send_message("s1", text="다시", contexts=[ctx], tools=[]))
    assert "작업대 지도" in engine.turns[0] and "빈칸 1" in engine.turns[0]
    # 다음 턴엔 지도 대신 켜진 출처 목록 (긴 대화에서도 다른 출처를 잊지 않게)
    assert "작업대 지도" not in engine.turns[1] and "[켜진 출처" in engine.turns[1] and "에디터: 보고서" in engine.turns[1]
    assert ws.store.workbench_for("s1")["docId"] == "d1"


def test_assistant_emits_ready_workbench_proposals_even_without_references(tmp_path: Path) -> None:
    """레퍼런스/리소스가 꺼져 있어도(usage_rows=[]) wb_propose 통과안은 workbench_proposals 로 나가고, 실패안·중복은 걸러진다."""
    from vibefs.wb_tools import WorkbenchTools

    docs = tmp_path / "documents"
    (docs / "d1").mkdir(parents=True)
    (docs / "d1" / "document.vdoc.json").write_text(
        json.dumps(
            {
                "docId": "d1",
                "title": "보고서",
                "pages": [{"pageId": "p1", "blocks": [{"blockId": "b1", "kind": "text", "slotId": "s1"}]}],
                "slots": {
                    "s1": {"slotId": "s1", "label": "요약", "role": "editable-slot", "content": "<p>기존 문장</p>"},
                    "s_lock": {"slotId": "s_lock", "label": "잠금", "role": "editable-slot", "content": "<p>머리글</p>", "constraints": {"locked": True}},
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    ws = ResourceWorkspace(state_dir=tmp_path / "ws", sandbox_dir=tmp_path / "sandbox", documents_root=docs)

    def _on_turn(turn_no: int, _text: str) -> None:
        if turn_no != 1:
            return
        wb = ws.store.workbench_for("s1")
        assert wb is not None
        from vibefs.workbench import Workbench

        tools = WorkbenchTools(Workbench.from_state(wb), proposals=ws.proposals, session_id="s1")
        # 1) 검증 실패 제안 (고정 슬롯 수정) → 프론트로 내려보내면 안 된다
        tools.call("wb_propose", {"target": "slot:s_lock", "candidates": [{"slots": {"s_lock": "<p>변경</p>"}}]})
        # 2) 검증 통과 제안 (레퍼런스 0개 환경) → 프론트로 내려보낸다
        tools.call(
            "wb_propose",
            {
                "target": "slot:s1",
                "mode": "compose",
                "summary": "요약 개편",
                "candidates": [
                    {"title": "간결안", "slots": {"s1": "<p>새 요약 1안</p>"}},
                    {"title": "상세안", "slots": {"s1": "<p>새 요약 2안</p>"}},
                ],
            },
        )

    engine = _FakeEngine(["개편안을 작성했습니다.", "후속 답변입니다."], on_turn=_on_turn)
    service = AssistantService(engines=SimpleNamespace(), policy=SimpleNamespace(), inline_model="m", workspace=ws)  # type: ignore[arg-type]
    service._sessions["s1"] = _Session(session_id="s1", engine=engine)  # type: ignore[arg-type]
    ctx = ContextItem(
        kind="workbench",
        ref_id="wb:state",
        label="작업대",
        content=json.dumps({"docId": "d1", "scope": {"mode": "document"}, "selection": ["s1"], "references": []}),
    )

    first = list(service.send_message("s1", text="요약 슬롯 고쳐줘", contexts=[ctx], tools=[]))
    prop_events = [e for e in first if e.get("type") == "workbench_proposals"]
    assert len(prop_events) == 1
    proposals = prop_events[0]["proposals"]
    assert len(proposals) == 1
    assert proposals[0]["docId"] == "d1"
    assert len(proposals[0]["candidates"]) == 2
    assert proposals[0]["candidates"][0]["slots"]["s1"] == "<p>새 요약 1안</p>"

    # 두 번째 턴에서는 이미 보낸 proposalId 를 중복 전송하지 않는다
    second = list(service.send_message("s1", text="고마워", contexts=[ctx], tools=[]))
    assert not any(e.get("type") == "workbench_proposals" for e in second)
