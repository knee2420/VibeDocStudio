#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
03_verify_fidelity.py
`truth.json` 과 `measure.json` 을 대조해 시각 일치도를 PASS/FAIL 판정한다.
실제 검증 로직은 로컬 `image_parity.verify_fidelity` 에 위임한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fidelity_core as _core  # noqa: E402, F401
from image_parity import verify_fidelity  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="truth.json vs measure.json → 통과/실패 판정")
    ap.add_argument("--truth", required=True)
    ap.add_argument("--measure", required=True)
    ap.add_argument("--tol-pos", type=float, default=1.0, help="글자 위치 허용 오차 px (기본 1.0)")
    ap.add_argument("--tol-size", type=float, default=0.05, help="글자 크기 허용 오차 px")
    ap.add_argument("--tol-img", type=float, default=1.0, help="그림 위치 허용 오차 px")
    ap.add_argument("--tol-rule", type=float, default=1.5, help="선 끝점 허용 오차 px")
    ap.add_argument(
        "--pix-margin",
        type=float,
        default=2.5,
        help="ink F1 이 잡음 하한선보다 이만큼(%%p) 낮아도 통과 (크롬은 작은 글자를 더 진하게 그린다, L-11)",
    )
    ap.add_argument("--json", help="판정 결과를 JSON 으로 저장")
    ap.add_argument("--diff", help="잉크 차이 그림 저장 (빨강=원본에만, 파랑=후보에만)")
    args = ap.parse_args()

    with open(args.truth, encoding="utf-8") as f:
        truth = json.load(f)
    with open(args.measure, encoding="utf-8") as f:
        measure = json.load(f)

    result = verify_fidelity(
        truth=truth,
        measure=measure,
        truth_dir=os.path.dirname(os.path.abspath(args.truth)),
        measure_dir=os.path.dirname(os.path.abspath(args.measure)),
        tol_pos=args.tol_pos,
        tol_size=args.tol_size,
        tol_img=args.tol_img,
        tol_rule=args.tol_rule,
        pix_margin=args.pix_margin,
        diff_path=args.diff,
    )

    summary = result["summary"]
    pixels = summary["pixels"]
    floor = summary["noise_floor"]
    within = summary["spans_within_tol"]
    total = summary["spans_total"]
    verdict = result["verdict"]
    regions = result["ink_regions"]

    print("=" * 72)
    print(f" 시각 일치도 판정 — {os.path.basename(truth['source']['pdf'])} p.{truth['source']['page']}")
    print("=" * 72)
    print(
        f" 글자 위치  {within}/{total} 개가 ±{args.tol_pos}px 이내 | "
        f"평균 |dx| {summary['mean_abs_dx']} · |dx1| {summary['mean_abs_dx1']} "
        f"· |dy| {summary['mean_abs_dy']} | 최대 {summary['max_err']}px"
    )
    fl = f" (잡음 하한선 {floor['ink_f1_1px']}%)" if floor else ""
    print(
        f" 픽셀       ink F1@1px {pixels['ink_f1_1px']}%{fl} | "
        f"blur±16 {pixels['blur_within_16']}% | 기준 {pixels['reference']}"
    )
    print(f" 선         {summary['rules_checked']} 개 검사 (밑줄 {summary['underlines_checked']})")
    print("-" * 72)
    for level in ("FAIL", "WARN"):
        for it in result["findings"]:
            if it["level"] == level:
                print(f" [{level}] {it['rule']}  {it['msg']}")
    for n in result["diagnostics"]:
        print(f" [진단] {n['rule']}  {n['msg']}")
    if regions["missing"] or regions["extra"]:
        top_m = ", ".join(f"{g['box']}({g['pixels']})" for g in regions["missing"][:3])
        top_e = ", ".join(f"{g['box']}({g['pixels']})" for g in regions["extra"][:3])
        print(f" [진단] D-INK  원본에만 있는 잉크 상위: {top_m or '-'} | 후보에만: {top_e or '-'}")
    print("-" * 72)
    print(f" VERDICT: {verdict}  (FAIL {result['fail_count']} · WARN {result['warn_count']})")
    print("=" * 72)

    if args.json:
        payload = {
            "verdict": verdict,
            "summary": summary,
            "findings": result["findings"],
            "diagnostics": result["diagnostics"],
            "offset_suggestions_px": result["offset_suggestions_px"],
            "ink_regions": regions,
            "spans": result["spans"],
        }
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
    sys.exit(1 if verdict == "FAIL" else 0)


if __name__ == "__main__":
    main()
