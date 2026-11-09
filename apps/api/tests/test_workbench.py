"""작업대 원시 기능: 앵커 읽기 · 이력 · 패턴 측정 · 후보 제안 검증 · 서비스의 작업대 첨부 처리."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.assistant.workspace import patterns
from app.assistant.workspace.proposals import ProposalStore, leaked_fragments, propose
from app.assistant.workspace.service import ResourceWorkspace
from app.assistant.workspace.wb_tools import WB_TOOL_SPECS, WorkbenchTools
from app.assistant.workspace.workbench import Workbench, html_to_text

ORIG = "<p>핵심은 템플릿 우선 제공이다. 첫 문서 완성 시간은 기준선 47분이었다.</p>"


def _doc(root: Path, doc_id: str, slots: dict, pages: list, revisions: list | None = None) -> Path:
    folder = root / doc_id
    folder.mkdir(parents=True)
    path = folder / "document.vdoc.json"
    path.write_text(json.dumps({"docId": doc_id, "title": doc_id, "pages": pages, "slots": slots}, ensure_ascii=False), encoding="utf-8")
    if revisions:
        (folder / "revisions.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in revisions), encoding="utf-8")
    return path


def _ref(root: Path, ref_id: str, blocks: list, pins: list | None = None) -> Path:
    """레퍼런스 라이브러리 항목 (vdoc 이 아니다): ref.json · extraction.json · pins.json."""
    folder = root / ref_id
    folder.mkdir(parents=True)
    (folder / "ref.json").write_text(json.dumps({"refId": ref_id, "kind": "pdf", "title": ref_id, "pageCount": 1}), encoding="utf-8")
    (folder / "extraction.json").write_text(json.dumps({"version": 1, "kind": "pdf", "pages": [{"page": 1}], "blocks": blocks,
                                                        "outline": []}, ensure_ascii=False), encoding="utf-8")
    (folder / "pins.json").write_text(json.dumps(pins or [], ensure_ascii=False), encoding="utf-8")
    return folder


@pytest.fixture()
def bench(tmp_path: Path) -> tuple[Path, dict]:
    docs = tmp_path / "documents"
    slots = {
        "s_sum": {"slotId": "s_sum", "label": "요약", "content": "<p>지금 요약 <strong>a</strong> <strong>b</strong></p>", "originalContent": ORIG},
        "s_num": {"slotId": "s_num", "label": "지표", "content": "<p>평균 45분, 인원 10명이다.</p>", "constraints": {"maxChars": 40}},
        "s_lock": {"slotId": "s_lock", "label": "머리", "role": "boilerplate", "content": "<p>고정</p>"},
    }
    pages = [{"pageId": "p1", "pageLabel": "요약", "blocks": [{"blockId": "b1", "kind": "text", "slotId": "s_sum"},
                                                             {"blockId": "b2", "kind": "text", "slotId": "s_num"},
                                                             {"blockId": "b3", "kind": "text", "slotId": "s_lock"}]}]
    revs = [{"rev": 2, "at": "2025-04-01", "author": "ai", "slots": [{"slotId": "s_sum", "before": ORIG, "after": slots["s_sum"]["content"]}]}]
    _doc(docs, "doc1", slots, pages, revs)
    refs = tmp_path / "references"
    _ref(refs, "ref1", [{"id": "rb1", "page": 1, "kind": "paragraph", "bbox": [100, 100, 200, 900],
                         "text": "결론: 루미나랩스는 시장 1위가 된다. 고객사 37곳.",
                         "html": "<p><b>결론: 루미나랩스는 시장 1위가 된다.</b> 고객사 37곳.</p>"}],
         [{"pinId": "pin1", "refId": "ref1", "kind": "text", "label": "결론", "page": 1, "text": "결론 먼저", "layer": "D4"}])
    state = {"docId": "doc1", "docPath": str(docs / "doc1" / "document.vdoc.json"), "scope": {"mode": "document"},
             "references": [{"refId": "ref1", "dir": str(refs / "ref1"), "pinIds": None, "layers": {"D2": False}}]}
    return tmp_path, state


def _tools(tmp: Path, state: dict) -> WorkbenchTools:
    return WorkbenchTools(Workbench.from_state(state), proposals=ProposalStore(str(tmp / "st")), session_id="s1")


def test_html_to_text_keeps_structure() -> None:
    text = html_to_text("<h2>제목</h2><ul><li><strong>문제</strong> — 크다</li></ul><table><tr><td>a</td><td>b</td></tr></table>")
    assert "## 제목" in text and "- **문제** — 크다" in text and "a | b" in text


def test_anchors_read_doc_reference_pin_and_history(bench) -> None:
    tmp, state = bench
    t = _tools(tmp, state)
    assert "s_sum" in t.call("wb_outline", {}) and "고정" in t.call("wb_outline", {})
    assert "결론 먼저" in t.call("wb_read", {"anchor": "ref:ref1#pin:pin1"})
    assert "옮기지 않는다" in t.call("wb_read", {"anchor": "ref:ref1"})  # 레퍼런스 읽기엔 역할 경고가 붙는다
    assert "37곳" in t.call("wb_read", {"anchor": "ref:ref1#blk:rb1"})
    assert "ref:ref1#blk:rb1" in t.call("wb_outline", {"target": "ref:ref1"})
    assert "ref:ref1#blk:rb1" in t.call("wb_search", {"query": "루미나"})
    overview = t.call("wb_overview", {})
    assert "ref:ref1#pin:pin1 [D4]" in overview and "꺼 둔 층위: D2" in overview
    assert "47분" in t.call("wb_read", {"anchor": "orig:s_sum"})
    assert "rev:2" in t.call("wb_history", {"slotId": "s_sum"})
    assert "rev:2#slot:s_sum" in t.call("wb_search", {"query": "47분"})
    with pytest.raises(ValueError):
        t.call("wb_read", {"anchor": "slot:nope"})


def test_patterns_measure_by_registry_layers() -> None:
    m = patterns.measure(["<h2>1. 배경</h2><ul><li>표준화함.</li></ul><p>※ 붙임 참조</p><p>문서번호 AB-2025-01</p>"])
    assert m["meta_doc_no"] and m["meta_footnote"] and m["heading_sequence"] == ["1. 배경"]
    assert "개조식(~함·~임·~음)" in m["ending_style"]
    assert {"D1", "D6"} <= patterns.layer_ids("document") and "U7" in patterns.layer_ids("uiux")
    assert "D3 격식·메타 규격" in patterns.render(m)


def test_propose_restore_accepts_history_text(bench) -> None:
    tmp, state = bench
    out = _tools(tmp, state).call("wb_propose", {"target": "slot:s_sum", "mode": "restore",
                                                 "candidates": [{"sources": ["orig:s_sum"], "slots": {"s_sum": ORIG}}]})
    assert "검증 통과" in out


def test_propose_rejects_leaks_scope_lock_and_capacity(bench) -> None:
    tmp, state = bench
    out = _tools(tmp, state).call("wb_propose", {"target": "slot:s_sum", "candidates": [
        {"layers": ["ref1:D1"], "sources": ["slot:s_num"], "slots": {"s_sum": "<p>결론: 루미나랩스는 시장 1위가 된다. 고객사 37곳.</p>"}},
        {"layers": ["ref1:D4"], "slots": {"s_lock": "<p>x</p>"}},
    ]})
    assert "검증 실패" in out and "문장이 그대로" in out and "37곳" in out and "target" in out and "고정" in out


def test_propose_restyle_must_keep_numbers(bench) -> None:
    tmp, state = bench
    out = _tools(tmp, state).call("wb_propose", {"target": "slot:s_num", "mode": "restyle",
                                                 "candidates": [{"layers": ["ref1:D6"], "slots": {"s_num": "<ul><li>평균 시간 측정함.</li></ul>"}}]})
    assert "수치가 사라졌다" in out


def test_propose_flags_unsupported_numbers_and_respects_selection_scope(bench) -> None:
    tmp, state = bench
    state = {**state, "scope": {"mode": "selection", "slotIds": ["s_num"]}}
    proposal = propose(Workbench.from_state(state), {"target": "slot:s_sum", "candidates": [
        {"layers": ["ref1:D1"], "sources": ["slot:s_num"], "slots": {"s_sum": "<p>평균 52분이다.</p>"}}]}, [], ProposalStore(str(tmp / "st")), "s1")
    errors = " ".join(proposal["report"]["errors"])
    warnings = " ".join(proposal["report"]["warnings"])
    assert "범위" in errors and "52분" in warnings and proposal["status"] == "needs_fix"


def test_leaked_fragments_finds_long_copies_only() -> None:
    assert leaked_fragments("우리는 결론: 루미나랩스는 시장 1위가 된다 라고 썼다", "결론: 루미나랩스는 시장 1위가 된다.")
    assert not leaked_fragments("시장 1위", "결론: 루미나랩스는 시장 1위가 된다.")


def test_service_resolves_workbench_paths_and_rejects_outside_roots(tmp_path: Path, bench) -> None:
    root, _ = bench
    ws = ResourceWorkspace(state_dir=tmp_path / "state" / "assistant" / "workspace", sandbox_dir=tmp_path / "sb",
                           documents_root=root / "documents", references_root=root / "references")
    wb = ws.set_workbench("s1", json.dumps({"docId": "doc1", "scope": {"mode": "page", "pageIds": ["p1"]},
                                            "references": [{"refId": "ref1", "pinIds": ["nope"]}, {"refId": "missing"}]}))
    assert wb is not None and wb.doc is not None and wb.scope_slots() == {"s_sum", "s_num", "s_lock"}
    assert list(wb.refs) == ["ref1"] and wb.refs["ref1"].pins == []  # 고른 핀만 · 라이브러리에 없는 레퍼런스는 뺀다
    assert ws.store.workbench_for("s1")["docPath"].endswith("document.vdoc.json")
    off = ws.set_workbench("s2", json.dumps({"docId": "doc1", "scope": {"mode": "off"}}))
    assert off is not None and off.doc is None
    ws.set_workbench("s3", json.dumps({"docId": "doc1", "documentsRoot": "C:/Windows"}))  # state 밖은 받지 않는다
    assert ws.store.workbench_for("s3")["docPath"].replace("\\", "/").startswith(str(root / "documents").replace("\\", "/"))


def test_wb_tool_specs_are_listed_and_named_consistently() -> None:
    names = {s["name"] for s in WB_TOOL_SPECS}
    assert names == {"wb_overview", "wb_outline", "wb_read", "wb_search", "wb_history", "wb_patterns", "wb_compare", "wb_propose"}
