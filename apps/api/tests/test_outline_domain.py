"""outline 독립 도메인 계약: 무제한 계층 WorkingOutline · reparent/turn_into · Compile Preview · Commit."""
from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
PROJECT = "vproj-enterprise-architecture-suite"


def test_working_outline_unlimited_depth_reparent_compile_and_commit() -> None:
    res = client.get(f"/api/projects/{PROJECT}/working-outline")
    assert res.status_code == 200, res.text
    outline = res.json()
    assert outline["projectId"] == PROJECT
    assert outline["dirty"] is False
    assert len(outline["nodes"]) >= 1

    doc_node = outline["nodes"][0]
    page_node = doc_node["children"][0]

    # 1. Insert deep hierarchy (depth 4+: page -> callout -> nested -> nested2) + table
    batch = client.post(
        f"/api/projects/{PROJECT}/working-outline/commands",
        json={
            "commands": [
                {
                    "type": "insert",
                    "nodeId": "wo-callout-1",
                    "parentId": page_node["nodeId"],
                    "text": "핵심 유의사항",
                    "elementKind": "callout-box",
                },
                {
                    "type": "insert",
                    "nodeId": "wo-deep-1",
                    "parentId": "wo-callout-1",
                    "text": "깊이 4 세부 규칙",
                    "elementKind": "text",
                },
                {
                    "type": "insert",
                    "nodeId": "wo-deep-2",
                    "parentId": "wo-deep-1",
                    "text": "깊이 5 세부 체크",
                    "elementKind": "text",
                },
                {
                    "type": "insert",
                    "nodeId": "wo-tbl-1",
                    "parentId": page_node["nodeId"],
                    "text": "신규 일정표",
                    "elementKind": "structured-table",
                },
                {
                    "type": "insert",
                    "nodeId": "wo-row-1",
                    "parentId": "wo-tbl-1",
                    "text": "1행",
                },
            ]
        },
    )
    assert batch.status_code == 200, batch.text
    after = batch.json()["outline"]
    assert after["dirty"] is True

    # 2. Reparent deep-2 into table-row -> automatically becomes table-cell; then move back to page -> becomes text
    rep1 = client.post(
        f"/api/projects/{PROJECT}/working-outline/commands",
        json={"commands": [{"type": "reparent", "nodeId": "wo-deep-2", "targetParentId": "wo-row-1"}]},
    )
    assert rep1.status_code == 200, rep1.text
    preview = client.post(f"/api/projects/{PROJECT}/working-outline/compile-preview", json={})
    assert preview.status_code == 200, preview.text
    assert preview.json()["dirty"] is True
    assert len(preview.json()["documents"]) >= 1

    # Detach back out to page root -> turns back into text and compiles standalone block
    rep2 = client.post(
        f"/api/projects/{PROJECT}/working-outline/commands",
        json={"commands": [{"type": "reparent", "nodeId": "wo-deep-2", "targetParentId": page_node["nodeId"]}]},
    )
    assert rep2.status_code == 200, rep2.text

    # 3. Turn-into callout -> hero
    ti = client.post(
        f"/api/projects/{PROJECT}/working-outline/commands",
        json={"commands": [{"type": "turn_into", "nodeId": "wo-callout-1", "elementKind": "hero"}]},
    )
    assert ti.status_code == 200, ti.text

    # 4. Commit -> clears dirty & aligns sourceRef to saved .vdoc
    commit = client.post(f"/api/projects/{PROJECT}/working-outline/commit", json={})
    assert commit.status_code == 200, commit.text
    committed = commit.json()
    assert committed["outline"]["dirty"] is False
    assert len(committed["documents"]) >= 1


def test_plain_text_unescapes_html5_entities_and_skips_scripts() -> None:
    from app.outline.mappers import _plain_text

    html_sample = (
        "<p>망고독 R&amp;D &nbsp; &#39;A&#x26;B&#39; &lt;tag&gt;</p>"
        "<script>alert(1)</script><style>.x{}</style>"
        "<p>반&nbsp;&nbsp;상&nbsp;회</p>"
    )
    assert _plain_text(html_sample) == "망고독 R&D 'A&B' <tag> 반 상 회"


def test_all_block_kinds_preserve_structure_across_extract_and_compile() -> None:
    from app.outline.mappers import (
        compile_preview_docs,
        extract_working_outline_from_docs,
    )

    doc = {
        "version": "1.0.0",
        "docId": "vdoc_all_blocks",
        "title": "전종 블록 검증",
        "status": "Draft",
        "revision": 1,
        "pages": [
            {
                "pageId": "p1",
                "pageNumber": 1,
                "pageLabel": "종합",
                "headerSlotId": "s_hdr",
                "footerSlotId": "s_ftr",
                "blocks": [
                    {
                        "blockId": "b_frame",
                        "kind": "composite-form-frame",
                        "title": "6구역 프레임",
                        "sections": [
                            {
                                "sectionId": "sec_1",
                                "title": "1구역 · 기본",
                                "rows": [
                                    {"rowId": "r1", "cells": [{"cellId": "c1", "slotId": "s_c1", "colSpan": 2}]},
                                ],
                            },
                        ],
                    },
                    {
                        "blockId": "b_grid_img",
                        "kind": "columns-grid",
                        "title": "사진 묶음",
                        "widths": ["1fr", "1fr"],
                        "columns": [
                            {"image": {"src": "data:image/png;base64,AAA", "alt": "사진1"}},
                            {"slotId": "s_col2"},
                        ],
                    },
                    {
                        "blockId": "b_grid_ids",
                        "kind": "columns-grid",
                        "title": "2단 슬롯",
                        "widths": ["1fr", "1fr"],
                        "slotIds": ["s_g1", "s_g2"],
                    },
                    {
                        "blockId": "b_sec",
                        "kind": "section-block",
                        "title": "텍스트 섹션",
                        "headingSlotId": "s_sh",
                        "bodySlotId": "s_sb",
                    },
                    {
                        "blockId": "b_hero",
                        "kind": "hero",
                        "title": "히어로",
                        "titleSlotId": "s_ht",
                        "subtitleSlotId": "s_hs",
                        "image": "data:image/png;base64,BBB",
                    },
                    {
                        "blockId": "b_cover",
                        "kind": "cover-banner",
                        "title": "표지",
                        "backgroundTheme": "dark-architecture",
                        "headlineSlotId": "s_ch",
                        "preparedBySlotId": "s_cb",
                        "preparedForSlotId": "s_cf",
                    },
                    {
                        "blockId": "b_sum",
                        "kind": "summary-list",
                        "title": "핵심 요약",
                        "items": [
                            {"itemId": "i1", "labelSlotId": "s_sl1", "valueSlotId": "s_sv1"},
                        ],
                    },
                    {
                        "blockId": "b_tbl",
                        "kind": "structured-table",
                        "title": "인보이스 표",
                        "columnWidths": ["50%", "50%"],
                        "rows": [
                            {"rowId": "tr1", "cells": [{"cellId": "tc1", "slotId": "s_t1"}, {"cellId": "tc2", "slotId": "s_t2"}]},
                        ],
                        "footerSummary": {"items": [{"itemId": "f1", "slotId": "s_tf"}]},
                    },
                    {"blockId": "b_img", "kind": "image", "title": "도표", "src": "data:image/png;base64,CCC", "alt": "도표", "width": "480px"},
                    {"blockId": "b_div", "kind": "divider", "title": "구분선", "variant": "short", "spacing": 24},
                    {"blockId": "b_spc", "kind": "spacer", "title": "여백", "height": 32},
                ],
            }
        ],
        "slots": {
            "s_hdr": {"slotId": "s_hdr", "label": "머리말", "role": "editable-slot", "content": "<p>머리</p>"},
            "s_ftr": {"slotId": "s_ftr", "label": "바닥글", "role": "editable-slot", "content": "<p>바닥</p>"},
            "s_c1": {"slotId": "s_c1", "label": "일시", "role": "editable-slot", "content": "<p>2026-10-27</p>"},
            "s_col2": {"slotId": "s_col2", "label": "설명", "role": "editable-slot", "content": "<p>우측 설명</p>"},
            "s_g1": {"slotId": "s_g1", "label": "1단", "role": "editable-slot", "content": "<p>좌</p>"},
            "s_g2": {"slotId": "s_g2", "label": "2단", "role": "editable-slot", "content": "<p>우</p>"},
            "s_sh": {"slotId": "s_sh", "label": "제목", "role": "editable-slot", "content": "<h2>섹션명</h2>"},
            "s_sb": {"slotId": "s_sb", "label": "본문", "role": "editable-slot", "content": "<p>섹션본문</p>"},
            "s_ht": {"slotId": "s_ht", "label": "H1", "role": "editable-slot", "content": "<h1>히어로</h1>"},
            "s_hs": {"slotId": "s_hs", "label": "H2", "role": "editable-slot", "content": "<p>부제</p>"},
            "s_ch": {"slotId": "s_ch", "label": "헤드", "role": "editable-slot", "content": "<p>표지제목</p>"},
            "s_cb": {"slotId": "s_cb", "label": "작성", "role": "editable-slot", "content": "<p>작성자</p>"},
            "s_cf": {"slotId": "s_cf", "label": "수신", "role": "editable-slot", "content": "<p>수신처</p>"},
            "s_sl1": {"slotId": "s_sl1", "label": "키", "role": "editable-slot", "content": "<p>핵심키</p>"},
            "s_sv1": {"slotId": "s_sv1", "label": "값", "role": "editable-slot", "content": "<p>핵심값</p>"},
            "s_t1": {"slotId": "s_t1", "label": "품명", "role": "editable-slot", "content": "<p>항목A</p>"},
            "s_t2": {"slotId": "s_t2", "label": "금액", "role": "editable-slot", "content": "<p>1000</p>"},
            "s_tf": {"slotId": "s_tf", "label": "합계", "role": "editable-slot", "content": "<p>합계 1000</p>"},
        },
        "variables": {},
        "backdata": {},
    }

    extracted = extract_working_outline_from_docs("proj_all", "전종 검증", [doc])
    compiled_list = compile_preview_docs(extracted, "전종 검증", [doc])
    assert len(compiled_list) == 1
    c_doc = compiled_list[0]
    c_blocks = c_doc["pages"][0]["blocks"]

    assert [b["kind"] for b in c_blocks] == [
        "composite-form-frame",
        "columns-grid",
        "columns-grid",
        "section-block",
        "hero",
        "cover-banner",
        "summary-list",
        "structured-table",
        "image",
        "divider",
        "spacer",
    ]
    assert c_blocks[0]["sections"][0]["rows"][0]["cells"][0]["colSpan"] == 2
    assert c_blocks[1]["columns"][0]["image"]["src"] == "data:image/png;base64,AAA"
    assert c_blocks[1]["columns"][1]["slotId"] == "s_col2"
    assert c_blocks[2]["slotIds"] == ["s_g1", "s_g2"]
    assert "slotId" not in c_blocks[3] and c_blocks[3]["headingSlotId"] == "s_sh"
    assert "slotId" not in c_blocks[4] and c_blocks[4]["subtitleSlotId"] == "s_hs"
    assert "slotId" not in c_blocks[5] and c_blocks[5]["preparedForSlotId"] == "s_cf"
    assert "slotId" not in c_blocks[6] and c_blocks[6]["items"][0]["valueSlotId"] == "s_sv1"
    assert c_blocks[8]["src"] == "data:image/png;base64,CCC"
    assert c_blocks[8]["width"] == "480px"
    assert c_blocks[9]["variant"] == "short"
    assert c_blocks[10]["height"] == 32
    assert set(doc["slots"].keys()).issubset(set(c_doc["slots"].keys()))
