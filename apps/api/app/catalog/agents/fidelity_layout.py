"""truth.json → 쪽 모델(줄 · 표 격자) → .vdoc 한 쪽.

생성기는 결정적이다. 같은 truth · 분할안(plan) · 보정값(tune)이면 같은 문서가 나온다.

    build_page_model   글자 덩어리를 기준선으로 묶어 줄을 만들고, 얇은 선(rules)으로 표 격자를 잡는다.
                       경계선이 없는 칸은 합친다(colSpan · rowSpan). 표 안 글자는 칸에, 나머지는 "글 줄"로.
    default_plan       글 줄을 블록으로 나누는 기본안 (조항 머리 · 큰 간격 · 글자 크기 변화에서 끊는다)
    validate_plan      LLM 이 낸 분할안이 글 줄을 빠짐없이 순서대로 한 번씩 덮는지 검사
    render_page        모델 + 분할안 + 보정값 → .vdoc 쪽과 슬롯

글자는 PDF 좌표에 그대로 놓는다. 위치를 정하는 숫자(칸 padding · 줄 margin-left · margin-top)는 전부
truth 에서 계산하고, 브라우저와 PDF 의 체계적 차이만 보정값(tune)으로 민다.
"""
from __future__ import annotations

import html
import math
import re
from bisect import bisect_right
from typing import Any, Optional

PX = 96.0 / 72.0
LINE_TOL = 1.6  # 같은 줄로 볼 기준선 차 px
EDGE_TOL = 1.5  # 같은 경계선으로 볼 선 중심 차 px
COVER_MIN = 0.6  # 칸 경계로 인정할 선 길이 비율
MIN_EDGE_LEN = 4.0  # 이보다 짧은 선 조각(모서리 이음새)만 있는 경계는 버린다
NBSP = "\u00a0"  # ProseMirror 가 접지 않는 공백

#: 보정값. 브라우저가 PDF 와 체계적으로 다르게 놓는 양만 민다. 칸 · 줄 하나하나를 손으로 옮기는 값이 아니다.
TUNABLES: dict[str, dict[str, Any]] = {
    "size_offsets": {"type": "map", "range": [-12, 12], "default": {},
                     "doc": "글자 크기(pt)별 줄 상자 오프셋 px {\"11.04\": -1}. 그 크기 글자를 이만큼 위로 올린다 (L-05, D-OFFSET 제안값)"},
    "text_dx": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 밖 글 블록 전체를 가로로 미는 px"},
    "text_dy": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 밖 글 블록 전체를 세로로 미는 px"},
    "table_dx": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 상자(선 포함)를 가로로 미는 px"},
    "table_dy": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 상자(선 포함)를 세로로 미는 px"},
    "cell_dx": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 칸 안 글자만 가로로 미는 px (선은 그대로)"},
    "cell_dy": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 칸 안 글자만 세로로 미는 px (선은 그대로)"},
    "line_height_scale": {"type": "number", "range": [0.8, 1.3], "default": 1.0,
                          "doc": "줄 높이 = 글자px × F × 배율. 여러 줄 블록에서 dy 가 줄마다 쌓일 때만 (L-04)"},
}

_FONT_ALIASES = {
    "굴림체": "GulimChe", "gulimche": "GulimChe", "굴림": "Gulim", "gulim": "Gulim",
    "돋움": "Dotum", "dotum": "Dotum", "돋움체": "DotumChe", "dotumche": "DotumChe",
    "바탕": "Batang", "batang": "Batang", "바탕체": "BatangChe", "batangche": "BatangChe",
    "궁서": "Gungsuh", "궁서체": "GungsuhChe", "맑은고딕": "Malgun Gothic", "malgungothic": "Malgun Gothic",
    "timesnewroman": "Times New Roman", "arial": "Arial", "couriernew": "Courier New",
    "dejavusans": "DejaVu Sans", "wingdings": "Wingdings", "symbol": "Symbol",
}
_STYLE_SUFFIX = re.compile(r"[,-]?(BoldItalic|BoldMT|ItalicMT|Bold|Italic|Regular|PSMT|MT)$", re.I)


def _r(v: float) -> float:
    return round(float(v), 2)


def default_tune() -> dict[str, Any]:
    return {k: (dict(spec["default"]) if isinstance(spec["default"], dict) else spec["default"]) for k, spec in TUNABLES.items()}


def validate_tune_changes(changes: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    accepted: dict[str, Any] = {}
    errors: list[str] = []
    for key, value in changes.items():
        spec = TUNABLES.get(key)
        if spec is None:
            errors.append(f"모르는 보정 키 '{key}'. 쓸 수 있는 키: {', '.join(TUNABLES)}")
            continue
        lo, hi = spec["range"]
        if spec["type"] == "map":
            if not isinstance(value, dict):
                errors.append(f"{key} 는 {{\"글자pt\": px}} 객체여야 함")
                continue
            clean: dict[str, float] = {}
            for pt, px in value.items():
                try:
                    pt_key, num = str(round(float(pt), 2)), float(px)
                except (TypeError, ValueError):
                    errors.append(f"{key}[{pt!r}]={px!r} 는 숫자여야 함")
                    continue
                if not lo <= num <= hi:
                    errors.append(f"{key}[{pt_key}]={num} 는 [{lo}, {hi}] 범위 밖")
                    continue
                clean[pt_key] = round(num, 3)
            if clean:
                accepted[key] = clean
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            errors.append(f"{key}={value!r} 는 숫자여야 함")
            continue
        if not lo <= num <= hi:
            errors.append(f"{key}={num} 는 [{lo}, {hi}] 범위 밖")
            continue
        accepted[key] = round(num, 3)
    return accepted, errors


# --- 글꼴 ------------------------------------------------------------------------


def decode_font_name(name: str) -> str:
    """부분 글꼴 접두어를 떼고, Latin1 로 잘못 읽힌 CP949 이름(L-16)을 되돌린다."""
    base = (name or "").split("+", 1)[-1]
    try:
        decoded = base.encode("latin1").decode("cp949")
        if re.search(r"[가-힣]", decoded):
            return decoded
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return base


def font_family(name: str) -> str:
    """PDF 글꼴 이름 → CSS 글꼴 이름 (굵기 · 기울임 꼬리는 뗀다)."""
    family = decode_font_name(name)
    while True:
        stripped = _STYLE_SUFFIX.sub("", family)
        if stripped == family:
            break
        family = stripped
    key = family.replace(" ", "").lower()
    return _FONT_ALIASES.get(family, _FONT_ALIASES.get(key, family))


def _css_family(name: str) -> str:
    return f"'{font_family(name)}'"


def css_border_px(thickness: float) -> float:
    """크롬은 테두리 두께를 정수 px 로 내린다 (1 미만은 1, L-10)."""
    if thickness <= 0:
        return 0.0
    return max(1.0, math.floor(thickness + 1e-6))


# --- 표 격자 ----------------------------------------------------------------------


def _segments(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segs = []
    for i, r in enumerate(rules):
        if r.get("orient") == "h":
            segs.append({"i": i, "o": "h", "c": (r["y"] + r["y1"]) / 2, "a": r["x"], "b": r["x1"],
                         "th": r.get("thickness", r["y1"] - r["y"]), "color": r.get("color") or "#000000", "rect": r})
        else:
            segs.append({"i": i, "o": "v", "c": (r["x"] + r["x1"]) / 2, "a": r["y"], "b": r["y1"],
                         "th": r.get("thickness", r["x1"] - r["x"]), "color": r.get("color") or "#000000", "rect": r})
    return segs


def _connected_groups(segs: list[dict[str, Any]], tol: float = 1.5) -> list[list[dict[str, Any]]]:
    parent = list(range(len(segs)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, a in enumerate(segs):
        ra = a["rect"]
        for j in range(i + 1, len(segs)):
            rb = segs[j]["rect"]
            if ra["x"] - tol <= rb["x1"] and rb["x"] - tol <= ra["x1"] and ra["y"] - tol <= rb["y1"] and rb["y"] - tol <= ra["y1"]:
                parent[find(i)] = find(j)
    groups: dict[int, list[dict[str, Any]]] = {}
    for i, s in enumerate(segs):
        groups.setdefault(find(i), []).append(s)
    return list(groups.values())


def _edges(segs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """같은 중심선의 조각을 한 경계선으로 모은다."""
    edges: list[dict[str, Any]] = []
    for s in sorted(segs, key=lambda s: s["c"]):
        if edges and abs(s["c"] - edges[-1]["c"]) <= EDGE_TOL:
            edges[-1]["segs"].append(s)
        else:
            edges.append({"c": s["c"], "segs": [s]})
    out = []
    for e in edges:
        long_segs = [s for s in e["segs"] if s["b"] - s["a"] >= MIN_EDGE_LEN]
        if not long_segs:
            continue
        e["c"] = sum(s["c"] for s in long_segs) / len(long_segs)
        out.append(e)
    return out


def _coverage(edge: dict[str, Any], a: float, b: float) -> tuple[float, float, str]:
    """경계선이 [a, b] 구간을 덮는 비율과, 덮는 선의 두께 · 색."""
    if b <= a:
        return 0.0, 0.0, "#000000"
    spans = sorted(((max(a, s["a"]), min(b, s["b"]), s) for s in edge["segs"] if s["b"] > a and s["a"] < b),
                   key=lambda it: (it[0], it[1]))
    covered, cur_a, cur_b = 0.0, None, None
    th, color = 0.0, "#000000"
    for sa, sb, s in spans:
        if sb - sa >= MIN_EDGE_LEN and s["th"] > th:
            th, color = s["th"], s["color"]
        if cur_b is None or sa > cur_b:
            if cur_b is not None:
                covered += cur_b - cur_a
            cur_a, cur_b = sa, sb
        else:
            cur_b = max(cur_b, sb)
    if cur_b is not None:
        covered += cur_b - cur_a
    return covered / (b - a), th, color


def detect_tables(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tables = []
    for group in _connected_groups(_segments(rules)):
        rows = _edges([s for s in group if s["o"] == "h"])
        cols = _edges([s for s in group if s["o"] == "v"])
        if len(rows) < 2 or len(cols) < 2:
            continue
        row_ys = [e["c"] for e in rows]
        col_xs = [e["c"] for e in cols]
        if row_ys[-1] - row_ys[0] < 8 or col_xs[-1] - col_xs[0] < 8:
            continue
        n_r, n_c = len(row_ys) - 1, len(col_xs) - 1
        parent = {(r, c): (r, c) for r in range(n_r) for c in range(n_c)}

        def find(u: tuple[int, int]) -> tuple[int, int]:
            while parent[u] != u:
                parent[u] = parent[parent[u]]
                u = parent[u]
            return u

        for r in range(n_r):
            for c in range(n_c):
                if c + 1 < n_c and _coverage(cols[c + 1], row_ys[r], row_ys[r + 1])[0] < COVER_MIN:
                    parent[find((r, c))] = find((r, c + 1))
                if r + 1 < n_r and _coverage(rows[r + 1], col_xs[c], col_xs[c + 1])[0] < COVER_MIN:
                    parent[find((r, c))] = find((r + 1, c))
        units: dict[tuple[int, int], list[tuple[int, int]]] = {}
        for u in parent:
            units.setdefault(find(u), []).append(u)
        tid = f"T{len(tables) + 1}"
        cells = []
        unit_cell: dict[tuple[int, int], str] = {}
        for members in sorted(units.values(), key=lambda m: min(m)):
            r0, c0 = min(m[0] for m in members), min(m[1] for m in members)
            r1, c1 = max(m[0] for m in members), max(m[1] for m in members)
            x, x1, y, y1 = col_xs[c0], col_xs[c1 + 1], row_ys[r0], row_ys[r1 + 1]
            borders = {}
            for side, edge, a, b in (("top", rows[r0], x, x1), ("bottom", rows[r1 + 1], x, x1),
                                     ("left", cols[c0], y, y1), ("right", cols[c1 + 1], y, y1)):
                cov, th, color = _coverage(edge, a, b)
                borders[side] = {"th": _r(th), "color": color} if cov >= COVER_MIN else None
            cid = f"{tid}.r{r0}c{c0}"
            for m in members:
                unit_cell[m] = cid
            cells.append({"id": cid, "row": r0, "col": c0, "row_span": r1 - r0 + 1, "col_span": c1 - c0 + 1,
                          "x": _r(x), "y": _r(y), "x1": _r(x1), "y1": _r(y1), "borders": borders, "lines": []})
        tables.append({"id": tid, "x": _r(col_xs[0]), "y": _r(row_ys[0]), "x1": _r(col_xs[-1]), "y1": _r(row_ys[-1]),
                       "col_xs": [_r(v) for v in col_xs], "row_ys": [_r(v) for v in row_ys],
                       "cells": cells, "_unit_cell": unit_cell})
    tables.sort(key=lambda t: (t["y"], t["x"]))
    for i, t in enumerate(tables):  # 위에서부터 다시 번호
        old, new = t["id"], f"T{i + 1}"
        if old != new:
            t["id"] = new
            for c in t["cells"]:
                c["id"] = new + c["id"][len(old):]
            t["_unit_cell"] = {u: new + cid[len(old):] for u, cid in t["_unit_cell"].items()}
    return tables


def _cell_of(tables: list[dict[str, Any]], cx: float, cy: float) -> Optional[str]:
    for t in tables:
        if t["x"] <= cx <= t["x1"] and t["y"] <= cy <= t["y1"]:
            c = min(max(bisect_right(t["col_xs"], cx) - 1, 0), len(t["col_xs"]) - 2)
            r = min(max(bisect_right(t["row_ys"], cy) - 1, 0), len(t["row_ys"]) - 2)
            return t["_unit_cell"].get((r, c))
    return None


# --- 쪽 모델 ----------------------------------------------------------------------


def _group_lines(spans: list[tuple[int, dict[str, Any]]]) -> list[list[tuple[int, dict[str, Any]]]]:
    lines: list[list[tuple[int, dict[str, Any]]]] = []
    for item in sorted(spans, key=lambda it: (it[1].get("baseline", it[1]["y1"]), it[1]["x"])):
        base = item[1].get("baseline", item[1]["y1"])
        if lines and abs(base - lines[-1][0][1].get("baseline", lines[-1][0][1]["y1"])) < LINE_TOL:
            lines[-1].append(item)
        else:
            lines.append([item])
    return [sorted(ln, key=lambda it: it[1]["x"]) for ln in lines]


def _main_span(line: list[tuple[int, dict[str, Any]]]) -> dict[str, Any]:
    """줄의 문단 글꼴 · 크기를 정할 덩어리: 가장 큰 글자 중 글자가 가장 많은 것 (기호 글꼴은 뒤로)."""
    def key(it: tuple[int, dict[str, Any]]) -> tuple[bool, float, int]:
        s = it[1]
        return (font_family(s["font"]) not in ("Wingdings", "Symbol"), s["pt"], len(s["text"]))
    return max(line, key=key)[1]


def build_page_model(truth: dict[str, Any]) -> dict[str, Any]:
    spans = truth.get("spans", [])
    tables = detect_tables(truth.get("rules", []))
    containers: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    for i, s in enumerate(spans):
        where = _cell_of(tables, (s["x"] + s["x1"]) / 2, (s["y"] + s["y1"]) / 2) or "text"
        containers.setdefault(where, []).append((i, s))

    raw_lines = []
    for where, items in containers.items():
        for ln in _group_lines(items):
            main = _main_span(ln)
            raw_lines.append({
                "where": where, "spans": [i for i, _ in ln],
                "x": _r(min(s["x"] for _, s in ln)), "x1": _r(max(s["x1"] for _, s in ln)),
                "y": _r(main["y"]), "y1": _r(max(s["y1"] for _, s in ln)), "baseline": _r(main.get("baseline", main["y1"])),
                "pt": main["pt"], "font": font_family(main["font"]), "font_ref": main.get("font_ref"),
                "bold": bool(main.get("bold")), "text": _line_text([s for _, s in ln]),
            })
    raw_lines.sort(key=lambda ln: (ln["y"], ln["x"]))
    cell_index = {c["id"]: c for t in tables for c in t["cells"]}
    for n, ln in enumerate(raw_lines):
        ln["id"] = f"L{n:02d}"
        if ln["where"] != "text":
            cell_index[ln["where"]]["lines"].append(ln["id"])

    fonts_f = {name: f.get("content_height") for name, f in (truth.get("fonts") or {}).items() if f.get("content_height")}
    page = truth.get("page", {"width": 794, "height": 1123})
    layout = truth.get("page_layout") or {}
    box = layout.get("content_box") or [0, 0, page["width"], page["height"]]
    return {
        "page": page,
        "content_box": box,
        "lines": raw_lines,
        "tables": [{k: v for k, v in t.items() if not k.startswith("_")} for t in tables],
        "images": truth.get("images", []),
        "fonts_f": fonts_f,
        "warnings": [w for w in truth.get("warnings", [])],
    }


def _line_text(spans: list[dict[str, Any]]) -> str:
    out, prev = "", None
    for s in spans:
        if prev is not None and s["x"] - prev["x1"] > s["pt"] * PX * 0.25:
            out += " "
        out += s["text"]
        prev = s
    return out


def text_lines(model: dict[str, Any]) -> list[dict[str, Any]]:
    return [ln for ln in model["lines"] if ln["where"] == "text"]


# --- 분할안 ------------------------------------------------------------------------

_ARTICLE = re.compile(r"^(제\s*\d+\s*(조|장|절)|부\s*칙|\[별표)")


def default_plan(model: dict[str, Any]) -> dict[str, Any]:
    """글 줄 → 블록 기본안. 조 · 장 머리, 글자 크기 변화, 줄 높이 1.5배 넘는 간격에서 끊는다."""
    blocks: list[dict[str, Any]] = []
    prev = None
    for ln in text_lines(model):
        lh = ln["pt"] * PX * 1.2
        new_block = (
            prev is None
            or abs(ln["pt"] - prev["pt"]) > 0.5
            or ln["y"] - prev["y1"] > lh * 1.5
            or bool(_ARTICLE.match(ln["text"]))
        )
        if new_block:
            blocks.append({"id": f"B{len(blocks) + 1}", "title": ln["text"][:24], "lines": [ln["id"], ln["id"]]})
        else:
            blocks[-1]["lines"][1] = ln["id"]
        prev = ln
    return {"blocks": blocks, "table_titles": {t["id"]: f"표 {t['id']}" for t in model["tables"]}, "source": "default"}


def validate_plan(model: dict[str, Any], plan: dict[str, Any]) -> list[str]:
    order = [ln["id"] for ln in text_lines(model)]
    pos = {lid: i for i, lid in enumerate(order)}
    errors: list[str] = []
    blocks = plan.get("blocks")
    if not isinstance(blocks, list):
        return ["blocks 는 [{id, title, lines: [첫 줄 id, 끝 줄 id]}] 목록이어야 함"]
    expect = 0
    seen_ids: set[str] = set()
    for b in blocks:
        rng = b.get("lines") if isinstance(b, dict) else None
        if not (isinstance(rng, list) and len(rng) == 2 and all(r in pos for r in rng)):
            errors.append(f"블록 {b!r}: lines 는 글 줄 id 두 개 [첫, 끝] 이어야 함 (표 안 줄은 넣지 않는다)")
            continue
        a, z = pos[rng[0]], pos[rng[1]]
        if a != expect:
            errors.append(f"블록 {b.get('id')}: {rng[0]} 에서 시작해야 하는데 빠지거나 겹친 줄이 있음 (기대 {order[expect] if expect < len(order) else '없음'})")
        if z < a:
            errors.append(f"블록 {b.get('id')}: 끝 줄이 첫 줄보다 앞")
        expect = z + 1
        bid = str(b.get("id") or "")
        if not re.fullmatch(r"[A-Za-z0-9_]{1,24}", bid) or bid in seen_ids:
            errors.append(f"블록 id {bid!r} 는 영문 · 숫자 · _ 로 된 겹치지 않는 이름이어야 함")
        seen_ids.add(bid)
    if not errors and expect != len(order):
        errors.append(f"마지막 블록 뒤에 남은 줄: {order[expect]}~{order[-1]}")
    return errors


def line_block_index(model: dict[str, Any], plan: dict[str, Any]) -> dict[str, str]:
    """줄 id → 그 줄이 들어간 블록 id (표 안 줄은 칸 id)."""
    order = [ln["id"] for ln in text_lines(model)]
    pos = {lid: i for i, lid in enumerate(order)}
    out: dict[str, str] = {}
    for b in plan.get("blocks", []):
        a, z = pos.get(b["lines"][0]), pos.get(b["lines"][1])
        if a is None or z is None:
            continue
        for lid in order[a:z + 1]:
            out[lid] = b["id"]
    for ln in model["lines"]:
        if ln["where"] != "text":
            out[ln["id"]] = ln["where"]
    return out


# --- 그리기 ------------------------------------------------------------------------


def _offset(tune: dict[str, Any], pt: float) -> float:
    return float((tune.get("size_offsets") or {}).get(str(round(float(pt), 2)), 0.0))


def _line_height(model: dict[str, Any], ln: dict[str, Any], tune: dict[str, Any]) -> float:
    f = model["fonts_f"].get(ln.get("font_ref") or "", 1.0)
    return _r(ln["pt"] * PX * f * float(tune.get("line_height_scale", 1.0)))


def _span_html(s: dict[str, Any], *, gap: float) -> str:
    """글자 덩어리 → 토큰마다 <span>. 스타일은 토큰 span 하나에 전부 싣는다.

    Tiptap 은 겹친 <span> 을 textStyle 표시 하나로 합치면서 안쪽 span 의 속성만 남긴다. 바깥 span 에
    글꼴을 두고 안쪽에 letter-spacing 만 두면 글꼴이 사라져 문단 글꼴로 그려진다.
    """
    tokens = s.get("tokens") or [{"t": s["text"], "ls": 0.0}]
    while tokens and not tokens[0]["t"].strip() and s["text"] and not s["text"][0].isspace():
        tokens = tokens[1:]  # 01 은 앞 공백을 뗀 x 를 쓴다
    if not s.get("trailing_space"):
        while tokens and not tokens[-1]["t"].strip():
            tokens = tokens[:-1]
    base = [f"font-size: {s['pt']}pt", f"font-family: {_css_family(s['font'])}",
            f"color: {s.get('color') or '#000000'}", f"font-weight: {'bold' if s.get('bold') else 'normal'}"]
    inner = ""
    for k, tk in enumerate(tokens):
        # ProseMirror 는 연속 공백을 하나로 접는다. NBSP 는 접지 않고, 02 는 NBSP 를 공백으로 읽는다.
        text = html.escape(tk["t"]).replace(" ", NBSP)
        styles = list(base)
        ls = float(tk.get("ls") or 0.0)
        if abs(ls) > 0.0005:
            styles.append(f"letter-spacing: {round(ls, 4)}px")
        # PDF 는 앞 덩어리 끝보다 살짝 앞에서 다음 덩어리를 시작하기도 한다 (겹침). 음수도 그대로 둬야 밀림이 안 쌓인다.
        if k == 0 and abs(gap) > 0.05:
            styles.append(f"margin-left: {gap}px")
        inner += f'<span style="{"; ".join(styles)}">{text}</span>'
    return inner


def _paragraph(model: dict[str, Any], ln: dict[str, Any], spans: list[dict[str, Any]], tune: dict[str, Any],
               *, left: float, top_gap: float) -> str:
    lh = _line_height(model, ln, tune)
    p_style = (
        f"font-size: {ln['pt']}pt; line-height: {lh}px; font-family: '{ln['font']}'; "
        f"margin: 0; margin-top: {_r(top_gap)}px; margin-left: {_r(max(0.0, ln['x'] - left))}px; "
        "text-align: left; white-space: pre; font-kerning: none; font-variant-ligatures: none"
    )
    inner, prev = "", None
    for s in spans:
        gap = 0.0
        if prev is not None:
            prev_end = prev.get("x1_raw", prev["x1"]) if prev.get("trailing_space") else prev["x1"]
            gap = _r(s["x"] - prev_end)
        inner += _span_html(s, gap=gap)
        prev = s
    return f'<p style="{p_style}">{inner}</p>'


def _stack(model: dict[str, Any], lines: list[dict[str, Any]], spans: list[dict[str, Any]], tune: dict[str, Any],
           *, left: float, top: float, dy: float = 0.0) -> tuple[str, float]:
    """줄들을 위에서부터 쌓는다. 반환: (HTML, 마지막 줄 아래 끝 y)."""
    parts, cursor = [], top
    for ln in lines:
        box_top = ln["y"] - _offset(tune, ln["pt"]) + dy
        parts.append(_paragraph(model, ln, [spans[i] for i in ln["spans"]], tune, left=left, top_gap=box_top - cursor))
        cursor = box_top + _line_height(model, ln, tune)
    return "".join(parts), cursor


def _slot(slot_id: str, label: str, content: str, *, locked: bool = False) -> dict[str, Any]:
    return {"slotId": slot_id, "label": label, "role": "boilerplate" if locked else "editable-slot",
            "content": content, "constraints": {"locked": locked}, "backDataRefs": []}


def render_page(
    model: dict[str, Any],
    truth: dict[str, Any],
    plan: dict[str, Any],
    tune: dict[str, Any],
    *,
    page_number: int = 1,
    page_label: str = "",
    image_srcs: Optional[dict[int, str]] = None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    spans = truth["spans"]
    lines_by_id = {ln["id"]: ln for ln in model["lines"]}
    slots: dict[str, dict[str, Any]] = {}
    blocks: list[dict[str, Any]] = []
    prefix = f"p{page_number}"
    page_w = float(model["page"]["width"])

    # 1. 표
    for t in model["tables"]:
        tx, ty = float(tune.get("table_dx", 0)), float(tune.get("table_dy", 0))
        cdx, cdy = float(tune.get("cell_dx", 0)), float(tune.get("cell_dy", 0))
        width = t["x1"] - t["x"]
        rows: list[dict[str, Any]] = []
        for r in range(len(t["row_ys"]) - 1):
            cells_out = []
            for c in sorted((c for c in t["cells"] if c["row"] == r), key=lambda c: c["col"]):
                slot_id = f"{prefix}_{c['id'].replace('.', '_')}"
                b = c["borders"]
                top_w = css_border_px(b["top"]["th"]) if b["top"] else 0.0
                left_w = css_border_px(b["left"]["th"]) if b["left"] else 0.0
                # 겹친 테두리 모델: 칸 안쪽은 경계선 중심에서 테두리 절반만큼 들어간 곳부터.
                inner_left = c["x"] + left_w / 2 - cdx
                inner_top = c["y"] + top_w / 2 - cdy
                cell_lines = [lines_by_id[lid] for lid in c["lines"]]
                if cell_lines:
                    first_top = cell_lines[0]["y"] - _offset(tune, cell_lines[0]["pt"])
                    pad_top = max(0.0, first_top - inner_top)
                    content, _ = _stack(model, cell_lines, spans, tune, left=inner_left, top=inner_top + pad_top)
                    label = cell_lines[0]["text"][:24]
                else:
                    pad_top, content, label = 0.0, "<p></p>", f"{c['id']} (빈 칸)"
                slots[slot_id] = _slot(slot_id, label, content)
                cell = {
                    "cellId": f"cell_{slot_id}", "slotId": slot_id, "vAlign": "top", "hAlign": "left",
                    "padding": f"{_r(pad_top)}px 0 0 0", "backgroundColor": "transparent",
                    "fontSize": f"{cell_lines[0]['pt'] if cell_lines else 10}pt", "lineHeight": "normal",
                }
                for side in ("top", "right", "bottom", "left"):
                    edge = b[side]
                    cell[f"border{side.capitalize()}"] = f"{edge['th']}px solid {edge['color']}" if edge else "none"
                if c["col_span"] > 1:
                    cell["colSpan"] = c["col_span"]
                if c["row_span"] > 1:
                    cell["rowSpan"] = c["row_span"]
                cells_out.append(cell)
            rows.append({"rowId": f"{prefix}_{t['id']}_row{r}", "height": f"{_r(t['row_ys'][r + 1] - t['row_ys'][r])}px",
                         "cells": cells_out})
        col_widths = [f"{round((t['col_xs'][i + 1] - t['col_xs'][i]) / width * 100, 4)}%" for i in range(len(t["col_xs"]) - 1)]
        blocks.append({
            "blockId": f"{prefix}_{t['id']}", "kind": "structured-table",
            "title": (plan.get("table_titles") or {}).get(t["id"]) or f"표 {t['id']}",
            "frame": {"x": _r(t["x"] + tx), "y": _r(t["y"] + ty), "w": _r(width)},
            "columnWidths": col_widths,
            "borderRules": {"outer": "none", "rowBottom": "none", "vertical": "none", "headerBottom": "none"},
            "headerStyle": {"bg": "transparent", "fontWeight": "400"},
            "rows": rows, "locked": False,
        })

    # 2. 표 밖 글 블록
    box = model["content_box"]
    left = float(box[0])
    width = min(float(box[2]) - left, page_w - left)
    tdx, tdy = float(tune.get("text_dx", 0)), float(tune.get("text_dy", 0))
    order = [ln["id"] for ln in text_lines(model)]
    pos = {lid: i for i, lid in enumerate(order)}
    for b in plan.get("blocks", []):
        a, z = pos.get(b["lines"][0]), pos.get(b["lines"][1])
        if a is None or z is None:
            continue
        b_lines = [lines_by_id[lid] for lid in order[a:z + 1]]
        top = b_lines[0]["y"] - _offset(tune, b_lines[0]["pt"]) + tdy
        content, bottom = _stack(model, b_lines, spans, tune, left=left + tdx, top=top, dy=tdy)
        slot_id = f"{prefix}_{b['id']}"
        slots[slot_id] = _slot(slot_id, b.get("title") or b_lines[0]["text"][:24], content)
        blocks.append({
            "blockId": slot_id, "kind": "text", "title": b.get("title") or b_lines[0]["text"][:24], "slotId": slot_id,
            "frame": {"x": _r(left + tdx), "y": _r(top), "w": _r(width), "h": _r(max(1.0, bottom - top))},
            "locked": False,
        })

    # 3. 그림
    for k, im in enumerate(model.get("images", [])):
        src = (image_srcs or {}).get(k)
        if not src:
            continue
        w, h = im["x1"] - im["x"], im["y1"] - im["y"]
        blocks.append({
            "blockId": f"{prefix}_img{k + 1}", "kind": "image", "title": f"그림 {k + 1}", "src": src, "alt": "",
            "width": f"{_r(w)}px", "height": f"{_r(h)}px", "objectFit": "fill", "align": "left",
            "frame": {"x": _r(im["x"]), "y": _r(im["y"]), "w": _r(w), "h": _r(h)},
        })

    blocks.sort(key=lambda b: (b["frame"]["y"], b["frame"]["x"]))
    header_id, footer_id = f"{prefix}_slot_header", f"{prefix}_slot_footer"
    slots[header_id] = _slot(header_id, f"{page_number}페이지 머리글", "<p></p>", locked=True)
    slots[footer_id] = _slot(footer_id, f"{page_number}페이지 바닥글", "<p></p>", locked=True)
    page = {
        "pageId": f"page_{page_number}", "pageNumber": page_number,
        "pageLabel": page_label or f"{page_number}p",
        "hideHeaderFooter": True, "headerSlotId": header_id, "footerSlotId": footer_id,
        "blocks": blocks,
        "pageRect": {"width": model["page"]["width"], "height": model["page"]["height"]},
        "layout": {"exactText": True, "margin": {"top": 0, "right": 0, "bottom": 0, "left": 0}},
    }
    return page, slots
