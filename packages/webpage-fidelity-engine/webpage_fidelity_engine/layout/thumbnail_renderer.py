"""Pillow 기반 가변 비율 페이지 썸네일 렌더러 (`doc.preview.pageThumbnails` 용)."""
from __future__ import annotations

import base64
import io
import os
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .paginator import PaginatedPage

_THUMB_W = 170
_PAD_X = 12
_PAD_Y = 14


@lru_cache(maxsize=4)
def _load_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    win_fonts = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    candidates = (
        [win_fonts / "malgunbd.ttf", win_fonts / "malgun.ttf", win_fonts / "gulim.ttc"]
        if bold
        else [win_fonts / "malgun.ttf", win_fonts / "gulim.ttc", win_fonts / "arial.ttf"]
    )
    linux_candidates = [
        Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in (*candidates, *linux_candidates):
        if path.is_file():
            try:
                return ImageFont.truetype(str(path), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def _safe_draw_text(
    draw: ImageDraw.ImageDraw,
    pos: tuple[int, int],
    text: str,
    *,
    fill: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> None:
    try:
        draw.text(pos, text, fill=fill, font=font)
    except UnicodeEncodeError:
        ascii_only = text.encode("ascii", "replace").decode("ascii")
        draw.text(pos, ascii_only, fill=fill, font=font)


def _thumb_height_for(target_width_px: int, target_height_px: int) -> int:
    w = max(200, int(target_width_px))
    h = max(200, int(target_height_px))
    return max(160, min(420, int(round(_THUMB_W * h / w))))


def _parse_grid_weights(raw_widths: object, count: int) -> list[float]:
    if not isinstance(raw_widths, list) or len(raw_widths) != count:
        return [1.0] * count
    weights: list[float] = []
    for item in raw_widths:
        s = str(item or "").strip().lower()
        for suffix in ("fr", "%", "px"):
            if s.endswith(suffix):
                s = s[: -len(suffix)].strip()
                break
        try:
            v = float(s)
            weights.append(v if v > 0 else 1.0)
        except ValueError:
            weights.append(1.0)
    return weights


def _paste_image_bytes(
    canvas: Image.Image,
    raw_bytes: bytes,
    *,
    x: int,
    y: int,
    box_w: int,
    box_h: int,
) -> None:
    try:
        with Image.open(io.BytesIO(raw_bytes)) as src:
            if src.mode != "RGB":
                src = src.convert("RGB")
            fitted = ImageOps.contain(src, (box_w, box_h), Image.Resampling.BILINEAR)
            ox = x + max(0, (box_w - fitted.width) // 2)
            oy = y + max(0, (box_h - fitted.height) // 2)
            canvas.paste(fitted, (ox, oy))
    except Exception:
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((x, y, x + box_w, y + box_h), fill="#f1f5f9", outline="#cbd5e1")


def render_page_thumbnail_data_url(
    page: PaginatedPage,
    *,
    target_width_px: int = 794,
    target_height_px: int = 1123,
) -> str:
    """`PaginatedPage` 내용을 실제 페이지 종횡비에 맞춘 축소 썸네일 JPEG Data URI 로 반환한다."""
    thumb_h = _thumb_height_for(target_width_px, target_height_px)
    usable_w = _THUMB_W - _PAD_X * 2
    content_w = max(320.0, float(target_width_px) - 96.0)
    scale = usable_w / content_w

    canvas = Image.new("RGB", (_THUMB_W, thumb_h), "#ffffff")
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, _THUMB_W - 1, thumb_h - 1), outline="#e2e8f0")

    font_h = _load_font(8, bold=True)
    font_b = _load_font(6, bold=False)

    y = _PAD_Y
    max_y = thumb_h - _PAD_Y

    for item in page.items:
        if y >= max_y - 6:
            break
        kind = item.block.get("kind")
        est_h = max(8, int(round(item.estimated_height_px * scale)))

        if kind == "image" and item.preview_images and item.preview_images[0].image_bytes:
            im0 = item.preview_images[0]
            if im0.width_px > 0 and im0.height_px > 0:
                natural_h = int(round(usable_w * im0.height_px / im0.width_px))
                box_h = max(18, min(max_y - y, natural_h))
            else:
                box_h = max(18, min(max_y - y, est_h))
            _paste_image_bytes(
                canvas,
                im0.image_bytes,
                x=_PAD_X,
                y=y,
                box_w=usable_w,
                box_h=box_h,
            )
            y += box_h + 4
            continue

        if kind == "columns-grid" and item.preview_images:
            n = len(item.preview_images)
            gap = 4
            avail_w = max(24, usable_w - gap * (n - 1))
            weights = _parse_grid_weights(item.block.get("widths"), n)
            sum_w = max(0.1, sum(weights))
            col_widths = [max(10, int(round(avail_w * (w / sum_w)))) for w in weights]
            natural_heights = [
                int(round(cw * im.height_px / im.width_px))
                if im.width_px > 0 and im.height_px > 0
                else est_h
                for cw, im in zip(col_widths, item.preview_images)
            ]
            box_h = max(18, min(max_y - y, max(natural_heights or [est_h])))
            cx = _PAD_X
            for cw, im in zip(col_widths, item.preview_images):
                if im.image_bytes:
                    _paste_image_bytes(
                        canvas,
                        im.image_bytes,
                        x=cx,
                        y=y,
                        box_w=cw,
                        box_h=box_h,
                    )
                else:
                    draw.rectangle((cx, y, cx + cw, y + box_h), fill="#f1f5f9", outline="#cbd5e1")
                cx += cw + gap
            y += box_h + 4
            continue

        if kind == "heading":
            txt = (item.preview_text or "")[:24]
            if txt:
                _safe_draw_text(draw, (_PAD_X, y), txt, fill="#0f172a", font=font_h)
                y += 11
            else:
                draw.rectangle((_PAD_X, y, _PAD_X + int(usable_w * 0.7), y + 4), fill="#1e293b")
                y += 8
            continue

        if kind in ("callout-box", "link-card"):
            box_h = max(12, min(max_y - y, max(12, est_h)))
            tone = item.block.get("tone", "neutral")
            fill = "#f0f9ff" if tone == "info" else "#f8fafc"
            outline = "#bae6fd" if tone == "info" else "#cbd5e1"
            draw.rectangle((_PAD_X, y, _THUMB_W - _PAD_X, y + box_h), fill=fill, outline=outline)
            txt = (item.preview_text or "")[:24]
            if txt and box_h >= 12:
                _safe_draw_text(draw, (_PAD_X + 3, y + 2), txt, fill="#334155", font=font_b)
            y += box_h + 4
            continue

        if kind == "structured-table":
            box_h = max(14, min(max_y - y, est_h))
            draw.rectangle((_PAD_X, y, _THUMB_W - _PAD_X, y + box_h), fill="#ffffff", outline="#94a3b8")
            mid = y + box_h // 2
            draw.line((_PAD_X, mid, _THUMB_W - _PAD_X, mid), fill="#cbd5e1")
            y += box_h + 4
            continue

        # 일반 text 블록: 짧은 문장 미리보기 + 라인 스켈레톤
        snippet = (item.preview_text or "").replace("\n", " ")[:28]
        if snippet:
            _safe_draw_text(draw, (_PAD_X, y), snippet, fill="#475569", font=font_b)
            y += 8
        line_count = max(1, min(4, est_h // 6))
        for li in range(line_count):
            if y >= max_y - 3:
                break
            line_w = int(usable_w * (0.65 if li == line_count - 1 else 0.96))
            draw.rectangle((_PAD_X, y, _PAD_X + line_w, y + 2), fill="#cbd5e1")
            y += 4
        y += 3

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=78, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"
