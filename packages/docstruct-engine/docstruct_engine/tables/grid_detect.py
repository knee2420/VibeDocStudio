"""표 격자 탐지(점선 병합 + 이중 테두리 병합 + 직사각 분할 + 셀 배경 채움 매핑)."""
from __future__ import annotations

import math
from typing import Any, Optional

from ..acquire.pdf.metrics import PX_PER_PT
from ..acquire.pdf.rule_stitcher import stitch_dashed_rules

PX = PX_PER_PT
LINE_TOL = 1.6
EDGE_TOL = 1.5
DOUBLE_BORDER_TOL = 3.8
COVER_MIN = 0.6
MIN_EDGE_LEN = 4.0


def _r(v: float) -> float:
    return round(float(v), 2)


def css_border_px(thickness: float) -> float:
    """크롬은 테두리 두께를 정수 px 로 내린다 (1 미만은 1)."""
    if thickness <= 0:
        return 0.0
    return max(1.0, math.floor(thickness + 1e-6))


def _segments(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segs = []
    for i, r in enumerate(rules):
        if r.get("orient") == "h":
            segs.append(
                {
                    "i": i,
                    "o": "h",
                    "c": (r["y"] + r["y1"]) / 2,
                    "a": r["x"],
                    "b": r["x1"],
                    "th": r.get("thickness", r["y1"] - r["y"]),
                    "color": r.get("color") or "#000000",
                    "dashed": bool(r.get("dashed")),
                    "rect": r,
                }
            )
        else:
            segs.append(
                {
                    "i": i,
                    "o": "v",
                    "c": (r["x"] + r["x1"]) / 2,
                    "a": r["y"],
                    "b": r["y1"],
                    "th": r.get("thickness", r["x1"] - r["x"]),
                    "color": r.get("color") or "#000000",
                    "dashed": bool(r.get("dashed")),
                    "rect": r,
                }
            )
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
            if (
                ra["x"] - tol <= rb["x1"]
                and rb["x"] - tol <= ra["x1"]
                and ra["y"] - tol <= rb["y1"]
                and rb["y"] - tol <= ra["y1"]
            ):
                parent[find(i)] = find(j)
    groups: dict[int, list[dict[str, Any]]] = {}
    for i, s in enumerate(segs):
        groups.setdefault(find(i), []).append(s)
    return list(groups.values())


def _edges(segs: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def _coverage(edge: dict[str, Any], a: float, b: float) -> tuple[float, float, str, bool]:
    if b <= a:
        return 0.0, 0.0, "#000000", False
    spans = sorted(
        ((max(a, s["a"]), min(b, s["b"]), s) for s in edge["segs"] if s["b"] > a and s["a"] < b),
        key=lambda it: (it[0], it[1]),
    )
    covered, cur_a, cur_b = 0.0, None, None
    th, color, dashed = 0.0, "#000000", False
    for sa, sb, s in spans:
        if sb - sa >= MIN_EDGE_LEN and s["th"] > th:
            th, color = s["th"], s["color"]
        if s.get("dashed"):
            dashed = True
        if cur_b is None or sa > cur_b:
            if cur_b is not None:
                covered += cur_b - cur_a
            cur_a, cur_b = sa, sb
        else:
            cur_b = max(cur_b, sb)
    if cur_b is not None:
        covered += cur_b - cur_a
    return covered / (b - a), th, color, dashed


def _match_cell_fill(cell: dict[str, Any], fills: list[dict[str, Any]]) -> Optional[str]:
    if not fills:
        return None
    cx0, cy0, cx1, cy1 = cell["x"], cell["y"], cell["x1"], cell["y1"]
    cell_area = max(1.0, (cx1 - cx0) * (cy1 - cy0))
    for f in fills:
        color = str(f.get("color") or "").lower()
        if not color or color in ("#ffffff", "#fefefe", "#fdfdfd"):
            continue
        ix0 = max(cx0, float(f["x"]))
        iy0 = max(cy0, float(f["y"]))
        ix1 = min(cx1, float(f["x1"]))
        iy1 = min(cy1, float(f["y1"]))
        if ix1 <= ix0 or iy1 <= iy0:
            continue
        ratio = ((ix1 - ix0) * (iy1 - iy0)) / cell_area
        if ratio >= 0.55:
            return f["color"]
    return None


def _has_span_between(
    spans: Optional[list[dict[str, Any]]],
    orient: str,
    c0: float,
    c1: float,
    ortho_lo: float,
    ortho_hi: float,
) -> bool:
    """두 평행 경계선 `(c0, c1)` 사이에 실제 텍스트 중심이 들어있는지 검사한다."""
    if not spans or c1 - c0 <= 0.6:
        return False
    for s in spans:
        sx0, sx1 = float(s["x"]), float(s["x1"])
        sy0 = float(s["y"])
        sy1 = float(s.get("y1", sy0 + float(s.get("pt", 10.0)) * PX))
        if orient == "v":
            center, o0, o1 = (sx0 + sx1) / 2.0, sy0, sy1
        else:
            center, o0, o1 = (sy0 + sy1) / 2.0, sx0, sx1
        if (c0 + 0.3) < center < (c1 - 0.3) and min(o1, ortho_hi) > max(o0, ortho_lo):
            return True
    return False


def _collapse_parallel_edges(
    edges: list[dict[str, Any]],
    *,
    orient: str,
    pair_tol: float = DOUBLE_BORDER_TOL,
    spans: Optional[list[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """이중 테두리(Double-border)·그림자 테두리의 근접 평행선 쌍(`gap <= pair_tol`)을 1개의 격자 경계로 병합한다."""
    if len(edges) < 2 or pair_tol <= 0:
        return edges

    def _edge_range(edge: dict[str, Any]) -> tuple[float, float, float]:
        segs = edge["segs"]
        lo = min(float(s["a"]) for s in segs)
        hi = max(float(s["b"]) for s in segs)
        weight = sum(max(1.0, float(s["b"]) - float(s["a"])) for s in segs)
        return lo, hi, weight

    merged: list[dict[str, Any]] = [
        {"c": edges[0]["c"], "segs": list(edges[0]["segs"]), "double": bool(edges[0].get("double"))}
    ]
    for nxt in edges[1:]:
        cur = merged[-1]
        gap = nxt["c"] - cur["c"]
        if gap > pair_tol:
            merged.append({"c": nxt["c"], "segs": list(nxt["segs"]), "double": bool(nxt.get("double"))})
            continue
        cur_lo, cur_hi, cur_w = _edge_range(cur)
        nxt_lo, nxt_hi, nxt_w = _edge_range(nxt)
        o_lo, o_hi = min(cur_lo, nxt_lo), max(cur_hi, nxt_hi)
        if _has_span_between(spans, orient, cur["c"], nxt["c"], o_lo, o_hi):
            merged.append({"c": nxt["c"], "segs": list(nxt["segs"]), "double": bool(nxt.get("double"))})
            continue
        cur["c"] = (cur["c"] * cur_w + nxt["c"] * nxt_w) / max(1.0, cur_w + nxt_w)
        cur["segs"].extend(nxt["segs"])
        if gap >= 1.0:
            cur["double"] = True
    return merged


def _partition_members_into_rectangles(members: list[tuple[int, int]]) -> list[tuple[int, int, int, int]]:
    """비정형(L·T·들여쓰기) 연결 성분을 겹침 없는 직사각형 셀 목록 `(r0, c0, r1, c1)` 로 분할한다."""
    r0_all = min(m[0] for m in members)
    c0_all = min(m[1] for m in members)
    r1_all = max(m[0] for m in members)
    c1_all = max(m[1] for m in members)
    if len(members) == (r1_all - r0_all + 1) * (c1_all - c0_all + 1):
        return [(r0_all, c0_all, r1_all, c1_all)]

    rem = set(members)
    rects: list[tuple[int, int, int, int]] = []
    while rem:
        r0, c0 = min(rem)
        c1 = c0
        while (r0, c1 + 1) in rem:
            c1 += 1
        r1 = r0
        while all((r1 + 1, c) in rem for c in range(c0, c1 + 1)):
            r1 += 1
        rects.append((r0, c0, r1, c1))
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                rem.remove((r, c))
    rects.sort()
    return rects


def detect_tables(
    rules: list[dict[str, Any]],
    *,
    fills: Optional[list[dict[str, Any]]] = None,
    spans: Optional[list[dict[str, Any]]] = None,
    dash_max_gap: float = 6.0,
    border_pair_tol: float = DOUBLE_BORDER_TOL,
) -> list[dict[str, Any]]:
    """점선 병합 + 이중 테두리 병합 + 직사각 분할로 표 격자(`col_span`/`row_span`)·셀 배경색을 추출한다."""
    stitched_rules = stitch_dashed_rules(rules, dash_max_gap=dash_max_gap)
    fills_list = fills or []
    tables = []
    for group in _connected_groups(_segments(stitched_rules), tol=1.8):
        rows = _collapse_parallel_edges(
            _edges([s for s in group if s["o"] == "h"]),
            orient="h",
            pair_tol=border_pair_tol,
            spans=spans,
        )
        cols = _collapse_parallel_edges(
            _edges([s for s in group if s["o"] == "v"]),
            orient="v",
            pair_tol=border_pair_tol,
            spans=spans,
        )
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
        rect_list: list[tuple[int, int, int, int]] = []
        for members in units.values():
            rect_list.extend(_partition_members_into_rectangles(members))
        rect_list.sort()

        for r0, c0, r1, c1 in rect_list:
            x, x1, y, y1 = col_xs[c0], col_xs[c1 + 1], row_ys[r0], row_ys[r1 + 1]
            borders = {}
            for side, edge, a, b in (
                ("top", rows[r0], x, x1),
                ("bottom", rows[r1 + 1], x, x1),
                ("left", cols[c0], y, y1),
                ("right", cols[c1 + 1], y, y1),
            ):
                cov, th, color, is_dashed = _coverage(edge, a, b)
                if cov >= COVER_MIN:
                    borders[side] = {"th": _r(th), "color": color, **({"dashed": True} if is_dashed else {})}
                else:
                    borders[side] = None
            cid = f"{tid}.r{r0}c{c0}"
            for rr in range(r0, r1 + 1):
                for cc in range(c0, c1 + 1):
                    unit_cell[(rr, cc)] = cid
            cell_dict: dict[str, Any] = {
                "id": cid,
                "row": r0,
                "col": c0,
                "row_span": r1 - r0 + 1,
                "col_span": c1 - c0 + 1,
                "x": _r(x),
                "y": _r(y),
                "x1": _r(x1),
                "y1": _r(y1),
                "borders": borders,
                "lines": [],
            }
            bg = _match_cell_fill(cell_dict, fills_list)
            if bg:
                cell_dict["bg"] = bg
            cells.append(cell_dict)
        tables.append(
            {
                "id": tid,
                "x": _r(col_xs[0]),
                "y": _r(row_ys[0]),
                "x1": _r(col_xs[-1]),
                "y1": _r(row_ys[-1]),
                "col_xs": [_r(v) for v in col_xs],
                "row_ys": [_r(v) for v in row_ys],
                "cells": cells,
                "_unit_cell": unit_cell,
            }
        )
    tables.sort(key=lambda t: (t["y"], t["x"]))
    for i, t in enumerate(tables):
        old, new = t["id"], f"T{i + 1}"
        if old != new:
            t["id"] = new
            for c in t["cells"]:
                c["id"] = new + c["id"][len(old) :]
            t["_unit_cell"] = {u: new + cid[len(old) :] for u, cid in t["_unit_cell"].items()}
    return tables

