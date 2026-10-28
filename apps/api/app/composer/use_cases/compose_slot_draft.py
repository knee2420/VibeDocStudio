"""유스케이스: 단일 슬롯 초안을 작성하고 provenance 동반 아티팩트로 기록한다."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.storage import RUN_PREFIX, new_id, safe_segment

from ..agents import SlotComposerAgent
from ..errors import SlotCompositionValidationError
from ..models import (
    SlotCompositionProvenance,
    SlotCompositionRequestModel,
    SlotCompositionResultModel,
)
from ..ports import CompositionArchivePort


class ComposeSlotDraftUseCase:
    def __init__(
        self,
        agent: SlotComposerAgent,
        archive: CompositionArchivePort,
    ) -> None:
        self._agent = agent
        self._archive = archive

    def execute(self, request: SlotCompositionRequestModel) -> SlotCompositionResultModel:
        normalized_slot_id = safe_segment(request.slot_id)
        if not request.prompt.strip():
            raise SlotCompositionValidationError("prompt must not be empty")

        html_out, model_name = self._agent.run(request)
        run_id = new_id(RUN_PREFIX)
        provenance = SlotCompositionProvenance(
            run_id=run_id,
            slot_id=normalized_slot_id,
            model_name=model_name,
            prompt=request.prompt.strip(),
            preset_id=request.preset_id,
            source_chunk_ids=tuple(c.chunk_id for c in request.backdata),
            created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        result = SlotCompositionResultModel(
            slot_id=normalized_slot_id,
            html=html_out,
            provenance=provenance,
        )
        self._archive.record_composition(result)
        return result

