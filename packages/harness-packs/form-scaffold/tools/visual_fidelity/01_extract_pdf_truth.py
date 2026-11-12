#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
01_extract_pdf_truth.py
원본 PDF 1페이지에서 정규화 정답 좌표(`truth.json`) 및 비교용 래스터 PNG 를 생성한다.
실제 추출·Faux-Bold 제거·역행 문자 재정렬·점선 선분 탐지 로직은 `docstruct_engine.acquire.pdf` 에 위임한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fidelity_core as core  # noqa: E402
from docstruct_engine.acquire.pdf import extract_page_truth  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="원본 PDF 한 쪽 → truth.json (정답 좌표)")
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--page", type=int, default=1, help="1부터 센 쪽 번호")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument(
        "--font",
        action="append",
        default=[],
        metavar="PDF글꼴이름=경로.ttf",
        help="브라우저에서 쓸 글꼴 파일 (공식 배포본). 여러 번 지정 가능",
    )
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    try:
        font_map = core.parse_font_map(args.font)
    except (ValueError, OSError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(2)

    try:
        truth = extract_page_truth(
            pdf_bytes=Path(args.pdf).read_bytes(),
            page_number=args.page,
            out_dir=args.out_dir,
            pdf_label_path=args.pdf,
            font_map=font_map,
            render_rasters=True,
            noise_floor_fn=core.image_metrics,
        )
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(2)

    out = os.path.join(args.out_dir, "truth.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)

    spans = truth["spans"]
    rules = truth["rules"]
    fills = truth["fills"]
    images = truth["images"]
    page_w, page_h = truth["page"]["width"], truth["page"]["height"]
    layout = truth["page_layout"]
    margins = layout["margins"]
    sizes = sorted({s["pt"] for s in spans})
    pdf_fonts = sorted({s["font"] for s in spans})
    render = truth["render"]

    print(f"[OK] {out}")
    print(f"  쪽 {page_w}×{page_h}px | 글자 {len(spans)} | 선 {len(rules)} | 칠 {len(fills)} | 그림 {len(images)}")
    print(
        f"  레이아웃: 본문폭 {layout['content_width']}px "
        f"(좌여백 {margins['left']}px · 우여백 {margins['right']}px · "
        f"상 {margins['top']}px · 하 {margins['bottom']}px)"
    )
    print(f"  글자 크기(pt): {', '.join(map(str, sizes))}")
    print(f"  PDF 글꼴: {', '.join(pdf_fonts)}")
    for name, f in truth["fonts"].items():
        print(f"  F({name}) = {f['content_height']}  → line-height = 글자px × {f['content_height']}")
    if "noise_floor" in render:
        nf = render["noise_floor"]
        print(f"  잡음 하한선 (MuPDF vs PDFium): ink F1@1px {nf['ink_f1_1px']}% | blur±16 {nf['blur_within_16']}%")
    for w in dict.fromkeys(truth["warnings"]):
        print(f"  [WARN] {w}")


if __name__ == "__main__":
    main()
