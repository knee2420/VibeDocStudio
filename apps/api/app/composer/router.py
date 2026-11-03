"""composer 도메인 HTTP 라우터 (`/api/ai`)."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException

from app.bootstrap.container import Container

from .errors import SlotCompositionValidationError
from .models import SlotBackdataInput, SlotCompositionRequestModel
from .schemas import (
    CancelRunRequest,
    CancelRunResponse,
    Phase1StorylineComposeRequest,
    Phase2TemplateRecommendRequest,
    SlotComposeProvenanceResponse,
    SlotComposeRequest,
    SlotComposeResponse,
    StagedPhaseComposeResponse,
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
        reference_node_ids=tuple(payload.referenceNodeIds),
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
            referenceNodeIds=list(result.provenance.reference_node_ids),
            createdAt=result.provenance.created_at,
        ),
    )


@router.post("/phase1/storyline", response_model=StagedPhaseComposeResponse)
@inject
def compose_storyline_phase1(
    payload: Phase1StorylineComposeRequest,
    service: ComposerServiceDep,
) -> StagedPhaseComposeResponse:
    try:
        result = service.compose_storyline_phase1(
            project_id=payload.projectId,
            prompt=payload.prompt,
            reference_nodes=payload.referenceNodes,
            target_parent_id=payload.targetParentId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StagedPhaseComposeResponse.model_validate(result)


@router.post("/phase2/templates", response_model=StagedPhaseComposeResponse)
@inject
def recommend_templates_phase2(
    payload: Phase2TemplateRecommendRequest,
    service: ComposerServiceDep,
) -> StagedPhaseComposeResponse:
    try:
        result = service.recommend_templates_phase2(
            project_id=payload.projectId,
            doc_id=payload.docId,
            nodes=payload.nodes,
            tuning_prompt=payload.tuningPrompt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StagedPhaseComposeResponse.model_validate(result)


@router.post("/runs/{run_id}/cancel", response_model=CancelRunResponse)
@inject
def cancel_composition_run(
    run_id: str,
    service: ComposerServiceDep,
    payload: CancelRunRequest | None = None,
) -> CancelRunResponse:
    try:
        reason = payload.reason if payload else "user_aborted"
        entry = service.cancel_composition_run(run_id, reason=reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CancelRunResponse.model_validate(entry)
