"""P1 tests: HWPX <-> DocIR <-> .vdoc parity and non-HWPX block mapping (§12.1, §12.2)."""
from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

from docstruct_engine.acquire import hwpx
from docstruct_engine.acquire import hwpx_ir as docstruct_hwpx
from docstruct_engine.compile import docstruct_vdoc, hwpx_vdoc
from docstruct_engine.ir import (
    CellFieldMeta,
    CellIR,
    DocIR,
    FieldBlock,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    NoteBlock,
    PageIR,
    PageSize,
    ParagraphBlock,
    TableIR,
    Word,
    validate_page_ir,
)


def _sample_hwpx_file(tmp_dir: Path) -> Path:
    header_xml = """<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
 <hh:refList>
  <hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬돋움"/></hh:fontface></hh:fontfaces>
  <hh:borderFills>
   <hh:borderFill id="1"><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="DOUBLE_SLIM" width="0.4 mm" color="#112233"/><hh:bottomBorder type="DASH" width="0.2 mm" color="#445566"/><hh:fillBrush><hc:winBrush faceColor="#ABCDEF"/></hh:fillBrush></hh:borderFill>
  </hh:borderFills>
  <hh:charPrs>
   <hh:charPr id="0" height="1000" textColor="#000000"><hh:fontRef hangul="0"/></hh:charPr>
   <hh:charPr id="1" height="1200" textColor="#FF0000"><hh:fontRef hangul="0"/><hh:bold/><hh:italic/><hh:underline type="BOTTOM"/></hh:charPr>
  </hh:charPrs>
  <hh:paraPrs>
   <hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
   <hh:paraPr id="1"><hh:align horizontal="CENTER"/><hh:lineSpacing type="PERCENT" value="140"/></hh:paraPr>
  </hh:paraPrs>
 </hh:refList>
</hh:head>"""
    section_xml = """<?xml version="1.0" encoding="UTF-8"?>
<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
 <hp:p paraPrIDRef="1"><hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray><hp:run charPrIDRef="1"><hp:t>제목 텍스트</hp:t></hp:run></hp:p>
 <hp:p paraPrIDRef="0"><hp:linesegarray><hp:lineseg textpos="0" vertpos="2000"/></hp:linesegarray><hp:run charPrIDRef="0"><hp:tbl rowCnt="2" colCnt="2" pageBreak="CELL" repeatHeader="1"><hp:sz width="40000"/><hp:tr><hp:tc header="1" borderFillIDRef="1"><hp:cellAddr rowAddr="0" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="2"/><hp:cellSz width="40000" height="3000"/><hp:cellMargin left="141" right="141" top="75" bottom="75"/><hp:subList vertAlign="CENTER"><hp:p paraPrIDRef="1"><hp:run charPrIDRef="1"><hp:t>헤더 셀</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr><hp:tr><hp:tc borderFillIDRef="1"><hp:cellAddr rowAddr="1" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="1"/><hp:cellSz width="15000" height="3000"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p></hp:subList></hp:tc><hp:tc borderFillIDRef="1"><hp:cellAddr rowAddr="1" colAddr="1"/><hp:cellSpan rowSpan="1" colSpan="1"/><hp:cellSz width="25000" height="3000"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/><hp:subList vertAlign="BOTTOM"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>부모</hp:t><hp:tbl rowCnt="1" colCnt="1"><hp:sz width="20000"/><hp:tr><hp:tc borderFillIDRef="1"><hp:cellAddr rowAddr="0" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="1"/><hp:cellSz width="20000" height="1500"/><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>안쪽표</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>
 <hp:p paraPrIDRef="0"><hp:linesegarray><hp:lineseg textpos="0" vertpos="9000"/></hp:linesegarray><hp:run charPrIDRef="0"><hp:t>꼬리 문단</hp:t></hp:run></hp:p>
</hp:sec>"""
    path = tmp_dir / "sample.hwpx"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("Contents/header.xml", header_xml)
        zf.writestr("Contents/section0.xml", section_xml)
    return path


def test_hwpx_to_doc_ir_validates_invariants_and_matches_vdoc_fields() -> None:
    with tempfile.TemporaryDirectory() as td:
        p = _sample_hwpx_file(Path(td))
        doc_ir = docstruct_hwpx.hwpx_to_doc_ir(str(p))
        assert len(doc_ir.pages) == 1
        page_ir = doc_ir.pages[0]
        assert page_ir.sourceKind == "hwpx"
        assert all(w.src == "hwpx" and w.bbox is None for w in page_ir.words)
        assert validate_page_ir(page_ir).ok

        # Nested table preserved structurally in IR
        tbl = page_ir.blocks[1]
        assert isinstance(tbl, TableIR)
        assert len(tbl.cells[2].nested) == 1
        assert tbl.widthRatio and abs(tbl.widthRatio[0] - 0.375) < 1e-3

        parsed = hwpx.parse(str(p))
        cnt = [0]

        def uid() -> str:
            cnt[0] += 1
            return f"u{cnt[0]}"

        res = hwpx_vdoc.build_pages(parsed, [1], uid=uid)
        assert len(res.pages) == 1
        pg = res.pages[0]
        assert pg["pageId"] == "pg_u1"
        assert pg["pageLabel"] == "원문 p1"
        assert pg["layout"]["fontFamily"] == "'함초롬돋움', 'Malgun Gothic', sans-serif"

        b_tx, b_tbl, b_tail = pg["blocks"]
        assert b_tx["kind"] == "text" and b_tx["align"] == "center"
        assert res.slots[b_tx["slotId"]]["content"] == '<p><strong><em><u><span style="font-size: 16px; color: #FF0000">제목 텍스트</span></u></em></strong></p>'
        assert res.slots[b_tx["slotId"]]["constraints"] == {"lineHeight": "1.4"}

        assert b_tbl["kind"] == "structured-table"
        assert b_tbl["columnWidths"] == ["37.50%", "62.50%"]
        assert b_tbl["tableWidthRatio"] == 0.9407
        assert b_tbl["borderRules"] == {"outer": "none", "rowBottom": "none", "vertical": "none"}

        hdr_cell = b_tbl["rows"][0]["cells"][0]
        assert hdr_cell["colSpan"] == 2
        assert hdr_cell["borderTop"] == "3px double #112233"
        assert hdr_cell["borderBottom"] == "1px dashed #445566"
        assert hdr_cell["backgroundColor"] == "#ABCDEF"
        assert hdr_cell["color"] == "#FF0000"
        assert hdr_cell["fontWeight"] == "bold"
        assert res.slots[hdr_cell["slotId"]]["content"] == "<p><em><u>헤더 셀</u></em></p>"

        empty_cell = b_tbl["rows"][1]["cells"][0]
        assert res.slots[empty_cell["slotId"]]["role"] == "editable-slot"
        assert res.slots[empty_cell["slotId"]]["label"] == "칸 2-1"

        nested_parent_cell = b_tbl["rows"][1]["cells"][1]
        assert res.slots[nested_parent_cell["slotId"]]["content"] == "<p>부모</p><p>안쪽표</p>"
        assert b_tail["title"] == "꼬리 문단"


def test_pdf_doc_ir_to_vdoc_mapping_rules() -> None:
    words = [
        Word(id="w0", text="제목", bbox=(40, 40, 100, 58), size=14.0, bold=True),
        Word(id="w1", text="서두 문단", bbox=(40, 70, 120, 84)),
        Word(id="w2", text="① 항목하나", bbox=(40, 90, 140, 104)),
        Word(id="w3", text="* 주석", bbox=(40, 110, 100, 122)),
        Word(id="w4", text="칸제목", bbox=(50, 150, 90, 165)),
        Word(id="w5", text="", bbox=(150, 150, 180, 165)),
        Word(id="w6", text="2026년 월 일", bbox=(40, 300, 160, 316)),
        Word(id="w7", text="신청인 (인)", bbox=(40, 330, 160, 346)),
    ]
    page = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=words,
        blocks=[
            HeadingBlock(id="h0", bbox=(40, 40, 100, 58), level=2, wordIds=["w0"]),
            ParagraphBlock(id="p0", bbox=(40, 70, 120, 84), wordIds=["w1"]),
            ListItemBlock(id="l0", bbox=(40, 90, 140, 104), marker="①", markerKind="circled", indentLevel=1, hangingIndentPt=10.0, wordIds=["w2"]),
            NoteBlock(id="n0", bbox=(40, 110, 100, 122), noteKind="footnote", wordIds=["w3"]),
            TableIR(
                id="t0",
                bbox=(40, 140, 240, 180),
                nRows=1,
                nCols=2,
                colXs=[40.0, 140.0, 240.0],
                rowYs=[140.0, 180.0],
                cells=[
                    CellIR(r=0, c=0, role="th", bbox=(40, 140, 140, 180), wordIds=["w4"]),
                    CellIR(r=0, c=1, role="td", bbox=(140, 140, 240, 180), wordIds=[], field=CellFieldMeta(kind="text", label="입력")),
                ],
            ),
            TableIR(
                id="t1_fail",
                bbox=(40, 200, 200, 250),
                nRows=1,
                nCols=1,
                colXs=[40.0, 200.0],
                rowYs=[200.0, 250.0],
                cells=[CellIR(r=0, c=0, bbox=(40, 200, 200, 250))],
                needsReview=True,
                imageFallbackSrc="data:image/jpeg;base64,/9j/4AAQ",
            ),
            FigureBlock(id="fig0", bbox=(40, 260, 160, 290), src="data:image/jpeg;base64,/9j/4AAQ", alt="차트"),
            FieldBlock(id="f_date", bbox=(40, 300, 160, 316), fieldKind="date", label="작성일", wordIds=["w6"]),
            FieldBlock(id="f_sign", bbox=(40, 330, 160, 346), fieldKind="sign", label="서명", wordIds=["w7"]),
        ],
        readingOrder=["h0", "p0", "l0", "n0", "t0", "t1_fail", "fig0", "f_date", "f_sign"],
    )
    doc_ir = DocIR(docId="d_pdf", title="PDF Sample", pages=[page])
    vdoc, reports = docstruct_vdoc.doc_ir_to_vdoc(doc_ir)
    pg = vdoc["pages"][0]
    kinds = [b["kind"] for b in pg["blocks"]]
    # Contiguous paragraph + listItem + note merge into a single "text" block; fallback table becomes "image"
    assert kinds == ["heading", "text", "structured-table", "image", "image", "fillable-group", "fillable-group"]

    text_slot_html = vdoc["slots"][pg["blocks"][1]["slotId"]]["content"]
    assert "<ol" not in text_slot_html
    assert "text-indent: -" in text_slot_html
    assert "① 항목하나" in text_slot_html

    tbl_block = pg["blocks"][2]
    fill_slot = vdoc["slots"][tbl_block["rows"][0]["cells"][1]["slotId"]]
    assert fill_slot["role"] == "editable-slot"

    fallback_img = pg["blocks"][3]
    assert fallback_img["kind"] == "image" and fallback_img["needsReview"] is True
    assert pg["blocks"][5]["fieldType"] == "date"
    assert pg["blocks"][6]["fieldType"] == "signature"
    assert reports[0].tables == 1
    assert reports[0].fill_cells == 3
    assert reports[0].pictures == 2

