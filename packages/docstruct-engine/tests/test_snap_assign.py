"""Tests for grid snapping, orphan word snapping, keepText figures, fields, and continuation."""
from __future__ import annotations

from docstruct_engine.build import build_page_ir
from docstruct_engine.ir.model import (
    CellIR,
    PageIR,
    PageSize,
    Ruling,
    TableIR,
    Word,
)
from docstruct_engine.ir.validate import validate_page_ir
from docstruct_engine.tables.assign import assign_words_to_table
from docstruct_engine.tables.candidates import CandidateCell, TableCandidate
from docstruct_engine.tables.continuation import detect_table_continuations
from docstruct_engine.tables.snap import snap_candidate_grid


def test_snap_candidate_grid_aligns_and_removes_slivers() -> None:
    cand = TableCandidate(
        id="t0",
        bbox=(49.2, 99.1, 300.9, 200.4),
        colXs=[49.2, 50.3, 174.1, 300.9],  # 49.2->50.0 and 50.3->50.0 collapses a 1.1pt sliver
        rowYs=[99.1, 130.6, 200.4],
        cells=[
            CandidateCell(r=0, c=0, rs=1, cs=1, bbox=(49.2, 99.1, 50.3, 130.6)),
            CandidateCell(r=0, c=1, rs=1, cs=2, bbox=(50.3, 99.1, 300.9, 130.6)),
            CandidateCell(r=1, c=0, rs=1, cs=2, bbox=(49.2, 130.6, 174.1, 200.4)),
            CandidateCell(r=1, c=2, rs=1, cs=1, bbox=(174.1, 130.6, 300.9, 200.4)),
        ],
    )
    rulings = [
        Ruling(orient="v", x0=50.0, y0=100.0, x1=50.0, y1=200.0),
        Ruling(orient="v", x0=175.0, y0=100.0, x1=175.0, y1=200.0),
        Ruling(orient="v", x0=300.0, y0=100.0, x1=300.0, y1=200.0),
        Ruling(orient="h", x0=50.0, y0=100.0, x1=300.0, y1=100.0),
        Ruling(orient="h", x0=50.0, y0=130.0, x1=300.0, y1=130.0),
        Ruling(orient="h", x0=50.0, y0=200.0, x1=300.0, y1=200.0),
    ]
    snapped = snap_candidate_grid(cand, rulings, snap_tol_pt=1.8)
    assert snapped.colXs == [50.0, 175.0, 300.0]
    assert snapped.rowYs == [100.0, 130.0, 200.0]
    assert len(snapped.cells) == 3  # merged row 0 col 0..1 cleanly becomes (0,0,cs=2)
    by_rc = {(c.r, c.c): c for c in snapped.cells}
    assert by_rc[(0, 0)].cs == 2


def test_assign_words_snaps_inner_orphan_and_excludes_keep_text_figure() -> None:
    cand = TableCandidate(
        id="t0",
        bbox=(50.0, 100.0, 350.0, 180.0),
        colXs=[50.0, 200.0, 350.0],
        rowYs=[100.0, 140.0, 180.0],
        cells=[
            CandidateCell(r=0, c=0, bbox=(50.0, 100.0, 200.0, 140.0)),
            CandidateCell(r=0, c=1, bbox=(200.0, 100.0, 350.0, 140.0)),
            CandidateCell(r=1, c=0, bbox=(50.0, 140.0, 200.0, 180.0)),
            CandidateCell(r=1, c=1, bbox=(200.0, 140.0, 350.0, 180.0)),
        ],
    )
    # w_edge center is at (200.0, 120.0) right on border, Wait - point_in_bbox(200,120) matches tol=0,
    # so place w_edge with center slightly outside or place a sub-cell gutter case via smaller inner boxes:
    cand.cells[0].bbox = (50.0, 100.0, 198.0, 140.0)
    cand.cells[1].bbox = (202.0, 100.0, 350.0, 140.0)

    words = [
        Word(id="w0", text="Item", bbox=(60, 110, 95, 124)),
        Word(id="w_edge", text="95%", bbox=(196, 110, 202.5, 124)),  # ctr=199.25 sits in gutter 198..202
        Word(id="w_fig", text="ChartLabel", bbox=(250, 150, 310, 164)),
    ]
    tbl, assigned = assign_words_to_table(cand, words, excluded_word_ids={"w_fig"})
    assert "w_fig" not in assigned
    assert "w_edge" in assigned
    # Nearest to ctr=199.25 is cell (0,0) edge 198 (dist=1.25 < 2.75) and must flag needsReview
    by_rc = {(c.r, c.c): c for c in tbl.cells}
    assert "w_edge" in by_rc[(0, 0)].wordIds
    assert by_rc[(0, 0)].needsReview is True
    assert tbl.needsReview is True


def test_props_cell_field_and_table_continuation() -> None:
    rulings = [
        Ruling(orient="v", x0=50, y0=100, x1=50, y1=160),
        Ruling(orient="v", x0=180, y0=100, x1=180, y1=160),
        Ruling(orient="v", x0=400, y0=100, x1=400, y1=160),
        Ruling(orient="h", x0=50, y0=100, x1=400, y1=100),
        Ruling(orient="h", x0=50, y0=130, x1=400, y1=130),
        Ruling(orient="h", x0=50, y0=160, x1=400, y1=160),
    ]
    fills = [{"x0": 50, "y0": 100, "x1": 400, "y1": 130, "color": "#E5E7EB"}]
    words = [
        Word(id="w0", text="항목", bbox=(95, 108, 130, 122), bold=True),
        Word(id="w1", text="내용", bbox=(275, 108, 305, 122), bold=True),
        Word(id="w2", text="작성일", bbox=(90, 138, 135, 152)),
        Word(id="w3", text="2026년 __월 __일", bbox=(230, 138, 340, 152)),
    ]
    page1 = build_page_ir(
        words,
        rulings,
        page_index=1,
        page_size=PageSize(width=595, height=842),
        fills_pt=fills,
    )
    assert validate_page_ir(page1).violations == []
    t1 = next(b for b in page1.blocks if isinstance(b, TableIR))
    c_rc = {(c.r, c.c): c for c in t1.cells}
    assert c_rc[(0, 0)].role == "th"
    assert c_rc[(0, 0)].bg == "#E5E7EB"
    assert c_rc[(1, 1)].field is not None
    assert c_rc[(1, 1)].field.kind == "date"

    t2 = TableIR(
        id="t0_p2",
        bbox=(50, 70, 400, 160),
        nRows=2,
        nCols=2,
        colXs=[50, 180, 400],
        rowYs=[70, 100, 160],
        widthRatio=t1.widthRatio,
        cells=[
            CellIR(r=0, c=0, role="th", bbox=(50, 70, 180, 100), text="항목"),
            CellIR(r=0, c=1, role="th", bbox=(180, 70, 400, 100), text="내용"),
            CellIR(r=1, c=0, bbox=(50, 100, 180, 160), text="비고"),
            CellIR(r=1, c=1, bbox=(180, 100, 400, 160), text="-"),
        ],
    )
    page2 = PageIR(
        pageIndex=2,
        sourceKind="pdf-vector",
        size=PageSize(width=595, height=842),
        blocks=[t2],
        readingOrder=["t0_p2"],
    )
    links = detect_table_continuations([page1, page2])
    assert len(links) == 1
    assert t2.repeatHeader is True
