"""composer 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Protocol

from .models import (
    SlotCompositionRequestModel,
    SlotCompositionResultModel,
)


class SlotComposerHarnessPort(Protocol):
    """단일 슬롯 범위 내에서 백데이터 근거를 바탕으로 HTML 초안을 합성하는 포트."""

    def synthesize_slot_html(
        self,
        request: SlotCompositionRequestModel,
    ) -> tuple[str, str]: ...


class CompositionArchivePort(Protocol):
    """생성된 슬롯 초안과 출처(provenance.json + HEAD.json)를 `data/` 등급에 영속화하는 포트."""

    def record_composition(self, result: SlotCompositionResultModel) -> None: ...

