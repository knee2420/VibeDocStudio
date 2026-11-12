from __future__ import annotations

import logging

from docstruct_engine.ir.model import (
    CellIR,
    HeadingBlock,
    NoteBlock,
    PageIR,
    PageSize,
    ParagraphBlock,
    TableIR,
    Word,
)
from harness_kit.docstruct_vdoc import doc_ir_pages_to_vdoc


def _w(
    wid: str,
    text: str,
    bbox: tuple[float, float, float, float],
    *,
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
        size=10.0,
        lineHint=line_hint,
        trailingSpace=trailing_space,
    )


def _uid_factory():
    c = [0]

    def _next() -> str:
        c[0] += 1
        return f"u{c[0]}"

    return _next


def test_header_footer_isolation_align_preserve_and_cell_para_merge(caplog) -> None:
    words = [
        _w("hw0", "(6쪽", (490, 42, 512, 52), line_hint=0, trailing_space=True),
        _w("hw1", "중", (515, 42, 526, 52), line_hint=0, trailing_space=True),
        _w("hw2", "2쪽)", (529, 42, 550, 52), line_hint=0),
        _w("bw0", "본문", (45, 100, 70, 110), line_hint=1, trailing_space=True),
        _w("bw1", "첫", (73, 100, 86, 110), line_hint=1, trailing_space=True),
        _w("bw2", "줄", (89, 100, 102, 110), line_hint=1),
        _w("bw3", "작성일: 2026-11-12", (420, 120, 550, 130), line_hint=2),
        # Multi-line structured cell: 1st bullet (2 soft-wrapped lines) + 2nd bullet + footnote note
        _w("cw0", "◈", (52, 200, 62, 210), line_hint=3, trailing_space=True),
        _w("cw1", "첫", (66, 200, 80, 210), line_hint=3, trailing_space=True),
        _w("cw2", "항목의", (84, 200, 120, 210), line_hint=3, trailing_space=True),
        _w("cw3", "긴", (124, 200, 136, 210), line_hint=3, trailing_space=True),
        _w("cw4", "안내문구가", (140, 200, 200, 210), line_hint=3, trailing_space=True),
        _w("cw5", "오른쪽", (204, 200, 240, 210), line_hint=3, trailing_space=True),
        _w("cw6", "끝까지", (244, 200, 540, 210), line_hint=3),
        _w("cw7", "자연스럽게", (66, 214, 120, 224), line_hint=4, trailing_space=True),
        _w("cw8", "이어집니다.", (124, 214, 190, 224), line_hint=4),
        _w("cw9", "ㅇ", (52, 228, 62, 238), line_hint=5, trailing_space=True),
        _w("cw10", "두", (66, 228, 78, 238), line_hint=5, trailing_space=True),
        _w("cw11", "번째", (82, 228, 105, 238), line_hint=5, trailing_space=True),
        _w("cw12", "항목", (109, 228, 132, 238), line_hint=5),
        _w("cw13", "※", (52, 242, 62, 252), line_hint=6, trailing_space=True),
        _w("cw14", "별도", (66, 242, 88, 252), line_hint=6, trailing_space=True),
        _w("cw15", "유의사항", (92, 242, 140, 252), line_hint=6),
    ]
    tbl = TableIR(
        id="t0",
        kind="table",
        bbox=(45, 190, 550, 270),
        nRows=1,
        nCols=1,
        colXs=[45.0, 550.0],
        rowYs=[190.0, 270.0],
        cells=[
            CellIR(
                r=0,
                c=0,
                bbox=(45, 190, 550, 270),
                wordIds=[f"cw{i}" for i in range(16)],
            )
        ],
    )
    p1 = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=841.0),
        words=words,
        rulings=[],
        blocks=[
            NoteBlock(id="nt0", bbox=(490, 42, 550, 52), noteKind="header", wordIds=["hw0", "hw1", "hw2"]),
            ParagraphBlock(id="p1", bbox=(45, 100, 102, 110), align="left", wordIds=["bw0", "bw1", "bw2"]),
            ParagraphBlock(id="p2", bbox=(420, 120, 550, 130), align="right", wordIds=["bw3"]),
            tbl,
        ],
    )
    p2 = PageIR(
        pageIndex=2,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=841.0),
        words=[_w("p2w", "제목", (220, 60, 340, 80), line_hint=0)],
        rulings=[],
        blocks=[
            HeadingBlock(id="hd0", bbox=(220, 60, 340, 80), level=1, align="center", wordIds=["p2w"]),
        ],
    )

    with caplog.at_level(logging.INFO, logger="harness_kit.docstruct_vdoc"):
        pages_out, slots_out, reports = doc_ir_pages_to_vdoc([p1, p2], uid=_uid_factory())

    assert pages_out[0]["hideHeaderFooter"] is False
    assert pages_out[1]["hideHeaderFooter"] is True

    hsid = pages_out[0]["headerSlotId"]
    assert slots_out[hsid]["content"] == "<p>(6쪽 중 2쪽)</p>"

    # Body text block must not include isolated header, and must preserve explicit right alignment on p2
    txt_blocks = [b for b in pages_out[0]["blocks"] if b["kind"] == "text"]
    assert len(txt_blocks) == 1
    body_html = slots_out[txt_blocks[0]["slotId"]]["content"]
    assert "6쪽 중 2쪽" not in body_html
    assert '<p style="text-align: right">작성일: 2026-11-12</p>' in body_html

    # Soft-wrapped line 4 merges into bullet 1 while preserving bullet 2 and note -> 3 <p> instead of 4
    tbl_blocks = [b for b in pages_out[0]["blocks"] if b["kind"] == "structured-table"]
    assert len(tbl_blocks) == 1
    cell_sid = tbl_blocks[0]["rows"][0]["cells"][0]["slotId"]
    cell_html = slots_out[cell_sid]["content"]
    assert cell_html.count("<p") == 3
    assert "오른쪽 끝까지 자연스럽게 이어집니다." in cell_html

    assert reports[0].headers_isolated == 1
    assert reports[0].cell_paragraphs_merged == 1
    assert any("[docstruct.vdoc]" in rec.message and "headersIsolated=1" in rec.message for rec in caplog.records)
