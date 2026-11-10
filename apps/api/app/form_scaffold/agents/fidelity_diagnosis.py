"""시각 일치도 진단 호스트 어댑터 (`pdf-fidelity-engine` 위임)."""
from __future__ import annotations

from typing import Any, Optional

from pdf_fidelity_engine.verify.diagnosis import AGREE, MIN_SHIFT
from pdf_fidelity_engine.verify.diagnosis import diagnose as _engine_diagnose

from .fidelity_layout import FONT_ALIASES


def diagnose(
    model: dict[str, Any],
    truth: dict[str, Any],
    measure: dict[str, Any],
    verify: dict[str, Any],
    line_block: dict[str, str],
    tune: dict[str, Any],
    *,
    min_shift: float = MIN_SHIFT,
    font_aliases: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """03 판정 + 02 측정 결과를 분석해 오프셋 처방과 엔진 이슈를 반환한다."""
    return _engine_diagnose(
        model=model,
        truth=truth,
        measure=measure,
        verify=verify,
        line_block=line_block,
        tune=tune,
        min_shift=min_shift,
        font_aliases=font_aliases if font_aliases is not None else FONT_ALIASES,
    )


__all__ = ["AGREE", "MIN_SHIFT", "diagnose"]
