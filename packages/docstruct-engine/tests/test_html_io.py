"""P3 tests for VLM HTML table codec, validation, multi-word fixes, and 2-reject image fallback."""
from __future__ import annotations

from pathlib import Path

from docstruct_engine.ir.model import CellIR, PageIR, PageSize, Ruling, TableIR, Word
from docstruct_engine.ir.validate import validate_page_ir
from docstruct_engine.tables.html_io import (
    render_table_proposal_html,
    validate_table_html_grid,
)
from docstruct_engine.tables.reconcile import (
    reconcile_table,
    validate_and_apply_word_fixes,
)
from PIL import Image


def _sample_page() -> PageIR:
    words = [
        Word(id="w0", text="Header", bbox=(60, 108, 120, 122), bold=True),
        Word(id="w1", text="Value", bbox=(210, 108, 260, 122), bold=True),
        Word(id="w2", text="Foo", bbox=(60, 138, 85, 152)),
        Word(id="w3", text="Bar", bbox=(90, 138, 115, 152)),
        Word(id="w4", text="Baz", bbox=(120, 138, 145, 152)),
        Word(id="w5", text="99", bbox=(210, 138, 230, 152)),
    ]
    rulings = [
        Ruling(orient="h", x0=50, y0=100, x1=300, y1=100),
        Ruling(orient="h", x0=50, y0=130, x1=300, y1=130),
        Ruling(orient="h", x0=50, y0=160, x1=300, y1=160),
        Ruling(orient="v", x0=50, y0=100, x1=50, y1=160),
        Ruling(orient="v", x0=180, y0=100, x1=180, y1=160),
        Ruling(orient="v", x0=300, y0=100, x1=300, y1=160),
    ]
    tbl = TableIR(
        id="t0",
        bbox=(50.0, 100.0, 300.0, 160.0),
        nRows=2,
        nCols=2,
        colXs=[50.0, 180.0, 300.0],
        rowYs=[100.0, 130.0, 160.0],
        cells=[
            CellIR(r=0, c=0, role="th", bbox=(50, 100, 180, 130), wordIds=["w0"], text="Header"),
            CellIR(r=0, c=1, role="th", bbox=(180, 100, 300, 130), wordIds=["w1"], text="Value"),
            CellIR(r=1, c=0, role="td", bbox=(50, 130, 180, 160), wordIds=["w2", "w3", "w4"], text="Foo Bar Baz"),
            CellIR(r=1, c=1, role="td", bbox=(180, 130, 300, 160), wordIds=["w5"], text="99"),
        ],
    )
    return PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595, height=842),
        words=words,
        rulings=rulings,
        blocks=[tbl],
        readingOrder=["t0"],
    )


def test_validate_table_html_grid_catches_errors() -> None:
    _, empty_err = validate_table_html_grid("<div>no table</div>")
    assert empty_err and empty_err[0].startswith("HTML_PARSE_EMPTY")

    overlap_html = (
        "<table><tr><td rowspan='2'>A</td><td>B</td></tr>"
        "<tr><td>C</td><td>D</td></tr></table>"
    )
    _, ov_err = validate_table_html_grid(overlap_html)
    assert any("HTML_SPAN_OVERLAP" in e or "HTML_JAGGED_GRID" in e for e in ov_err)

    jagged_html = "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>"
    _, jag_err = validate_table_html_grid(jagged_html)
    assert any("HTML_JAGGED_GRID" in e for e in jag_err)


def test_multiword_fixes_rules_and_last_fix_wins() -> None:
    page = _sample_page()

    # Cross-cell rejection
    ok_cross, err_cross = validate_and_apply_word_fixes(page, [{"wordIds": ["w2", "w5"], "text": "X"}])
    assert not ok_cross and any("FIX_CROSS_CONTAINER" in e for e in err_cross)

    # Non-contiguous slice inside one cell rejection (cell has w2, w3, w4)
    ok_gap, err_gap = validate_and_apply_word_fixes(page, [{"wordIds": ["w2", "w4"], "text": "X"}])
    assert not ok_gap and any("FIX_NON_CONTIGUOUS" in e for e in err_gap)

    # Valid contiguous slice + sequential override -> last fix wins
    ok_apply, err_apply = validate_and_apply_word_fixes(
        page,
        [
            {"wordIds": ["w2", "w3"], "text": "MergedFirst"},
            {"wordIds": ["w2", "w3"], "text": "FinalOverride"},
        ],
    )
    assert ok_apply and err_apply == []
    words_by_id = {w.id: w for w in page.words}
    assert words_by_id["w2"].text == "FinalOverride"
    assert words_by_id["w3"].text == ""
    assert words_by_id["w4"].text == "Baz"
    tbl = page.blocks[0]
    assert isinstance(tbl, TableIR)
    c10 = next(c for c in tbl.cells if c.r == 1 and c.c == 0)
    assert c10.text == "FinalOverride Baz"
    assert validate_page_ir(page).ok


def test_reconcile_table_and_two_reject_image_fallback(tmp_path: Path) -> None:
    page = _sample_page()
    tbl = page.blocks[0]
    assert isinstance(tbl, TableIR)
    html_prop = render_table_proposal_html(tbl, {w.id: w for w in page.words})
    assert 'data-w="w0"' in html_prop

    # Clean HTML update preserves structure & word ownership
    updated_html = (
        "<table><thead><tr><th>Title</th><th>Score</th></tr></thead>"
        "<tbody><tr><td>Foo Bar Baz</td><td>100</td></tr></tbody></table>"
    )
    res_ok = reconcile_table(page, "t0", html=updated_html)
    assert res_ok.ok and res_ok.page is not None and not res_ok.fallbackToImage
    assert validate_page_ir(res_ok.page).ok

    # Render synthetic PNG page to exercise 2nd rejection JPEG crop fallback (§12.7)
    png_path = tmp_path / "p1.png"
    Image.new("RGB", (595, 842), color=(255, 255, 255)).save(png_path)

    bad_html = "<table><tr><td>A</td></tr><tr><td>B</td><td>C</td></tr></table>"
    res1 = reconcile_table(page, "t0", html=bad_html, reject_count=0, page_png_path=png_path)
    assert not res1.ok and res1.rejectCount == 1 and not res1.fallbackToImage

    res2 = reconcile_table(page, "t0", html=bad_html, reject_count=res1.rejectCount, page_png_path=png_path)
    assert res2.ok and res2.fallbackToImage and res2.rejectCount == 2
    assert res2.table is not None
    assert res2.table.needsReview is True
    assert res2.table.imageFallbackSrc is not None
    assert res2.table.imageFallbackSrc.startswith("data:image/jpeg;base64,")
