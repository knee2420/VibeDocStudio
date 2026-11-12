"""PDF primitive unit tests internalized into docstruct-engine (char normalizer, drawings, dashed rules, table grid)."""
from __future__ import annotations

import pymupdf
from docstruct_engine.acquire.pdf import (
    PX,
    CharAtom,
    atoms_from_rawdict,
    deduplicate_faux_bold,
    extract_drawings,
    find_underline_targets,
    normalize_chars_to_spans,
    stitch_dashed_rules,
    vertical_walls_from_rules,
)
from docstruct_engine.tables.grid_detect import detect_tables


def _atom(
    ch: str,
    x0: float,
    x1: float,
    *,
    y0: float = 100.0,
    y1: float = 114.0,
    pt: float = 10.0,
    font: str = "MalgunGothic",
    bold: bool = False,
) -> CharAtom:
    return CharAtom(
        c=ch,
        x0=x0,
        y0=y0,
        x1=x1,
        y1=y1,
        origin_x=x0,
        baseline=y1 - 2.0,
        pt=pt,
        font=font,
        color="#000000",
        bold=bold,
        italic=False,
        block=0,
        line=0,
    )


def test_faux_bold_dedup_promotes_bold_and_collapses_duplicate() -> None:
    """Overprinted identical glyphs within 0.15em collapse to one bold atom."""
    atoms = [
        _atom("성", 10.0, 22.0),
        _atom("성", 10.4, 22.4),  # faux-bold overprint
        _atom("명", 23.0, 35.0),
    ]
    cleaned = deduplicate_faux_bold(atoms)
    assert [a.c for a in cleaned] == ["성", "명"]
    assert cleaned[0].bold is True
    assert cleaned[1].bold is False


def test_backtracking_reorders_out_of_stream_punctuation_and_restores_spaces() -> None:
    """Font-batched punctuation emitted out of visual order is sorted back cleanly."""
    # Stream order emits parentheses AFTER the inner text, as GDI PDF printers do
    raw = {
        "blocks": [
            {
                "type": 0,
                "lines": [
                    {
                        "dir": (1.0, 0.0),
                        "bbox": (10.0, 90.0, 140.0, 104.0),
                        "spans": [
                            {
                                "size": 10.0,
                                "font": "Batang",
                                "flags": 0,
                                "color": 0,
                                "origin": (20.0, 102.0),
                                "bbox": (20.0, 90.0, 100.0, 104.0),
                                "chars": [
                                    {"c": "수", "bbox": (20.0, 90.0, 30.0, 104.0), "origin": (20.0, 102.0)},
                                    {"c": "신", "bbox": (30.0, 90.0, 40.0, 104.0), "origin": (30.0, 102.0)},
                                    {"c": "인", "bbox": (44.0, 90.0, 54.0, 104.0), "origin": (44.0, 102.0)},
                                ],
                            },
                            {
                                "size": 10.0,
                                "font": "Gulim",
                                "flags": 0,
                                "color": 0,
                                "origin": (12.0, 102.0),
                                "bbox": (12.0, 90.0, 68.0, 104.0),
                                "chars": [
                                    {"c": "(", "bbox": (12.0, 90.0, 17.0, 104.0), "origin": (12.0, 102.0)},
                                    {"c": ")", "bbox": (54.0, 90.0, 59.0, 104.0), "origin": (54.0, 102.0)},
                                ],
                            },
                        ],
                    }
                ],
            }
        ]
    }
    atoms = atoms_from_rawdict(raw)
    spans = normalize_chars_to_spans(atoms, space_ratio=0.20)
    assert len(spans) == 1
    assert spans[0]["text"] == "(수신 인)"


def test_vertical_wall_splits_spans_across_column_boundary() -> None:
    """A vertical cell wall between close glyphs prevents merging across cells."""
    atoms = [
        _atom("구분", 50.0, 80.0),
        _atom("내용", 88.0, 118.0),
    ]
    spans = normalize_chars_to_spans(atoms, vertical_walls=[(84.0, 90.0, 130.0)])
    assert [s["text"] for s in spans] == ["구분", "내용"]


def test_extract_drawings_rules_and_non_white_fills_only() -> None:
    """Vector stroked paths yield rules; shaded fills are preserved while white page fills are skipped."""
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=300)
    shape = page.new_shape()
    shape.draw_rect(pymupdf.Rect(0, 0, 400, 300))
    shape.finish(fill=(1, 1, 1), color=None)
    shape.draw_rect(pymupdf.Rect(30, 30, 150, 60))
    shape.finish(fill=(0.9, 0.9, 0.9), color=(0, 0, 0), width=1.0)
    shape.draw_line(pymupdf.Point(30, 80), pymupdf.Point(150, 80))
    shape.finish(color=(0, 0, 0), width=0.75)
    shape.commit()

    rules, fills = extract_drawings(page)
    walls = vertical_walls_from_rules(rules)
    assert len(fills) == 1
    assert fills[0]["color"] == "#e5e5e5"
    assert round(fills[0]["x"], 1) == round(30 * PX, 1)
    assert len(rules) >= 5
    assert len(walls) == 2
    doc.close()


def test_stitch_dashed_rules_merges_segments_within_gap() -> None:
    """Small co-linear dash segments stitch into a single dashed rule, leaving large gaps separate."""
    dashes = [
        {"x": 10.0 + i * 6.0, "y": 50.0, "x1": 13.0 + i * 6.0, "y1": 51.0, "thickness": 1.0, "orient": "h", "color": "#000000"}
        for i in range(4)
    ]
    far = {"x": 80.0, "y": 50.0, "x1": 120.0, "y1": 51.0, "thickness": 1.0, "orient": "h", "color": "#000000"}
    stitched = stitch_dashed_rules(dashes + [far], dash_max_gap=5.0)
    assert len(stitched) == 2
    first = min(stitched, key=lambda r: r["x"])
    assert first["dashed"] is True
    assert first["x"] == 10.0 and first["x1"] == 31.0


def test_detect_tables_handles_colspan_fill_and_underline_exclusion() -> None:
    """2x2 grid with merged top row (`col_span=2`) and shaded cell detects cleanly."""
    rules = [
        {"x": 10.0, "y": 10.0, "x1": 210.0, "y1": 11.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 10.0, "y": 40.0, "x1": 210.0, "y1": 41.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 10.0, "y": 70.0, "x1": 210.0, "y1": 71.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 10.0, "y": 10.0, "x1": 11.0, "y1": 70.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
        {"x": 110.0, "y": 40.0, "x1": 111.0, "y1": 70.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
        {"x": 210.0, "y": 10.0, "x1": 211.0, "y1": 70.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
    ]
    fills = [{"x": 10.0, "y": 10.0, "x1": 210.0, "y1": 40.0, "color": "#eeeeee"}]
    tables = detect_tables(rules, fills=fills)
    assert len(tables) == 1
    cells = {(c["row"], c["col"]): c for c in tables[0]["cells"]}
    assert cells[(0, 0)]["col_span"] == 2
    assert cells[(0, 0)]["bg"] == "#eeeeee"
    assert (1, 0) in cells and (1, 1) in cells

    under_line = {"id": "L_under", "text": "서명", "x": 15.0, "y": 120.0, "x1": 65.0, "y1": 134.0}
    extra_rule = {"x": 15.0, "y": 135.0, "x1": 65.0, "y1": 136.0, "thickness": 1.0, "orient": "h", "color": "#000000"}
    assert "L_under" in find_underline_targets([under_line], [extra_rule], tables)
