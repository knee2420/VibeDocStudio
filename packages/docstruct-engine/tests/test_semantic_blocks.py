from __future__ import annotations

import logging

from docstruct_engine.blocks.reflow import reflow_non_table_blocks
from docstruct_engine.ir.model import (
    CaptionBlock,
    CellIR,
    HeadingBlock,
    ListItemBlock,
    NoteBlock,
    PageIR,
    PageSize,
    ParagraphBlock,
    TableIR,
    Word,
)
from docstruct_engine.telemetry import summarize_doc_metrics, summarize_page_metrics


def _w(
    wid: str,
    text: str,
    bbox: tuple[float, float, float, float],
    *,
    size: float = 10.0,
    bold: bool = False,
    line_hint: int = 0,
    trailing_space: bool | None = None,
) -> Word:
    return Word(
        id=wid,
        text=text,
        bbox=bbox,
        conf=1.0,
        src="vec",
        font="MalgunGothic",
        size=size,
        bold=bold,
        lineHint=line_hint,
        trailingSpace=trailing_space,
    )


def test_title_heading_centered_above_wide_table_and_byulpyo_not_caption() -> None:
    tbl = TableIR(
        id="t0",
        kind="table",
        bbox=(30.0, 140.0, 565.0, 420.0),
        nRows=1,
        nCols=1,
        colXs=[30.0, 565.0],
        rowYs=[140.0, 420.0],
        cells=[
            CellIR(r=0, c=0, bbox=(30.0, 140.0, 565.0, 420.0), wordIds=[]),
        ],
    )
    words = [
        _w("w0", "표준계약서", (200.0, 56.0, 350.0, 76.0), size=20.0, bold=True, line_hint=0),
        _w("w1", "(6쪽", (490.0, 43.0, 512.0, 53.0), size=10.0, line_hint=1, trailing_space=True),
        _w("w2", "중", (515.0, 43.0, 526.0, 53.0), size=10.0, line_hint=1, trailing_space=True),
        _w("w3", "2쪽)", (529.0, 43.0, 550.0, 53.0), size=10.0, line_hint=1),
        _w("w4", "별표", (45.0, 450.0, 68.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w5", "1의", (71.0, 450.0, 88.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w6", "시설물", (91.0, 450.0, 125.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w7", "점검기준에", (128.0, 450.0, 185.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w8", "따른", (188.0, 450.0, 210.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w9", "유지보수", (213.0, 450.0, 255.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w10", "항목은", (258.0, 450.0, 290.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w11", "다음과", (293.0, 450.0, 325.0, 460.0), size=10.0, line_hint=2, trailing_space=True),
        _w("w12", "같다.", (328.0, 450.0, 355.0, 460.0), size=10.0, line_hint=2),
        _w("w13", "표", (45.0, 480.0, 57.0, 490.0), size=10.0, line_hint=3, trailing_space=True),
        _w("w14", "1.", (60.0, 480.0, 72.0, 490.0), size=10.0, line_hint=3, trailing_space=True),
        _w("w15", "항목", (75.0, 480.0, 98.0, 490.0), size=10.0, line_hint=3, trailing_space=True),
        _w("w16", "요약", (101.0, 480.0, 125.0, 490.0), size=10.0, line_hint=3),
    ]
    blocks = reflow_non_table_blocks(
        words,
        [],
        tables=[tbl],
        figures=[],
        page_width=595.0,
        page_height=841.0,
    )
    headings = [b for b in blocks if isinstance(b, HeadingBlock)]
    notes = [b for b in blocks if isinstance(b, NoteBlock)]
    captions = [b for b in blocks if isinstance(b, CaptionBlock)]
    paras = [b for b in blocks if isinstance(b, ParagraphBlock)]

    assert len(headings) == 1
    assert headings[0].text == "표준계약서"
    assert headings[0].level == 1
    assert headings[0].align == "center"

    assert len(notes) == 1
    assert notes[0].noteKind == "header"
    assert notes[0].text == "(6쪽 중 2쪽)"

    assert [c.text for c in captions] == ["표 1. 항목 요약"]
    assert any((p.text or "").startswith("별표 1의") for p in paras)


def test_heading_vs_list_item_note_wrap_and_article_boundary() -> None:
    words = [
        # Valid numbered section heading with leading bold stem
        _w("h0", "2.", (50.0, 100.0, 62.0, 110.0), size=10.0, bold=True, line_hint=0, trailing_space=True),
        _w("h1", "검토기관", (65.0, 100.0, 110.0, 110.0), size=10.0, bold=True, line_hint=0, trailing_space=True),
        _w("h2", "(외부검토자가", (114.0, 100.0, 185.0, 110.0), size=10.0, bold=False, line_hint=0, trailing_space=True),
        _w("h3", "해당)", (189.0, 100.0, 220.0, 110.0), size=10.0, bold=False, line_hint=0),
        # Multi-line annotation note must stay one NoteBlock
        _w("n0", "※", (50.0, 130.0, 60.0, 140.0), size=9.0, line_hint=1, trailing_space=True),
        _w("n1", "담당자가", (63.0, 130.0, 110.0, 140.0), size=9.0, line_hint=1, trailing_space=True),
        _w("n2", "검토서를", (114.0, 130.0, 165.0, 140.0), size=9.0, line_hint=1, trailing_space=True),
        _w("n3", "작성한", (169.0, 130.0, 210.0, 140.0), size=9.0, line_hint=1, trailing_space=True),
        _w("n4", "경우", (214.0, 130.0, 250.0, 140.0), size=9.0, line_hint=1, trailing_space=True),
        _w("n5", "사본을", (254.0, 130.0, 548.0, 140.0), size=9.0, line_hint=1),
        _w("n6", "보관한다.", (60.0, 144.0, 115.0, 154.0), size=9.0, line_hint=2),
        # Mid-bold numbered clause must NOT become heading
        _w("l0", "1.", (50.0, 180.0, 60.0, 190.0), size=10.0, bold=False, line_hint=3, trailing_space=True),
        _w("l1", "운영기관의", (64.0, 180.0, 120.0, 190.0), size=10.0, bold=False, line_hint=3, trailing_space=True),
        _w("l2", "동의없이", (124.0, 180.0, 175.0, 190.0), size=10.0, bold=False, line_hint=3, trailing_space=True),
        _w("l3", "승계하는", (179.0, 180.0, 230.0, 190.0), size=10.0, bold=True, line_hint=3, trailing_space=True),
        _w("l4", "행위", (234.0, 180.0, 260.0, 190.0), size=10.0, bold=False, line_hint=3),
        # Parenthesized numbered list item wide line (not centered heading)
        _w("p0", "1)", (55.0, 210.0, 68.0, 220.0), size=10.0, line_hint=4, trailing_space=True),
        _w("p1", "계약기간이", (72.0, 210.0, 135.0, 220.0), size=10.0, line_hint=4, trailing_space=True),
        _w("p2", "만료되기", (139.0, 210.0, 195.0, 220.0), size=10.0, line_hint=4, trailing_space=True),
        _w("p3", "전", (199.0, 210.0, 215.0, 220.0), size=10.0, line_hint=4, trailing_space=True),
        _w("p4", "통지서를", (219.0, 210.0, 480.0, 220.0), size=10.0, line_hint=4),
        # Article boundary immediately after tight list item
        _w("a0", "제5조(이용", (50.0, 224.0, 105.0, 234.0), size=10.0, bold=True, line_hint=5, trailing_space=True),
        _w("a1", "조건", (109.0, 224.0, 135.0, 234.0), size=10.0, bold=True, line_hint=5, trailing_space=True),
        _w("a2", "변경)", (139.0, 224.0, 170.0, 234.0), size=10.0, bold=True, line_hint=5, trailing_space=True),
        _w("a3", "운영기관은", (174.0, 224.0, 235.0, 234.0), size=10.0, line_hint=5, trailing_space=True),
        _w("a4", "협의한다.", (239.0, 224.0, 290.0, 234.0), size=10.0, line_hint=5),
    ]
    blocks = reflow_non_table_blocks(
        words,
        [],
        tables=[],
        figures=[],
        page_width=595.0,
        page_height=841.0,
    )

    headings = [b for b in blocks if isinstance(b, HeadingBlock)]
    assert [(h.level, h.text) for h in headings] == [(2, "2. 검토기관 (외부검토자가 해당)")]

    notes = [b for b in blocks if isinstance(b, NoteBlock)]
    assert len(notes) == 1
    assert notes[0].noteKind == "annotation"
    assert "사본을 보관한다." in (notes[0].text or "")

    list_items = [b for b in blocks if isinstance(b, ListItemBlock)]
    assert len(list_items) == 2
    assert (list_items[0].text or "").startswith("1. 운영기관의")
    assert (list_items[1].text or "").startswith("1) 계약기간이")
    assert "제5조" not in (list_items[1].text or "")

    paras = [b for b in blocks if isinstance(b, ParagraphBlock)]
    assert any((p.text or "").startswith("제5조(이용 조건 변경)") for p in paras)


def test_telemetry_semantic_metrics(caplog) -> None:
    page = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=841.0),
        words=[],
        rulings=[],
        blocks=[
            HeadingBlock(id="hd0", bbox=(200, 50, 350, 70), level=1, text="표준계약서"),
            NoteBlock(id="nt1", bbox=(480, 40, 550, 52), noteKind="header", text="(6쪽 중 1쪽)"),
            NoteBlock(id="nt2", bbox=(45, 120, 300, 132), noteKind="annotation", text="※ 안내"),
            CaptionBlock(id="cp3", bbox=(45, 200, 200, 212), text="표 1. 요약"),
        ],
    )
    pm = summarize_page_metrics(page)
    assert pm["headingCount"] == 1
    assert pm["captionCount"] == 1
    assert pm["noteCount"] == 2
    assert pm["headerFooterCount"] == 1
    assert pm["headingSummary"] == ["H1:표준계약서"]
    assert pm["headerTexts"] == ["(6쪽 중 1쪽)"]

    from docstruct_engine.ir.model import DocIR

    doc = DocIR(docId="sample", title="sample", pages=[page])
    with caplog.at_level(logging.INFO):
        dm = summarize_doc_metrics(doc)
    assert dm["totalHeadings"] == 1
    assert dm["totalCaptions"] == 1
    assert dm["totalHeaderFooters"] == 1
