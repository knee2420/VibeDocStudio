"""truth 기반 생성기(fidelity_layout)와 진단(fidelity_diagnosis)의 불변식 테스트 (브라우저 없이)."""
import json
import re
from pathlib import Path

from app.catalog.agents.fidelity_diagnosis import diagnose
from app.catalog.agents.fidelity_layout import (
    build_page_model,
    default_plan,
    default_tune,
    detect_tables,
    font_family,
    line_block_index,
    render_page,
    text_lines,
    validate_plan,
    validate_tune_changes,
)

VFORM_TRUTH = Path(__file__).resolve().parents[3] / "work" / "fidelity" / "vform_107824" / "truth.json"


def _h(x, y, x1, th=0.96):
    return {"orient": "h", "x": x, "y": y - th / 2, "x1": x1, "y1": y + th / 2, "thickness": th, "color": "#000000"}


def _v(x, y, y1, th=0.96):
    return {"orient": "v", "x": x - th / 2, "y": y, "x1": x + th / 2, "y1": y1, "thickness": th, "color": "#000000"}


def _span(text, x, y, pt=10.0, **extra):
    w = len(text) * pt * 96 / 72
    return {"text": text, "x": x, "y": y, "x1": x + w, "y1": y + pt * 96 / 72, "baseline": y + pt * 1.1,
            "pt": pt, "font": "±¼¸²Ã¼", "color": "#000000", "bold": False, **extra}


def test_detect_tables_merges_cells_without_a_divider() -> None:
    # 3행 × 2열. 맨 아래 행에는 가운데 세로선이 없다 → 한 칸 (colSpan 2).
    rules = [_h(100, 100, 300), _h(100, 140, 300), _h(100, 180, 300), _h(100, 260, 300),
             _v(100, 100, 260), _v(300, 100, 260), _v(180, 100, 180)]
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


def test_page_model_puts_spans_in_cells_and_renders_padding_from_truth() -> None:
    rules = [_h(100, 100, 300), _h(100, 140, 300), _v(100, 100, 140), _v(300, 100, 140), _v(180, 100, 140)]
    truth = {"page": {"width": 794, "height": 1123}, "rules": rules,
             "spans": [_span("일 시", 110, 112), _span("오전 10시", 190, 112), _span("본문", 120, 300)]}
    model = build_page_model(truth)
    where = {ln["text"]: ln["where"] for ln in model["lines"]}
    assert where == {"일 시": "T1.r0c0", "오전 10시": "T1.r0c1", "본문": "text"}

    plan = default_plan(model)
    assert validate_plan(model, plan) == []
    page, slots = render_page(model, truth, plan, default_tune())
    table = next(b for b in page["blocks"] if b["kind"] == "structured-table")
    cell = table["rows"][0]["cells"][0]
    # 칸 안쪽 위 = 선 중심 100 + 그려진 테두리 1px 의 절반 → 글자 y 112 까지 11.5px
    assert cell["padding"].startswith("11.5px")
    html = slots[cell["slotId"]]["content"]
    assert "margin-left: 9.5px" in html  # 글자 x 110 - (선 중심 100 + 0.5)
    assert page["layout"]["exactText"] is True


def test_every_token_span_carries_its_own_font() -> None:
    # Tiptap 은 겹친 span 을 하나의 textStyle 로 합치며 안쪽 속성만 남긴다 → 토큰 span 마다 글꼴이 있어야 한다.
    tokens = [{"t": "가", "ls": 0.1}, {"t": "  ", "ls": 0.5}, {"t": "나", "ls": 0.0}]
    truth = {"page": {"width": 794, "height": 1123}, "rules": [],
             "spans": [_span("가  나", 100, 100, tokens=tokens), _span("“", 160, 100, font="TimesNewRoman", tokens=[{"t": "“", "ls": 0}])]}
    truth["spans"][1]["x"] = truth["spans"][0]["x1"] - 0.4  # PDF 의 겹침
    model = build_page_model(truth)
    page, slots = render_page(model, truth, default_plan(model), default_tune())
    html = next(s["content"] for s in slots.values() if "가" in s["content"])
    spans = re.findall(r'<span style="([^"]*)">([^<]*)</span>', html)
    assert len(spans) == 4
    assert all("font-family" in style for style, _ in spans)
    assert "  " in html  # 연속 공백은 NBSP
    assert "Times New Roman" in spans[-1][0] and "margin-left: -0.4px" in spans[-1][0]


def test_validate_plan_rejects_gaps_overlaps_and_table_lines() -> None:
    truth = json.loads(VFORM_TRUTH.read_text(encoding="utf-8"))
    model = build_page_model(truth)
    ids = [ln["id"] for ln in text_lines(model)]
    assert len(ids) == 38 and not model["tables"]
    good = {"blocks": [{"id": "B1", "title": "제목", "lines": [ids[0], ids[1]]},
                       {"id": "B2", "title": "본문", "lines": [ids[2], ids[-1]]}]}
    assert validate_plan(model, good) == []
    gap = {"blocks": [{"id": "B1", "title": "x", "lines": [ids[0], ids[1]]}, {"id": "B2", "title": "y", "lines": [ids[3], ids[-1]]}]}
    assert validate_plan(model, gap)
    short = {"blocks": [{"id": "B1", "title": "x", "lines": [ids[0], ids[5]]}]}
    assert validate_plan(model, short)
    dup = {"blocks": [{"id": "B1", "title": "x", "lines": [ids[0], ids[1]]}, {"id": "B1", "title": "y", "lines": [ids[2], ids[-1]]}]}
    assert validate_plan(model, dup)

    blocks = line_block_index(model, good)
    assert blocks[ids[0]] == "B1" and blocks[ids[-1]] == "B2"


def test_default_plan_keeps_numbered_items_with_their_article() -> None:
    truth = json.loads(VFORM_TRUTH.read_text(encoding="utf-8"))
    model = build_page_model(truth)
    plan = default_plan(model)
    titles = [b["title"] for b in plan["blocks"]]
    assert not any(t.startswith("1. ") for t in titles), titles
    page, _ = render_page(model, truth, plan, default_tune())
    for b in page["blocks"]:  # L-15: 블록은 종이 안
        assert b["frame"]["x"] >= 0 and b["frame"]["x"] + b["frame"]["w"] <= 794


def test_font_family_decodes_cp949_and_strips_style() -> None:
    assert font_family("±¼¸²Ã¼") == "GulimChe"
    assert font_family("µ¸¿ò") == "Dotum"
    assert font_family("ABCDEF+TimesNewRoman,Bold") == "Times New Roman"


def test_validate_tune_changes_checks_keys_and_ranges() -> None:
    ok, errors = validate_tune_changes({"size_offsets": {"10.08": -1.01}, "cell_dx": -0.67})
    assert ok == {"size_offsets": {"10.08": -1.01}, "cell_dx": -0.67} and not errors
    ok, errors = validate_tune_changes({"cell_dx": 99, "nope": 1})
    assert ok == {} and len(errors) == 2


def test_diagnose_prescribes_size_offset_with_tune_sign() -> None:
    truth = {"page": {"width": 794, "height": 1123}, "rules": [],
             "spans": [_span(f"줄{i}", 100, 100 + i * 30) for i in range(6)]}
    model = build_page_model(truth)
    plan = default_plan(model)
    verify = {"summary": {"tol_pos": 1.0}, "findings": [],
              "spans": [{"i": i, "dx": 0.0, "dx1": 0.0, "dy": -1.0, "err": 1.0} for i in range(6)]}
    d = diagnose(model=model, truth=truth, measure={"rules": [], "spans": []}, verify=verify,
                 line_block=line_block_index(model, plan), tune=default_tune())
    [p] = d["prescriptions"]
    assert p["lesson"] == "L-05"
    # 그려진 글자가 1px 위(dy -1) → 그 크기를 1px 덜 올린다(오프셋 -1). 03 의 원시 제안과 부호가 반대다.
    assert p["action"]["args"]["changes"] == {"size_offsets": {"10.0": -1.0}}
