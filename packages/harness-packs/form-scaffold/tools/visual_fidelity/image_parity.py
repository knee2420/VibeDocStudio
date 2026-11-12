"""픽셀 일치도 측정(F1@1px · blur±16) 및 truth vs measure 판정(VERIFY)."""
from __future__ import annotations

import importlib
import os
import re
import statistics
from typing import Any, Optional

from docstruct_engine.acquire.pdf.metrics import PX_PER_PT

PX = PX_PER_PT


def _need(module: str, pip_name: str) -> Any:
    try:
        return importlib.import_module(module)
    except ImportError as exc:
        raise RuntimeError(f"{module} 이 필요합니다: pip install {pip_name}") from exc


def parse_css_color(value: Optional[str]) -> Optional[tuple[int, int, int]]:
    """'rgb(1, 2, 3)' · 'rgba(...)' · '#abc' · '#aabbcc' → (r, g, b) 또는 None."""
    if not value:
        return None
    v = value.strip().lower()
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) >= 6:
            try:
                return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
            except ValueError:
                return None
    if v.startswith("rgb"):
        try:
            nums = v[v.index("(") + 1 : v.index(")")].replace("/", ",").split(",")
            return (int(float(nums[0])), int(float(nums[1])), int(float(nums[2])))
        except (ValueError, IndexError):
            return None
    return None


def color_distance(a: Optional[tuple[int, int, int]], b: Optional[tuple[int, int, int]]) -> Optional[int]:
    if a is None or b is None:
        return None
    return max(abs(x - y) for x, y in zip(a, b))


def image_metrics(path_a: str, path_b: str, size: Optional[tuple[int, int]] = None) -> dict[str, float]:
    """두 이미지(같은 크기로 맞춤)의 일치도 (px_within_16, blur_within_16, ink_f1_1px, ink_iou)."""
    np = _need("numpy", "numpy")
    image = _need("PIL.Image", "pillow")
    ndimage = _need("scipy.ndimage", "scipy")
    a_img = image.open(path_a).convert("L")
    b_img = image.open(path_b).convert("L")
    size = size or a_img.size
    a = np.asarray(a_img.resize(size), float)
    b = np.asarray(b_img.resize(size), float)
    ink_a, ink_b = a < 160, b < 160
    tol = np.ones((3, 3), bool)
    recall = (ink_a & ndimage.binary_dilation(ink_b, tol)).sum() / max(1, ink_a.sum())
    precision = (ink_b & ndimage.binary_dilation(ink_a, tol)).sum() / max(1, ink_b.sum())
    f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
    ba, bb = ndimage.gaussian_filter(a, 1.0), ndimage.gaussian_filter(b, 1.0)
    return {
        "px_within_16": round(float((np.abs(a - b) <= 16).mean() * 100), 3),
        "blur_within_16": round(float((np.abs(ba - bb) <= 16).mean() * 100), 3),
        "ink_f1_1px": round(float(f1 * 100), 3),
        "ink_iou": round(float((ink_a & ink_b).sum() / max(1, (ink_a | ink_b).sum()) * 100), 3),
    }


def unmatched_ink_regions(path_a: str, path_b: str, size: Optional[tuple[int, int]] = None, top: int = 8) -> dict[str, list[dict[str, Any]]]:
    """어긋난 잉크가 몰린 영역 (missing = 원본에만, extra = 후보에만). 진단용."""
    np = _need("numpy", "numpy")
    image = _need("PIL.Image", "pillow")
    ndimage = _need("scipy.ndimage", "scipy")
    a_img = image.open(path_a).convert("L")
    size = size or a_img.size
    a = np.asarray(a_img.resize(size), float) < 160
    b = np.asarray(image.open(path_b).convert("L").resize(size), float) < 160
    tol = np.ones((3, 3), bool)
    out: dict[str, list[dict[str, Any]]] = {}
    for name, mask in (
        ("missing", a & ~ndimage.binary_dilation(b, tol)),
        ("extra", b & ~ndimage.binary_dilation(a, tol)),
    ):
        lab, _ = ndimage.label(ndimage.binary_dilation(mask, np.ones((5, 5), bool)))
        regions = []
        for k, sl in enumerate(ndimage.find_objects(lab)):
            count = int((mask[sl] & (lab[sl] == k + 1)).sum())
            regions.append({"pixels": count, "box": [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop]})
        out[name] = sorted(regions, key=lambda r: -r["pixels"])[:top]
    return out


class Report:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def add(self, level: str, rule: str, msg: str, **data: Any) -> None:
        self.items.append({"level": level, "rule": rule, "msg": msg, **data})

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i["level"] == level)


def norm_font(name: str) -> str:
    base = name.split("+", 1)[-1]
    try:
        decoded = base.encode("latin1").decode("cp949")
        if "굴림" in decoded:
            return "gulimche"
        if "돋움" in decoded:
            return "dotum"
        if "바탕" in decoded:
            return "batang"
    except Exception:
        pass
    s = re.sub(r"[^a-z0-9]", "", base.lower())
    s = re.sub(r"(psmt|mt|ps|regular|bold)$", "", s)
    return s


def merge_rules(rules: list[dict[str, Any]], gap: float = 1.5) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for orient in ("h", "v"):
        rs = sorted(
            (dict(x) for x in rules if x["orient"] == orient),
            key=lambda r: (round(r["y"] if orient == "h" else r["x"]), r["x"] if orient == "h" else r["y"]),
        )
        for r in rs:
            if out and out[-1]["orient"] == orient:
                p = out[-1]
                if (
                    orient == "h"
                    and abs(p["y"] - r["y"]) < 0.6
                    and abs(p["thickness"] - r["thickness"]) < 0.3
                    and r["x"] <= p["x1"] + gap
                ):
                    p["x1"] = max(p["x1"], r["x1"])
                    continue
                if (
                    orient == "v"
                    and abs(p["x"] - r["x"]) < 0.6
                    and abs(p["thickness"] - r["thickness"]) < 0.3
                    and r["y"] <= p["y1"] + gap
                ):
                    p["y1"] = max(p["y1"], r["y1"])
                    continue
            out.append(r)
    return out


def verify_fidelity(
    *,
    truth: dict[str, Any],
    measure: dict[str, Any],
    truth_dir: str,
    measure_dir: str,
    tol_pos: float = 1.0,
    tol_size: float = 0.05,
    tol_img: float = 1.0,
    tol_rule: float = 1.5,
    pix_margin: float = 2.5,
    diff_path: Optional[str] = None,
) -> dict[str, Any]:
    """truth.json 과 measure.json 을 대조해 FAIL/WARN 항목 · pixel F1 · 오프셋 제안을 계산한다."""
    rep = Report()
    for c in measure.get("visible_chrome", []):
        rep.add(
            "FAIL",
            "F-CHROME-001",
            f"후보 사진에 편집 도구 모양이 찍힘: {c['desc']} @({c['x']:.0f},{c['y']:.0f})",
        )

    rows: list[dict[str, Any]] = []
    for i, (t, m) in enumerate(zip(truth.get("spans", []), measure.get("spans", []))):
        label = t["text"][:40]
        if m is None:
            rep.add("FAIL", "F-ELEM-001", f"후보에 없음: {label!r}", span=i)
            continue
        dx, dx1, dy = m["x"] - t["x"], m["x1"] - t["x1"], m["y"] - t["y"]
        err = max(abs(dx), abs(dx1), abs(dy))
        rows.append({"i": i, "text": label, "pt": t["pt"], "dx": dx, "dx1": dx1, "dy": dy, "err": err})
        if err > tol_pos:
            rep.add(
                "FAIL",
                "F-POS-001",
                f"{label!r} 오차 {err:.2f}px (dx {dx:+.2f} · dx1 {dx1:+.2f} · dy {dy:+.2f})",
                span=i,
                dx=round(dx, 3),
                dx1=round(dx1, 3),
                dy=round(dy, 3),
            )
        if m.get("lines", 1) > 1:
            rep.add("FAIL", "F-WRAP-001", f"{label!r} 이(가) {m['lines']}줄로 줄바꿈됨 — 폭 · 자간 확인", span=i)
        want_px = t["pt"] * PX
        got_px = float(m["font_size"][:-2]) if str(m.get("font_size", "")).endswith("px") else None
        if got_px is None or abs(got_px - want_px) > tol_size:
            rep.add("FAIL", "F-SIZE-001", f"{label!r} 글자 크기 {m.get('font_size')} ≠ {want_px:.3f}px ({t['pt']}pt)", span=i)
        rendered = [f for f in m.get("rendered_fonts", []) if f["glyphs"] > 0]
        if rendered:
            want = norm_font(t.get("css_font") or t["font"])
            bad = [f for f in rendered if norm_font(f["postscript"] or f["family"]) != want]
            if bad:
                names = ", ".join(f"{f['postscript'] or f['family']}({f['glyphs']})" for f in bad)
                rep.add("FAIL", "F-FONT-001", f"{label!r} 원본 {t['font']} 인데 실제 그린 글꼴: {names}", span=i)
        else:
            fam = norm_font(m.get("font_family", "").split(",")[0])
            if fam and fam not in norm_font(t.get("css_font") or t["font"]):
                rep.add("WARN", "F-FONT-001", f"{label!r} font-family {m.get('font_family')} (실제 글꼴 확인 불가)", span=i)
        dist = color_distance(parse_css_color(t.get("color")), parse_css_color(m.get("color")))
        if dist is not None and dist > 8:
            rep.add("WARN", "F-COLOR-001", f"{label!r} 색 {m.get('color')} vs 원본 {t['color']} (차 {dist})", span=i)
        if m.get("kerning") not in (None, "none"):
            rep.add("WARN", "F-KERN-001", f"{label!r} font-kerning={m['kerning']} — none 으로 두세요", span=i)

    # rules
    t_rules = merge_rules(truth.get("rules", []))
    m_rules = merge_rules(measure.get("rules", []))
    n_underlines = 0
    for tr in t_rules:
        under = [
            (t, m)
            for t, m in zip(truth.get("spans", []), measure.get("spans", []))
            if tr["orient"] == "h"
            and 0 <= tr["y"] - t["y"] <= (t.get("y1", t["y"] + t["pt"] * PX) - t["y"]) + 2
            and tr["x"] - 2 <= t["x"]
            and t["x1"] <= tr["x1"] + 2
        ]
        if under:
            n_underlines += 1
            for t, m in under:
                if m and not m.get("underline"):
                    rep.add("WARN", "F-ULINE-001", f"{t['text'][:40]!r} 원본은 밑줄, 후보는 밑줄 없음")
            continue
        cands = [m for m in m_rules if m["orient"] == tr["orient"]]

        def _rule_dist(m: dict[str, Any], ref_r: dict[str, Any] = tr) -> float:
            if ref_r["orient"] == "h":
                return abs((m["y"] + m["y1"]) / 2 - (ref_r["y"] + ref_r["y1"]) / 2) + 0.1 * abs(m["x"] - ref_r["x"])
            return abs((m["x"] + m["x1"]) / 2 - (ref_r["x"] + ref_r["x1"]) / 2) + 0.1 * abs(m["y"] - ref_r["y"])

        best = min(cands, key=_rule_dist) if cands else None
        where = f"{tr['orient']} 선 ({tr['x']:.1f},{tr['y']:.1f})-({tr['x1']:.1f},{tr['y1']:.1f}) 두께 {tr['thickness']}"
        if best is None or _rule_dist(best) > 6:
            rep.add("WARN", "F-RULE-001", f"후보에 없는 {where}")
            continue
        msgs = []
        for edge in ("x", "y", "x1", "y1"):
            d = best[edge] - tr[edge]
            if abs(d) > tol_rule:
                msgs.append(f"{edge} {d:+.1f}")
        if abs(best["thickness"] - tr["thickness"]) > 0.5:
            msgs.append(f"두께 {best['thickness']} vs {tr['thickness']}")
        if msgs:
            rep.add("WARN", "F-RULE-001", f"{where}: " + ", ".join(msgs))

    # images
    for ti in truth.get("images", []):
        best = min(measure.get("images", []), key=lambda m: abs(m["x"] - ti["x"]) + abs(m["y"] - ti["y"]), default=None)
        if best is None:
            rep.add("FAIL", "F-IMG-001", f"그림 없음 @({ti['x']:.1f},{ti['y']:.1f})")
            continue
        err = max(abs(best[k] - ti[k]) for k in ("x", "y", "x1", "y1"))
        if err > tol_img:
            rep.add("FAIL", "F-IMG-001", f"그림 오차 {err:.2f}px @({ti['x']:.1f},{ti['y']:.1f})")

    # blocks
    page_w = truth["page"]["width"]
    page_h = truth["page"]["height"]
    for b in measure.get("blocks", []):
        bid = b.get("id", "unknown")
        x, y, x1, y1 = b.get("x", 0), b.get("y", 0), b.get("x1", 0), b.get("y1", 0)
        w, h = b.get("w", 0), b.get("h", 0)
        if x1 > page_w + 1.5 or x < -1.5:
            rep.add("FAIL", "F-BLOCK-001", f"블록 '{bid}' 가로 페이지 초과 (x={x:.1f}, w={w:.1f}, x1={x1:.1f})", block_id=bid)
        if y1 > page_h + 1.5 or y < -1.5:
            rep.add("FAIL", "F-BLOCK-001", f"블록 '{bid}' 세로 페이지 초과 (y={y:.1f}, h={h:.1f}, y1={y1:.1f})", block_id=bid)

    # pixels
    render = truth["render"]
    size = tuple(render["size"])
    cand = os.path.join(measure_dir, measure["candidate_png"])
    ref_name = render.get("pdfium") or render["mupdf"]
    ref = os.path.join(truth_dir, ref_name)
    metrics = image_metrics(ref, cand, size)
    floor = render.get("noise_floor")
    if floor:
        need = floor["ink_f1_1px"] - pix_margin
        if metrics["ink_f1_1px"] < need:
            rep.add(
                "FAIL",
                "F-PIX-001",
                f"ink F1@1px {metrics['ink_f1_1px']}% < 하한 {need:.2f}% (잡음 하한선 {floor['ink_f1_1px']}% - {pix_margin})",
            )
    elif metrics["ink_f1_1px"] < 95:
        rep.add("WARN", "F-PIX-001", f"ink F1@1px {metrics['ink_f1_1px']}%")
    regions = unmatched_ink_regions(ref, cand, size)
    if diff_path:
        np = _need("numpy", "numpy")
        image = _need("PIL.Image", "pillow")
        a = np.asarray(image.open(ref).convert("L").resize(size)) < 160
        b = np.asarray(image.open(cand).convert("L").resize(size)) < 160
        out = np.full(a.shape + (3,), 255, np.uint8)
        out[a & b] = (170, 170, 170)
        out[a & ~b] = (220, 40, 40)
        out[b & ~a] = (40, 90, 230)
        image.fromarray(out).save(diff_path)

    # diagnostics
    notes = []
    sizes = [m["font_size"] for m in measure.get("spans", []) if m]
    if sizes and len({s["pt"] for s in truth.get("spans", [])}) >= 3:
        top = max(set(sizes), key=sizes.count)
        if sizes.count(top) / len(sizes) >= 0.6:
            notes.append({"rule": "D-STYLE", "msg": f"후보 글자 {sizes.count(top)}/{len(sizes)} 개가 {top} — 서식 소실 의심"})
    by_pt: dict[float, list[dict[str, Any]]] = {}
    for r_item in rows:
        by_pt.setdefault(r_item["pt"], []).append(r_item)
    offset_suggest: dict[str, int] = {}
    for pt, rs in sorted(by_pt.items()):
        dys = [r_item["dy"] for r_item in rs]
        med = statistics.median(dys)
        same_sign = sum(1 for d in dys if d * med > 0) / len(dys)
        if abs(med) >= 0.5 and same_sign >= 0.8:
            offset_suggest[str(pt)] = round(-med)
            notes.append({"rule": "D-OFFSET", "msg": f"{pt}pt 글자 {len(rs)}개가 세로 평균 {med:+.2f}px 밀림"})

    total = len(truth.get("spans", []))
    within = sum(1 for r_item in rows if r_item["err"] <= tol_pos)
    summary = {
        "spans_total": total,
        "spans_within_tol": within,
        "tol_pos": tol_pos,
        "mean_abs_dx": round(statistics.mean(abs(r_item["dx"]) for r_item in rows), 3) if rows else None,
        "mean_abs_dx1": round(statistics.mean(abs(r_item["dx1"]) for r_item in rows), 3) if rows else None,
        "mean_abs_dy": round(statistics.mean(abs(r_item["dy"]) for r_item in rows), 3) if rows else None,
        "max_err": round(max((r_item["err"] for r_item in rows), default=0), 3),
        "pixels": {"reference": ref_name, **metrics},
        "noise_floor": floor,
        "rules_checked": len(t_rules),
        "underlines_checked": n_underlines,
    }
    verdict = "FAIL" if rep.count("FAIL") else "PASS"
    return {
        "verdict": verdict,
        "fail_count": rep.count("FAIL"),
        "warn_count": rep.count("WARN"),
        "summary": summary,
        "findings": rep.items,
        "diagnostics": notes,
        "offset_suggestions_px": offset_suggest,
        "ink_regions": regions,
        "spans": rows,
    }

