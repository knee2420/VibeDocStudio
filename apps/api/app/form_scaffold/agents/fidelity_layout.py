"""truth.json + 분할안(plan) + 보정값(tune) → 클린 슬롯 `.vdoc` 조립 호스트 어댑터.

핵심 알고리즘은 `pdf-fidelity-engine` 패키지에 있으며,
이 모듈은 `form-scaffold` 하네스 팩(`fonts.json` · `tunables.json`)을 주입하는 얇은 어댑터다.
"""
from __future__ import annotations

from typing import Any, Optional

from harness_kit import packs
from pdf_fidelity_engine.fonts.metrics import PX_PER_PT
from pdf_fidelity_engine.fonts.registry import (
    decode_font_name,
)
from pdf_fidelity_engine.fonts.registry import (
    font_family as _font_family,
)
from pdf_fidelity_engine.layout.slot_renderer import (
    _span_html as _engine_span_html,
)
from pdf_fidelity_engine.layout.slot_renderer import (
    default_tune as _default_tune,
)
from pdf_fidelity_engine.layout.slot_renderer import (
    render_page as _render_page,
)
from pdf_fidelity_engine.layout.slot_renderer import (
    validate_tune_changes as _validate_tune_changes,
)
from pdf_fidelity_engine.layout.table_grid import (
    build_page_model as _build_page_model,
)
from pdf_fidelity_engine.layout.table_grid import (
    css_border_px,
    detect_tables,
    text_lines,
)
from pdf_fidelity_engine.layout.zone_planner import (
    default_plan,
    line_block_index,
    validate_plan,
)

PX = PX_PER_PT
FONT_ALIASES: dict[str, str] = packs.data("form-scaffold:fonts.json")
TUNABLES: dict[str, dict[str, Any]] = packs.data("form-scaffold:tunables.json")


def font_family(name: str, aliases: Optional[dict[str, str]] = None) -> str:
    """PDF 글꼴 이름 → CSS 글꼴 이름 (`form-scaffold:fonts.json` 기본 적용)."""
    return _font_family(name, aliases=aliases if aliases is not None else FONT_ALIASES)


def build_page_model(
    truth: dict[str, Any],
    *,
    font_aliases: Optional[dict[str, str]] = None,
    dash_max_gap: float = 6.0,
) -> dict[str, Any]:
    """`truth.json` → 표 · 줄 모델 (`form-scaffold:fonts.json` 기본 적용)."""
    return _build_page_model(
        truth,
        font_aliases=font_aliases if font_aliases is not None else FONT_ALIASES,
        dash_max_gap=dash_max_gap,
    )


def default_tune() -> dict[str, Any]:
    """`form-scaffold:tunables.json` 기본 보정값."""
    return _default_tune(TUNABLES)


def validate_tune_changes(changes: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """보정값 변경 검증 (`form-scaffold:tunables.json` 스키마 기준)."""
    return _validate_tune_changes(changes, tunables_spec=TUNABLES)


def _span_html(
    s: dict[str, Any],
    gap: float = 0.0,
    *,
    underline: bool = False,
    font_aliases: Optional[dict[str, str]] = None,
) -> str:
    return _engine_span_html(
        s,
        gap=gap,
        underline=underline,
        font_aliases=font_aliases if font_aliases is not None else FONT_ALIASES,
    )


def render_page(
    model: dict[str, Any],
    truth: dict[str, Any],
    plan: dict[str, Any],
    tune: dict[str, Any],
    *,
    page_number: int = 1,
    page_label: str = "",
    image_srcs: Optional[dict[int, str]] = None,
    font_aliases: Optional[dict[str, str]] = None,
    clamp_negative_gap_px: float = -3.0,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """쪽 모델 + 분할안 + 보정값 → 클린 `.vdoc` 한 쪽 조립."""
    return _render_page(
        model,
        truth,
        plan,
        tune,
        page_number=page_number,
        page_label=page_label,
        image_srcs=image_srcs,
        font_aliases=font_aliases if font_aliases is not None else FONT_ALIASES,
        clamp_negative_gap_px=clamp_negative_gap_px,
    )


__all__ = [
    "FONT_ALIASES",
    "PX",
    "TUNABLES",
    "build_page_model",
    "css_border_px",
    "decode_font_name",
    "default_plan",
    "default_tune",
    "detect_tables",
    "font_family",
    "line_block_index",
    "render_page",
    "text_lines",
    "validate_plan",
    "validate_tune_changes",
]
