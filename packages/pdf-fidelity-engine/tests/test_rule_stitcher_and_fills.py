"""점선 경계 병합(1x3 다단표) · 셀 배경 Fill · 제목 밑줄 탐지 및 VDoc HTML 반영 테스트."""
from __future__ import annotations

from pdf_fidelity_engine import (
    build_page_model,
    default_plan,
    default_tune,
    detect_tables,
    render_page,
    stitch_dashed_rules,
)


def _table_outer_box_and_dashed_dividers() -> tuple[list[dict], list[dict]]:
    # 바깥 테두리 100..700 x 100..220 + x=300, x=500 에 높이 1px 점선 조각들이 y=102..216 사이 3px 간격으로 찍힌 표
    rules = [
        {"x": 100.0, "y": 100.0, "x1": 700.0, "y1": 101.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 100.0, "y": 219.0, "x1": 700.0, "y1": 220.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 100.0, "y": 100.0, "x1": 101.0, "y1": 220.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
        {"x": 699.0, "y": 100.0, "x1": 700.0, "y1": 220.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
    ]
    for dx in (300.0, 500.0):
        for y in range(102, 218, 4):
            rules.append(
                {
                    "x": dx,
                    "y": float(y),
                    "x1": dx + 1.0,
                    "y1": float(y) + 1.2,
                    "thickness": 1.0,
                    "orient": "v",
                    "color": "#666666",
                    "dashed": True,
                }
            )
    fills = [
        {"x": 101.0, "y": 101.0, "x1": 299.0, "y1": 219.0, "color": "#cccccc"},
    ]
    return rules, fills


def test_stitched_dashed_dividers_split_table_into_three_columns_with_fill() -> None:
    rules, fills = _table_outer_box_and_dashed_dividers()
    stitched = stitch_dashed_rules(rules, dash_max_gap=6.0)
    tables = detect_tables(stitched, fills=fills)
    assert len(tables) == 1
    tbl = tables[0]
    assert len(tbl["row_ys"]) - 1 == 1
    assert len(tbl["col_xs"]) - 1 == 3
    assert tbl["cells"][0]["bg"] == "#cccccc"
    assert tbl["cells"][1].get("bg") is None


def test_render_page_applies_cell_background_dashed_border_and_heading_underline() -> None:
    rules, fills = _table_outer_box_and_dashed_dividers()
    # 표 위 x=100..220, y=72 위치에 '회의 진행 방법' + 그 아래 1px 밑줄 규칙 추가
    rules.append({"x": 100.0, "y": 73.0, "x1": 220.0, "y1": 74.2, "thickness": 1.2, "orient": "h", "color": "#000000"})

    truth = {
        "page": {"width": 794, "height": 1123},
        "page_layout": {"content_box": [100.0, 50.0, 700.0, 220.0]},
        "spans": [
            {
                "text": "회의 진행 방법",
                "x": 100.0,
                "y": 54.0,
                "x1": 220.0,
                "y1": 71.0,
                "baseline": 69.0,
                "pt": 13.0,
                "font": "MalgunGothic",
                "css_font": "Malgun Gothic",
                "color": "#000000",
                "bold": True,
                "tokens": [{"t": "회의 진행 방법", "ls": 0.0}],
            },
            {
                "text": "1. 개회사",
                "x": 110.0,
                "y": 115.0,
                "x1": 180.0,
                "y1": 130.0,
                "baseline": 128.0,
                "pt": 10.5,
                "font": "MalgunGothic",
                "css_font": "Malgun Gothic",
                "color": "#000000",
                "bold": False,
                "tokens": [{"t": "1. 개회사", "ls": 0.0}],
            },
        ],
        "rules": rules,
        "fills": fills,
        "images": [],
        "fonts": {},
        "warnings": [],
    }
    model = build_page_model(truth, dash_max_gap=6.0)
    plan = default_plan(model)
    tune = default_tune()
    page, slots = render_page(model, truth, plan, tune, page_number=1)

    text_blocks = [b for b in page["blocks"] if b["kind"] == "text"]
    table_blocks = [b for b in page["blocks"] if b["kind"] == "structured-table"]
    assert len(table_blocks) == 1
    row_cells = table_blocks[0]["rows"][0]["cells"]
    assert len(row_cells) == 3
    assert row_cells[0]["backgroundColor"] == "#cccccc"
    assert "dashed" in (row_cells[0].get("borderRight") or "")
    heading_html = slots[text_blocks[0]["slotId"]]["content"]
    assert "text-decoration: underline" in heading_html


def test_double_border_parallel_edges_and_l_shape_partition_without_phantom_cells() -> None:
    # 1.8px 간격 이중 테두리(x=98/99.8, y=100/101.8, y=220/221.8) + 행 0..1만 있는 헤더-바디 구조
    rules = [
        # 이중 좌측 세로선 + 우측 세로선 + 내부 세로선
        {"x": 97.6, "y": 100.0, "x1": 98.4, "y1": 222.0, "thickness": 0.8, "orient": "v", "color": "#000000"},
        {"x": 99.4, "y": 100.0, "x1": 100.2, "y1": 222.0, "thickness": 0.8, "orient": "v", "color": "#000000"},
        {"x": 180.0, "y": 100.0, "x1": 181.0, "y1": 222.0, "thickness": 0.8, "orient": "v", "color": "#000000"},
        {"x": 499.0, "y": 100.0, "x1": 500.0, "y1": 222.0, "thickness": 0.8, "orient": "v", "color": "#000000"},
        # 이중 상/하/중간 가로선
        {"x": 98.0, "y": 99.6, "x1": 500.0, "y1": 100.4, "thickness": 0.8, "orient": "h", "color": "#000000"},
        {"x": 98.0, "y": 101.4, "x1": 500.0, "y1": 102.2, "thickness": 0.8, "orient": "h", "color": "#000000"},
        {"x": 98.0, "y": 139.6, "x1": 500.0, "y1": 140.4, "thickness": 0.8, "orient": "h", "color": "#000000"},
        {"x": 98.0, "y": 141.4, "x1": 500.0, "y1": 142.2, "thickness": 0.8, "orient": "h", "color": "#000000"},
        {"x": 98.0, "y": 219.6, "x1": 500.0, "y1": 220.4, "thickness": 0.8, "orient": "h", "color": "#000000"},
        {"x": 98.0, "y": 221.4, "x1": 500.0, "y1": 222.2, "thickness": 0.8, "orient": "h", "color": "#000000"},
    ]
    tables = detect_tables(rules)
    assert len(tables) == 1
    tbl = tables[0]
    n_rows = len(tbl["row_ys"]) - 1
    n_cols = len(tbl["col_xs"]) - 1
    assert (n_rows, n_cols) == (2, 2)
    assert sum(c["row_span"] * c["col_span"] for c in tbl["cells"]) == n_rows * n_cols
    assert len(tbl["cells"]) == 4


def test_non_rectangular_l_shape_component_decomposes_into_disjoint_rectangles() -> None:
    # 2x2 격자에서 (0,1) 우상단만 벽으로 막고 {(0,0), (1,0), (1,1)} 을 ㄴ자 형태로 연결했을 때
    # 바운딩 박스로 2x2 전체를 삼키지 않고 겹침 없는 직사각형들로 분할되어야 한다.
    rules = [
        {"x": 100.0, "y": 100.0, "x1": 300.0, "y1": 101.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 200.0, "y": 140.0, "x1": 300.0, "y1": 141.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 100.0, "y": 180.0, "x1": 300.0, "y1": 181.0, "thickness": 1.0, "orient": "h", "color": "#000000"},
        {"x": 100.0, "y": 100.0, "x1": 101.0, "y1": 181.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
        {"x": 200.0, "y": 100.0, "x1": 201.0, "y1": 141.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
        {"x": 299.0, "y": 100.0, "x1": 300.0, "y1": 181.0, "thickness": 1.0, "orient": "v", "color": "#000000"},
    ]
    [tbl] = detect_tables(rules)
    assert (len(tbl["row_ys"]) - 1, len(tbl["col_xs"]) - 1) == (2, 2)
    assert sum(c["row_span"] * c["col_span"] for c in tbl["cells"]) == 4
    assert max(c["row_span"] * c["col_span"] for c in tbl["cells"]) <= 2
