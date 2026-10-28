"""composer 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException

from app.bootstrap.container import Container

from .errors import SlotCompositionValidationError
from .models import SlotBackdataInput, SlotCompositionRequestModel
from .schemas import (
    SlotComposeProvenanceResponse,
    SlotComposeRequest,
    SlotComposeResponse,
)
from .service import ComposerService

router = APIRouter()

ComposerServiceDep = Annotated[
    ComposerService,
    Depends(Provide[Container.composer_service]),
]


@router.post("/compose", response_model=SlotComposeResponse)
@inject
def compose_slot_content(
    payload: SlotComposeRequest,
    service: ComposerServiceDep,
) -> SlotComposeResponse:
    max_lines: int | None = None
    if isinstance(payload.constraints, dict) and payload.constraints.get("maxLines") is not None:
        max_lines = int(payload.constraints["maxLines"])

    req_model = SlotCompositionRequestModel(
        slot_id=payload.slotId,
        slot_label=payload.slotLabel,
        current_content=payload.currentContent,
        prompt=payload.prompt,
        preset_id=payload.presetId or "",
        max_lines=max_lines,
        backdata=tuple(
            SlotBackdataInput(
                chunk_id=item.chunkId,
                source_title=item.sourceTitle,
                excerpt=item.excerpt,
            )
            for item in payload.backdata
        ),
    )
    try:
        result = service.compose_slot(req_model)
    except (SlotCompositionValidationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SlotComposeResponse(
        slotId=result.slot_id,
        html=result.html,
        provenance=SlotComposeProvenanceResponse(
            runId=result.provenance.run_id,
            modelName=result.provenance.model_name,
            sourceChunkIds=list(result.provenance.source_chunk_ids),
            createdAt=result.provenance.created_at,
        ),
    )
