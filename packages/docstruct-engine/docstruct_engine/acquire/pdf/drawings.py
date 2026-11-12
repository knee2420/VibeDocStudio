"""PDF 1페이지에서 정규화된 스팬과 벡터 도형(`rules`, `fills`)을 CSS px 좌표로 추출한다."""
from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any, Callable, Optional

import pymupdf

from .char_normalizer import atoms_from_rawdict, normalize_chars_to_spans
from .fonts import inspect_page_fonts
from .metrics import PX_PER_PT, FontMetrics
from .rule_stitcher import vertical_walls_from_rules

PX = PX_PER_PT


def _hex_color(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, int):
        return f"#{value:06x}"
    return "#" + "".join(f"{round(c * 255):02x}" for c in value[:3])


def _r(v: float) -> float:
    return round(float(v), 2)


def extract_spans(
    page: pymupdf.Page,
    font_map: Optional[dict[str, FontMetrics]] = None,
    warnings: Optional[list[str]] = None,
    *,
    font_aliases: Optional[dict[str, str]] = None,
    faux_bold_dedup: bool = True,
    space_ratio: float = 0.20,
    vertical_walls: Optional[list[tuple[float, float, float]]] = None,
) -> list[dict[str, Any]]:
    """페이지에서 char 단위 정규화(Faux-Bold 제거 · x정렬 · 세로선 분할 · 공백 복원)를 거친 `spans`를 추출한다."""
    font_meta = inspect_page_fonts(page)
    walls = vertical_walls
    if walls is None:
        rules, _ = extract_drawings(page)
        walls = vertical_walls_from_rules(rules)
    raw = page.get_text("rawdict")
    atoms = atoms_from_rawdict(raw, font_meta=font_meta)
    return normalize_chars_to_spans(
        atoms,
        font_map=font_map,
        font_meta=font_meta,
        font_aliases=font_aliases,
        warnings=warnings,
        faux_bold_dedup=faux_bold_dedup,
        space_ratio=space_ratio,
        vertical_walls=walls,
    )


def extract_drawings(page: pymupdf.Page) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """선분(`rules`, 점선 포함)과 채움 사각형(`fills`)을 CSS px 좌표로 추출한다."""
    rules: list[dict[str, Any]] = []
    fills: list[dict[str, Any]] = []
    for d in page.get_drawings():
        rect = d["rect"]
        x, y, x1, y1 = rect.x0 * PX, rect.y0 * PX, rect.x1 * PX, rect.y1 * PX
        w, h = x1 - x, y1 - y
        fill, stroke = d.get("fill"), d.get("color")
        is_dashed = bool(d.get("dashes") and not str(d.get("dashes")).startswith("[]"))

        is_white_fill = bool(fill and all(c > 0.98 for c in fill[:3]))
        if is_white_fill and not stroke:
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
                rules.append(
                    {
                        "x": _r(lx),
                        "y": _r(ly),
                        "x1": _r(lx1),
                        "y1": _r(ly1),
                        "thickness": _r(width),
                        "orient": "h" if horizontal else "v",
                        "color": _hex_color(stroke),
                        **({"dashed": True} if is_dashed else {}),
                    }
                )
            continue

        if fill and min(w, h) <= 4 * PX:
            if not is_white_fill:
                rules.append(
                    {
                        "x": _r(x),
                        "y": _r(y),
                        "x1": _r(x1),
                        "y1": _r(y1),
                        "thickness": _r(min(w, h)),
                        "orient": "h" if w >= h else "v",
                        "color": _hex_color(fill),
                    }
                )
        elif fill and not is_white_fill:
            fills.append({"x": _r(x), "y": _r(y), "x1": _r(x1), "y1": _r(y1), "color": _hex_color(fill)})

        if stroke:
            width = (d.get("width") or 1) * PX
            hw = width / 2
            re_rects = [it[1] for it in d["items"] if it[0] == "re" and len(it) > 1]
            target_rects = re_rects if len(re_rects) > 1 else [rect]
            for tr in target_rects:
                tx, ty, tx1, ty1 = tr.x0 * PX, tr.y0 * PX, tr.x1 * PX, tr.y1 * PX
                for sx, sy, sx1, sy1, orient in (
                    (tx, ty - hw, tx1, ty + hw, "h"),
                    (tx, ty1 - hw, tx1, ty1 + hw, "h"),
                    (tx - hw, ty, tx + hw, ty1, "v"),
                    (tx1 - hw, ty, tx1 + hw, ty1, "v"),
                ):
                    rules.append(
                        {
                            "x": _r(sx),
                            "y": _r(sy),
                            "x1": _r(sx1),
                            "y1": _r(sy1),
                            "thickness": _r(width),
                            "orient": orient,
                            "color": _hex_color(stroke),
                            **({"dashed": True} if is_dashed else {}),
                        }
                    )
    return rules, fills


def extract_page_truth(
    *,
    pdf_bytes: bytes,
    page_number: int = 1,
    out_dir: Optional[str | Path] = None,
    pdf_label_path: str = "",
    font_map: Optional[dict[str, FontMetrics]] = None,
    font_aliases: Optional[dict[str, str]] = None,
    render_rasters: bool = True,
    faux_bold_dedup: bool = True,
    space_ratio: float = 0.20,
    noise_floor_fn: Optional[Callable[[str, str, tuple[int, int]], dict[str, float]]] = None,
) -> dict[str, Any]:
    """PDF 바이트의 지정 페이지에서 정답 좌표 딕셔너리(`truth.json` 호환)를 생성한다."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    if not 1 <= page_number <= doc.page_count:
        raise ValueError(f"쪽 번호 범위 밖: {page_number} (1~{doc.page_count})")
    page = doc[page_number - 1]
    page_w, page_h = round(page.rect.width * PX), round(page.rect.height * PX)
    warnings: list[str] = []

    rules, fills = extract_drawings(page)
    vertical_walls = vertical_walls_from_rules(rules)
    spans = extract_spans(
        page,
        font_map=font_map,
        warnings=warnings,
        font_aliases=font_aliases,
        faux_bold_dedup=faux_bold_dedup,
        space_ratio=space_ratio,
        vertical_walls=vertical_walls,
    )
    images = [
        {"x": _r(i["bbox"][0] * PX), "y": _r(i["bbox"][1] * PX), "x1": _r(i["bbox"][2] * PX), "y1": _r(i["bbox"][3] * PX)}
        for i in page.get_image_info()
    ]

    render: dict[str, Any] = {"size": [page_w, page_h]}
    if render_rasters and out_dir is not None:
        out_p = Path(out_dir)
        out_p.mkdir(parents=True, exist_ok=True)
        mupdf_png = str(out_p / "original_mupdf.png")
        page.get_pixmap(matrix=pymupdf.Matrix(PX, PX), alpha=False).save(mupdf_png)
        render["mupdf"] = "original_mupdf.png"
        if noise_floor_fn is not None:
            try:
                import pypdfium2 as pdfium  # type: ignore[import-untyped]

                pdfium_doc = pdfium.PdfDocument(pdf_bytes)
                pdfium_png = str(out_p / "original_pdfium.png")
                pdfium_doc[page_number - 1].render(scale=PX).to_pil().convert("RGB").resize((page_w, page_h)).save(pdfium_png)
                render["pdfium"] = "original_pdfium.png"
                render["noise_floor"] = noise_floor_fn(mupdf_png, pdfium_png, (page_w, page_h))
            except ImportError:
                warnings.append("pypdfium2 없음 → 잡음 하한선 없이 진행")

    all_x = [s["x"] for s in spans] + [r["x"] for r in rules] + [f["x"] for f in fills]
    all_x1 = [s["x1"] for s in spans] + [r["x1"] for r in rules] + [f["x1"] for f in fills]
    all_y = [s["y"] for s in spans] + [r["y"] for r in rules] + [f["y"] for f in fills]
    all_y1 = [s["y1"] for s in spans] + [r["y1"] for r in rules] + [f["y1"] for f in fills]

    min_x = round(min(all_x), 2) if all_x else 0.0
    max_x1 = round(max(all_x1), 2) if all_x1 else float(page_w)
    min_y = round(min(all_y), 2) if all_y else 0.0
    max_y1 = round(max(all_y1), 2) if all_y1 else float(page_h)
    content_w = round(max_x1 - min_x, 2)

    page_layout = {
        "content_box": [min_x, min_y, max_x1, max_y1],
        "content_width": content_w,
        "margins": {
            "left": min_x,
            "right": round(page_w - max_x1, 2),
            "top": min_y,
            "bottom": round(page_h - max_y1, 2),
        },
    }

    for s in spans:
        cx = (s["x"] + s["x1"]) / 2.0
        if abs(cx - page_w / 2.0) <= 6.0 or abs(cx - (min_x + max_x1) / 2.0) <= 6.0:
            s["suggested_align"] = "center"
        elif abs(s["x1"] - max_x1) <= 6.0:
            s["suggested_align"] = "right"
        else:
            s["suggested_align"] = "left"

    fonts = {
        name: {
            "file": fm.path,
            "ascent": round(fm.ascent, 4),
            "descent": round(fm.descent, 4),
            "line_gap": round(fm.line_gap, 4),
            "content_height": round(fm.content_height, 4),
        }
        for name, fm in (font_map or {}).items()
    }

    return {
        "source": {"pdf": os.path.abspath(pdf_label_path) if pdf_label_path else "", "page": page_number},
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


def extract_page_image_data_uris(page: pymupdf.Page) -> dict[int, str]:
    """PDF 페이지 내 래스터 이미지를 `page.get_image_info` 순서에 맞춰 PNG data URI 로 추출한다."""
    doc = page.parent
    out: dict[int, str] = {}
    for k, info in enumerate(page.get_image_info(xrefs=True)):
        png: Optional[bytes] = None
        xref = int(info.get("xref") or 0)
        if xref and doc is not None:
            try:
                pix = pymupdf.Pixmap(doc, xref)
                if pix.n - pix.alpha >= 4:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                png = pix.tobytes("png")
            except Exception:
                png = None
        if png is None:
            png = page.get_pixmap(clip=pymupdf.Rect(info["bbox"]), matrix=pymupdf.Matrix(2, 2)).tobytes("png")
        out[k] = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
    return out

