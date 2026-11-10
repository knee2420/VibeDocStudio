"""슬롯 스코프 AI 작성 에이전트 정의."""
from __future__ import annotations

from ..models import SlotCompositionRequestModel
from ..ports import SlotComposerHarnessPort


class SlotComposerAgent:
    """타겟 슬롯의 제약 조건과 연결된 백데이터만 입력받아 초안을 생성한다."""

    def __init__(self, harness: SlotComposerHarnessPort) -> None:
        self._harness = harness

    def run(self, request: SlotCompositionRequestModel) -> tuple[str, str]:
        return self._harness.synthesize_slot_html(request)

