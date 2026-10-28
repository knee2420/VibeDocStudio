"""composer 도메인 서비스."""
from __future__ import annotations

from .models import (
    SlotCompositionRequestModel,
    SlotCompositionResultModel,
)
from .use_cases import ComposeSlotDraftUseCase


class ComposerService:
    def __init__(self, compose_draft: ComposeSlotDraftUseCase) -> None:
        self._compose_draft = compose_draft

    def compose_slot(
        self,
        request: SlotCompositionRequestModel,
    ) -> SlotCompositionResultModel:
        return self._compose_draft.execute(request)

