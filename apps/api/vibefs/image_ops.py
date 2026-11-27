"""스크랩·리소스 이미지 분석 · 비파괴 조작 · 합성 엔진 (Pillow 기반, 순수 함수).

`app` 패키지를 import 하지 않는다 (vibefs MCP 서버 경량 실행 유지).
지원 연산:
  - inspect_image: 해상도 · 포맷 · 모드 · 비율 · 용량 조회
  - transform_image:
      * crop (픽셀/정규화 0..1 사각형)
      * aspect + anchor (16:9 · 4:3 · 1:1 · 3:2 · 9:16 · 21:9 비율 크롭)
      * rotate (회전) · flip (좌우/상하 반전)
      * resize (width · height · maxWidth · maxHeight · contain/cover)
      * adjust (brightness · contrast · sharpness · saturation · grayscale · blur)
      * annotate (box + spotlight · circle · blur_region · text 라벨, 한글 폰트 지원)
      * format (jpg · png · webp) · quality
  - compose_images: 2~6장 가로(horizontal) · 세로(vertical) · 그리드(grid) 합성 + 패널 라벨
"""
from __future__ import annotations

import io
import math
import os
import re
from typing import Any, Optional

from PIL import Image, ImageColor, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

MAX_INPUT_PIXELS = 50_000_000  # 50MP 안전 상한 (decompression bomb 방지)
MAX_OUTPUT_DIM = 4096
DEFAULT_QUALITY = 90

_ASPECT_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*[:/xX]\s*(\d+(?:\.\d+)?)\s*$")
_FMT_MAP: dict[str, tuple[str, str, str]] = {
    "jpg": ("JPEG", ".jpg", "image/jpeg"),
    "jpeg": ("JPEG", ".jpg", "image/jpeg"),
    "png": ("PNG", ".png", "image/png"),
    "webp": ("WEBP", ".webp", "image/webp"),
}

_FONT_CANDIDATES = (
    # Windows 한글/영문 고딕
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\malgun.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    # macOS
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    # Linux
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
)


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    px = max(10, min(int(size or 18), 160))
    for path in _FONT_CANDIDATES:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, px)
            except OSError:
                continue
    return ImageFont.load_default()


def _open_image(raw: bytes) -> Image.Image:
    if not raw:
        raise ValueError("이미지 데이터가 비어 있다")
    Image.MAX_IMAGE_PIXELS = MAX_INPUT_PIXELS
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise ValueError(f"이미지를 열 수 없다: {exc}") from exc
    if img.width <= 0 or img.height <= 0:
        raise ValueError("이미지 크기가 올바르지 않다")
    if img.width * img.height > MAX_INPUT_PIXELS:
        raise ValueError(f"이미지가 너무 크다 ({img.width}×{img.height})")
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    return img


def inspect_image(raw: bytes) -> dict[str, Any]:
    img = _open_image(raw)
    w, h = img.size
    return {
        "width": w,
        "height": h,
        "format": (img.format or "PNG").upper(),
        "mode": img.mode,
        "aspectRatio": round(w / h, 3) if h else 0.0,
        "sizeBytes": len(raw),
    }


def _parse_color(value: Any, default: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if not value:
        return default
    try:
        rgb = ImageColor.getrgb(str(value).strip())
        if len(rgb) == 4:
            return (rgb[0], rgb[1], rgb[2], rgb[3])
        return (rgb[0], rgb[1], rgb[2], 255)
    except ValueError:
        return default


def _resolve_bbox(spec: Any, w: int, h: int) -> tuple[int, int, int, int]:
    """bbox([x1, y1, x2, y2] 또는 {x, y, width, height}) → 클램핑된 픽셀 (x1, y1, x2, y2).
    값이 모두 0..1 범위(최대 <= 1.0)이면 이미지 크기 대비 정규화 비율 좌표로 해석한다."""
    if isinstance(spec, dict):
        if all(k in spec for k in ("x1", "y1", "x2", "y2")):
            vals = [float(spec["x1"]), float(spec["y1"]), float(spec["x2"]), float(spec["y2"])]
            normalized = all(0.0 <= v <= 1.0 for v in vals)
            x1, y1, x2, y2 = (vals[0] * w, vals[1] * h, vals[2] * w, vals[3] * h) if normalized else vals
        elif all(k in spec for k in ("x", "y", "width", "height")):
            x, y, bw, bh = float(spec["x"]), float(spec["y"]), float(spec["width"]), float(spec["height"])
            normalized = all(0.0 <= v <= 1.0 for v in (x, y, bw, bh)) and (bw <= 1.0 and bh <= 1.0)
            if normalized:
                x1, y1, x2, y2 = x * w, y * h, (x + bw) * w, (y + bh) * h
            else:
                x1, y1, x2, y2 = x, y, x + bw, y + bh
        else:
            raise ValueError("bbox 객체에는 (x, y, width, height) 또는 (x1, y1, x2, y2) 가 필요하다")
    elif isinstance(spec, (list, tuple)) and len(spec) == 4:
        vals = [float(v) for v in spec]
        normalized = all(0.0 <= v <= 1.0 for v in vals)
        x1, y1, x2, y2 = (vals[0] * w, vals[1] * h, vals[2] * w, vals[3] * h) if normalized else vals
    else:
        raise ValueError("bbox 는 [x1, y1, x2, y2] 또는 {x, y, width, height} 여야 한다")

    ix1 = max(0, min(w - 1, int(round(min(x1, x2)))))
    iy1 = max(0, min(h - 1, int(round(min(y1, y2)))))
    ix2 = max(ix1 + 1, min(w, int(round(max(x1, x2)))))
    iy2 = max(iy1 + 1, min(h, int(round(max(y1, y2)))))
    return (ix1, iy1, ix2, iy2)


def _apply_aspect_crop(img: Image.Image, aspect: str, anchor: str = "center") -> tuple[Image.Image, str]:
    m = _ASPECT_RE.match(str(aspect or ""))
    if not m:
        raise ValueError(f"지원하지 않는 비율 형식: {aspect} (예: 16:9, 4:3, 1:1, 3:2)")
    aw, ah = float(m.group(1)), float(m.group(2))
    if aw <= 0 or ah <= 0:
        raise ValueError(f"비율은 양수여야 한다: {aspect}")
    target_ratio = aw / ah
    w, h = img.size
    cur_ratio = w / h
    if abs(cur_ratio - target_ratio) < 0.005:
        return img, f"aspect({aspect})"
    if cur_ratio > target_ratio:
        new_w = max(1, int(round(h * target_ratio)))
        new_h = h
    else:
        new_w = w
        new_h = max(1, int(round(w / target_ratio)))

    anc = str(anchor or "center").strip().lower()
    if "left" in anc:
        left = 0
    elif "right" in anc:
        left = w - new_w
    else:
        left = (w - new_w) // 2

    if "top" in anc:
        top = 0
    elif "bottom" in anc:
        top = h - new_h
    else:
        top = (h - new_h) // 2

    return img.crop((left, top, left + new_w, top + new_h)), f"aspect({aspect},{anc})"


def _apply_resize(img: Image.Image, spec: dict[str, Any]) -> tuple[Image.Image, str]:
    w, h = img.size
    req_w = int(spec["width"]) if spec.get("width") else None
    req_h = int(spec["height"]) if spec.get("height") else None
    max_w = int(spec["maxWidth"]) if spec.get("maxWidth") else None
    max_h = int(spec["maxHeight"]) if spec.get("maxHeight") else None
    fit = str(spec.get("fit") or "contain").strip().lower()

    if req_w and req_h:
        tw, th = max(1, min(req_w, MAX_OUTPUT_DIM)), max(1, min(req_h, MAX_OUTPUT_DIM))
        if fit == "cover":
            out = ImageOps.fit(img, (tw, th), method=Image.Resampling.LANCZOS)
            return out, f"resize({tw}×{th},cover)"
        return img.resize((tw, th), Image.Resampling.LANCZOS), f"resize({tw}×{th})"
    if req_w:
        tw = max(1, min(req_w, MAX_OUTPUT_DIM))
        th = max(1, min(int(round(h * (tw / w))), MAX_OUTPUT_DIM))
        return img.resize((tw, th), Image.Resampling.LANCZOS), f"resize(w={tw})"
    if req_h:
        th = max(1, min(req_h, MAX_OUTPUT_DIM))
        tw = max(1, min(int(round(w * (th / h))), MAX_OUTPUT_DIM))
        return img.resize((tw, th), Image.Resampling.LANCZOS), f"resize(h={th})"

    scale = 1.0
    if max_w and w > max_w:
        scale = min(scale, max_w / w)
    if max_h and h > max_h:
        scale = min(scale, max_h / h)
    if scale < 1.0:
        tw = max(1, min(int(round(w * scale)), MAX_OUTPUT_DIM))
        th = max(1, min(int(round(h * scale)), MAX_OUTPUT_DIM))
        return img.resize((tw, th), Image.Resampling.LANCZOS), f"resize({tw}×{th})"
    return img, "resize(noop)"


def _apply_adjust(img: Image.Image, spec: dict[str, Any]) -> tuple[Image.Image, list[str]]:
    notes: list[str] = []
    alpha = img.getchannel("A") if img.mode == "RGBA" else None
    work = img.convert("RGB") if img.mode not in ("RGB", "L") else img

    for key, cls in (
        ("brightness", ImageEnhance.Brightness),
        ("contrast", ImageEnhance.Contrast),
        ("sharpness", ImageEnhance.Sharpness),
        ("saturation", ImageEnhance.Color),
    ):
        if key in spec and spec[key] is not None:
            factor = max(0.0, min(3.0, float(spec[key])))
            if abs(factor - 1.0) > 0.001:
                work = cls(work).enhance(factor)
                notes.append(f"{key}={factor:.2g}")

    if spec.get("grayscale"):
        work = ImageOps.grayscale(work).convert("RGB")
        notes.append("grayscale")

    if spec.get("blur"):
        radius = max(0.2, min(40.0, float(spec["blur"])))
        work = work.filter(ImageFilter.GaussianBlur(radius=radius))
        notes.append(f"blur={radius:.1f}")

    if alpha is not None:
        work = work.convert("RGBA")
        work.putalpha(alpha)
    return work, notes


def _apply_annotations(img: Image.Image, annotations: list[dict[str, Any]]) -> tuple[Image.Image, list[str]]:
    if not annotations:
        return img, []
    base = img.convert("RGBA")
    w, h = base.size
    notes: list[str] = []

    # 1) blur_region 먼저 적용 (민감 정보 · 워터마크 마스킹)
    for ann in annotations:
        if not isinstance(ann, dict):
            continue
        if str(ann.get("type") or "").lower() == "blur_region" and ann.get("bbox") is not None:
            x1, y1, x2, y2 = _resolve_bbox(ann["bbox"], w, h)
            radius = max(2.0, min(40.0, float(ann.get("radius") or 14)))
            region = base.crop((x1, y1, x2, y2)).filter(ImageFilter.GaussianBlur(radius=radius))
            base.paste(region, (x1, y1))
            notes.append("blur_region")

    # 2) spotlight 옵션이 켜진 box 가 하나라도 있으면 바깥 영역을 부드럽게 어둡게 처리
    spotlight_boxes: list[tuple[int, int, int, int]] = []
    for ann in annotations:
        if isinstance(ann, dict) and str(ann.get("type") or "").lower() == "box" and ann.get("spotlight") and ann.get("bbox") is not None:
            spotlight_boxes.append(_resolve_bbox(ann["bbox"], w, h))
    if spotlight_boxes:
        overlay = Image.new("RGBA", (w, h), (15, 23, 42, 115))
        ov_draw = ImageDraw.Draw(overlay)
        for bx in spotlight_boxes:
            ov_draw.rectangle(bx, fill=(0, 0, 0, 0))
        base = Image.alpha_composite(base, overlay)
        notes.append("spotlight")

    # 3) 박스 · 원 · 텍스트 배지 그리기
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for ann in annotations:
        if not isinstance(ann, dict):
            continue
        kind = str(ann.get("type") or "box").strip().lower()
        if kind == "blur_region":
            continue
        color = _parse_color(ann.get("color"), (239, 68, 68, 255))
        stroke = max(1, min(24, int(ann.get("width") or max(3, round(min(w, h) / 180)))))

        if kind == "box" and ann.get("bbox") is not None:
            x1, y1, x2, y2 = _resolve_bbox(ann["bbox"], w, h)
            draw.rectangle((x1, y1, x2, y2), outline=color, width=stroke)
            label = str(ann.get("label") or "").strip()
            if label:
                fsize = max(14, min(40, int(ann.get("fontSize") or max(16, round(min(w, h) / 36)))))
                font = _load_font(fsize)
                tb = draw.textbbox((0, 0), label, font=font)
                tw, th = tb[2] - tb[0], tb[3] - tb[1]
                pad_x, pad_y = 8, 4
                lx = max(4, min(x1, w - tw - pad_x * 2 - 4))
                ly = y1 - th - pad_y * 2 - 4
                if ly < 4:
                    ly = min(h - th - pad_y * 2 - 4, y1 + 4)
                draw.rounded_rectangle((lx, ly, lx + tw + pad_x * 2, ly + th + pad_y * 2), radius=6, fill=color)
                draw.text((lx + pad_x, ly + pad_y - tb[1]), label, fill=(255, 255, 255, 255), font=font)
            notes.append(f"box({label})" if label else "box")
        elif kind == "circle" and ann.get("bbox") is not None:
            x1, y1, x2, y2 = _resolve_bbox(ann["bbox"], w, h)
            draw.ellipse((x1, y1, x2, y2), outline=color, width=stroke)
            notes.append("circle")
        elif kind == "text" and ann.get("text"):
            text = str(ann.get("text")).strip()
            pos = ann.get("pos") or [0.05, 0.05]
            if isinstance(pos, (list, tuple)) and len(pos) == 2:
                px_v, py_v = float(pos[0]), float(pos[1])
                tx = int(round(px_v * w)) if 0.0 <= px_v <= 1.0 else int(round(px_v))
                ty = int(round(py_v * h)) if 0.0 <= py_v <= 1.0 else int(round(py_v))
            else:
                tx, ty = 16, 16
            fsize = max(12, min(72, int(ann.get("size") or ann.get("fontSize") or max(18, round(min(w, h) / 30)))))
            font = _load_font(fsize)
            tb = draw.textbbox((0, 0), text, font=font)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
            pad_x, pad_y = 10, 6
            tx = max(4, min(tx, max(4, w - tw - pad_x * 2 - 4)))
            ty = max(4, min(ty, max(4, h - th - pad_y * 2 - 4)))
            bg = _parse_color(ann.get("bg"), (17, 24, 39, 215))
            fg = _parse_color(ann.get("color"), (255, 255, 255, 255))
            draw.rounded_rectangle((tx, ty, tx + tw + pad_x * 2, ty + th + pad_y * 2), radius=6, fill=bg)
            draw.text((tx + pad_x, ty + pad_y - tb[1]), text, fill=fg, font=font)
            notes.append("text")

    return Image.alpha_composite(base, layer), notes


def _encode_image(img: Image.Image, target_fmt: Optional[str], fallback_fmt: str, quality: int = DEFAULT_QUALITY) -> tuple[bytes, str, str]:
    key = str(target_fmt or fallback_fmt or "jpg").strip().lower().lstrip(".")
    pil_fmt, ext, mime = _FMT_MAP.get(key, ("JPEG", ".jpg", "image/jpeg"))
    q = max(30, min(100, int(quality or DEFAULT_QUALITY)))
    out_img = img
    if pil_fmt == "JPEG":
        if out_img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", out_img.size, (255, 255, 255))
            rgba = out_img.convert("RGBA")
            bg.paste(rgba, mask=rgba.getchannel("A"))
            out_img = bg
        elif out_img.mode != "RGB":
            out_img = out_img.convert("RGB")
    buf = io.BytesIO()
    save_kwargs: dict[str, Any] = {}
    if pil_fmt in ("JPEG", "WEBP"):
        save_kwargs["quality"] = q
    if pil_fmt == "JPEG":
        save_kwargs["optimize"] = True
    out_img.save(buf, format=pil_fmt, **save_kwargs)
    return buf.getvalue(), ext, mime


def transform_image(raw: bytes, ops: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """이미지에 조작 파이프라인(crop · aspect · rotate · flip · resize · adjust · annotate · format)을 적용한다."""
    img = _open_image(raw)
    orig_w, orig_h = img.size
    orig_fmt = (img.format or "JPEG").lower()
    spec = dict(ops or {})
    applied: list[str] = []

    if spec.get("crop") is not None:
        bx = _resolve_bbox(spec["crop"], img.width, img.height)
        img = img.crop(bx)
        applied.append(f"crop({bx[2] - bx[0]}×{bx[3] - bx[1]})")

    if spec.get("aspect"):
        img, note = _apply_aspect_crop(img, str(spec["aspect"]), str(spec.get("anchor") or "center"))
        applied.append(note)

    if spec.get("rotate"):
        deg = float(spec["rotate"])
        if abs(deg % 360) > 0.01:
            # PIL rotate 는 반시계 방향이므로 시계 방향(사용자 직관)으로 맞추기 위해 -deg 사용
            img = img.rotate(-deg, expand=True, resample=Image.Resampling.BICUBIC)
            applied.append(f"rotate({deg:g}°)")

    if spec.get("flip"):
        fl = str(spec["flip"]).strip().lower()
        if fl in ("horizontal", "h", "x", "left-right"):
            img = ImageOps.mirror(img)
            applied.append("flip(horizontal)")
        elif fl in ("vertical", "v", "y", "top-bottom"):
            img = ImageOps.flip(img)
            applied.append("flip(vertical)")

    if isinstance(spec.get("resize"), dict) and spec["resize"]:
        img, note = _apply_resize(img, spec["resize"])
        applied.append(note)

    if isinstance(spec.get("adjust"), dict) and spec["adjust"]:
        img, adj_notes = _apply_adjust(img, spec["adjust"])
        applied.extend(adj_notes)

    if isinstance(spec.get("annotate"), list) and spec["annotate"]:
        img, ann_notes = _apply_annotations(img, spec["annotate"])
        applied.extend(ann_notes)

    # 최종 안전 상한
    if img.width > MAX_OUTPUT_DIM or img.height > MAX_OUTPUT_DIM:
        img, _ = _apply_resize(img, {"maxWidth": MAX_OUTPUT_DIM, "maxHeight": MAX_OUTPUT_DIM})

    out_bytes, ext, mime = _encode_image(
        img,
        spec.get("format"),
        orig_fmt if orig_fmt in _FMT_MAP else "jpg",
        int(spec.get("quality") or DEFAULT_QUALITY),
    )
    return {
        "bytes": out_bytes,
        "ext": ext,
        "mime": mime,
        "origSize": (orig_w, orig_h),
        "newSize": img.size,
        "applied": applied,
    }


def compose_images(
    raw_list: list[bytes],
    *,
    layout: str = "horizontal",
    gap: int = 12,
    padding: int = 12,
    background: str = "#ffffff",
    max_width: int = 1920,
    labels: Optional[list[str]] = None,
    fmt: str = "jpg",
    quality: int = DEFAULT_QUALITY,
) -> dict[str, Any]:
    """2~6장의 이미지를 나란히(horizontal) · 세로 연결(vertical) · 그리드(grid)로 합성한다."""
    if len(raw_list) < 2:
        raise ValueError("합성하려면 이미지가 최소 2장 필요하다")
    if len(raw_list) > 6:
        raise ValueError("한 번에 최대 6장까지 합성할 수 있다")

    imgs = [_open_image(b).convert("RGB") for b in raw_list]
    clean_layout = str(layout or "horizontal").strip().lower()
    g = max(0, min(64, int(gap if gap is not None else 12)))
    p = max(0, min(64, int(padding if padding is not None else 12)))
    bg_rgba = _parse_color(background, (255, 255, 255, 255))
    bg_rgb = (bg_rgba[0], bg_rgba[1], bg_rgba[2])
    max_w = max(320, min(MAX_OUTPUT_DIM, int(max_width or 1920)))
    lbls = [str(x or "").strip() for x in (labels or [])]
    has_labels = any(lbls)
    label_h = 34 if has_labels else 0
    font = _load_font(16) if has_labels else None

    if clean_layout == "vertical":
        target_w = min(max_w - p * 2, max(im.width for im in imgs))
        resized = [
            im.resize((target_w, max(1, int(round(im.height * (target_w / im.width))))), Image.Resampling.LANCZOS)
            for im in imgs
        ]
        total_h = p * 2 + sum(im.height + label_h for im in resized) + g * (len(resized) - 1)
        canvas = Image.new("RGB", (target_w + p * 2, min(MAX_OUTPUT_DIM * 2, total_h)), bg_rgb)
        draw = ImageDraw.Draw(canvas)
        y = p
        for idx, im in enumerate(resized):
            canvas.paste(im, (p, y))
            if has_labels and idx < len(lbls) and lbls[idx] and font is not None:
                draw.text((p + 4, y + im.height + 6), lbls[idx][:60], fill=(30, 41, 59), font=font)
            y += im.height + label_h + g
    elif clean_layout == "grid":
        cols = 2 if len(imgs) <= 4 else 3
        rows = math.ceil(len(imgs) / cols)
        cell_w = max(160, (max_w - p * 2 - g * (cols - 1)) // cols)
        cell_h = int(round(cell_w * 0.66))
        fitted = [ImageOps.fit(im, (cell_w, cell_h), method=Image.Resampling.LANCZOS) for im in imgs]
        canvas_w = p * 2 + cols * cell_w + g * (cols - 1)
        canvas_h = p * 2 + rows * (cell_h + label_h) + g * (rows - 1)
        canvas = Image.new("RGB", (canvas_w, canvas_h), bg_rgb)
        draw = ImageDraw.Draw(canvas)
        for idx, im in enumerate(fitted):
            r, c = divmod(idx, cols)
            x = p + c * (cell_w + g)
            y = p + r * (cell_h + label_h + g)
            canvas.paste(im, (x, y))
            if has_labels and idx < len(lbls) and lbls[idx] and font is not None:
                draw.text((x + 4, y + cell_h + 6), lbls[idx][:48], fill=(30, 41, 59), font=font)
    else:
        # horizontal (나란히 비교: 동일 높이로 맞춘 뒤 max_w 안쪽으로 축소)
        target_h = min(900, min(im.height for im in imgs))
        scaled = [
            im.resize((max(1, int(round(im.width * (target_h / im.height)))), target_h), Image.Resampling.LANCZOS)
            for im in imgs
        ]
        raw_total_w = p * 2 + sum(im.width for im in scaled) + g * (len(scaled) - 1)
        if raw_total_w > max_w:
            ratio = (max_w - p * 2 - g * (len(scaled) - 1)) / max(1, sum(im.width for im in scaled))
            target_h = max(120, int(round(target_h * ratio)))
            scaled = [
                im.resize((max(1, int(round(im.width * (target_h / im.height)))), target_h), Image.Resampling.LANCZOS)
                for im in imgs
            ]
        canvas_w = p * 2 + sum(im.width for im in scaled) + g * (len(scaled) - 1)
        canvas_h = p * 2 + target_h + label_h
        canvas = Image.new("RGB", (canvas_w, canvas_h), bg_rgb)
        draw = ImageDraw.Draw(canvas)
        x = p
        for idx, im in enumerate(scaled):
            canvas.paste(im, (x, p))
            if has_labels and idx < len(lbls) and lbls[idx] and font is not None:
                draw.text((x + 4, p + target_h + 6), lbls[idx][:48], fill=(30, 41, 59), font=font)
            x += im.width + g

    out_bytes, ext, mime = _encode_image(canvas, fmt, "jpg", quality)
    return {
        "bytes": out_bytes,
        "ext": ext,
        "mime": mime,
        "size": canvas.size,
        "count": len(imgs),
        "layout": clean_layout,
    }
