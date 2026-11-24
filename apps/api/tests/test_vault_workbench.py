"""playground v2 볼트 모드 — 작업대 문서 · 에이전트 초안이 볼트 파일이다 (docs/specs/v2-composer-port-testcases.md §3.1).

studio(`/api/documents` · docId)와 같은 도구가, 작업대에 `vaultId` 가 있으면 볼트 파일(`/api/vaults/{id}/file`)로
읽고 쓴다. 사람 문서 구조는 여전히 바꾸지 않는다.
"""
from __future__ import annotations

import copy
import json
import urllib.parse
from pathlib import Path
from typing import Any

from app.assistant.workspace import ResourceWorkspace
from app.documents.models import blank_document
from vibefs.doc_tools import DocTools
from vibefs.workbench import Workbench


def _human_doc(doc_id: str = "vdoc-human", title: str = "시스템 제안서") -> dict[str, Any]:
    doc = blank_document(doc_id, title, surface="paged", genre="document", origin={"createdBy": "user"})
    page = doc["pages"][0]
    page["blocks"] = [{"blockId": "b1", "kind": "text", "title": "개요", "slotId": "s_intro"}]
    doc["slots"] = {"s_intro": {"slotId": "s_intro", "label": "개요", "role": "body", "content": "<p>초안</p>", "backDataRefs": []}}
    return doc


class FakeVaultApi:
    """볼트 API 대역 — GET · PUT · POST `/api/vaults/{id}/file`. 같은 경로 POST 는 409."""

    def __init__(self, vault_id: str, files: dict[str, str]) -> None:
        self.vault_id = vault_id
        self.files = dict(files)
        self.calls: list[tuple[str, str]] = []

    def call(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        self.calls.append((method, path))
        base, _, query = path.partition("?")
        assert base == f"/api/vaults/{self.vault_id}/file", path
        if method == "GET":
            rel = urllib.parse.parse_qs(query)["path"][0]
            if rel not in self.files:
                raise ValueError("문서 API 오류 404: not found")
            return {"node": {"path": rel}, "content": self.files[rel]}
        if method == "PUT":
            self.files[body["path"]] = body["content"]
            return {"path": body["path"]}
        if method == "POST":
            if body["path"] in self.files:
                raise ValueError("문서 API 오류 409: exists")
            self.files[body["path"]] = body["content"]
            return {"path": body["path"]}
        raise AssertionError((method, path))

    def doc(self, rel: str) -> dict[str, Any]:
        return json.loads(self.files[rel])


class FakeStore:
    def __init__(self, state: dict[str, Any]) -> None:
        self.state = state

    def workbench_for(self, _session: str) -> dict[str, Any]:
        return self.state

    def set_workbench(self, _session: str, state: dict[str, Any]) -> None:
        self.state = state


def _vault_state(**extra: Any) -> dict[str, Any]:
    return {
        "vaultId": "v1",
        "vaultRoot": "C:/vault",
        "docId": "vdoc-human",
        "docVaultPath": "01. Architecture/00. 제안서.vdoc",
        "projectDocs": [
            {"docId": "vdoc-human", "title": "시스템 제안서", "vaultPath": "01. Architecture/00. 제안서.vdoc"},
            {"docId": "vdoc-empty", "title": "빈 공고서", "vaultPath": "01. Architecture/빈 공고서.vdoc"},
        ],
        "scope": {"mode": "document"},
        "references": [],
        **extra,
    }


def _tools(state: dict[str, Any] | None = None) -> tuple[DocTools, FakeVaultApi]:
    empty = blank_document("vdoc-empty", "빈 공고서", surface="paged", genre="document", origin={"createdBy": "user"})
    api = FakeVaultApi("v1", {
        "01. Architecture/00. 제안서.vdoc": json.dumps(_human_doc(), ensure_ascii=False),
        "01. Architecture/빈 공고서.vdoc": json.dumps(empty, ensure_ascii=False),
    })
    return DocTools(FakeStore(state or _vault_state()), "s1", api=api), api  # type: ignore[arg-type]


# --- UB1 · UB2: 작업대가 볼트 경로를 푼다 -------------------------------------------------------------

def _workspace(tmp_path: Path, vault_root: Path) -> ResourceWorkspace:
    return ResourceWorkspace(state_dir=tmp_path / "state" / "assistant" / "workspace", sandbox_dir=tmp_path / "sandbox",
                             vault_roots=lambda vid: str(vault_root) if vid == "v1" else None)


def test_set_workbench_resolves_vault_doc_path_and_overview_reads_it(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    (root / "01. Architecture").mkdir(parents=True)
    (root / "01. Architecture" / "00. 제안서.vdoc").write_text(json.dumps(_human_doc(), ensure_ascii=False), encoding="utf-8")
    ws = _workspace(tmp_path, root)
    wb = ws.set_workbench("s1", json.dumps({
        "vaultId": "v1", "docId": "vdoc-human", "docVaultPath": "01. Architecture/00. 제안서.vdoc",
        "projectDocs": [{"docId": "vdoc-human", "title": "시스템 제안서", "vaultPath": "01. Architecture\\00. 제안서.vdoc"}],
        "scope": {"mode": "document"}, "references": [],
    }, ensure_ascii=False))
    assert wb is not None and wb.doc is not None
    state = ws.store.workbench_for("s1")
    assert Path(state["docPath"]) == (root / "01. Architecture" / "00. 제안서.vdoc").resolve()
    assert state["vaultId"] == "v1" and state["documentsRoot"] is None
    assert state["projectDocs"][0]["vaultPath"] == "01. Architecture/00. 제안서.vdoc"
    overview = wb.overview()
    assert "시스템 제안서" in overview
    text, _ = wb.read("slot:s_intro")
    assert "초안" in text


def test_set_workbench_rejects_paths_outside_the_vault(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    root.mkdir()
    secret = tmp_path / "secret.vdoc"
    secret.write_text(json.dumps(_human_doc(), ensure_ascii=False), encoding="utf-8")
    ws = _workspace(tmp_path, root)
    for bad in ("../secret.vdoc", str(secret), "C:/secret.vdoc", "a/../../secret.vdoc"):
        ws.set_workbench("s1", json.dumps({"vaultId": "v1", "docId": "x", "docVaultPath": bad, "scope": {"mode": "document"},
                                           "projectDocs": [{"docId": "x", "vaultPath": bad}]}))
        state = ws.store.workbench_for("s1")
        assert state["docPath"] is None, bad
        assert state["projectDocs"] == [], bad


def test_unknown_vault_falls_back_to_studio_documents(tmp_path: Path) -> None:
    docs = tmp_path / "documents"
    (docs / "vdoc-a").mkdir(parents=True)
    (docs / "vdoc-a" / "document.vdoc.json").write_text(json.dumps(_human_doc("vdoc-a")), encoding="utf-8")
    ws = ResourceWorkspace(state_dir=tmp_path / "state" / "assistant" / "workspace", sandbox_dir=tmp_path / "sandbox",
                           documents_root=docs, vault_roots=lambda vid: None)
    ws.set_workbench("s1", json.dumps({"vaultId": "nope", "docId": "vdoc-a", "scope": {"mode": "document"}}))
    state = ws.store.workbench_for("s1")
    assert "vaultId" not in state
    assert state["docPath"] and state["docPath"].endswith("document.vdoc.json")


# --- UB3 · UB4: 에이전트 초안 = 볼트 파일 -----------------------------------------------------------------

def test_dc_new_creates_agent_draft_file_next_to_active_doc_and_build_writes_it() -> None:
    tools, api = _tools()
    out = tools.call("dc_new", {"title": "입찰 공고서", "surface": "paged", "genre": "bid-notice"})
    rel = "01. Architecture/입찰 공고서.vdoc"
    assert rel in api.files and f"vault://{rel}" in out
    draft = api.doc(rel)
    assert draft["origin"]["createdBy"] == "agent" and draft["surface"]["kind"] == "paged"
    state = tools.store.state
    assert state["docId"] == draft["docId"] and state["docVaultPath"] == rel
    assert any(d.get("vaultPath") == rel for d in state["projectDocs"])
    assert not any(m == "POST" and p == "/api/documents" for m, p in api.calls)

    tools.call("dc_build", {"ops": [
        {"op": "add", "kind": "heading", "text": "Ⅰ. 공고 개요"},
        {"op": "add", "kind": "text", "html": "<p>사업명: [확인 필요]</p>"},
    ]})
    built = api.doc(rel)
    assert [b["kind"] for b in built["pages"][0]["blocks"]] == ["heading", "text"]
    assert built["revision"] == draft["revision"] + 1
    assert tools.call("dc_outline", {}).count("공고 개요") >= 1


def test_dc_new_numbers_the_file_when_name_is_taken() -> None:
    tools, api = _tools()
    tools.call("dc_new", {"title": "빈 공고서", "surface": "paged"})
    assert "01. Architecture/빈 공고서 (2).vdoc" in api.files


def test_dc_new_without_active_doc_goes_to_ai_drafts_folder() -> None:
    tools, api = _tools(_vault_state(docId=None, docVaultPath=None))
    tools.call("dc_new", {"title": "블로그 글"})
    assert "AI Drafts/블로그 글.vdoc" in api.files


# --- UB5: 사람 문서 구조는 그대로 ----------------------------------------------------------------------

def test_dc_build_refuses_human_document_and_leaves_file_untouched() -> None:
    tools, api = _tools()
    before = api.files["01. Architecture/00. 제안서.vdoc"]
    try:
        tools.call("dc_build", {"ops": [{"op": "add", "kind": "text", "html": "<p>몰래 추가</p>"}]})
    except ValueError:
        pass
    else:
        raise AssertionError("사람 문서 구조 조작이 통과했다")
    assert api.files["01. Architecture/00. 제안서.vdoc"] == before
    assert not any(m == "PUT" for m, _ in api.calls)


# --- UB6 · UB7: 문서 전환 · 읽기 ------------------------------------------------------------------------

def test_dc_use_by_title_or_file_name_switches_to_vault_doc_and_allows_building_empty_one() -> None:
    for target in ("빈 공고서", "빈 공고서.vdoc", "01. Architecture/빈 공고서.vdoc", "vdoc-empty"):
        tools, api = _tools()
        out = tools.call("dc_use", {"doc": target})
        state = tools.store.state
        assert state["docId"] == "vdoc-empty" and state["docVaultPath"] == "01. Architecture/빈 공고서.vdoc", target
        assert "vault://01. Architecture/빈 공고서.vdoc" in out
    tools.call("dc_build", {"ops": [{"op": "add", "kind": "heading", "text": "공고"}]})
    assert api.doc("01. Architecture/빈 공고서.vdoc")["pages"][0]["blocks"][0]["kind"] == "heading"


def test_dc_use_unknown_doc_is_reported() -> None:
    tools, _ = _tools()
    try:
        tools.call("dc_use", {"doc": "없는 문서"})
    except ValueError as exc:
        assert "없는 문서" in str(exc)
    else:
        raise AssertionError("없는 문서가 통과했다")


def test_dc_outline_reads_active_vault_doc() -> None:
    tools, _ = _tools()
    out = tools.call("dc_outline", {})
    assert "시스템 제안서" in out and "b1 text" in out and "초안" in out


def test_workbench_from_state_reads_vault_doc_without_revisions(tmp_path: Path) -> None:
    path = tmp_path / "a.vdoc"
    path.write_text(json.dumps(_human_doc(), ensure_ascii=False), encoding="utf-8")
    wb = Workbench.from_state({"docId": "vdoc-human", "docPath": str(path), "scope": {"mode": "document"}})
    assert wb.doc is not None and wb.revisions == []
    assert wb.scope_slots() is None


# --- UB9: 볼트 폴더를 리소스로 걸어도 앱 문서는 사실 근거가 아니다 ---------------------------------------------

def test_mounted_vault_folder_hides_app_documents_from_index_and_reads(tmp_path: Path) -> None:
    from vibefs.hook import decide
    from vibefs.index import MountItem, WorkspaceIndex
    from vibefs.store import WorkspaceStore

    folder = tmp_path / "vault" / "01. Architecture"
    folder.mkdir(parents=True)
    (folder / "회의록.md").write_text("# 회의\n결정: 2D 우선", encoding="utf-8")
    for name in ("00. 제안서.vdoc", "00. 제안서.outline", "참고.ref", "표.vasset", "스타일.vstyle"):
        (folder / name).write_text("{}", encoding="utf-8")
    items = [MountItem(str(folder), "vault:01", "01. Architecture", kind="dir")]
    index = WorkspaceIndex.build(items)
    assert sorted(e.abs_path.rsplit("\\", 1)[-1].rsplit("/", 1)[-1] for e in index.files) == ["회의록.md"]

    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_mount("asst-1", items, "conv-1")
    read = lambda p: decide({"toolCall": {"name": "read_file", "args": {"Path": p}}, "conversationId": "conv-1"}, store)  # noqa: E731
    assert read(str(folder / "회의록.md"))["decision"] == "allow"
    denied = read(str(folder / "00. 제안서.vdoc"))
    assert denied["decision"] == "deny" and "앱 문서" in denied["reason"]
    assert read("01. Architecture/00. 제안서.outline")["decision"] == "deny"


# --- UB8: studio 경로는 그대로 ---------------------------------------------------------------------------

def test_studio_mode_still_uses_documents_api() -> None:
    from tests.test_compose_tools import FakeApi, FakeStore as StudioStore

    api = FakeApi()
    tools = DocTools(StudioStore({"projectId": "proj-a", "references": []}), "s1", api=api)  # type: ignore[arg-type]
    tools.call("dc_new", {"title": "회고"})
    doc_id = tools.store.state["docId"]
    assert doc_id in api.docs and "vaultId" not in tools.store.state
    assert copy.deepcopy(api.docs[doc_id])["origin"]["createdBy"] == "agent"


# --- 인용 검증: 줄 범위 없는 읽기는 agy 가 보여 준 창만큼 읽은 것이다 (화면 실행 L2 에서 찾은 오탐) -----------------

def test_whole_file_read_without_range_covers_cited_lines() -> None:
    from app.assistant.workspace.citations import Citation, verify_citations

    reads = [{"path": r"C:\vault\03. Harness\vault.config.json", "start": None, "end": None, "ok": True}]
    verified, warnings = verify_citations([Citation(target="vault.config.json", start_line=1, end_line=7)], reads)
    assert warnings == [] and verified[0].is_verified
    # 범위를 준 읽기는 그 범위만 — 밖의 줄은 여전히 경고
    _, warned = verify_citations([Citation(target="vault.config.json", start_line=40, end_line=45)],
                                 [{"path": "C:/vault/vault.config.json", "start": 1, "end": 10, "ok": True}])
    assert warned


def test_dc_new_folder_argument_places_draft_in_chosen_vault_folder() -> None:
    tools, api = _tools()
    out = tools.call("dc_new", {"title": "도쿄 여행", "folder": "여행/도쿄/글"})
    assert "여행/도쿄/글/도쿄 여행.vdoc" in api.files and "vault://여행/도쿄/글/도쿄 여행.vdoc" in out
    for bad in ("../밖", "C:/x"):
        try:
            tools.call("dc_new", {"title": "x", "folder": bad})
        except ValueError:
            continue
        raise AssertionError(f"볼트 밖 폴더가 통과했다: {bad}")
