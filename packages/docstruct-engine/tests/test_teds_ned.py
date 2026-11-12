"""P0 tests for self-contained Zhang-Shasha TEDS/TEDS-S, NED, Ruling Line F1, Field F1."""
from __future__ import annotations

from docstruct_engine.ir import (
    CellIR,
    FieldBlock,
    PageIR,
    PageSize,
    ParagraphBlock,
    Ruling,
    TableIR,
    Word,
)
from docstruct_engine.verify import (
    compare_rulings,
    compute_ned,
    compute_teds,
    evaluate_fields,
    page_ned,
    table_grid_lines,
)


def test_teds_identical_and_implicit_tbody() -> None:
    a = "<table><tr><th>Item</th><th>Qty</th></tr><tr><td colspan='2'>None</td></tr></table>"
    b = "<table><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody><tr><td colspan='2'>None</td></tr></tbody></table>"
    assert compute_teds(a, b) == 1.0
    assert compute_teds(a, b, structure_only=True) == 1.0


def test_teds_structure_vs_text_sensitivity() -> None:
    gold = "<table><thead><tr><th>Name</th><th>Amount</th></tr></thead><tbody><tr><td>Fee</td><td>1000</td></tr></tbody></table>"
    text_diff = "<table><thead><tr><th>Name</th><th>Amount</th></tr></thead><tbody><tr><td>Fee</td><td>2000</td></tr></tbody></table>"
    span_diff = "<table><thead><tr><th>Name</th><th>Amount</th></tr></thead><tbody><tr><td colspan='2'>Fee 1000</td></tr></tbody></table>"

    assert compute_teds(gold, text_diff, structure_only=True) == 1.0
    assert compute_teds(gold, text_diff, structure_only=False) < 1.0
    assert compute_teds(gold, span_diff, structure_only=True) < 1.0


def test_ned_reading_order_sensitivity() -> None:
    assert compute_ned("Alpha Beta", "Alpha Beta") == 0.0
    assert 0.0 < compute_ned("Alpha Beta", "Alpha Gamma") < 1.0

    p1 = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=500, height=700),
        words=[
            Word(id="w0", text="First", bbox=(10, 10, 50, 25)),
            Word(id="w1", text="Second", bbox=(10, 40, 60, 55)),
        ],
        blocks=[
            ParagraphBlock(id="b0", bbox=(10, 10, 50, 25), wordIds=["w0"]),
            ParagraphBlock(id="b1", bbox=(10, 40, 60, 55), wordIds=["w1"]),
        ],
        readingOrder=["b0", "b1"],
    )
    p2 = p1.model_copy(deep=True)
    p2.readingOrder = ["b1", "b0"]
    assert page_ned(p1, p1) == 0.0
    assert page_ned(p1, p2) > 0.5


def test_ruling_line_f1_with_merged_spans() -> None:
    tbl = TableIR(
        id="t0",
        bbox=(0, 0, 200, 100),
        nRows=2,
        nCols=2,
        colXs=[0.0, 100.0, 200.0],
        rowYs=[0.0, 50.0, 100.0],
        cells=[
            CellIR(r=0, c=0, rs=1, cs=1, bbox=(0, 0, 100, 50)),
            CellIR(r=0, c=1, rs=1, cs=1, bbox=(100, 0, 200, 50)),
            CellIR(r=1, c=0, rs=1, cs=2, bbox=(0, 50, 200, 100)),
        ],
    )
    lines = table_grid_lines(tbl)
    gold = [
        Ruling(orient="h", x0=0, y0=0, x1=200, y1=0),
        Ruling(orient="h", x0=0, y0=50, x1=200, y1=50),
        Ruling(orient="h", x0=0, y0=100, x1=200, y1=100),
        Ruling(orient="v", x0=0, y0=0, x1=0, y1=100),
        Ruling(orient="v", x0=100, y0=0, x1=100, y1=50),
        Ruling(orient="v", x0=200, y0=0, x1=200, y1=100),
    ]
    res = compare_rulings(lines, gold)
    assert res.f1 == 1.0

    # Drop middle vertical ruling -> lower recall
    res_missing = compare_rulings([r for r in lines if not (r.orient == "v" and abs(r.x0 - 100.0) < 1)], gold)
    assert res_missing.recall < 1.0
    assert len(res_missing.missingBoxes) == 1


def test_field_f1() -> None:
    p_gold = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=500, height=700),
        blocks=[
            FieldBlock(id="f0", bbox=(20, 20, 120, 40), fieldKind="date", label="Date"),
            FieldBlock(id="f1", bbox=(20, 60, 120, 80), fieldKind="sign", label="Sign"),
        ],
        readingOrder=["f0", "f1"],
    )
    p_pred = p_gold.model_copy(deep=True)
    assert evaluate_fields(p_pred, p_gold).f1 == 1.0
    p_pred.blocks[1].fieldKind = "line"  # type: ignore[union-attr]
    assert evaluate_fields(p_pred, p_gold).f1 == 0.5
