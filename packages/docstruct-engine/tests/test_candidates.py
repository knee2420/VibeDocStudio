"""Tests for PyMuPDF acquisition, rotated coordinates, ruling tables, and horizontal-rule tables."""
from __future__ import annotations

from pathlib import Path

import pymupdf
from docstruct_engine.acquire import (
    classify_page_mode,
    extract_vector_rulings_and_fills,
    extract_vector_words,
)
from docstruct_engine.build import acquire_pages, build_page_ir
from docstruct_engine.ir.model import PageSize, Ruling, TableIR, Word
from docstruct_engine.ir.validate import validate_page_ir
from docstruct_engine.tables.candidates import propose_table_candidates


def _draw_table_pdf(pdf_path: Path, *, rotation: int = 0) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    # Title above table
    page.insert_text((72, 70), "System Architecture Overview", fontsize=16, fontname="helv")

    # 3x3 table with shaded header row and merged (0,1..2) cell:
    # x = [70, 200, 350, 500], y = [110, 140, 175, 210]
    shape = page.new_shape()
    # Shaded top row
    shape.draw_rect(pymupdf.Rect(70, 110, 500, 140))
    shape.finish(fill=(0.88, 0.90, 0.95), color=(0, 0, 0), width=1.0)
    shape.commit()

    shape = page.new_shape()
    xs = [70, 200, 350, 500]
    ys = [110, 140, 175, 210]
    # Horizontal lines
    for y in ys:
        shape.draw_line((xs[0], y), (xs[-1], y))
    # Outer vertical lines + left column line
    for x in (70, 200, 500):
        shape.draw_line((x, ys[0]), (x, ys[-1]))
    # Inner vertical divider only in body rows (row 0 merged across cols 1..2)
    shape.draw_line((350, ys[1]), (350, ys[-1]))
    shape.finish(color=(0, 0, 0), width=1.0)
    shape.commit()

    page.insert_text((90, 129), "Category", fontsize=10, fontname="helv")
    page.insert_text((310, 129), "Details", fontsize=10, fontname="helv")
    page.insert_text((90, 162), "CPU", fontsize=10, fontname="helv")
    page.insert_text((220, 162), "8 Cores", fontsize=10, fontname="helv")
    page.insert_text((370, 162), "3.6 GHz", fontsize=10, fontname="helv")
    page.insert_text((90, 197), "RAM", fontsize=10, fontname="helv")
    page.insert_text((220, 197), "32 GB", fontsize=10, fontname="helv")
    page.insert_text((370, 197), "DDR5", fontsize=10, fontname="helv")

    if rotation:
        page.set_rotation(rotation)
    doc.save(str(pdf_path))
    doc.close()


def test_vector_pdf_table_acquisition_and_invariants(tmp_path: Path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    _draw_table_pdf(pdf_path, rotation=0)

    src_hash, acquired = acquire_pages(pdf_path, cache_root=tmp_path / "cache")
    assert len(src_hash) == 16
    assert len(acquired) == 1
    acq = acquired[0]
    assert acq.sourceKind == "pdf-vector"
    assert acq.imagePath is not None and acq.imagePath.is_file()

    with pymupdf.open(str(pdf_path)) as doc:
        page_ir = build_page_ir(
            acq.words,
            acq.rulings,
            page_index=1,
            page_size=acq.size,
            source_kind=acq.sourceKind,
            fills_pt=acq.fillsPt,
            page=doc[0],
        )

    assert validate_page_ir(page_ir).violations == []
    tables = [b for b in page_ir.blocks if isinstance(b, TableIR)]
    assert len(tables) == 1
    tbl = tables[0]
    assert tbl.nRows == 3
    assert tbl.nCols == 3

    by_rc = {(c.r, c.c): c for c in tbl.cells}
    assert by_rc[(0, 1)].cs == 2
    assert by_rc[(0, 0)].role == "th"
    assert by_rc[(0, 0)].bg is not None
    assert "CPU" in (by_rc[(1, 0)].text or "")
    assert "DDR5" in (by_rc[(2, 2)].text or "")


def test_rotated_pdf_words_and_rulings_align(tmp_path: Path) -> None:
    pdf_path = tmp_path / "rot90.pdf"
    _draw_table_pdf(pdf_path, rotation=90)

    with pymupdf.open(str(pdf_path)) as doc:
        page = doc[0]
        mode = classify_page_mode(page)
        assert mode.kind == "pdf-vector"
        assert mode.rotation == 90
        rulings, fills = extract_vector_rulings_and_fills(page)
        words = extract_vector_words(page, rulings=rulings)
        page_ir = build_page_ir(
            words,
            rulings,
            page_index=1,
            page_size=PageSize(width=float(page.rect.width), height=float(page.rect.height)),
            source_kind="pdf-vector",
            fills_pt=fills,
            page=page,
        )

    assert page_ir.size.width > page_ir.size.height
    assert validate_page_ir(page_ir).violations == []
    tables = [b for b in page_ir.blocks if isinstance(b, TableIR)]
    assert len(tables) == 1
    cell_texts = " | ".join(c.text or "" for c in tables[0].cells)
    assert "Category" in cell_texts
    assert "DDR5" in cell_texts


def test_horizontal_only_ruling_table_candidate() -> None:
    rulings = [
        Ruling(orient="h", x0=50, y0=100, x1=450, y1=100),
        Ruling(orient="h", x0=50, y0=125, x1=450, y1=125),
        Ruling(orient="h", x0=50, y0=150, x1=450, y1=150),
        Ruling(orient="h", x0=50, y0=175, x1=450, y1=175),
    ]
    words = [
        Word(id="w0", text="Metric", bbox=(60, 108, 110, 120)),
        Word(id="w1", text="Score", bbox=(280, 108, 330, 120)),
        Word(id="w2", text="Precision", bbox=(60, 133, 130, 145)),
        Word(id="w3", text="0.96", bbox=(280, 133, 320, 145)),
        Word(id="w4", text="Recall", bbox=(60, 158, 120, 170)),
        Word(id="w5", text="0.94", bbox=(280, 158, 320, 170)),
    ]
    cands = propose_table_candidates(rulings, words)
    assert len(cands) == 1
    assert len(cands[0].rowYs) == 4
    assert len(cands[0].colXs) == 3
