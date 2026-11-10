"""`data/knowledge/composer/` 아래 슬롯 작성 산출물과 provenance(`HEAD.json` + `provenance.json`)를 기록하는 어댑터."""
from __future__ import annotations

from pathlib import Path

from app.core.storage import safe_segment, write_json

from ..models import SlotCompositionResultModel


class LocalCompositionArchiveAdapter:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir

    def record_composition(self, result: SlotCompositionResultModel) -> None:
        safe_slot = safe_segment(result.slot_id)
        safe_run = safe_segment(result.provenance.run_id)
        slot_dir = self._root / safe_slot
        run_dir = slot_dir / "runs" / safe_run

        write_json(
            run_dir / "artifact.json",
            {
                "slotId": result.slot_id,
                "html": result.html,
            },
        )
        write_json(
            run_dir / "provenance.json",
            {
                "runId": result.provenance.run_id,
                "slotId": result.provenance.slot_id,
                "modelName": result.provenance.model_name,
                "prompt": result.provenance.prompt,
                "presetId": result.provenance.preset_id,
                "sourceChunkIds": list(result.provenance.source_chunk_ids),
                "createdAt": result.provenance.created_at,
            },
        )
        write_json(
            slot_dir / "HEAD.json",
            {
                "slotId": result.slot_id,
                "adoptedRunId": result.provenance.run_id,
                "updatedAt": result.provenance.created_at,
            },
        )

