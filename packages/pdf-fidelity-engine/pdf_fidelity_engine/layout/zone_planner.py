"""표 밖 글 줄 → 블록 분할안(default_plan / validate_plan / line_block_index)."""
from __future__ import annotations

import re
from typing import Any

from ..fonts.metrics import PX_PER_PT
from .table_grid import text_lines

PX = PX_PER_PT
_ARTICLE = re.compile(r"^(제\s*\d+\s*(조|장|절)|부\s*칙|\[별표)")


def default_plan(model: dict[str, Any]) -> dict[str, Any]:
    """글 줄 → 블록 기본안. 조·장 머리, 글자 크기 변화, 줄 높이 1.5배 넘는 간격에서 끊는다."""
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
            errors.append(
                f"블록 {b.get('id')}: {rng[0]} 에서 시작해야 하는데 빠지거나 겹친 줄이 있음 "
                f"(기대 {order[expect] if expect < len(order) else '없음'})"
            )
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
    order = [ln["id"] for ln in text_lines(model)]
    pos = {lid: i for i, lid in enumerate(order)}
    out: dict[str, str] = {}
    for b in plan.get("blocks", []):
        a, z = pos.get(b["lines"][0]), pos.get(b["lines"][1])
        if a is None or z is None:
            continue
        for lid in order[a : z + 1]:
            out[lid] = b["id"]
    for ln in model["lines"]:
        if ln["where"] != "text":
            out[ln["id"]] = ln["where"]
    return out

