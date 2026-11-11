"""문서 짓기(dc_*) · 사진 목록(ws_images) · 배치 측정 — 에이전트가 레퍼런스 배치로 새 글을 혼자 짓는 기본기."""
from __future__ import annotations

import copy
from typing import Any

import pytest
from harness_kit import patterns
from harness_kit.vdoc_build import make_block, sanitize_html

from app.reference.adapters import layout_to_extraction
from vibefs.doc_tools import DocTools


class FakeApi:
    """문서 API 대역 — POST /api/documents · GET · PUT 만."""

    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}

    def call(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        if method == "POST" and path == "/api/documents":
            from app.documents.models import blank_document

            doc_id = f"vdoc-test{len(self.docs) + 1}"
            doc = blank_document(doc_id, body["title"], surface=body["surface"], genre=body["genre"],
                                 origin={"createdBy": body["createdBy"]}, project_id=body["projectId"])
            self.docs[doc_id] = doc
            return {"docId": doc_id, "document": copy.deepcopy(doc)}
        doc_id = path.rsplit("/", 1)[-1]
        if method == "GET":
            return {"docId": doc_id, "document": copy.deepcopy(self.docs[doc_id])}
        if method == "PUT":
            doc = copy.deepcopy(body["document"])
            doc["revision"] = int(doc.get("revision") or 0) + 1
            self.docs[doc_id] = doc
            return {"docId": doc_id, "document": copy.deepcopy(doc)}
        raise AssertionError((method, path))


class FakeStore:
    def __init__(self, state: dict[str, Any]) -> None:
        self.state = state

    def workbench_for(self, _session: str) -> dict[str, Any]:
        return self.state

    def set_workbench(self, _session: str, state: dict[str, Any]) -> None:
        self.state = state


class FakeIndex:
    class _E:
        def __init__(self, path: str, rid: str) -> None:
            self.abs_path, self.resource_id, self.rel = path, rid, path

    def __init__(self, files: list[tuple[str, str]]) -> None:
        self.files = [self._E(p, r) for p, r in files]


def _tools(state: dict[str, Any] | None = None) -> tuple[DocTools, FakeApi]:
    api = FakeApi()
    store = FakeStore(state or {"projectId": "proj-a", "references": []})
    index = FakeIndex([("a/shot1.png", "file_1"), ("a/shot2.png", "file_2"), ("a/shot3.png", "file_3")])
    return DocTools(store, "s1", index=index, api=api), api  # type: ignore[arg-type]


def test_new_then_build_section_and_check() -> None:
    tools, api = _tools()
    out = tools.call("dc_new", {"title": "회고", "surface": "scroll", "genre": "blog"})
    doc_id = tools.store.state["docId"]
    assert doc_id in out and api.docs[doc_id]["surface"]["kind"] == "scroll"
    built = tools.call("dc_build", {"ops": [
        {"op": "add", "kind": "heading", "text": "가장 어려웠던 결정은?", "decoration": "bar", "as": "$h"},
        {"op": "add", "kind": "gallery", "images": ["resource:file_1", "resource:file_2"]},
        {"op": "add", "kind": "text", "html": "<p>핵심 <span style=\"background-color:#fff3a3\">구절</span> <script>x</script></p>"},
        {"op": "add", "kind": "link-card", "title": "결정 카드", "url": "vdoc:resource/file_9", "thumbnail": "resource:file_3"},
        {"op": "props", "block": "$h", "text": "가장 결정적이었던 피벗은?"},
    ]})
    assert "G2" in built and "LINK" in built
    doc = api.docs[doc_id]
    kinds = [b["kind"] for b in doc["pages"][0]["blocks"]]
    assert kinds == ["heading", "columns-grid", "text", "link-card"]
    text_slot = doc["slots"][doc["pages"][0]["blocks"][2]["slotId"]]["content"]
    assert "background-color" in text_slot and "script" not in text_slot and "x</p>" not in text_slot
    head_slot = doc["slots"][doc["pages"][0]["blocks"][0]["slotId"]]["content"]
    assert "피벗은?" in head_slot
    check = tools.call("dc_check", {})
    assert "빈 칸" not in check


def test_build_rejects_foreign_photos_and_human_documents_atomically() -> None:
    tools, api = _tools()
    tools.call("dc_new", {"title": "글"})
    doc_id = tools.store.state["docId"]
    before = copy.deepcopy(api.docs[doc_id])
    with pytest.raises(ValueError, match="1번|2번"):
        tools.call("dc_build", {"ops": [
            {"op": "add", "kind": "heading", "text": "제목"},
            {"op": "add", "kind": "image", "src": "https://ref-blog.example/photo.jpg"},
        ]})
    assert api.docs[doc_id] == before  # 하나라도 실패하면 아무것도 저장하지 않는다
    with pytest.raises(ValueError):
        tools.call("dc_build", {"ops": [{"op": "add", "kind": "image", "src": "resource:file_unknown"}]})
    api.docs[doc_id]["origin"] = {"createdBy": "user"}
    with pytest.raises(ValueError):
        tools.call("dc_build", {"ops": [{"op": "add", "kind": "divider"}]})


def test_sanitize_and_block_factory_follow_schema_shapes() -> None:
    assert sanitize_html("첫 줄\n\n둘째 줄") == "<p>첫 줄</p><p>둘째 줄</p>"
    assert "onclick" not in sanitize_html('<p onclick="x()">a</p>')
    block, slots = make_block("gallery", {"images": ["resource:a", "resource:b", "resource:c"]}, "u1")
    assert block["kind"] == "columns-grid" and len(block["columns"]) == 3 and not slots
    with pytest.raises(ValueError):
        make_block("gallery", {"images": ["resource:a"]}, "u2")
    with pytest.raises(ValueError):
        make_block("video", {}, "u3")


def test_layout_extraction_and_layout_metrics_see_the_rhythm() -> None:
    layout = {"title": "여행", "slots": {
        "h1": {"label": "", "content": "<p>가장 좋았던 곳은?</p>"},
        "t1": {"label": "본문", "content": "<p>글 <span style=\"background-color:#ff0\">강조</span></p>"},
        "l1": {"label": "링크 카드", "content": "<p><strong>후기</strong></p>"},
        "h2": {"label": "", "content": "<p>가장 맛있던 음식은?</p>"},
        "t2": {"label": "본문", "content": "<p>글</p>"},
    }, "pages": [{"blocks": [
        {"kind": "heading", "slotId": "h1"},
        {"kind": "columns-grid", "widths": ["1fr", "1fr"], "columns": [{"image": {"src": "x"}}, {"image": {"src": "y"}}]},
        {"kind": "text", "slotId": "t1"},
        {"kind": "link-card", "slotId": "l1", "url": "u", "thumbnail": "t"},
        {"kind": "heading", "slotId": "h2"},
        {"kind": "image", "src": "z", "width": "698px"},
        {"kind": "text", "slotId": "t2"},
        {"kind": "image", "src": "s", "width": "80px"},
    ]}]}
    ex = layout_to_extraction(layout)
    assert [b["kind"] for b in ex["blocks"]] == ["heading", "gallery", "paragraph", "link-card", "heading", "image", "paragraph", "image"]
    m = patterns.measure_layout(ex["blocks"])
    assert m["sections"] == 2 and m["photos"] == 3 and m["stickers"] == 1
    assert m["photo_first_ratio"] == 1.0 and m["link_end_ratio"] == 0.5 and m["question_headings"] == 1.0
    assert m["link_thumb_ratio"] == 1.0 and m["highlight_per_para"] == 0.5


def test_dc_use_switches_target_and_allows_building_in_empty_user_doc() -> None:
    tools, api = _tools()
    blank_id = "vdoc-blank-user-1"
    filled_id = "vdoc-filled-user-2"
    api.docs[blank_id] = {
        "docId": blank_id,
        "title": "타이난 여행(가제목)",
        "projectId": "p1",
        "revision": 1,
        "surface": {"kind": "paged"},
        "origin": {"createdBy": "user"},
        "pages": [{"pageId": "p1", "pageLabel": "Page 1", "blocks": []}],
        "slots": {},
    }
    api.docs[filled_id] = {
        "docId": filled_id,
        "title": "기존 채워진 문서",
        "projectId": "p1",
        "revision": 1,
        "surface": {"kind": "paged"},
        "origin": {"createdBy": "user"},
        "pages": [{"pageId": "p1", "pageLabel": "Page 1", "blocks": [{"blockId": "b1", "kind": "text", "slotId": "s1"}]}],
        "slots": {"s1": {"content": "<p>이미 작성된 글</p>"}},
    }
    tools.store.state["projectDocs"] = [
        {"docId": blank_id, "title": "타이난 여행(가제목)", "surface": "paged", "pages": 1, "blocks": 0},
        {"docId": filled_id, "title": "기존 채워진 문서", "surface": "paged", "pages": 1, "blocks": 1},
    ]

    # 1) 제목으로 작업 문서를 지정해 전환하면 빈 문서는 곧바로 dc_build 로 지을 수 있다
    selected = tools.call("dc_use", {"doc": "타이난 여행(가제목)"})
    assert f"docId={blank_id}" in selected
    assert tools.store.state["docId"] == blank_id

    saved = tools.call("dc_build", {"ops": [
        {"op": "add", "kind": "heading", "text": "첫 섹션"},
        {"op": "add", "kind": "image", "src": "resource:file_1"},
    ]})
    assert f"docId={blank_id}" in saved
    assert api.docs[blank_id]["origin"].get("agentComposed") is True
    assert len(api.docs[blank_id]["pages"][0]["blocks"]) == 2

    # 2) 이미 블록이 채워진 사람 문서는 dc_use 로 전환해도 dc_build 구조 덮어쓰기는 여전히 거부한다
    switched = tools.call("dc_use", {"doc": filled_id})
    assert f"docId={filled_id}" in switched
    with pytest.raises(ValueError):
        tools.call("dc_build", {"ops": [{"op": "add", "kind": "divider"}]})
