#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fidelity_core.py
시각 일치도 도구(01 · 02 · 03)가 함께 쓰는 계산 모듈.

  - 단위: 모든 좌표는 CSS px (96 dpi). PDF pt × 96/72.
  - 글꼴 지표: TTF 의 hhea ascent/descent 로 "글자 박스 높이 비율"(content height factor)을 구한다.
    줄 높이를 이 값 × 글자 크기로 두면, 브라우저 글자 박스 위쪽 = 줄 상자 위쪽이 된다.
  - 토큰 자간: PDF 글자 원점(origin)과 글꼴 진행폭(advance)의 차이로 단어 · 공백마다 letter-spacing 을 푼다.
  - 픽셀 지표: 1px 허용 잉크 F1 · 블러 일치율. 같은 PDF 를 두 렌더러로 그린 값이 "잡음 하한선"이다.
"""

import importlib
import os
import sys

PX_PER_PT = 96 / 72

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


def need(module: str, pip_name: str):
    """선택 의존성을 불러오고, 없으면 설치 명령을 알려 주며 종료한다."""
    try:
        return importlib.import_module(module)
    except ImportError:
        print(f"[ERROR] {module} 이 필요합니다: pip install {pip_name}", file=sys.stderr)
        sys.exit(2)


# ── 글꼴 ──────────────────────────────────────────────────────────────────

class FontMetrics:
    """TTF 한 개의 진행폭과 세로 지표. cmap 이 없는 부분 글꼴(PDF 에서 뽑은 것)은 거부한다."""

    def __init__(self, path: str):
        ttlib = need("fontTools.ttLib", "fonttools")
        self.path = path
        self.font = ttlib.TTFont(path)
        cmap = self.font.getBestCmap() if "cmap" in self.font else None
        if not cmap:
            raise ValueError(
                f"{os.path.basename(path)}: cmap 이 없습니다. PDF 에서 뽑은 부분 글꼴은 브라우저에서 쓸 수 없습니다 "
                "(L-03). 공식 배포본 전체 글꼴을 쓰세요."
            )
        self.cmap = cmap
        self.hmtx = self.font["hmtx"]
        self.upm = self.font["head"].unitsPerEm
        hhea = self.font["hhea"]
        self.ascent = hhea.ascent / self.upm
        self.descent = -hhea.descent / self.upm
        self.line_gap = hhea.lineGap / self.upm

    @property
    def content_height(self) -> float:
        """글자 박스 높이 / 글자 크기 (예: DejaVu Sans = 1.1641)."""
        return self.ascent + self.descent

    def advance_px(self, text: str, size_px: float) -> float:
        total = 0
        for ch in text:
            gid = self.cmap.get(ord(ch))
            if gid is None:
                raise KeyError(f"글꼴에 없는 글자: {ch!r} (U+{ord(ch):04X})")
            total += self.hmtx[gid][0]
        return total * size_px / self.upm


def parse_font_map(pairs):
    """`PDF글꼴이름=경로.ttf` 목록 → {이름: FontMetrics}."""
    out = {}
    for pair in pairs or []:
        if "=" not in pair:
            raise ValueError(f"--font 형식은 NAME=PATH 입니다: {pair}")
        name, path = pair.split("=", 1)
        out[name.strip()] = FontMetrics(path.strip())
    return out


def pick_font(font_map: dict, pdf_font_name: str):
    """PDF 글꼴 이름(부분 글꼴 접두어 `ABCDEF+` 포함 가능)에 맞는 FontMetrics."""
    base = pdf_font_name.split("+", 1)[-1]
    candidates = [base]
    try:
        candidates.append(base.encode("latin1").decode("cp949"))
    except Exception:
        pass
    for cand in candidates:
        if cand in font_map:
            return font_map[cand]
        for name, fm in font_map.items():
            if cand.replace("-", "").replace(" ", "").replace(",", "").lower() == name.replace("-", "").replace(" ", "").replace(",", "").lower():
                return fm
    return None


def solve_token_spacing(chars, font: "FontMetrics", size_px: float):
    """
    PDF 글자 목록(rawdict chars: c, origin, bbox; 단위 px) → [{t, ls}] (단어 · 공백 토큰마다 letter-spacing px).
    토큰의 PDF 폭 = 다음 토큰 시작 원점 - 이 토큰 시작 원점 (마지막은 bbox 끝).
    브라우저는 letter-spacing 을 마지막 글자 뒤에도 더하므로 ls = (PDF폭 - 진행폭) / 글자 수.
    """
    tokens = []
    i = 0
    while i < len(chars):
        is_space = chars[i]["c"] == " "
        j = i
        while j < len(chars) and (chars[j]["c"] == " ") == is_space:
            j += 1
        start = chars[i]["x"]
        end = chars[j]["x"] if j < len(chars) else chars[j - 1]["x_end"]
        text = "".join(c["c"] for c in chars[i:j])
        ls = (end - start - font.advance_px(text, size_px)) / len(text)
        tokens.append({"t": text, "ls": round(ls, 4)})
        i = j
    return tokens


# ── 색 ────────────────────────────────────────────────────────────────────

def parse_css_color(value: str):
    """'rgb(1, 2, 3)' · 'rgba(...)' · '#abc' · '#aabbcc' → (r, g, b) 또는 None (oklch 등은 None)."""
    if not value:
        return None
    v = value.strip().lower()
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) >= 6:
            return tuple(int(h[k:k + 2], 16) for k in (0, 2, 4))
    if v.startswith("rgb"):
        nums = v[v.index("(") + 1:v.index(")")].replace("/", ",").split(",")
        try:
            return tuple(int(float(n)) for n in nums[:3])
        except ValueError:
            return None
    return None


def color_distance(a, b):
    if a is None or b is None:
        return None
    return max(abs(x - y) for x, y in zip(a, b))


# ── 픽셀 지표 ─────────────────────────────────────────────────────────────

def image_metrics(path_a: str, path_b: str, size=None):
    """
    두 이미지(같은 크기로 맞춤)의 일치도.
      px_within_16   밝기 차가 16 이하인 픽셀 비율 (%)
      blur_within_16 σ=1 블러 후 같은 비율 (%) — 안티앨리어싱 차이를 덜 탄다
      ink_f1_1px     잉크(밝기<160)를 1px 이웃까지 같은 것으로 본 F1 (%) — 위치 일치도를 가장 잘 반영
      ink_iou        잉크 정확 일치 IoU (%) — 렌더러 차이에 매우 민감, 참고용
    """
    np = need("numpy", "numpy")
    image = need("PIL.Image", "pillow")
    ndimage = need("scipy.ndimage", "scipy")
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


def unmatched_ink_regions(path_a: str, path_b: str, size=None, top=8):
    """어긋난 잉크가 몰린 영역 (missing = 원본에만, extra = 후보에만). 진단용."""
    np = need("numpy", "numpy")
    image = need("PIL.Image", "pillow")
    ndimage = need("scipy.ndimage", "scipy")
    a_img = image.open(path_a).convert("L")
    size = size or a_img.size
    a = np.asarray(a_img.resize(size), float) < 160
    b = np.asarray(image.open(path_b).convert("L").resize(size), float) < 160
    tol = np.ones((3, 3), bool)
    out = {}
    for name, mask in (("missing", a & ~ndimage.binary_dilation(b, tol)), ("extra", b & ~ndimage.binary_dilation(a, tol))):
        lab, _ = ndimage.label(ndimage.binary_dilation(mask, np.ones((5, 5), bool)))
        regions = []
        for k, sl in enumerate(ndimage.find_objects(lab)):
            count = int((mask[sl] & (lab[sl] == k + 1)).sum())
            regions.append({"pixels": count, "box": [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop]})
        out[name] = sorted(regions, key=lambda r: -r["pixels"])[:top]
    return out
