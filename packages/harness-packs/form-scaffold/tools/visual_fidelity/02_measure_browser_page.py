#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02_measure_browser_page.py
디버그 크롬(CDP)에 떠 있는 후보 페이지를 재서 `measure.json` 과 `candidate.png` 를 만든다.
실제 CDP 계측 로직은 `pdf_fidelity_engine.verify.browser_measure` 에 위임한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fidelity_core as _core  # noqa: E402, F401
from pdf_fidelity_engine.verify.browser_measure import measure_browser_page  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="CDP 로 후보 페이지를 재서 measure.json · candidate.png 생성")
    ap.add_argument("--truth", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--target-url-contains", default="", help="탭 URL 에 들어 있는 문자열")
    ap.add_argument("--page-selector", default="body", help="쪽(종이) 요소 CSS 선택자")
    ap.add_argument("--page-text", default="", help="여러 쪽 중 이 글자를 포함한 쪽을 고른다")
    ap.add_argument("--viewport", default="1920x1400", help="재는 동안 쓸 창 크기 (확대율 1)")
    ap.add_argument("--reload", action="store_true", help="재기 전에 새로고침 (편집 중인 문서에는 쓰지 말 것)")
    ap.add_argument("--calibrate", action="store_true", help="글자 크기별 상자 오프셋도 잰다")
    ap.add_argument("--settle", type=float, default=0.8, help="스크롤 후 기다릴 초")
    ap.add_argument(
        "--hide-selector",
        action="append",
        default=["[data-fidelity-ignore]"],
        help="잴 때 숨길 편집 도구 모양 CSS 선택자 (여러 번 지정 가능)",
    )
    args = ap.parse_args()

    with open(args.truth, encoding="utf-8") as f:
        truth = json.load(f)

    try:
        measure = measure_browser_page(
            truth=truth,
            out_dir=args.out_dir,
            cdp_endpoint=args.cdp,
            target_url_contains=args.target_url_contains,
            page_selector=args.page_selector,
            page_text=args.page_text,
            viewport=args.viewport,
            reload_page=args.reload,
            calibrate=args.calibrate,
            settle=args.settle,
            hide_selectors=args.hide_selector,
        )
    except RuntimeError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(2)

    out = os.path.join(args.out_dir, "measure.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(measure, f, ensure_ascii=False, indent=1)

    rect = measure["page_rect"]
    matched = measure["spans"]
    missing = sum(1 for m in matched if m is None)
    chrome = measure.get("visible_chrome", [])
    calibration = measure.get("calibration")
    print(f"[OK] {out}")
    print(
        f"  쪽 {rect[2]:.1f}×{rect[3]:.1f}px @({rect[0]:.1f},{rect[1]:.1f}) | "
        f"글자 {len(matched) - missing}/{len(matched)} 찾음 | 선 {len(measure['rules'])} | 그림 {len(measure['images'])}"
    )
    print(f"  불러온 웹 글꼴: {', '.join(sorted(set(measure['loaded_fonts']))) or '(없음)'}")
    if chrome:
        print(
            f"  [WARN] 사진에 찍힌 편집 도구 모양 {len(chrome)}개: {', '.join(c['desc'] for c in chrome[:5])}"
            " → --hide-selector 로 숨기세요"
        )
    if calibration:
        for size, rows in sorted(calibration.items(), key=lambda kv: float(kv[0][:-2])):
            offs = sorted({row["rect_minus_box_top"] for row in rows})
            print(f"  calibrate {size}: 글자상자-줄상자 위쪽 = {offs}")
    print("  판정은 03_verify_fidelity.py 로 하세요.")


if __name__ == "__main__":
    main()
