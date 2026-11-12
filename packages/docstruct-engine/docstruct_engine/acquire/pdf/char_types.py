"""PDF 글자 스트림 원자 타입 (CSS 96dpi px 기준)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CharAtom:
    """PDF 콘텐츠 스트림의 개별 글자 한 개 (96dpi CSS px 좌표)."""

    c: str
    x0: float
    y0: float
    x1: float
    y1: float
    origin_x: float
    baseline: float
    pt: float
    font: str
    color: str = "#000000"
    bold: bool = False
    italic: bool = False
    block: int = 0
    line: int = 0
    has_to_unicode: bool = True
    is_space: bool = False

