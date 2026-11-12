"""PDF 격자 탐지(`detect_tables`)와 폰트 이름 해독(`font_family`) 불변식 테스트 (`docstruct-engine`)."""
from __future__ import annotations

from docstruct_engine.acquire.pdf.fonts import font_family
from docstruct_engine.tables.grid_detect import detect_tables


def _h(x: float, y: float, x1: float, th: float = 0.96) -> dict:
    return {"orient": "h", "x": x, "y": y - th / 2, "x1": x1, "y1": y + th / 2, "thickness": th, "color": "#000000"}


def _v(x: float, y: float, y1: float, th: float = 0.96) -> dict:
    return {"orient": "v", "x": x - th / 2, "y": y, "x1": x + th / 2, "y1": y1, "thickness": th, "color": "#000000"}


def test_detect_tables_merges_cells_without_a_divider() -> None:
    # 3행 × 2열. 맨 아래 행에는 가운데 세로선이 없다 → 한 칸 (colSpan 2).
    rules = [
        _h(100, 100, 300),
        _h(100, 140, 300),
        _h(100, 180, 300),
        _h(100, 260, 300),
        _v(100, 100, 260),
        _v(300, 100, 260),
        _v(180, 100, 180),
    ]
    [table] = detect_tables(rules)
    assert table["row_ys"] == [100, 140, 180, 260]
    assert table["col_xs"] == [100, 180, 300]
    by_id = {c["id"]: c for c in table["cells"]}
    assert set(by_id) == {"T1.r0c0", "T1.r0c1", "T1.r1c0", "T1.r1c1", "T1.r2c0"}
    assert by_id["T1.r2c0"]["col_span"] == 2
    assert by_id["T1.r0c0"]["borders"]["right"] is not None
    assert by_id["T1.r2c0"]["borders"]["top"] is not None


def test_lone_underline_is_not_a_table() -> None:
    assert detect_tables([_h(100, 100, 300)]) == []


def test_font_family_decodes_cp949_and_strips_style() -> None:
    assert font_family("±¼¸²Ã¼") == "GulimChe"
    assert font_family("µ¸¿ò") == "Dotum"
    assert font_family("ABCDEF+TimesNewRoman,Bold") == "Times New Roman"
