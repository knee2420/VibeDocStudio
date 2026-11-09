"""composer 도메인 HTTP 라우터 (`/api/ai`).

도메인 오류는 `app.bootstrap.error_handlers` 가 HTTP 응답으로 번역하므로 여기서는 잡지 않는다.
"""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

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
from .use_cases import (
    CancelCompositionRunUseCase,
    ComposeSlotDraftUseCase,
    ComposeStorylinePhase1UseCase,
    RecommendTemplatesPhase2UseCase,
)

router = APIRouter()

ComposeSlotDep = Annotated[ComposeSlotDraftUseCase, Depends(Provide["compose_slot_draft"])]
Phase1Dep = Annotated[ComposeStorylinePhase1UseCase, Depends(Provide["compose_storyline_phase1"])]
Phase2Dep = Annotated[RecommendTemplatesPhase2UseCase, Depends(Provide["recommend_templates_phase2"])]
CancelDep = Annotated[CancelCompositionRunUseCase, Depends(Provide["cancel_composition_run"])]


def _to_request_model(payload: SlotComposeRequest) -> SlotCompositionRequestModel:
    constraints = payload.constraints or {}
    max_lines = constraints.get("maxLines")
    return SlotCompositionRequestModel(
        slot_id=payload.slotId,
        slot_label=payload.slotLabel,
        current_content=payload.currentContent,
        prompt=payload.prompt,
        preset_id=payload.presetId or "",
        max_lines=int(max_lines) if max_lines is not None else None,
        backdata=tuple(
            SlotBackdataInput(chunk_id=item.chunkId, source_title=item.sourceTitle, excerpt=item.excerpt)
            for item in payload.backdata
        ),
        reference_node_ids=tuple(payload.referenceNodeIds),
    )


@router.post("/compose", response_model=SlotComposeResponse)
@inject
def compose_slot_content(payload: SlotComposeRequest, use_case: ComposeSlotDep) -> SlotComposeResponse:
    result = use_case.execute(_to_request_model(payload))
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
    use_case: Phase1Dep,
) -> StagedPhaseComposeResponse:
    result = use_case.execute(
        project_id=payload.projectId,
        prompt=payload.prompt,
        reference_nodes=tuple(node.to_input() for node in payload.referenceNodes),
        target_parent_id=payload.targetParentId,
        run_id=payload.runId,
    )
    return StagedPhaseComposeResponse.from_result(result)


@router.post("/phase2/templates", response_model=StagedPhaseComposeResponse)
@inject
def recommend_templates_phase2(
    payload: Phase2TemplateRecommendRequest,
    use_case: Phase2Dep,
) -> StagedPhaseComposeResponse:
    result = use_case.execute(
        project_id=payload.projectId,
        doc_id=payload.docId,
        nodes=tuple(node.to_input() for node in payload.nodes),
        tuning_prompt=payload.tuningPrompt,
        run_id=payload.runId,
    )
    return StagedPhaseComposeResponse.from_result(result)


@router.post("/runs/{run_id}/cancel", response_model=CancelRunResponse)
@inject
def cancel_composition_run(
    run_id: str,
    use_case: CancelDep,
    payload: CancelRunRequest | None = None,
) -> CancelRunResponse:
    entry = use_case.execute(run_id, reason=payload.reason if payload else "user_aborted")
    return CancelRunResponse(
        runId=entry.run_id,
        status=entry.status,
        reason=entry.reason,
        cancelledAt=entry.cancelled_at,
    )
