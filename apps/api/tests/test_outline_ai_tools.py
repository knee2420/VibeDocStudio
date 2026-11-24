"""`.outline` AI 도구(`ol_*`) · raw 쓰기 차단 · `workbench_proposals` 연동 단위/통합 테스트 (E1, E4-server, E6).

- E1-a: `vf_write` · `vf_patch` 의 `.outline` raw 덮어쓰기 코드 레벨 차단
- E1-b: `ol_map` · `ol_read` · `ol_find` 압축 인지 및 서브트리 `baseHash` 계산
- E1-c: `ol_propose_patch` 검증 (미존재 nodeId · `outlineScope` 범위 밖 · `docBindings` 삭제 보호 · `baseHash` 불일치 · `readOnly`/`plan` 차단)
- E1-d: `ol_propose_patch` `nodeEvidence` 사이드카 ↔ `reads.jsonl` 교차 검증 경고
- E1-e: `ol_attach_resource` (`file` / `img-token` / `wikilink`) 볼트 실재 검증 + `TreePatchRequest` 생성
- E4-server: `vibefs.server.Server` MCP 노출 + `AssistantService` 기존 `workbench_proposals` SSE 채널을 통한 `outlinePatch` 방출
- E6-hash: 서브트리 `baseHash` 격리성 (무관한 브랜치 수정 시 대상 서브트리 지문 불변)
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import pytest

from app.assistant.models import ContextItem
from app.assistant.use_cases.assistant_service import AssistantService
from app.assistant.workspace.service import ResourceWorkspace
from app.llm.models import EngineChoice, Lane
from app.llm.policy import RuntimeExecutionPolicy
from vibefs.fs_tools import VaultFsTools
from vibefs.outline_tools import OL_TOOL_SPECS, OutlineTools, compute_subtree_hash
from vibefs.proposals import ProposalStore
from vibefs.server import Server as VibefsServer
from vibefs.store import WorkspaceStore


def _sample_outline() -> dict[str, Any]:
    return {
        "version": 1,
        "id": "outline-master-1",
        "title": "마스터 아웃라인",
        "defaultView": "bullets",
        "docBindings": {
            "n-doc": {
                "docId": "doc-1",
                "vdocPath": "vault://docs/proposal.vdoc",
                "profileId": "a4",
            }
        },
        "rootNodes": [
            {
                "id": "n-doc",
                "text": "<<doc:a4>> 사업 제안서",
                "isFolded": False,
                "children": [
                    {
                        "id": "n-sec1",
                        "text": "<<view:section>> 1. 개요",
                        "isFolded": False,
                        "children": [
                            {"id": "n-p1", "text": "초기 설명 문단", "isFolded": False, "children": []},
                        ],
                    },
                    {
                        "id": "n-sec2",
                        "text": "<<view:section>> 2. 일정",
                        "isFolded": False,
                        "children": [
                            {"id": "n-p2", "text": "상반기 일정", "isFolded": False, "children": []},
                        ],
                    },
                ],
            }
        ],
    }


def _setup_outline(
    tmp_path: Path,
    *,
    session_id: str = "ol-s1",
    read_only: bool = False,
    mode: str = "agent",
    outline_scope: dict[str, Any] | None = None,
) -> tuple[Path, WorkspaceStore, OutlineTools, VaultFsTools]:
    vault_root = tmp_path / "vault"
    state_dir = tmp_path / "state"
    vault_root.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)
    (vault_root / "docs").mkdir()
    (vault_root / "photos").mkdir()
    (vault_root / "photos" / "hero.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (vault_root / "notes").mkdir()
    (vault_root / "notes" / "facts.md").write_text("예산은 5000만원입니다.\n", encoding="utf-8")
    (vault_root / "docs" / "master.outline").write_text(
        json.dumps(_sample_outline(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    store = WorkspaceStore(str(state_dir))
    store.set_workbench(
        session_id,
        {
            "vaultId": "v1",
            "vaultRoot": str(vault_root),
            "activeOutlinePath": "docs/master.outline",
            "readOnly": read_only,
            "mode": mode,
            "outlineScope": outline_scope,
        },
    )
    proposals = ProposalStore(str(state_dir))
    ol_tools = OutlineTools(store, session_id, proposals=proposals)
    fs_tools = VaultFsTools(store, session_id)
    return vault_root, store, ol_tools, fs_tools


def test_e1a_vf_write_and_vf_patch_physically_block_outline(tmp_path: Path) -> None:
    _, _, _, fs_tools = _setup_outline(tmp_path)
    with pytest.raises(ValueError, match="ol_propose_patch"):
        fs_tools.call("vf_write", {"path": "docs/master.outline", "content": "{}", "mode": "overwrite"})
    with pytest.raises(ValueError, match="ol_propose_patch"):
        fs_tools.call("vf_patch", {"path": "docs/master.outline", "find": "초기", "replace": "수정"})


def test_e1b_ol_map_read_find_and_subtree_hash_isolation(tmp_path: Path) -> None:
    _, _, ol_tools, _ = _setup_outline(tmp_path)

    mapped = ol_tools.call("ol_map", {})
    assert "[.outline 지도] docs/master.outline" in mapped
    assert "[n-doc]" in mapped and "doc:vault://docs/proposal.vdoc" in mapped
    assert "[n-sec1]" in mapped and "[n-p1]" in mapped

    read_out = ol_tools.call("ol_read", {"nodeId": "n-sec1"})
    assert "baseHash=" in read_out
    assert "초기 설명 문단" in read_out

    found = ol_tools.call("ol_find", {"tag": "view:section"})
    assert "[n-sec1]" in found and "[n-sec2]" in found

    # E6-hash: 무관한 브랜치(n-sec2)를 고쳐도 n-sec1 서브트리 baseHash 는 변하지 않음
    before_roots = _sample_outline()["rootNodes"]
    h_sec1_before = compute_subtree_hash(before_roots, ["n-sec1"])
    after_roots = _sample_outline()["rootNodes"]
    after_roots[0]["children"][1]["children"][0]["text"] = "하반기 일정으로 수정"
    h_sec1_after = compute_subtree_hash(after_roots, ["n-sec1"])
    assert h_sec1_before == h_sec1_after


def test_e1c_ol_propose_patch_guards_scope_docbindings_stale_and_modes(tmp_path: Path) -> None:
    # 1) 범위 밖 노드 차단
    _, _, scoped, _ = _setup_outline(
        tmp_path / "scoped",
        outline_scope={"mode": "selection", "label": "선택 불릿 · 1. 개요", "allowedNodeIds": ["n-sec1", "n-p1"]},
    )
    with pytest.raises(ValueError, match="범위"):
        scoped.call("ol_propose_patch", {"requests": [{"op": "replace", "id": "n-p2", "text": "금지"}]})

    # 범위 안 노드는 허용
    ok_msg = scoped.call(
        "ol_propose_patch",
        {"summary": "개요 문단 보강", "requests": [{"op": "replace", "id": "n-p1", "text": "보강된 문단"}]},
    )
    assert "[Staged 제출" in ok_msg

    # 2) docBindings 바인딩된 루트 삭제 보호
    _, _, normal, _ = _setup_outline(tmp_path / "normal")
    with pytest.raises(ValueError, match="바인딩된"):
        normal.call("ol_propose_patch", {"requests": [{"op": "delete", "id": "n-doc"}]})

    # 3) 미존재 노드 / 잘못된 op / baseHash 불일치 차단
    with pytest.raises(ValueError, match="존재하지 않는 노드"):
        normal.call("ol_propose_patch", {"requests": [{"op": "replace", "id": "missing-id", "text": "x"}]})
    with pytest.raises(ValueError, match="baseHash 불일치"):
        normal.call("ol_propose_patch", {"baseHash": "0000000000000000", "requests": [{"op": "replace", "id": "n-p1", "text": "x"}]})

    # 4) readOnly / plan 모드 차단
    _, _, ro, _ = _setup_outline(tmp_path / "ro", read_only=True)
    with pytest.raises(ValueError, match="읽기 전용"):
        ro.call("ol_propose_patch", {"requests": [{"op": "replace", "id": "n-p1", "text": "x"}]})
    _, _, plan, _ = _setup_outline(tmp_path / "plan", mode="plan")
    with pytest.raises(ValueError, match="plan 모드"):
        plan.call("ol_propose_patch", {"requests": [{"op": "replace", "id": "n-p1", "text": "x"}]})


def test_e1d_node_evidence_cross_check_against_reads(tmp_path: Path) -> None:
    vault_root, store, _, _ = _setup_outline(tmp_path)
    reads = [{"path": str(vault_root / "notes" / "facts.md"), "start": 1, "end": 5}]
    ol_tools = OutlineTools(store, "ol-s1", proposals=ProposalStore(store.dir), reads=lambda: reads)

    # 읽은 파일 근거 -> 경고 없음
    msg_ok = ol_tools.call(
        "ol_propose_patch",
        {
            "summary": "근거 있는 수정",
            "requests": [{"op": "replace", "id": "n-p1", "text": "예산 5000만원"}],
            "nodeEvidence": {
                "n-p1": [{"kind": "resource", "refId": "vault:notes/facts.md", "label": "facts.md", "sourcePath": "notes/facts.md"}]
            },
        },
    )
    assert "경고:" not in msg_ok

    # 읽지 않은 파일 근거 -> 경고 표시
    msg_warn = ol_tools.call(
        "ol_propose_patch",
        {
            "summary": "미열람 근거",
            "requests": [{"op": "replace", "id": "n-p1", "text": "추정치"}],
            "nodeEvidence": {
                "n-p1": [{"kind": "resource", "refId": "vault:notes/unread.md", "label": "unread.md", "sourcePath": "notes/unread.md"}]
            },
        },
    )
    assert "경고:" in msg_warn and "unread.md" in msg_warn


def test_e1e_ol_attach_resource_all_modes(tmp_path: Path) -> None:
    _, store, ol_tools, _ = _setup_outline(tmp_path)

    # 없는 리소스 거부
    with pytest.raises(ValueError, match="존재하지 않습니다"):
        ol_tools.call("ol_attach_resource", {"nodeId": "n-sec1", "target": "photos/missing.png", "mode": "file"})

    r1 = ol_tools.call("ol_attach_resource", {"nodeId": "n-sec1", "target": "photos/hero.png", "mode": "file"})
    r2 = ol_tools.call("ol_attach_resource", {"nodeId": "n-sec1", "target": "photos/hero.png", "mode": "img-token", "caption": "대표컷"})
    r3 = ol_tools.call("ol_attach_resource", {"nodeId": "n-sec1", "target": "notes/facts.md", "mode": "wikilink"})
    assert "[Staged 제출" in r1 and "[Staged 제출" in r2 and "[Staged 제출" in r3

    saved = ProposalStore(store.dir).list("ol-s1")
    assert len(saved) == 3
    ops = [p["outlinePatch"]["requests"][0] for p in saved]
    assert ops[0]["op"] == "set_file" and ops[0]["file"]["target"] == "photos/hero.png"
    assert ops[1]["op"] == "insert_after" and "[img:대표컷 -> resource:vault:photos/hero.png]" in ops[1]["items"][0]["text"]
    assert ops[2]["op"] == "insert_after" and "[[facts]]" in ops[2]["items"][0]["text"]


def test_e4_server_vibefs_and_workbench_proposals_sse_channel(tmp_path: Path) -> None:
    vault_root = tmp_path / "vault"
    state_dir = tmp_path / "state"
    vault_root.mkdir()
    state_dir.mkdir()
    (vault_root / "docs").mkdir()
    (vault_root / "docs" / "master.outline").write_text(
        json.dumps(_sample_outline(), ensure_ascii=False, indent=2), encoding="utf-8"
    )

    assert {"ol_map", "ol_read", "ol_find", "ol_create", "ol_propose_patch", "ol_attach_resource"} == {s["name"] for s in OL_TOOL_SPECS}

    ws = ResourceWorkspace(
        state_dir=state_dir,
        sandbox_dir=tmp_path / "sandbox",
        vault_roots=lambda vid: str(vault_root) if vid == "v1" else None,
    )

    class _OutlineAgentEngine:
        choice = EngineChoice(provider="offline", model="offline-ol")

        def __init__(self, sid: str) -> None:
            self.sid = sid

        def run_turn(self, text: str, cancel: threading.Event, *, images: Any = None):
            srv = VibefsServer(ws.store.dir, session_id=self.sid)
            srv.call(
                "ol_propose_patch",
                {"summary": "섹션1 보강", "requests": [{"op": "replace", "id": "n-p1", "text": "새 개요 문단"}]},
                {},
            )
            yield {"type": "text_delta", "text": "패치를 Staged 로 올렸습니다."}
            yield {"type": "turn_done", "usage": {}, "durationMs": 4}

        def export_state(self) -> dict[str, Any]:
            return {}

        def close(self) -> None:
            pass

    class _Provider:
        def resolve(self, provider: str | None, model: str | None) -> EngineChoice:
            return EngineChoice(provider="offline", model="offline-ol")

        def open_conversation(self, choice: EngineChoice, *, lane: Lane, resume: Any = None, session_id: str | None = None, system_prompt: str | None = None):
            return _OutlineAgentEngine(session_id or "")

        def warmup(self, targets: Any) -> None:
            pass

        def available_models(self, provider: str) -> list[dict[str, str]]:
            return []

        def status(self) -> dict[str, Any]:
            return {}

        def shutdown(self) -> None:
            pass

    policy = RuntimeExecutionPolicy(
        primary_provider="offline",
        fallback_provider="offline",
        google_api_model="offline",
        google_api_timeout_seconds=30,
        agent_cli_model="offline",
        agent_cli_timeout_seconds=30,
        agent_cli_bin="agy",
    )
    svc = AssistantService(_Provider(), policy, "offline-ol", workspace=ws)  # type: ignore[arg-type]
    sid = svc.create_session()["sessionId"]
    wb_ctx = ContextItem(
        kind="workbench",
        ref_id="wb:state",
        label="작업대",
        content=json.dumps({"vaultId": "v1", "activeOutlinePath": "docs/master.outline"}),
    )
    events = list(svc.send_message(sid, text="개요 보강해줘", contexts=[wb_ctx], tools=[], mode="agent"))

    # 신규 SSE 이벤트 없이 기존 workbench_proposals 채널로 outlinePatch 가 정확히 방출되어야 함
    prop_events = [e for e in events if e.get("type") == "workbench_proposals"]
    assert len(prop_events) == 1
    prop = prop_events[0]["proposals"][0]
    assert prop["mode"] == "outline-patch"
    assert prop["outlinePatch"]["path"] == "docs/master.outline"
    assert prop["outlinePatch"]["requests"][0] == {"op": "replace", "id": "n-p1", "text": "새 개요 문단"}


def test_e1f_ol_create_creates_nested_outline_guards_overwrite_and_supports_vf_undo(tmp_path: Path) -> None:
    vault_root, store, ol_tools, _ = _setup_outline(tmp_path)
    out = ol_tools.call(
        "ol_create",
        {
            "path": "재편 계획/볼트_재편_계획.outline",
            "title": "볼트 재편 계획",
            "rootNodes": [
                {
                    "text": "01. System",
                    "items": [{"text": "01. Architecture -> 01. System"}],
                }
            ],
        },
    )
    assert "볼트 재편 계획" in out and "batchId=" in out
    created = vault_root / "재편 계획" / "볼트_재편_계획.outline"
    assert created.is_file()
    parsed = json.loads(created.read_text(encoding="utf-8"))
    assert parsed["title"] == "볼트 재편 계획"
    assert len(parsed["rootNodes"]) == 1
    assert parsed["rootNodes"][0]["children"][0]["text"] == "01. Architecture -> 01. System"

    # 기존 .outline 덮어쓰기 차단 (ol_propose_patch 강제)
    with pytest.raises(ValueError, match="이미 존재하는"):
        ol_tools.call("ol_create", {"path": "재편 계획/볼트_재편_계획.outline"})

    # vf_undo 로 생성 파일 및 빈 상위 폴더까지 안전하게 원복
    batch_id = out.split("batchId=")[1].split("]")[0]
    fs_tools = VaultFsTools(store, "ol-s1")
    fs_tools.call("vf_undo", {"batchId": batch_id})
    assert not created.exists()
    assert not (vault_root / "재편 계획").exists()


def test_e1g_ol_propose_patch_rejects_replace_nested_and_normalizes_insert_children(tmp_path: Path) -> None:
    _, store, ol_tools, _ = _setup_outline(tmp_path)

    # 1) replace 에 items/children 을 넣으면 즉시 거부 + insert_after 안내
    with pytest.raises(ValueError, match="insert_after"):
        ol_tools.call(
            "ol_propose_patch",
            {
                "requests": [
                    {"op": "replace", "id": "n-p1", "text": "제목", "items": [{"text": "하위"}]}
                ]
            },
        )

    # 2) 자식이 있는 노드를 recursively=true 없이 delete 시도하면 즉시 거부
    with pytest.raises(ValueError, match="recursively"):
        ol_tools.call("ol_propose_patch", {"requests": [{"op": "delete", "id": "n-sec1"}]})

    # 3) insert_after 내 중첩 items 오기입은 @vibe/outliner 표준 children 으로 정규화
    ol_tools.call(
        "ol_propose_patch",
        {
            "summary": "중첩 삽입 정규화",
            "requests": [
                {
                    "op": "insert_after",
                    "targetId": "n-sec1",
                    "inside": True,
                    "items": [{"id": "fake-id", "text": "상위", "items": [{"text": "하위 항목"}]}],
                }
            ],
        },
    )
    saved = ProposalStore(store.dir).list("ol-s1")[-1]
    inserted = saved["outlinePatch"]["requests"][0]["items"][0]
    assert "id" not in inserted
    assert inserted["children"][0]["text"] == "하위 항목"


def test_e1h_vault_hook_auto_allows_vault_reads_and_redirects_document_files(tmp_path: Path) -> None:
    from vibefs.hook import decide

    vault_root, store, _, _ = _setup_outline(tmp_path)
    # mounts.json 이 완전히 비어 있는 상태에서도 workbench.vaultRoot 만 있으면 자동 인식
    store.bind_workbench_conversation("ol-s1", "conv-vault-1")

    # 1) 볼트 안 리소스 파일(.md)은 별도 마운트 체크 없이 read_file 자동 허용 (상대 경로 & 샌드박스 접두사 모두 해석)
    ok_rel = decide({"conversationId": "conv-vault-1", "toolCall": {"name": "read_file", "args": {"Path": "notes/facts.md"}}}, store)
    assert ok_rel["decision"] == "allow"
    assert ok_rel["overwrite"]["Path"].endswith(str(vault_root / "notes" / "facts.md"))

    sandbox_prefixed = "C:/fake/assistant/sandbox/notes/facts.md"
    ok_sbx = decide({"conversationId": "conv-vault-1", "toolCall": {"name": "read_file", "args": {"Path": sandbox_prefixed}}}, store)
    assert ok_sbx["decision"] == "allow"
    assert ok_sbx["overwrite"]["Path"].endswith(str(vault_root / "notes" / "facts.md"))

    # 2) .outline 파일은 마운트 없음이 아니라 전용 도구(ol_map/ol_read/ol_create) 안내로 거부
    deny_ol = decide(
        {"conversationId": "conv-vault-1", "toolCall": {"name": "read_file", "args": {"Path": "C:/fake/sandbox/docs/master.outline"}}},
        store,
    )
    assert deny_ol["decision"] == "deny"
    assert "ol_map" in deny_ol["reason"] and "마운트된 자료가 없다" not in deny_ol["reason"]

    # 3) ws_tree 도 마운트 없이 볼트 루트를 자동 탐색 (앱 문서 제외, 순수 리소스 표시)
    srv = VibefsServer(store.dir, session_id="ol-s1")
    tree_out = srv.call("ws_tree", {"depth": 3}, {"antigravity.google/conversation_id": "conv-vault-1"})
    assert "facts.md" in tree_out and "마운트된 파일이 없다" not in tree_out

    # 4) 볼트 루트도 마운트도 없는 Studio v1 세션은 기존대로 noMount 유지
    empty_store = WorkspaceStore(str(tmp_path / "empty_state"))
    deny_v1 = decide({"conversationId": "conv-v1", "toolCall": {"name": "read_file", "args": {"Path": "notes/facts.md"}}}, empty_store)
    assert deny_v1["decision"] == "deny" and "마운트된 자료가 없다" in deny_v1["reason"]
