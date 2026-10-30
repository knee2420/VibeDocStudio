#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
01_extract_pdf_truth.py
원본 PDF 한 쪽에서 "정답 좌표"(truth.json)를 뽑는다. 이후 모든 판정은 이 파일만 기준으로 한다.

정답은 원본 PDF 다. 같은 문서를 다시 조판한 .typ · .docx · 스크린샷은 정답이 아니다 (L-01).

뽑는 것 (단위 CSS px, 96 dpi, 쪽 왼쪽 위 원점):
  spans   글자 덩어리마다 text · x · y · x1 · y1 · pt · font · color · bold · block/line 번호
          y/y1 은 글꼴 ascent/descent 상자 = 브라우저 Range 사각형과 같은 기준
          x1 은 끝 공백을 뺀 실제 글자 끝 (PDF 상자는 끝 공백까지 포함한다, L-09)
          --font 를 주면 단어 · 공백 토큰마다 letter-spacing 해(tokens)도 함께 낸다
  rules   얇은 선 (채운 얇은 사각형 · 선분) — 위치 · 두께 · 색
  fills   배경 칠 (흰색 제외)
  images  그림 위치
  fonts   --font 로 준 글꼴의 세로 지표 (content_height = 줄 높이 공식의 F)
  render  original_mupdf.png · original_pdfium.png 와 둘 사이 잡음 하한선 (noise_floor)

사용법:
  python 01_extract_pdf_truth.py --pdf invoice.pdf --out-dir work/fidelity \\
      --font DejaVuSans=fonts/DejaVuSans.ttf --font DejaVuSans-Bold=fonts/DejaVuSans-Bold.ttf
"""

import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fidelity_core as core  # noqa: E402

PX = core.PX_PER_PT


def hex_color(value):
    if value is None:
        return None
    if isinstance(value, int):
        return f"#{value:06x}"
    return "#" + "".join(f"{round(c * 255):02x}" for c in value[:3])


def r(v):
    return round(float(v), 2)


def extract_spans(page, font_map, warnings):
    raw = page.get_text("rawdict")
    spans = []
    for bi, block in enumerate(raw["blocks"]):
        if block.get("type") != 0:
            continue
        for li, line in enumerate(block["lines"]):
            for span in line["spans"]:
                chars = span["chars"]
                text = "".join(c["c"] for c in chars)
                if not text.strip():
                    continue
                # 앞뒤 공백을 떼되, 끝 공백 존재는 기록한다 (생성기가 공백 토큰을 이어 붙일 때 필요).
                lead = len(text) - len(text.lstrip(" "))
                vis = chars[lead:len(text.rstrip(" "))]
                trailing = len(text) - len(text.rstrip(" "))
                bx = span["bbox"]
                item = {
                    "text": "".join(c["c"] for c in vis),
                    "x": r(vis[0]["bbox"][0] * PX),
                    "y": r(bx[1] * PX),
                    "x1": r(vis[-1]["bbox"][2] * PX),
                    "y1": r(bx[3] * PX),
                    "x1_raw": r(bx[2] * PX),
                    "pt": round(span["size"], 2),
                    "font": span["font"],
                    "color": hex_color(span["color"]),
                    "bold": bool(span["flags"] & 16) or "bold" in span["font"].lower(),
                    "italic": bool(span["flags"] & 2),
                    "block": bi,
                    "line": li,
                    "trailing_space": trailing > 0,
                    "baseline": r(span["origin"][1] * PX),
                }
                fm = core.pick_font(font_map, span["font"]) if font_map else None
                if fm:
                    try:
                        px_chars = [{"c": c["c"], "x": c["origin"][0] * PX, "x_end": c["bbox"][2] * PX} for c in chars]
                        item["tokens"] = core.solve_token_spacing(px_chars, fm, span["size"] * PX)
                    except KeyError as exc:
                        warnings.append(f"토큰 자간 생략 ({item['text'][:20]}): {exc}")
                elif font_map:
                    warnings.append(f"--font 에 없는 PDF 글꼴: {span['font']} (토큰 자간 없음)")
                spans.append(item)
    return spans


def extract_drawings(page, page_w, page_h):
    rules, fills = [], []
    for d in page.get_drawings():
        rect = d["rect"]
        x, y, x1, y1 = rect.x0 * PX, rect.y0 * PX, rect.x1 * PX, rect.y1 * PX
        w, h = x1 - x, y1 - y
        fill, stroke = d.get("fill"), d.get("color")
        # 쪽 전체를 덮는 흰 배경은 버린다.
        if fill and all(c > 0.98 for c in fill[:3]) and not stroke:
            continue
        line_items = [it for it in d["items"] if it[0] == "l"]
        if stroke and line_items:
            width = (d.get("width") or 1) * PX
            for it in line_items:
                p0, p1 = it[1], it[2]
                horizontal = abs(p0.y - p1.y) < abs(p0.x - p1.x)
                lx, ly = min(p0.x, p1.x) * PX, min(p0.y, p1.y) * PX
                lx1, ly1 = max(p0.x, p1.x) * PX, max(p0.y, p1.y) * PX
                if horizontal:
                    ly, ly1 = ly - width / 2, ly + width / 2
                else:
                    lx, lx1 = lx - width / 2, lx + width / 2
                rules.append({"x": r(lx), "y": r(ly), "x1": r(lx1), "y1": r(ly1), "thickness": r(width),
                              "orient": "h" if horizontal else "v", "color": hex_color(stroke)})
            continue
        if fill and min(w, h) <= 4 * PX:
            rules.append({"x": r(x), "y": r(y), "x1": r(x1), "y1": r(y1), "thickness": r(min(w, h)),
                          "orient": "h" if w >= h else "v", "color": hex_color(fill)})
        elif fill:
            fills.append({"x": r(x), "y": r(y), "x1": r(x1), "y1": r(y1), "color": hex_color(fill)})
        elif stroke:
            # 테두리만 있는 사각형 → 네 변을 선으로 기록
            width = (d.get("width") or 1) * PX
            hw = width / 2
            for side in ((x, y - hw, x1, y + hw, "h"), (x, y1 - hw, x1, y1 + hw, "h"),
                         (x - hw, y, x + hw, y1, "v"), (x1 - hw, y, x1 + hw, y1, "v")):
                rules.append({"x": r(side[0]), "y": r(side[1]), "x1": r(side[2]), "y1": r(side[3]),
                              "thickness": r(width), "orient": side[4], "color": hex_color(stroke)})
    return rules, fills


def main():
    ap = argparse.ArgumentParser(description="원본 PDF 한 쪽 → truth.json (정답 좌표)")
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--page", type=int, default=1, help="1부터 센 쪽 번호")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--font", action="append", default=[], metavar="PDF글꼴이름=경로.ttf",
                    help="브라우저에서 쓸 글꼴 파일 (공식 배포본). 여러 번 지정 가능")
    args = ap.parse_args()

    fitz = core.need("fitz", "pymupdf")
    os.makedirs(args.out_dir, exist_ok=True)
    warnings = []

    try:
        font_map = core.parse_font_map(args.font)
    except (ValueError, OSError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(2)

    pdf_bytes = Path(args.pdf).read_bytes()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if not 1 <= args.page <= doc.page_count:
        print(f"[ERROR] 쪽 번호 범위 밖: {args.page} (1~{doc.page_count})", file=sys.stderr)
        sys.exit(2)
    page = doc[args.page - 1]
    page_w, page_h = round(page.rect.width * PX), round(page.rect.height * PX)

    spans = extract_spans(page, font_map, warnings)
    rules, fills = extract_drawings(page, page_w, page_h)
    images = [{"x": r(i["bbox"][0] * PX), "y": r(i["bbox"][1] * PX), "x1": r(i["bbox"][2] * PX), "y1": r(i["bbox"][3] * PX)}
              for i in page.get_image_info()]

    # 원본 래스터 두 장: MuPDF 와 PDFium(크롬의 PDF 엔진). 둘의 차이가 "도달 가능한 최대치"를 정한다.
    mupdf_png = os.path.join(args.out_dir, "original_mupdf.png")
    page.get_pixmap(matrix=fitz.Matrix(PX, PX), alpha=False).save(mupdf_png)
    render = {"mupdf": "original_mupdf.png", "size": [page_w, page_h]}
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(pdf_bytes)
        pdfium_png = os.path.join(args.out_dir, "original_pdfium.png")
        pdf[args.page - 1].render(scale=PX).to_pil().convert("RGB").resize((page_w, page_h)).save(pdfium_png)
        render["pdfium"] = "original_pdfium.png"
        render["noise_floor"] = core.image_metrics(mupdf_png, pdfium_png, (page_w, page_h))
    except ImportError:
        warnings.append("pypdfium2 없음 → 잡음 하한선 없이 진행 (pip install pypdfium2 권장)")

    # 문서 본문 영역(Content Bounding Box) 및 마진 계산
    all_x = [s["x"] for s in spans] + [r["x"] for r in rules] + [f["x"] for f in fills]
    all_x1 = [s["x1"] for s in spans] + [r["x1"] for r in rules] + [f["x1"] for f in fills]
    all_y = [s["y"] for s in spans] + [r["y"] for r in rules] + [f["y"] for f in fills]
    all_y1 = [s["y1"] for s in spans] + [r["y1"] for r in rules] + [f["y1"] for f in fills]

    min_x = round(min(all_x), 2) if all_x else 0.0
    max_x1 = round(max(all_x1), 2) if all_x1 else float(page_w)
    min_y = round(min(all_y), 2) if all_y else 0.0
    max_y1 = round(max(all_y1), 2) if all_y1 else float(page_h)

    content_w = round(max_x1 - min_x, 2)
    margin_left = min_x
    margin_right = round(page_w - max_x1, 2)
    margin_top = min_y
    margin_bottom = round(page_h - max_y1, 2)

    page_layout = {
        "content_box": [min_x, min_y, max_x1, max_y1],
        "content_width": content_w,
        "margins": {
            "left": margin_left,
            "right": margin_right,
            "top": margin_top,
            "bottom": margin_bottom
        }
    }

    # 각 span에 정렬 힌트(suggested_align) 부여
    for s in spans:
        center_x = (s["x"] + s["x1"]) / 2.0
        if abs(center_x - page_w / 2.0) <= 6.0 or abs(center_x - (min_x + max_x1) / 2.0) <= 6.0:
            s["suggested_align"] = "center"
        elif abs(s["x1"] - max_x1) <= 6.0:
            s["suggested_align"] = "right"
        else:
            s["suggested_align"] = "left"

    fonts = {name: {"file": fm.path, "ascent": round(fm.ascent, 4), "descent": round(fm.descent, 4),
                    "line_gap": round(fm.line_gap, 4), "content_height": round(fm.content_height, 4)}
             for name, fm in font_map.items()}

    truth = {
        "source": {"pdf": os.path.abspath(args.pdf), "page": args.page},
        "unit": "css_px_96dpi",
        "page": {"width": page_w, "height": page_h},
        "page_layout": page_layout,
        "spans": spans,
        "rules": rules,
        "fills": fills,
        "images": images,
        "fonts": fonts,
        "render": render,
        "warnings": warnings,
    }
    out = os.path.join(args.out_dir, "truth.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)

    sizes = sorted({s["pt"] for s in spans})
    pdf_fonts = sorted({s["font"] for s in spans})
    print(f"[OK] {out}")
    print(f"  쪽 {page_w}×{page_h}px | 글자 {len(spans)} | 선 {len(rules)} | 칠 {len(fills)} | 그림 {len(images)}")
    print(f"  레이아웃: 본문폭 {content_w}px (좌여백 {margin_left}px · 우여백 {margin_right}px · 상 {margin_top}px · 하 {margin_bottom}px)")
    print(f"  글자 크기(pt): {', '.join(map(str, sizes))}")
    print(f"  PDF 글꼴: {', '.join(pdf_fonts)}")
    for name, f in fonts.items():
        print(f"  F({name}) = {f['content_height']}  → line-height = 글자px × {f['content_height']}")
    if "noise_floor" in render:
        nf = render["noise_floor"]
        print(f"  잡음 하한선 (MuPDF vs PDFium): ink F1@1px {nf['ink_f1_1px']}% | blur±16 {nf['blur_within_16']}%")
    for w in dict.fromkeys(warnings):
        print(f"  [WARN] {w}")


if __name__ == "__main__":
    main()
