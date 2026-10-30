#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
03_verify_fidelity.py
truth.json(01) 과 measure.json(02) 을 비교해 통과/실패를 판정하는 관문.
작업자는 "완료"를 스스로 말하지 않는다. 이 도구의 VERDICT 줄이 곧 완료 여부다.

검사 규칙:
  F-CHROME-001 FAIL 후보 사진에 버튼 · 손잡이 같은 편집 도구 모양이 찍힘 (측정 무효)
  F-ELEM-001  FAIL  원본 글자가 후보에 없음
  F-POS-001   FAIL  글자 위치(x · x1 · y) 오차 > --tol-pos
  F-WRAP-001  FAIL  원본 한 줄 글자가 후보에서 줄바꿈됨
  F-SIZE-001  FAIL  계산된 글자 크기 ≠ 원본 pt × 96/72
  F-FONT-001  FAIL  크롬이 실제로 그린 글꼴 ≠ 원본 글꼴 (대체 글꼴 · 합성 굵기)
  F-IMG-001   FAIL  그림 위치 오차 > --tol-img
  F-PIX-001   FAIL  ink F1@1px < 잡음 하한선 - --pix-margin
  F-COLOR-001 WARN  글자 색 차이 > 8 (채널 최대값)
  F-RULE-001  WARN  선 위치 · 길이 · 두께 차이
  F-ULINE-001 WARN  원본 밑줄이 후보에서 밑줄이 아님
  F-KERN-001  WARN  커닝이 켜져 있음 (PDF 글자 위치는 커닝 없이 박혀 있다, L-06)

진단(판정에 영향 없음):
  D-STYLE     서식 소실 의심 — 원본은 크기가 여러 개인데 후보 글자 대부분이 한 크기 (L-02)
  D-OFFSET    글자 크기별로 같은 방향으로 밀린 오차 → 생성기 보정값 제안 (L-05)

사용법:
  python 03_verify_fidelity.py --truth work/fidelity/truth.json --measure work/fidelity/measure.json
  python 03_verify_fidelity.py ... --json work/fidelity/verify.json --diff work/fidelity/diff.png
"""

import argparse
import json
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fidelity_core as core  # noqa: E402

PX = core.PX_PER_PT


class Report:
    def __init__(self):
        self.items = []

    def add(self, level, rule, msg, **data):
        self.items.append({"level": level, "rule": rule, "msg": msg, **data})

    def count(self, level):
        return sum(1 for i in self.items if i["level"] == level)


def norm_font(name):
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


def merge_rules(rules, gap=1.5):
    """같은 줄에 이어진 선 조각(표 칸마다 그린 테두리)을 하나로 합친다."""
    out = []
    for orient in ("h", "v"):
        rs = sorted((dict(x) for x in rules if x["orient"] == orient),
                    key=lambda r: (round(r["y"] if orient == "h" else r["x"]), r["x"] if orient == "h" else r["y"]))
        for r in rs:
            if out and out[-1]["orient"] == orient:
                p = out[-1]
                if orient == "h" and abs(p["y"] - r["y"]) < 0.6 and abs(p["thickness"] - r["thickness"]) < 0.3 and r["x"] <= p["x1"] + gap:
                    p["x1"] = max(p["x1"], r["x1"])
                    continue
                if orient == "v" and abs(p["x"] - r["x"]) < 0.6 and abs(p["thickness"] - r["thickness"]) < 0.3 and r["y"] <= p["y1"] + gap:
                    p["y1"] = max(p["y1"], r["y1"])
                    continue
            out.append(r)
    return out


def check_spans(truth, measure, rep, args):
    rows = []
    for i, (t, m) in enumerate(zip(truth["spans"], measure["spans"])):
        label = t["text"][:40]
        if m is None:
            rep.add("FAIL", "F-ELEM-001", f"후보에 없음: {label!r}", span=i)
            continue
        dx, dx1, dy = m["x"] - t["x"], m["x1"] - t["x1"], m["y"] - t["y"]
        err = max(abs(dx), abs(dx1), abs(dy))
        rows.append({"i": i, "text": label, "pt": t["pt"], "dx": dx, "dx1": dx1, "dy": dy, "err": err})
        if err > args.tol_pos:
            rep.add("FAIL", "F-POS-001", f"{label!r} 오차 {err:.2f}px (dx {dx:+.2f} · dx1 {dx1:+.2f} · dy {dy:+.2f})",
                    span=i, dx=round(dx, 3), dx1=round(dx1, 3), dy=round(dy, 3))
        if m.get("lines", 1) > 1:
            rep.add("FAIL", "F-WRAP-001", f"{label!r} 이(가) {m['lines']}줄로 줄바꿈됨 — 폭 · 자간 확인", span=i)
        want_px = t["pt"] * PX
        got_px = float(m["font_size"][:-2]) if m.get("font_size", "").endswith("px") else None
        if got_px is None or abs(got_px - want_px) > args.tol_size:
            rep.add("FAIL", "F-SIZE-001", f"{label!r} 글자 크기 {m.get('font_size')} ≠ {want_px:.3f}px ({t['pt']}pt)", span=i)
        rendered = [f for f in m.get("rendered_fonts", []) if f["glyphs"] > 0]
        if rendered:
            want = norm_font(t["font"])
            bad = [f for f in rendered if norm_font(f["postscript"] or f["family"]) != want]
            if bad:
                names = ", ".join(f"{f['postscript'] or f['family']}({f['glyphs']})" for f in bad)
                rep.add("FAIL", "F-FONT-001", f"{label!r} 원본 {t['font']} 인데 실제 그린 글꼴: {names}", span=i)
        else:
            fam = norm_font(m.get("font_family", "").split(",")[0])
            if fam and fam not in norm_font(t["font"]):
                rep.add("WARN", "F-FONT-001", f"{label!r} font-family {m.get('font_family')} (실제 글꼴 확인 불가)", span=i)
        dist = core.color_distance(core.parse_css_color(t.get("color")), core.parse_css_color(m.get("color")))
        if dist is not None and dist > 8:
            rep.add("WARN", "F-COLOR-001", f"{label!r} 색 {m.get('color')} vs 원본 {t['color']} (차 {dist})", span=i)
        if m.get("kerning") not in (None, "none"):
            rep.add("WARN", "F-KERN-001", f"{label!r} font-kerning={m['kerning']} — none 으로 두세요", span=i)
    return rows


def check_rules(truth, measure, rep, args):
    t_rules, m_rules = merge_rules(truth["rules"]), merge_rules(measure["rules"])
    underline_rules = 0
    for tr in t_rules:
        # 글자 바로 아래 같은 폭의 가는 선은 밑줄이다 → 해당 글자의 밑줄 여부로 확인한다.
        under = [(t, m) for t, m in zip(truth["spans"], measure["spans"]) if tr["orient"] == "h"
                 and 0 <= tr["y"] - t["y"] <= (t["y1"] - t["y"]) + 2 and tr["x"] - 2 <= t["x"] and t["x1"] <= tr["x1"] + 2]
        if under:
            underline_rules += 1
            for t, m in under:
                if m and not m.get("underline"):
                    rep.add("WARN", "F-ULINE-001", f"{t['text'][:40]!r} 원본은 밑줄, 후보는 밑줄 없음")
            continue
        cands = [m for m in m_rules if m["orient"] == tr["orient"]]
        if tr["orient"] == "h":
            key = lambda m: abs((m["y"] + m["y1"]) / 2 - (tr["y"] + tr["y1"]) / 2) + 0.1 * abs(m["x"] - tr["x"])
        else:
            key = lambda m: abs((m["x"] + m["x1"]) / 2 - (tr["x"] + tr["x1"]) / 2) + 0.1 * abs(m["y"] - tr["y"])
        best = min(cands, key=key) if cands else None
        where = f"{tr['orient']} 선 ({tr['x']:.1f},{tr['y']:.1f})-({tr['x1']:.1f},{tr['y1']:.1f}) 두께 {tr['thickness']}"
        if best is None or key(best) > 6:
            rep.add("WARN", "F-RULE-001", f"후보에 없는 {where}")
            continue
        msgs = []
        for edge in ("x", "y", "x1", "y1"):
            d = best[edge] - tr[edge]
            if abs(d) > args.tol_rule:
                msgs.append(f"{edge} {d:+.1f}")
        if abs(best["thickness"] - tr["thickness"]) > 0.5:
            msgs.append(f"두께 {best['thickness']} vs {tr['thickness']} (크롬은 테두리 두께를 정수 px 로 내림, L-10)")
        if msgs:
            rep.add("WARN", "F-RULE-001", f"{where}: " + ", ".join(msgs))
    return len(t_rules), underline_rules


def check_blocks(truth, measure, rep, args):
    page_w = truth["page"]["width"]
    page_h = truth["page"]["height"]
    blocks = measure.get("blocks", [])
    for b in blocks:
        bid = b.get("id", "unknown")
        x, y, x1, y1 = b.get("x", 0), b.get("y", 0), b.get("x1", 0), b.get("y1", 0)
        w, h = b.get("w", 0), b.get("h", 0)
        if x1 > page_w + 1.5 or x < -1.5:
            rep.add("FAIL", "F-BLOCK-001",
                    f"블록 '{bid}' 가로 페이지 초과 (x={x:.1f}, w={w:.1f}, x1={x1:.1f} > 페이지폭 {page_w}px)",
                    block_id=bid, x=x, w=w, x1=x1, page_w=page_w)
        if y1 > page_h + 1.5 or y < -1.5:
            rep.add("FAIL", "F-BLOCK-001",
                    f"블록 '{bid}' 세로 페이지 초과 (y={y:.1f}, h={h:.1f}, y1={y1:.1f} > 페이지높이 {page_h}px)",
                    block_id=bid, y=y, h=h, y1=y1, page_h=page_h)


def check_images(truth, measure, rep, args):
    for ti in truth["images"]:
        best = min(measure["images"], key=lambda m: abs(m["x"] - ti["x"]) + abs(m["y"] - ti["y"]), default=None)
        if best is None:
            rep.add("FAIL", "F-IMG-001", f"그림 없음 @({ti['x']:.1f},{ti['y']:.1f})")
            continue
        err = max(abs(best[k] - ti[k]) for k in ("x", "y", "x1", "y1"))
        if err > args.tol_img:
            rep.add("FAIL", "F-IMG-001", f"그림 오차 {err:.2f}px @({ti['x']:.1f},{ti['y']:.1f})")


def check_pixels(truth, measure, rep, args, base):
    render = truth["render"]
    size = tuple(render["size"])
    cand = os.path.join(base["measure"], measure["candidate_png"])
    ref_name = render.get("pdfium") or render["mupdf"]
    ref = os.path.join(base["truth"], ref_name)
    metrics = core.image_metrics(ref, cand, size)
    floor = render.get("noise_floor")
    if floor:
        need = floor["ink_f1_1px"] - args.pix_margin
        if metrics["ink_f1_1px"] < need:
            rep.add("FAIL", "F-PIX-001", f"ink F1@1px {metrics['ink_f1_1px']}% < 하한 {need:.2f}% (잡음 하한선 {floor['ink_f1_1px']}% - {args.pix_margin})")
    elif metrics["ink_f1_1px"] < 95:
        rep.add("WARN", "F-PIX-001", f"ink F1@1px {metrics['ink_f1_1px']}% (잡음 하한선 없음 — pypdfium2 설치 후 01 재실행)")
    regions = core.unmatched_ink_regions(ref, cand, size)
    if args.diff:
        np = core.need("numpy", "numpy")
        image = core.need("PIL.Image", "pillow")
        a = np.asarray(image.open(ref).convert("L").resize(size)) < 160
        b = np.asarray(image.open(cand).convert("L").resize(size)) < 160
        out = np.full(a.shape + (3,), 255, np.uint8)
        out[a & b] = (170, 170, 170)
        out[a & ~b] = (220, 40, 40)    # 원본에만 있는 잉크
        out[b & ~a] = (40, 90, 230)    # 후보에만 있는 잉크
        image.fromarray(out).save(args.diff)
    return {"reference": ref_name, **metrics}, floor, regions


def diagnostics(truth, measure, rows, rep):
    notes = []
    sizes = [m["font_size"] for m in measure["spans"] if m]
    if sizes and len({s["pt"] for s in truth["spans"]}) >= 3:
        top = max(set(sizes), key=sizes.count)
        if sizes.count(top) / len(sizes) >= 0.6:
            notes.append({"rule": "D-STYLE", "msg": f"후보 글자 {sizes.count(top)}/{len(sizes)} 개가 {top} — 서식이 지워졌을 수 있음 "
                                                    "(에디터가 class/style 을 버리는지 확인, L-02)"})
    by_pt = {}
    for r in rows:
        by_pt.setdefault(r["pt"], []).append(r)
    suggest = {}
    for pt, rs in sorted(by_pt.items()):
        dys = [r["dy"] for r in rs]
        med = statistics.median(dys)
        same_sign = sum(1 for d in dys if d * med > 0) / len(dys)
        if abs(med) >= 0.5 and same_sign >= 0.8:
            suggest[str(pt)] = round(-med)
            notes.append({"rule": "D-OFFSET", "msg": f"{pt}pt 글자 {len(rs)}개가 세로로 평균 {med:+.2f}px 밀림 → 이 크기 줄 상자 오프셋 {-med:+.0f}px 보정 제안"})
    return notes, suggest


def main():
    ap = argparse.ArgumentParser(description="truth.json vs measure.json → 통과/실패 판정")
    ap.add_argument("--truth", required=True)
    ap.add_argument("--measure", required=True)
    ap.add_argument("--tol-pos", type=float, default=1.0, help="글자 위치 허용 오차 px (기본 1.0)")
    ap.add_argument("--tol-size", type=float, default=0.05, help="글자 크기 허용 오차 px")
    ap.add_argument("--tol-img", type=float, default=1.0, help="그림 위치 허용 오차 px")
    ap.add_argument("--tol-rule", type=float, default=1.5, help="선 끝점 허용 오차 px")
    ap.add_argument("--pix-margin", type=float, default=2.5,
                    help="ink F1 이 잡음 하한선보다 이만큼(%%p) 낮아도 통과 (크롬은 작은 글자를 더 진하게 그린다, L-11)")
    ap.add_argument("--json", help="판정 결과를 JSON 으로 저장")
    ap.add_argument("--diff", help="잉크 차이 그림 저장 (빨강=원본에만, 파랑=후보에만)")
    args = ap.parse_args()

    with open(args.truth, encoding="utf-8") as f:
        truth = json.load(f)
    with open(args.measure, encoding="utf-8") as f:
        measure = json.load(f)
    base = {"truth": os.path.dirname(os.path.abspath(args.truth)), "measure": os.path.dirname(os.path.abspath(args.measure))}

    rep = Report()
    for c in measure.get("visible_chrome", []):
        rep.add("FAIL", "F-CHROME-001", f"후보 사진에 편집 도구 모양이 찍힘: {c['desc']} @({c['x']:.0f},{c['y']:.0f})"
                                        " — 02 를 --hide-selector 로 다시 재세요 (측정 무효)")
    rows = check_spans(truth, measure, rep, args)
    n_rules, n_underlines = check_rules(truth, measure, rep, args)
    check_images(truth, measure, rep, args)
    check_blocks(truth, measure, rep, args)
    pixels, floor, regions = check_pixels(truth, measure, rep, args, base)
    notes, offset_suggest = diagnostics(truth, measure, rows, rep)

    total = len(truth["spans"])
    within = sum(1 for r in rows if r["err"] <= args.tol_pos)
    summary = {
        "spans_total": total,
        "spans_within_tol": within,
        "tol_pos": args.tol_pos,
        "mean_abs_dx": round(statistics.mean(abs(r["dx"]) for r in rows), 3) if rows else None,
        "mean_abs_dx1": round(statistics.mean(abs(r["dx1"]) for r in rows), 3) if rows else None,
        "mean_abs_dy": round(statistics.mean(abs(r["dy"]) for r in rows), 3) if rows else None,
        "max_err": round(max((r["err"] for r in rows), default=0), 3),
        "pixels": pixels,
        "noise_floor": floor,
        "rules_checked": n_rules,
        "underlines_checked": n_underlines,
    }
    verdict = "FAIL" if rep.count("FAIL") else "PASS"

    print("=" * 72)
    print(f" 시각 일치도 판정 — {os.path.basename(truth['source']['pdf'])} p.{truth['source']['page']}")
    print("=" * 72)
    print(f" 글자 위치  {within}/{total} 개가 ±{args.tol_pos}px 이내 | 평균 |dx| {summary['mean_abs_dx']} · |dx1| {summary['mean_abs_dx1']}"
          f" · |dy| {summary['mean_abs_dy']} | 최대 {summary['max_err']}px")
    fl = f" (잡음 하한선 {floor['ink_f1_1px']}%)" if floor else ""
    print(f" 픽셀       ink F1@1px {pixels['ink_f1_1px']}%{fl} | blur±16 {pixels['blur_within_16']}% | 기준 {pixels['reference']}")
    print(f" 선         {n_rules} 개 검사 (밑줄 {n_underlines})")
    print("-" * 72)
    for level in ("FAIL", "WARN"):
        for it in rep.items:
            if it["level"] == level:
                print(f" [{level}] {it['rule']}  {it['msg']}")
    for n in notes:
        print(f" [진단] {n['rule']}  {n['msg']}")
    if regions["missing"] or regions["extra"]:
        top_m = ", ".join(f"{g['box']}({g['pixels']})" for g in regions["missing"][:3])
        top_e = ", ".join(f"{g['box']}({g['pixels']})" for g in regions["extra"][:3])
        print(f" [진단] D-INK  원본에만 있는 잉크 상위: {top_m or '-'} | 후보에만: {top_e or '-'}")
    print("-" * 72)
    print(f" VERDICT: {verdict}  (FAIL {rep.count('FAIL')} · WARN {rep.count('WARN')})")
    print("=" * 72)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"verdict": verdict, "summary": summary, "findings": rep.items, "diagnostics": notes,
                       "offset_suggestions_px": offset_suggest, "ink_regions": regions, "spans": rows},
                      f, ensure_ascii=False, indent=1)
    sys.exit(1 if verdict == "FAIL" else 0)


if __name__ == "__main__":
    main()
