"""글꼴 지표(TTF hhea ascent/descent) 및 토큰 자간 계산 (선택 의존성 fontTools)."""
from __future__ import annotations

import importlib
import os
from typing import Any, Optional

PX_PER_PT = 96 / 72


def _require_ttlib() -> Any:
    try:
        return importlib.import_module("fontTools.ttLib")
    except ImportError as exc:
        raise RuntimeError("fontTools 가 필요합니다: pip install fonttools") from exc


class FontMetrics:
    """TTF 한 개의 진행폭과 세로 지표. cmap 이 없는 부분 글꼴은 거부한다."""

    def __init__(self, path: str) -> None:
        ttlib = _require_ttlib()
        self.path = path
        self.font = ttlib.TTFont(path)
        cmap = self.font.getBestCmap() if "cmap" in self.font else None
        if not cmap:
            raise ValueError(
                f"{os.path.basename(path)}: cmap 이 없습니다. PDF 에서 뽑은 부분 글꼴은 브라우저에서 쓸 수 없습니다."
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
        return self.ascent + self.descent

    def advance_px(self, text: str, size_px: float) -> float:
        total = 0
        for ch in text:
            gid = self.cmap.get(ord(ch))
            if gid is None:
                raise KeyError(f"글꼴에 없는 글자: {ch!r} (U+{ord(ch):04X})")
            total += self.hmtx[gid][0]
        return total * size_px / self.upm


def parse_font_map(pairs: Optional[list[str]]) -> dict[str, FontMetrics]:
    """`PDF글꼴이름=경로.ttf` 목록 → `{이름: FontMetrics}`."""
    out: dict[str, FontMetrics] = {}
    for pair in pairs or []:
        if "=" not in pair:
            raise ValueError(f"--font 형식은 NAME=PATH 입니다: {pair}")
        name, path = pair.split("=", 1)
        out[name.strip()] = FontMetrics(path.strip())
    return out


def pick_font(font_map: dict[str, FontMetrics], pdf_font_name: str) -> Optional[FontMetrics]:
    """PDF 글꼴 이름(부분 글꼴 접두어 `ABCDEF+` 포함)에 맞는 FontMetrics."""
    base = pdf_font_name.split("+", 1)[-1]
    candidates = [base]
    try:
        candidates.append(base.encode("latin1").decode("cp949"))
    except Exception:
        pass
    for cand in candidates:
        if cand in font_map:
            return font_map[cand]
        norm = cand.replace("-", "").replace(" ", "").replace(",", "").lower()
        for name, fm in font_map.items():
            if norm == name.replace("-", "").replace(" ", "").replace(",", "").lower():
                return fm
    return None


def solve_token_spacing(chars: list[dict[str, Any]], font: FontMetrics, size_px: float) -> list[dict[str, Any]]:
    """PDF 글자 목록(px) → `[{t, ls}]` 단어·공백 토큰별 letter-spacing px."""
    tokens: list[dict[str, Any]] = []
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

