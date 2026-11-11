"""pdf-fidelity-engine 도메인 중립 데이터 모델 (CSS 96dpi px 기준)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional


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


@dataclass
class SuspectSlot:
    """텍스트 깨짐 · /ToUnicode 누락 · 공백 결여 등으로 선별 정제가 필요한 슬롯."""

    slot_id: str
    block_id: str
    block_title: str
    kind: Literal["text", "table-cell"]
    bbox_px: tuple[float, float, float, float]
    raw_text: str
    reasons: list[str] = field(default_factory=list)
    crop_png_bytes: Optional[bytes] = None


@dataclass
class RefinedSlotPatch:
    """외부 OCR/VLM 정제기가 돌려준 슬롯 본문 패치 (바운더리는 변경하지 않는다)."""

    slot_id: str
    paragraphs: list[str] = field(default_factory=list)
    html: Optional[str] = None
    notes: str = ""


@dataclass
class FidelityOptions:
    """호스트(하네스 팩 등)가 주입하는 폰트 · 튜닝 파라미터."""

    font_aliases: dict[str, str] = field(default_factory=dict)
    tunables_spec: dict[str, dict[str, Any]] = field(default_factory=dict)
    min_edge_len: float = 4.0
    dash_max_gap: float = 6.0
    faux_bold_dedup: bool = True
    char_gap_space_ratio: float = 0.22
    clamp_negative_gap_px: float = -3.0

