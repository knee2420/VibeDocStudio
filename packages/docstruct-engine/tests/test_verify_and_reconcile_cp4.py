"""Checkpoint 4 tests: inline underline filtering in verify_page and ruling/word snapping in reconcile_table."""
from __future__ import annotations

import logging

from docstruct_engine.ir.model import (
    CellIR,
    PageIR,
    PageSize,
    Ruling,
    TableIR,
    Word,
)
from docstruct_engine.tables.reconcile import reconcile_table
from docstruct_engine.verify import verify_page


def _base_outer_rulings(x0: float, y0: float, x1: float, y1: float) -> list[Ruling]:
    return [
        Ruling(orient="h", x0=x0, y0=y0, x1=x1, y1=y0),
        Ruling(orient="h", x0=x0, y0=y1, x1=x1, y1=y1),
        Ruling(orient="v", x0=x0, y0=y0, x1=x0, y1=y1),
        Ruling(orient="v", x0=x1, y0=y0, x1=x1, y1=y1),
    ]


def test_verify_page_excludes_inline_text_underlines_from_gold_rulings(caplog) -> None:
    caplog.set_level(logging.INFO, logger="docstruct_engine")
    words = [
        Word(id="w1", text="Section", bbox=(60.0, 110.0, 140.0, 125.0), size=10.0),
        Word(id="w2", text="Summary", bbox=(145.0, 110.0, 240.0, 125.0), size=10.0),
    ]
    rulings = [
        *_base_outer_rulings(50.0, 100.0, 300.0, 180.0),
        # Inline underline sitting at the bottom of printed words w1..w2 inside cell (0, 0)
        Ruling(orient="h", x0=60.0, y0=125.2, x1=240.0, y1=125.2),
    ]
    table = TableIR(
        id="t0",
        bbox=(50.0, 100.0, 300.0, 180.0),
        nRows=1,
        nCols=1,
        colXs=[50.0, 300.0],
        rowYs=[100.0, 180.0],
        cells=[
            CellIR(
                r=0,
                c=0,
                bbox=(50.0, 100.0, 300.0, 180.0),
                wordIds=["w1", "w2"],
                text="Section Summary",
            )
        ],
    )
    page = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=words,
        rulings=rulings,
        blocks=[table],
        readingOrder=["t0"],
    )

    report, pending = verify_page(page)
    assert report.rulingLineF1 == 1.0
    assert report.missingLineBoxes == []
    assert report.ok is True
    assert pending == []
    assert any("filteredUnderlines=1" in rec.message for rec in caplog.records)

    # Even after VLM cell consolidation blanks trailing tokens (`rw.text = ""`, `rw.src = "vlm"`),
    # inline underlines beneath those glyph boxes must remain excluded on re-verification.
    rec_after = reconcile_table(page, "t0", html="<table><tr><td>Section-Summary</td></tr></table>")
    assert rec_after.ok and rec_after.page is not None
    report_after, pending_after = verify_page(rec_after.page)
    assert report_after.rulingLineF1 == 1.0
    assert report_after.missingLineBoxes == []
    assert pending_after == []


def test_verify_page_keeps_genuine_cell_border_below_whitespace() -> None:
    words = [
        Word(id="w1", text="Header", bbox=(60.0, 108.0, 130.0, 122.0), size=10.0),
    ]
    rulings = [
        *_base_outer_rulings(50.0, 100.0, 300.0, 180.0),
        # Genuine unparsed horizontal border far below text whitespace
        Ruling(orient="h", x0=50.0, y0=150.0, x1=300.0, y1=150.0),
    ]
    table = TableIR(
        id="t0",
        bbox=(50.0, 100.0, 300.0, 180.0),
        nRows=1,
        nCols=1,
        colXs=[50.0, 300.0],
        rowYs=[100.0, 180.0],
        cells=[
            CellIR(
                r=0,
                c=0,
                bbox=(50.0, 100.0, 300.0, 180.0),
                wordIds=["w1"],
                text="Header",
            )
        ],
    )
    page = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=words,
        rulings=rulings,
        blocks=[table],
        readingOrder=["t0"],
    )

    report, pending = verify_page(page)
    assert report.rulingLineF1 < 0.90
    assert len(report.missingLineBoxes) == 1
    assert any(item.kind == "table_reread" for item in pending)


def test_reconcile_table_snaps_mismatched_col_count_to_word_gutters_and_rulings() -> None:
    # Asymmetric 4-col initial table `[50, 120, 220, 340, 500]` merged down to 2 cols by VLM.
    # Word `w_right` centers at x=250: uniform 2-col midpoint `275` would trigger WORD_OUTSIDE_CELL,
    # whereas snapping to existing ruling / gutter `220` keeps every word strictly inside its cell.
    words = [
        Word(id="w_left", text="Item", bbox=(60.0, 112.0, 180.0, 126.0)),
        Word(id="w_right", text="Amount", bbox=(230.0, 112.0, 270.0, 126.0)),
        Word(id="w_b1", text="RowA", bbox=(60.0, 152.0, 110.0, 166.0)),
        Word(id="w_b2", text="100", bbox=(235.0, 152.0, 265.0, 166.0)),
    ]
    rulings = [
        *_base_outer_rulings(50.0, 100.0, 500.0, 180.0),
        Ruling(orient="h", x0=50.0, y0=140.0, x1=500.0, y1=140.0),
        Ruling(orient="v", x0=220.0, y0=100.0, x1=220.0, y1=180.0),
    ]
    orig_tbl = TableIR(
        id="t0",
        bbox=(50.0, 100.0, 500.0, 180.0),
        nRows=2,
        nCols=4,
        colXs=[50.0, 120.0, 220.0, 340.0, 500.0],
        rowYs=[100.0, 140.0, 180.0],
        cells=[
            CellIR(r=0, c=0, role="th", bbox=(50.0, 100.0, 120.0, 140.0), wordIds=["w_left"], text="Item"),
            CellIR(r=0, c=1, role="th", bbox=(120.0, 100.0, 220.0, 140.0), text=""),
            CellIR(r=0, c=2, role="th", bbox=(220.0, 100.0, 340.0, 140.0), wordIds=["w_right"], text="Amount"),
            CellIR(r=0, c=3, role="th", bbox=(340.0, 100.0, 500.0, 140.0), text=""),
            CellIR(r=1, c=0, bbox=(50.0, 140.0, 120.0, 180.0), wordIds=["w_b1"], text="RowA"),
            CellIR(r=1, c=1, bbox=(120.0, 140.0, 220.0, 180.0), text=""),
            CellIR(r=1, c=2, bbox=(220.0, 140.0, 340.0, 180.0), wordIds=["w_b2"], text="100"),
            CellIR(r=1, c=3, bbox=(340.0, 140.0, 500.0, 180.0), text=""),
        ],
    )
    page = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=words,
        rulings=rulings,
        blocks=[orig_tbl],
        readingOrder=["t0"],
    )

    vlm_html = (
        "<table>"
        "<tr>"
        '<th><span data-w="w_left">Item</span></th>'
        '<th><span data-w="w_right">Amount</span></th>'
        "</tr>"
        "<tr>"
        '<td><span data-w="w_b1">RowA</span></td>'
        '<td><span data-w="w_b2">100</span></td>'
        "</tr>"
        "</table>"
    )
    res = reconcile_table(page, "t0", html=vlm_html)
    assert res.ok is True, res.errors
    assert res.errors == []
    assert res.table is not None
    assert res.table.nCols == 2
    assert res.table.colXs == [50.0, 220.0, 500.0]

