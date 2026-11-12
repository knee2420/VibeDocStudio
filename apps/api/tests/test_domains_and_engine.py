"""4대 헥사고날 도메인(`catalog`, `documents`, `backdata`, `composer`) 및 `docstruct-engine` 통합 테스트."""
from __future__ import annotations

from docstruct_engine.compile.docstruct_vdoc import doc_ir_to_vdoc
from docstruct_engine.ir.model import (
    CellIR,
    DocIR,
    HeadingBlock,
    PageIR,
    PageSize,
    TableIR,
    Word,
)
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_endpoint_reports_all_domains_and_flagship_models() -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert set(body["domains"]) == {
        "catalog",
        "form_scaffold",
        "documents",
        "resource.backdata",
        "authoring",
        "authoring.staging",
        "authoring.harness",
        "projects",
        "resource.ledger",
        "resource.index",
        "llm",
        "assistant",
        "reference",
    }
    assert body["models"]["composer"] == "Gemini-3.8-flash"
    assert body["models"]["tagger"] == "Gemma4 31b"


def test_catalog_domain_lists_and_validates_all_bundles() -> None:
    res = client.get("/api/catalog")
    assert res.status_code == 200
    manifests = res.json()
    catalog_ids = {m["catalogId"] for m in manifests}
    assert "yesform-07-bansanghoe" in catalog_ids
    assert "vibe-architecture-minutes" in catalog_ids

    bundle_res = client.get("/api/catalog/yesform-07-bansanghoe")
    assert bundle_res.status_code == 200
    vdoc = bundle_res.json()["document"]

    slots = vdoc.get("slots") or {}
    tables: list[dict] = []
    for pg in vdoc.get("pages") or []:
        for b in pg.get("blocks") or []:
            if b.get("kind") == "structured-table":
                tables.append(b)
            elif b.get("kind") == "composite-form-frame":
                tables.extend(b.get("sections") or [])
    assert len(tables) >= 5
    for tbl in tables:
        for row in tbl.get("rows") or []:
            for cell in row.get("cells") or []:
                sid = cell.get("slotId")
                if sid:
                    assert sid in slots


def test_docstruct_engine_compiles_measured_doc_ir_with_merged_table() -> None:
    words = [
        Word(id="w1", text="반상회", bbox=(200.0, 40.0, 260.0, 64.0), size=18.0, bold=True),
        Word(id="w2", text="회의록", bbox=(266.0, 40.0, 330.0, 64.0), size=18.0, bold=True),
        Word(id="w3", text="성 명", bbox=(80.0, 96.0, 140.0, 112.0), size=10.0, bold=True),
        Word(id="w4", text="비 고", bbox=(240.0, 96.0, 300.0, 112.0), size=10.0, bold=True),
        Word(id="w5", text="101호 김철수", bbox=(80.0, 124.0, 180.0, 140.0), size=10.0),
        Word(id="w6", text="(인)", bbox=(250.0, 124.0, 290.0, 140.0), size=10.0),
        Word(id="w7", text="(서명)", bbox=(400.0, 124.0, 440.0, 140.0), size=10.0),
    ]
    tbl = TableIR(
        id="t1",
        bbox=(72.0, 90.0, 521.4, 146.0),
        nRows=2,
        nCols=3,
        colXs=[72.0, 221.4, 371.4, 521.4],
        rowYs=[90.0, 118.0, 146.0],
        cells=[
            CellIR(r=0, c=0, rs=1, cs=1, role="th", bbox=(72.0, 90.0, 221.4, 118.0), wordIds=["w3"], text="성 명"),
            CellIR(r=0, c=1, rs=1, cs=2, role="th", bbox=(221.4, 90.0, 521.4, 118.0), wordIds=["w4"], text="비 고"),
            CellIR(r=1, c=0, rs=1, cs=1, role="td", bbox=(72.0, 118.0, 221.4, 146.0), wordIds=["w5"], text="101호 김철수"),
            CellIR(r=1, c=1, rs=1, cs=1, role="td", bbox=(221.4, 118.0, 371.4, 146.0), wordIds=["w6"], text="(인)"),
            CellIR(r=1, c=2, rs=1, cs=1, role="td", bbox=(371.4, 118.0, 521.4, 146.0), wordIds=["w7"], text="(서명)"),
        ],
    )
    heading = HeadingBlock(
        id="hd1",
        bbox=(200.0, 40.0, 330.0, 64.0),
        level=1,
        align="center",
        wordIds=["w1", "w2"],
        text="반상회 회의록",
    )
    page_ir = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.28, height=841.89),
        words=words,
        blocks=[heading, tbl],
        readingOrder=["hd1", "t1"],
    )
    doc_ir = DocIR(docId="vdoc_test_extracted", title="반상회 회의록 테스트", pages=[page_ir])
    vdoc, reports = doc_ir_to_vdoc(doc_ir)

    assert len(reports) == 1 and reports[0].tables == 1
    assert len(vdoc["pages"]) == 1
    tbl_block = next(b for b in vdoc["pages"][0]["blocks"] if b["kind"] == "structured-table")
    assert tbl_block["rows"][0]["cells"][1]["colSpan"] == 2
    for row in tbl_block["rows"]:
        for cell in row["cells"]:
            assert cell["slotId"] in vdoc["slots"]


def test_documents_backdata_and_composer_domains_end_to_end() -> None:
    # 1. Backdata import
    bd_res = client.post(
        "/api/backdata/import",
        json={
            "source_title": "10월_단지회의_메모.md",
            "source_type": "markdown",
            "raw_text": "후문 LED 보안등 12기를 전면 교체하기로 의결함.\n\n동절기 지하주차장 유도선 보수 실시.",
            "tags": ["회의록", "백데이터"],
        },
    )
    assert bd_res.status_code == 200
    chunks = bd_res.json()["chunks"]
    assert len(chunks) == 2

    # 2. Composer slot draft synthesis with provenance
    comp_res = client.post(
        "/api/ai/compose",
        json={
            "slotId": "bsh_agenda_body",
            "slotLabel": "협의 및 결의사항 본문",
            "currentContent": "<p>기존 초안</p>",
            "prompt": "3줄 개조식 불릿 변환",
            "presetId": "bullet-3",
            "backdata": chunks,
        },
    )
    assert comp_res.status_code == 200
    comp_body = comp_res.json()
    assert comp_body["slotId"] == "bsh_agenda_body"
    assert "<ul>" in comp_body["html"]
    assert comp_body["provenance"]["runId"].startswith("run-")
