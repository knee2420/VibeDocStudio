"""점선 벡터 선분 조각 병합(Stitching) 및 텍스트 밑줄 탐지."""
from __future__ import annotations

from typing import Any


def _r(v: float) -> float:
    return round(float(v), 2)


def stitch_dashed_rules(
    rules: list[dict[str, Any]],
    *,
    edge_tol: float = 1.5,
    dash_max_gap: float = 6.0,
) -> list[dict[str, Any]]:
    """동일 중심선상에 흩어진 점선 세그먼트(예: 0.64px 높이 조각 100개)를 하나의 논리 선분으로 잇는다.

    일반 실선이나 행간이 큰 비연속 구분선(`gap > dash_max_gap`)은 합치지 않는다.
    """
    if not rules:
        return []

    stitched: list[dict[str, Any]] = []
    for orient in ("h", "v"):
        orient_rules = [r for r in rules if (r.get("orient") or "h") == orient]
        if not orient_rules:
            continue

        # 중심 좌표(h 면 y 중심, v 면 x 중심) 기준 그룹핑
        def center_of(r: dict[str, Any]) -> float:
            return (float(r["y"]) + float(r["y1"])) / 2.0 if orient == "h" else (float(r["x"]) + float(r["x1"])) / 2.0

        sorted_by_c = sorted(orient_rules, key=center_of)
        c_groups: list[list[dict[str, Any]]] = [[sorted_by_c[0]]]
        for r in sorted_by_c[1:]:
            if abs(center_of(r) - center_of(c_groups[-1][0])) <= edge_tol:
                c_groups[-1].append(r)
            else:
                c_groups.append([r])

        for grp in c_groups:
            def span_ab(r: dict[str, Any]) -> tuple[float, float]:
                return (float(r["x"]), float(r["x1"])) if orient == "h" else (float(r["y"]), float(r["y1"]))

            grp_sorted = sorted(grp, key=lambda r: span_ab(r)[0])
            chains: list[list[dict[str, Any]]] = [[grp_sorted[0]]]
            cur_end = span_ab(grp_sorted[0])[1]

            for r in grp_sorted[1:]:
                sa, sb = span_ab(r)
                if sa - cur_end <= dash_max_gap:
                    chains[-1].append(r)
                    cur_end = max(cur_end, sb)
                else:
                    chains.append([r])
                    cur_end = sb

            for ch in chains:
                if len(ch) == 1:
                    stitched.append(dict(ch[0]))
                    continue
                is_dashed = len(ch) >= 3 or any(bool(s.get("dashed")) for s in ch)
                x0 = _r(min(float(s["x"]) for s in ch))
                y0 = _r(min(float(s["y"]) for s in ch))
                x1 = _r(max(float(s["x1"]) for s in ch))
                y1 = _r(max(float(s["y1"]) for s in ch))
                th = _r(max(float(s.get("thickness") or (y1 - y0 if orient == "h" else x1 - x0)) for s in ch))
                color = ch[0].get("color") or "#000000"
                stitched.append(
                    {
                        "x": x0,
                        "y": y0,
                        "x1": x1,
                        "y1": y1,
                        "thickness": th,
                        "orient": orient,
                        "color": color,
                        "dashed": is_dashed,
                    }
                )
    return stitched


def find_underline_targets(
    text_lines_list: list[dict[str, Any]],
    rules: list[dict[str, Any]],
    tables: list[dict[str, Any]],
) -> set[str]:
    """표 바깥 가로선 중 텍스트 줄 바로 아래에 깔린 밑줄(`y` 0~6px 이내, 겹침 70% 이상)의 line id 집합."""
    def in_any_table(r: dict[str, Any]) -> bool:
        rx = (float(r["x"]) + float(r["x1"])) / 2.0
        ry = (float(r["y"]) + float(r["y1"])) / 2.0
        return any(t["x"] - 2.0 <= rx <= t["x1"] + 2.0 and t["y"] - 2.0 <= ry <= t["y1"] + 2.0 for t in tables)

    h_rules = [r for r in rules if r.get("orient") == "h" and not in_any_table(r)]
    underlined: set[str] = set()
    if not h_rules:
        return underlined

    for ln in text_lines_list:
        lw = max(1.0, float(ln["x1"]) - float(ln["x"]))
        ly1 = float(ln["y1"])
        lbase = float(ln.get("baseline", ly1))
        for r in h_rules:
            ry = (float(r["y"]) + float(r["y1"])) / 2.0
            if not (lbase - 1.0 <= ry <= ly1 + 7.0):
                continue
            ov = min(float(ln["x1"]), float(r["x1"])) - max(float(ln["x"]), float(r["x"]))
            if ov >= lw * 0.7:
                underlined.add(ln["id"])
                break
    return underlined


def vertical_walls_from_rules(
    rules: list[dict[str, Any]],
    *,
    dash_max_gap: float = 6.0,
    min_wall_len: float = 6.0,
) -> list[tuple[float, float, float]]:
    """표/구분선 세로 선분 목록 `(center_x, y0, y1)` 을 추출해 글자 스팬 경계 분할에 쓴다."""
    v_only = [r for r in rules if r.get("orient") == "v"]
    if not v_only:
        return []
    stitched = stitch_dashed_rules(v_only, dash_max_gap=dash_max_gap)
    walls: list[tuple[float, float, float]] = []
    for r in stitched:
        y0, y1 = float(r["y"]), float(r["y1"])
        if y1 - y0 >= min_wall_len:
            cx = (float(r["x"]) + float(r["x1"])) / 2.0
            walls.append((cx, y0, y1))
    return walls

