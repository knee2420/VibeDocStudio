"""P0 tests for PageIR / DocIR schema and all 6 structural invariants."""
from __future__ import annotations

import json
from pathlib import Path

from docstruct_engine.ir import (
    CellIR,
    DocIR,
    FigureBlock,
    HeadingBlock,
    PageIR,
    PageSize,
    ParagraphBlock,
    TableIR,
    Word,
    build_json_schema,
    validate_doc_ir,
    validate_page_ir,
)


def _valid_sample_page() -> PageIR:
    words = [
        Word(id="w0", text="Title", bbox=(50, 40, 120, 58), src="vec", size=14.0, bold=True),
        Word(id="w1", text="ColA", bbox=(55, 85, 95, 100), src="vec"),
        Word(id="w2", text="ColB", bbox=(160, 85, 200, 100), src="vec"),
        Word(id="w3", text="Val", bbox=(60, 120, 110, 136), src="vec"),
        Word(id="w4", text="ChartLabel", bbox=(60, 210, 140, 224), src="vec"),
        Word(id="w5", text="Body", bbox=(55, 305, 110, 320), src="vec"),
    ]
    tbl = TableIR(
        id="t0",
        bbox=(50, 80, 250, 150),
        nRows=2,
        nCols=2,
        colXs=[50.0, 150.0, 250.0],
        rowYs=[80.0, 110.0, 150.0],
        cells=[
            CellIR(r=0, c=0, rs=1, cs=1, role="th", bbox=(50, 80, 150, 110), wordIds=["w1"]),
            CellIR(r=0, c=1, rs=1, cs=1, role="th", bbox=(150, 80, 250, 110), wordIds=["w2"]),
            CellIR(r=1, c=0, rs=1, cs=2, role="td", bbox=(50, 110, 250, 150), wordIds=["w3"]),
        ],
    )
    return PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=words,
        blocks=[
            HeadingBlock(id="b0", bbox=(48, 38, 130, 60), level=1, wordIds=["w0"]),
            tbl,
            FigureBlock(id="f0", bbox=(50, 200, 200, 260), figureKind="chart", keepText=True),
            ParagraphBlock(id="b1", bbox=(50, 300, 300, 330), wordIds=["w5"]),
        ],
        readingOrder=["b0", "t0", "f0", "b1"],
    )


def test_schema_matches_exported_json() -> None:
    schema_path = Path(__file__).resolve().parents[1] / "docstruct_engine" / "ir" / "schema.json"
    assert schema_path.is_file()
    loaded = json.loads(schema_path.read_text(encoding="utf-8"))
    assert loaded == build_json_schema()


def test_valid_page_and_figure_keep_text_exclusion() -> None:
    page = _valid_sample_page()
    res = validate_page_ir(page)
    assert res.ok, res.violations
    assert res.orphanWordIds == []
    doc = DocIR(docId="d1", srcHash="abc123", pages=[page])
    doc_res = validate_doc_ir(doc)
    assert doc_res[1].ok


def test_invariant1_grid_overlap_and_hole_detected() -> None:
    page = _valid_sample_page()
    tbl = page.blocks[1]
    assert isinstance(tbl, TableIR)
    # Remove merged bottom cell and put overlapping/partial cell -> overlap + hole
    tbl.cells = [
        CellIR(r=0, c=0, rs=1, cs=2, role="th", bbox=(50, 80, 250, 110), wordIds=["w1", "w2"]),
        CellIR(r=0, c=1, rs=1, cs=1, role="th", bbox=(150, 80, 250, 110)),
        CellIR(r=1, c=0, rs=1, cs=1, role="td", bbox=(50, 110, 150, 150), wordIds=["w3"]),
    ]
    res = validate_page_ir(page)
    assert not res.ok
    codes = {v.code for v in res.violations if v.invariant == 1}
    assert "CELL_OVERLAP" in codes
    assert "GRID_HOLE" in codes
    assert "t0" in res.failedTables


def test_invariant2_non_monotone_coords_detected() -> None:
    page = _valid_sample_page()
    tbl = page.blocks[1]
    assert isinstance(tbl, TableIR)
    tbl.colXs = [50.0, 200.0, 150.0]
    res = validate_page_ir(page)
    assert not res.ok
    assert any(v.invariant == 2 and v.code == "COL_XS_NOT_MONOTONE" for v in res.violations)


def test_invariant3_orphan_word_detected() -> None:
    page = _valid_sample_page()
    page.words.append(Word(id="w99", text="Orphan", bbox=(400, 400, 450, 415), src="vec"))
    res = validate_page_ir(page)
    assert not res.ok
    assert "w99" in res.orphanWordIds
    assert any(v.invariant == 3 and v.code == "ORPHAN_WORD" for v in res.violations)


def test_invariant4_geometric_containment_and_hwpx_skip() -> None:
    page = _valid_sample_page()
    # Swap w1 (in col 0: x 55..95) into cell (0,1) (x 150..250)
    tbl = page.blocks[1]
    assert isinstance(tbl, TableIR)
    tbl.cells[0].wordIds = []
    tbl.cells[1].wordIds = ["w1", "w2"]
    res = validate_page_ir(page)
    assert not res.ok
    assert any(v.invariant == 4 and v.code == "WORD_OUTSIDE_CELL" for v in res.violations)
    assert "w1" in res.outOfBoundsWordIds

    # When sourceKind == 'hwpx' and word bbox is None, Invariant #4 skips cleanly
    hwpx_page = page.model_copy(deep=True)
    hwpx_page.sourceKind = "hwpx"
    hwpx_page.words = [w for w in hwpx_page.words if w.id != "w4"]
    for w in hwpx_page.words:
        w.src = "hwpx"
        w.bbox = None
    assert validate_page_ir(hwpx_page).ok


def test_invariant6_reading_order_completeness() -> None:
    page = _valid_sample_page()
    page.readingOrder = ["b0", "t0"]
    res = validate_page_ir(page)
    assert not res.ok
    assert any(v.invariant == 6 and v.code == "READING_ORDER_INCOMPLETE" for v in res.violations)
