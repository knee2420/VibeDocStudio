"""pdf-fidelity-engine 외부 의존 포트 (추상 인터페이스)."""
from __future__ import annotations

from typing import Optional, Protocol

from .models import RefinedSlotPatch, SuspectSlot


class SlotTextRefinerPort(Protocol):
    """문제가 감지된 슬롯(깨진 기호·/ToUnicode 누락·비정상 붙여쓰기)의 텍스트만 정제하는 포트.

    호스트(예: VibeDocStudio)가 `agy CLI` · VLM · OCR 어댑터로 구현해 주입한다.
    바운더리(표 행열·frame)는 변경하지 않고 슬롯 HTML/문단만 반환한다.
    """

    def refine_slots(
        self,
        *,
        page_png_bytes: Optional[bytes],
        doc_title: str,
        suspects: list[SuspectSlot],
        page_vdoc: dict,
    ) -> dict[str, RefinedSlotPatch]:
        """`{slotId: RefinedSlotPatch}` 매핑을 반환한다."""
        ...

