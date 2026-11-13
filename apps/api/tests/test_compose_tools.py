"""문서 짓기(dc_*) · 사진 목록(ws_images) · 배치 측정 — 에이전트가 레퍼런스 배치로 새 글을 혼자 짓는 기본기."""
from __future__ import annotations

import copy
from typing import Any

import pytest
from docstruct_engine.compile.vdoc_build import make_block, sanitize_html
from harness_kit import patterns

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


def test_table_block_builds_grid_form_and_spans() -> None:
    """표 블록: 머리 행 · 라벨 열(서식 카드) · 병합 칸이 양식 가져오기와 같은 structured-table 모양으로."""
    block, slots = make_block("table", {"rows": [["구분", "번호", "명칭"], [{"text": "보안", "rowSpan": 2}, "SER-001", "통합인증"], ["SER-002", "송수신 정보"]]}, "t1")
    assert block["kind"] == "structured-table" and len(block["columnWidths"]) == 3
    head = block["rows"][0]["cells"]
    assert all(c.get("isHeader") for c in head)
    second, third = block["rows"][1]["cells"], block["rows"][2]["cells"]
    assert second[0]["rowSpan"] == 2 and len(second) == 3 and len(third) == 2  # 병합으로 찬 열은 비운다
    assert all(c["slotId"] in slots for r in block["rows"] for c in r["cells"])

    card, card_slots = make_block("table", {"fields": [["요구사항 고유번호", "ECR-001"], ["요구사항 명칭", "표준 준수"]], "widths": [1, 3]}, "t2")
    labels = [r["cells"][0] for r in card["rows"]]
    assert all(c.get("isHeader") and c.get("backgroundColor") for c in labels)
    assert not card["rows"][0]["cells"][1].get("isHeader")
    assert card["columnWidths"] == ["25.00%", "75.00%"]
    assert "ECR-001" in card_slots[card["rows"][0]["cells"][1]["slotId"]]["content"]

    with pytest.raises(ValueError):
        make_block("table", {"rows": []}, "t3")


def test_table_html_in_text_is_rejected_and_drops_are_reported() -> None:
    tools, api = _tools()
    tools.call("dc_new", {"title": "공고"})
    doc_id = tools.store.state["docId"]
    before = copy.deepcopy(api.docs[doc_id])
    with pytest.raises(ValueError, match="table"):
        tools.call("dc_build", {"ops": [{"op": "add", "kind": "text", "html": "<table><tr><td>사업명</td></tr></table>"}]})
    assert api.docs[doc_id] == before  # 표를 줄글로 납작하게 만들어 저장하지 않는다
    out = tools.call("dc_build", {"ops": [
        {"op": "add", "kind": "table", "fields": [["사업명", "문서 플랫폼 구축"], ["사업기간", "[확인 필요]"]]},
        {"op": "add", "kind": "text", "html": "<p>본문 <img src='x.png'> <font>글</font></p>"},
    ]})
    assert "TBL" in out or "structured-table" in out
    assert "img×1" in out and "font" not in out.split("정리됨")[-1]  # 지운 것은 보고하고, 무해한 껍데기는 조용히
    kinds = [b["kind"] for b in api.docs[doc_id]["pages"][0]["blocks"]]
    assert kinds == ["structured-table", "text"]


def test_paragraph_styles_are_assigned_from_markers_and_allow_listed() -> None:
    """개조식 기호(❏ ○ - ※ 가.)로 시작하는 문단은 레지스트리 규칙으로 스타일이 붙고, 모르는 스타일 id 는 지운다."""
    html = sanitize_html("<p>❏ 사업 개요<br>○ 추진 배경 정리<br>- 세부 근거 하나</p><p>※ 주석</p><p data-style=\"zzz\">일반</p>")
    assert '<p data-style="b1">❏ 사업 개요</p>' in html
    assert '<p data-style="b2">○ 추진 배경 정리</p>' in html
    assert '<p data-style="b3">- 세부 근거 하나</p>' in html
    assert '<p data-style="note">※ 주석</p>' in html
    assert 'data-style="zzz"' not in html
    plain = sanitize_html("가. 제안요청 개요\n❏ 사업명 : 문서 플랫폼\n○ 기간 : [확인 필요]")
    assert plain.count("<p") == 3 and 'data-style="sec"' in plain and 'data-style="b2"' in plain
    kept = sanitize_html('<p data-style="lead">요약</p>')
    assert 'data-style="lead"' in kept


def test_marker_scheme_measure_and_range_scoped_check(tmp_path: Any) -> None:
    m = patterns.measure(["<p>❏ 하나</p><p>❏ 둘</p><p>○ 셋</p><p>○ 넷</p><p>• 한 번</p>"])
    assert m["marker_scheme"] == ["box", "circle"]  # 한 번 쓴 기호는 체계가 아니다
    import json as _json
    ref_dir = tmp_path / "ref"
    ref_dir.mkdir()
    blocks = [{"id": f"b{i}", "page": p, "kind": "paragraph", "html": h, "text": h}
              for i, (p, h) in enumerate([(1, "<p>❏ 개요</p>"), (1, "<p>❏ 범위</p>"), (2, "<p>○ 근거</p>"), (2, "<p>○ 효과</p>"),
                                          (30, "<p>• 붙임</p>"), (30, "<p>• 서약</p>")])]
    (ref_dir / "extraction.json").write_text(_json.dumps({"blocks": blocks}), encoding="utf-8")
    (ref_dir / "layers.json").write_text(_json.dumps({"set": "document", "metrics": {"marker_scheme": ["dot"]}}), encoding="utf-8")
    scoped, set_name, scope, _ = DocTools._ref_metrics(str(ref_dir), "1-23")
    assert set_name == "document" and scope == "1-23쪽" and scoped["marker_scheme"] == ["box", "circle"]
    whole, _, _, _ = DocTools._ref_metrics(str(ref_dir), "")
    assert "dot" in whole["marker_scheme"]  # 범위가 없으면 전체 (붙임 서식까지)


def test_section_skeleton_diff_and_genre_items():
    from harness_kit import patterns as P

    ref = P.section_lines([
        ("Ⅰ. 사업 개요····························3", "list"),  # 목차 줄(점 리더)은 뼈대가 아니다
        ("Ⅰ 사업 개요", "paragraph"), ("가. 제안요청 개요", "list"), ("나. 추진배경 및 목적", "list"),
        ("Ⅱ 사업 추진 방안", "paragraph"), ("가. 추진 내용", "list"), ("나. 추진 체계", "list"),
        ("Ⅲ | ", "table"),  # 글자 없는 조각
    ])
    assert [s["path"] for s in ref] == ["Ⅰ", "Ⅰ/가", "Ⅰ/나", "Ⅱ", "Ⅱ/가", "Ⅱ/나"]
    assert [s["level"] for s in ref] == [1, 2, 2, 1, 2, 2]
    mine = P.section_lines([
        ("Ⅰ. 사업 개요", "heading"), ("**가. 제안요청 개요**\n❏ 사업명", "text"),
        ("Ⅱ. 사업 추진 방안", "heading"), ("가. 추진 내용 및 개발 방향", "text"), ("나. 예산 계획", "text"),
    ])
    d = P.skeleton_diff(ref, mine)
    assert [s["path"] for s in d["missing"]] == ["Ⅰ/나"]
    assert [(r["path"], m["title"]) for r, m in d["renamed"]] == [("Ⅱ/나", "예산 계획")]
    assert len(d["kept"]) == 4 and d["theirs_scheme"] == d["mine_scheme"] == ["roman", "hangul-dot"]

    g = P.genre_of("[입찰공고] 플랫폼 구축")
    assert g and g["id"] == "bid-notice" and P.genre_of("여행 블로그") is None
    rows = {r["id"]: r["present"] for r in P.genre_items(g, "입찰 참가자격: [확인 필요]\n문의처: 담당자")}
    assert rows["eligibility"] and rows["contact"] and not rows["documents"]


def test_block_kind_aliases_line_up_reference_and_document():
    from harness_kit import patterns as P

    ref = P.measure(["<p>a</p>"], ["paragraph", "list", "table", "heading"])
    doc = P.measure(["<p>a</p>"], ["text", "structured-table", "heading"])
    assert ref["block_kinds"] == doc["block_kinds"] == ["heading", "table", "text"]


def test_rf_skeleton_lists_numbered_section_tree_in_page_range():
    from vibefs.ref_tools import RefTools

    blocks = [
        {"page": 2, "kind": "list", "text": "가. 제안요청 개요··········3"},  # 목차
        {"page": 4, "kind": "paragraph", "text": "Ⅰ 사업 개요"},
        {"page": 4, "kind": "list", "text": "가. 제안요청 개요\n❏ 사업명 : 무엇\n※ 참고"},
        {"page": 5, "kind": "table", "text": "구분 | 내용"},
        {"page": 5, "kind": "list", "text": "나. 추진 체계\n◦ 역할"},
        {"page": 30, "kind": "paragraph", "text": "Ⅴ 붙임"},
    ]
    rows = RefTools._section_tree(blocks, "1-23")
    assert "1-23쪽" in rows[0] and "3개" in rows[0]
    assert rows[1].startswith("Ⅰ. 사업 개요") and "(p4)" in rows[1]
    assert rows[2].startswith("  가. 제안요청 개요") and "표 1" in rows[2] and "❏ ※" in rows[2]
    assert rows[3].startswith("  나. 추진 체계") and "◦" in rows[3]
    assert RefTools._section_tree([{"page": 1, "kind": "paragraph", "text": "그냥 글"}], "") == []


def test_marker_lists_become_styled_paragraphs():
    from docstruct_engine.compile.vdoc_build import assign_paragraph_styles

    out = assign_paragraph_styles('<ul><li>❏ 첫째<ul><li>◦ 세부</li><li>- 더 세부</li></ul></li><li>❏ 둘째</li></ul>')
    assert out == ('<p data-style="b1">❏ 첫째</p><p data-style="b2">◦ 세부</p>'
                   '<p data-style="b3">- 더 세부</p><p data-style="b1">❏ 둘째</p>')
    plain = '<ul><li>그냥 목록</li><li>둘째</li></ul>'
    assert assign_paragraph_styles(plain) == plain  # 기호 없는 목록은 목록 그대로


def test_marker_hint_names_missing_bullet_levels_with_glyphs():
    hint = DocTools._marker_hint({"marker_scheme": ["roman", "box", "circle", "dash", "note"]},
                                 {"marker_scheme": ["roman", "box", "circle"]})
    assert len(hint) == 1 and "❏ ○ - ※" in hint[0] and hint[0].count("Ⅰ") == 0
    assert DocTools._marker_hint({"marker_scheme": ["box"]}, {"marker_scheme": ["box", "dash"]}) == []


def test_provenance_rows_flag_values_missing_from_read_lines(tmp_path):
    import json as _json
    src = tmp_path / "note.md"
    src.write_text("예산 1.85억원\n기간 3개월로 잡는다\n", encoding="utf-8")
    ref_dir = tmp_path / "ref"
    ref_dir.mkdir()
    (ref_dir / "extraction.json").write_text(_json.dumps({"blocks": [{"text": "사업예산 65,000,000원 · 4개월"}]}), encoding="utf-8")
    tools, _ = _tools({"references": [{"refId": "r1", "dir": str(ref_dir)}]})
    tools._reads = lambda: [{"path": str(src), "start": 1, "end": 2}]
    other = tmp_path / "plan.md"
    other.write_text("# 일정\n착수 후 4개월 안에 끝낸다\n", encoding="utf-8")
    from types import SimpleNamespace
    tools.index = SimpleNamespace(text_files=lambda: [SimpleNamespace(rel="plan.md", text_lines=other.read_text(encoding="utf-8").splitlines())])
    rows = tools._provenance_rows("사업비 1.85억원 · 기간 3개월 · 착수 4개월 · 공고 제2026-11호", "r1")
    text = "\n".join(rows)
    assert "리소스 1개" in rows[0] and "1.85억원" not in "\n".join(rows[1:])
    assert "4개월 → plan.md:L2" in text  # 리소스에는 있는데 아직 안 읽음 → 그 줄
    assert "제2026-11호" in next(r for r in rows if "어느 리소스에도" in r)  # 어디에도 없음 → 빈칸
    assert "레퍼런스에서 온 값: 4개월" in text
    assert tools._provenance_rows("숫자 없는 글", "r1") == []


def test_set_rebuilds_table_in_place_and_refuses_empty_text() -> None:
    tools, api = _tools()
    tools.call("dc_new", {"title": "공고", "surface": "paged", "genre": "document"})
    doc_id = tools.store.state["docId"]
    tools.call("dc_build", {"ops": [
        {"op": "add", "kind": "heading", "text": "Ⅳ. 입찰 안내"},
        {"op": "add", "kind": "table", "fields": [["참가자격", "등록 업체"]], "as": "$t"},
        {"op": "add", "kind": "text", "text": "끝"},
    ]})
    blocks = api.docs[doc_id]["pages"][0]["blocks"]
    tid = blocks[1]["blockId"]
    out = tools.call("dc_build", {"ops": [{"op": "set", "block": tid, "kind": "table", "header": "col",
                                           "fields": [["참가자격", "등록 업체"], ["제출서류", "[확인 필요]"], ["문의처", "[확인 필요]"]]}]})
    doc = api.docs[doc_id]
    blocks = doc["pages"][0]["blocks"]
    assert [b["kind"] for b in blocks] == ["heading", "structured-table", "text"]  # 같은 자리
    assert blocks[1]["blockId"] == tid and len(blocks[1]["rows"]) == 3 and "다시 지음" in out
    cells = " ".join(str(doc["slots"][c["slotId"]]["content"]) for r in blocks[1]["rows"] for c in r["cells"])
    assert "제출서류" in cells and "문의처" in cells
    with pytest.raises(ValueError, match="글"):
        tools.call("dc_build", {"ops": [{"op": "set", "block": blocks[2]["blockId"]}]})


def test_provenance_absent_values_name_their_blocks(tmp_path):
    tools, _ = _tools({"references": []})
    tools._reads = lambda: []
    blocks = [{"blockId": "b_tbl_1", "text": "사업예산 | 350,000,000원"}, {"blockId": "b_tx_2", "text": "끝"}]
    rows = tools._provenance_rows("사업예산 | 350,000,000원\n끝", "", blocks)
    assert any("350,000,000원 (b_tbl_1)" in r for r in rows)


def test_heading_level_comes_from_section_number_when_not_given() -> None:
    from docstruct_engine.compile.vdoc_build import make_block

    lv = lambda text, **kw: make_block("heading", {"text": text, **kw}, "u")[0]["level"]  # noqa: E731
    assert lv("Ⅰ. 사업 개요") == 1 and lv("가. 제안요청 개요") == 2
    assert lv("목 차") == 2 and lv("가. 개요", level=3) == 3  # 번호 없으면 2, 준 단계는 그대로


def test_bullet_ratio_counts_marker_paragraphs_not_section_numbers() -> None:
    from harness_kit import patterns as P

    m = P.measure(["<p>가. 개요</p><p>❏ 하나</p><p>◦ 둘</p><p>그냥 문단</p>"])
    assert m["bullet_ratio"] == 0.5  # ❏ ◦ 는 글머리, 가. 는 절 번호(문단)
    assert P.measure(["<ul><li>하나</li><li>둘</li></ul>"])["bullet_ratio"] == 1.0
