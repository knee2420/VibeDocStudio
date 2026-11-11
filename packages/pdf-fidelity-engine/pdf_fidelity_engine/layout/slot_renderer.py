"""쪽 모델 + 분할안 + 보정값 → 클린 슬롯 HTML · .vdoc 한 쪽 조립."""
from __future__ import annotations

import html
from typing import Any, Optional

from ..fonts.metrics import PX_PER_PT
from ..fonts.registry import font_family
from .table_grid import css_border_px, text_lines

PX = PX_PER_PT
NBSP = "\u00a0"

DEFAULT_TUNABLES: dict[str, dict[str, Any]] = {
    "size_offsets": {"type": "map", "range": [-12, 12], "default": {}, "doc": "글자 크기(pt)별 줄 상자 오프셋 px"},
    "text_dx": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 밖 글 블록 가로 이동 px"},
    "text_dy": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 밖 글 블록 세로 이동 px"},
    "table_dx": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 상자 가로 이동 px"},
    "table_dy": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 상자 세로 이동 px"},
    "cell_dx": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 칸 글자 가로 이동 px"},
    "cell_dy": {"type": "number", "range": [-20, 20], "default": 0, "doc": "표 칸 글자 세로 이동 px"},
    "line_height_scale": {"type": "number", "range": [0.8, 1.3], "default": 1.0, "doc": "줄 높이 배율"},
}


def _r(v: float) -> float:
    return round(float(v), 2)


def default_tune(tunables_spec: Optional[dict[str, dict[str, Any]]] = None) -> dict[str, Any]:
    spec_map = tunables_spec if tunables_spec is not None else DEFAULT_TUNABLES
    return {
        k: (dict(spec["default"]) if isinstance(spec["default"], dict) else spec["default"])
        for k, spec in spec_map.items()
    }


def validate_tune_changes(
    changes: dict[str, Any],
    *,
    tunables_spec: Optional[dict[str, dict[str, Any]]] = None,
) -> tuple[dict[str, Any], list[str]]:
    spec_map = tunables_spec if tunables_spec is not None else DEFAULT_TUNABLES
    accepted: dict[str, Any] = {}
    errors: list[str] = []
    for key, value in changes.items():
        spec = spec_map.get(key)
        if spec is None:
            errors.append(f"모르는 보정 키 '{key}'. 쓸 수 있는 키: {', '.join(spec_map)}")
            continue
        lo, hi = spec["range"]
        if spec["type"] == "map":
            if not isinstance(value, dict):
                errors.append(f'{key} 는 {{"글자pt": px}} 객체여야 함')
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


def _offset(tune: dict[str, Any], pt: float) -> float:
    return float((tune.get("size_offsets") or {}).get(str(round(float(pt), 2)), 0.0))


def _line_height(model: dict[str, Any], ln: dict[str, Any], tune: dict[str, Any]) -> float:
    f = model["fonts_f"].get(ln.get("font_ref") or "", 1.0)
    return _r(ln["pt"] * PX * f * float(tune.get("line_height_scale", 1.0)))


def _span_html(
    s: dict[str, Any],
    *,
    gap: float,
    underline: bool = False,
    font_aliases: Optional[dict[str, str]] = None,
) -> str:
    tokens = s.get("tokens") or [{"t": s["text"], "ls": 0.0}]
    while tokens and not tokens[0]["t"].strip() and s["text"] and not s["text"][0].isspace():
        tokens = tokens[1:]
    if not s.get("trailing_space"):
        while tokens and not tokens[-1]["t"].strip():
            tokens = tokens[:-1]

    fam = s.get("css_font") or font_family(s["font"], aliases=font_aliases)
    base = [
        f"font-size: {s['pt']}pt",
        f"font-family: '{fam}'",
        f"color: {s.get('color') or '#000000'}",
        f"font-weight: {'bold' if s.get('bold') else 'normal'}",
    ]
    if underline:
        base.append("text-decoration: underline")

    inner = ""
    for k, tk in enumerate(tokens):
        text = html.escape(tk["t"]).replace(" ", NBSP)
        styles = list(base)
        ls = float(tk.get("ls") or 0.0)
        if abs(ls) > 0.0005:
            styles.append(f"letter-spacing: {round(ls, 4)}px")
        if k == 0 and abs(gap) > 0.05:
            styles.append(f"margin-left: {gap}px")
        inner += f'<span style="{"; ".join(styles)}">{text}</span>'
    return inner


def _paragraph(
    model: dict[str, Any],
    ln: dict[str, Any],
    spans: list[dict[str, Any]],
    tune: dict[str, Any],
    *,
    left: float,
    top_gap: float,
    font_aliases: Optional[dict[str, str]] = None,
    clamp_negative_gap_px: float = -3.0,
) -> str:
    lh = _line_height(model, ln, tune)
    p_style = (
        f"font-size: {ln['pt']}pt; line-height: {lh}px; font-family: '{ln['font']}'; "
        f"margin: 0; margin-top: {_r(top_gap)}px; margin-left: {_r(max(0.0, ln['x'] - left))}px; "
        "text-align: left; white-space: pre; font-kerning: none; font-variant-ligatures: none"
    )
    underline = bool(ln.get("underline"))
    inner, prev = "", None
    for s in spans:
        gap = 0.0
        if prev is not None:
            prev_end = prev.get("x1_raw", prev["x1"]) if prev.get("trailing_space") else prev["x1"]
            gap = _r(s["x"] - prev_end)
            # 대체 폰트 사용 시 대형 음수 마진 되감기는 브라우저에서 글자 겹침 폭주를 유발하므로 안전하게 클램프한다.
            if gap < clamp_negative_gap_px and (not prev.get("tokens") or not s.get("tokens")):
                gap = 0.0
        inner += _span_html(s, gap=gap, underline=underline, font_aliases=font_aliases)
        prev = s
    return f'<p style="{p_style}">{inner}</p>'


def _stack(
    model: dict[str, Any],
    lines: list[dict[str, Any]],
    spans: list[dict[str, Any]],
    tune: dict[str, Any],
    *,
    left: float,
    top: float,
    dy: float = 0.0,
    font_aliases: Optional[dict[str, str]] = None,
    clamp_negative_gap_px: float = -3.0,
) -> tuple[str, float]:
    parts, cursor = [], top
    for ln in lines:
        box_top = ln["y"] - _offset(tune, ln["pt"]) + dy
        parts.append(
            _paragraph(
                model,
                ln,
                [spans[i] for i in ln["spans"]],
                tune,
                left=left,
                top_gap=box_top - cursor,
                font_aliases=font_aliases,
                clamp_negative_gap_px=clamp_negative_gap_px,
            )
        )
        cursor = box_top + _line_height(model, ln, tune)
    return "".join(parts), cursor


def _slot(slot_id: str, label: str, content: str, *, locked: bool = False) -> dict[str, Any]:
    return {
        "slotId": slot_id,
        "label": label,
        "role": "boilerplate" if locked else "editable-slot",
        "content": content,
        "constraints": {"locked": locked},
        "backDataRefs": [],
    }


def render_page(
    model: dict[str, Any],
    truth: dict[str, Any],
    plan: dict[str, Any],
    tune: dict[str, Any],
    *,
    page_number: int = 1,
    page_label: str = "",
    image_srcs: Optional[dict[int, str]] = None,
    font_aliases: Optional[dict[str, str]] = None,
    clamp_negative_gap_px: float = -3.0,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    spans = truth["spans"]
    lines_by_id = {ln["id"]: ln for ln in model["lines"]}
    slots: dict[str, dict[str, Any]] = {}
    blocks: list[dict[str, Any]] = []
    prefix = f"p{page_number}"
    page_w = float(model["page"]["width"])

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
                inner_left = c["x"] + left_w / 2 - cdx
                inner_top = c["y"] + top_w / 2 - cdy
                cell_lines = [lines_by_id[lid] for lid in c["lines"]]
                if cell_lines:
                    first_top = cell_lines[0]["y"] - _offset(tune, cell_lines[0]["pt"])
                    pad_top = max(0.0, first_top - inner_top)
                    content, _ = _stack(
                        model,
                        cell_lines,
                        spans,
                        tune,
                        left=inner_left,
                        top=inner_top + pad_top,
                        font_aliases=font_aliases,
                        clamp_negative_gap_px=clamp_negative_gap_px,
                    )
                    label = cell_lines[0]["text"][:24]
                else:
                    pad_top, content, label = 0.0, "<p></p>", f"{c['id']} (빈 칸)"
                slots[slot_id] = _slot(slot_id, label, content)
                cell = {
                    "cellId": f"cell_{slot_id}",
                    "slotId": slot_id,
                    "vAlign": "top",
                    "hAlign": "left",
                    "padding": f"{_r(pad_top)}px 0 0 0",
                    "backgroundColor": c.get("bg") or "transparent",
                    "fontSize": f"{cell_lines[0]['pt'] if cell_lines else 10}pt",
                    "lineHeight": "normal",
                }
                for side in ("top", "right", "bottom", "left"):
                    edge = b[side]
                    if edge:
                        style_kw = "dashed" if edge.get("dashed") else "solid"
                        cell[f"border{side.capitalize()}"] = f"{edge['th']}px {style_kw} {edge['color']}"
                    else:
                        cell[f"border{side.capitalize()}"] = "none"
                if c["col_span"] > 1:
                    cell["colSpan"] = c["col_span"]
                if c["row_span"] > 1:
                    cell["rowSpan"] = c["row_span"]
                cells_out.append(cell)
            rows.append(
                {
                    "rowId": f"{prefix}_{t['id']}_row{r}",
                    "height": f"{_r(t['row_ys'][r + 1] - t['row_ys'][r])}px",
                    "cells": cells_out,
                }
            )
        col_widths = [
            f"{round((t['col_xs'][i + 1] - t['col_xs'][i]) / width * 100, 4)}%"
            for i in range(len(t["col_xs"]) - 1)
        ]
        blocks.append(
            {
                "blockId": f"{prefix}_{t['id']}",
                "kind": "structured-table",
                "title": (plan.get("table_titles") or {}).get(t["id"]) or f"표 {t['id']}",
                "frame": {"x": _r(t["x"] + tx), "y": _r(t["y"] + ty), "w": _r(width)},
                "columnWidths": col_widths,
                "borderRules": {"outer": "none", "rowBottom": "none", "vertical": "none", "headerBottom": "none"},
                "headerStyle": {"bg": "transparent", "fontWeight": "400"},
                "rows": rows,
                "locked": False,
            }
        )

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
        b_lines = [lines_by_id[lid] for lid in order[a : z + 1]]
        top = b_lines[0]["y"] - _offset(tune, b_lines[0]["pt"]) + tdy
        content, bottom = _stack(
            model,
            b_lines,
            spans,
            tune,
            left=left + tdx,
            top=top,
            dy=tdy,
            font_aliases=font_aliases,
            clamp_negative_gap_px=clamp_negative_gap_px,
        )
        slot_id = f"{prefix}_{b['id']}"
        slots[slot_id] = _slot(slot_id, b.get("title") or b_lines[0]["text"][:24], content)
        blocks.append(
            {
                "blockId": slot_id,
                "kind": "text",
                "title": b.get("title") or b_lines[0]["text"][:24],
                "slotId": slot_id,
                "frame": {"x": _r(left + tdx), "y": _r(top), "w": _r(width), "h": _r(max(1.0, bottom - top))},
                "locked": False,
            }
        )

    for k, im in enumerate(model.get("images", [])):
        src = (image_srcs or {}).get(k)
        if not src:
            continue
        w, h = im["x1"] - im["x"], im["y1"] - im["y"]
        blocks.append(
            {
                "blockId": f"{prefix}_img{k + 1}",
                "kind": "image",
                "title": f"그림 {k + 1}",
                "src": src,
                "alt": "",
                "width": f"{_r(w)}px",
                "height": f"{_r(h)}px",
                "objectFit": "fill",
                "align": "left",
                "frame": {"x": _r(im["x"]), "y": _r(im["y"]), "w": _r(w), "h": _r(h)},
            }
        )

    blocks.sort(key=lambda b: (b["frame"]["y"], b["frame"]["x"]))
    header_id, footer_id = f"{prefix}_slot_header", f"{prefix}_slot_footer"
    slots[header_id] = _slot(header_id, f"{page_number}페이지 머리글", "<p></p>", locked=True)
    slots[footer_id] = _slot(footer_id, f"{page_number}페이지 바닥글", "<p></p>", locked=True)
    page = {
        "pageId": f"page_{page_number}",
        "pageNumber": page_number,
        "pageLabel": page_label or f"{page_number}p",
        "hideHeaderFooter": True,
        "headerSlotId": header_id,
        "footerSlotId": footer_id,
        "blocks": blocks,
        "pageRect": {"width": model["page"]["width"], "height": model["page"]["height"]},
        "layout": {"exactText": True, "margin": {"top": 0, "right": 0, "bottom": 0, "left": 0}},
    }
    return page, slots

