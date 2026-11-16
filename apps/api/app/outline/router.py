"""outline 도메인 HTTP 라우터 (`/api/projects/{project_id}/working-outline`)."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import JSONResponse

from .mappers import working_outline_to_dict
from .schemas import (
    CommitOutlineRequest,
    CommitOutlineResponse,
    CompilePreviewRequest,
    CompilePreviewResponse,
    SaveWorkingOutlineRequest,
    WorkingOutlineBatchRequest,
    WorkingOutlineBatchResponse,
    WorkingOutlineResponse,
)
from .use_cases import (
    ApplyWorkingCommandsUseCase,
    CommitOutlineToDocumentsUseCase,
    CompilePreviewUseCase,
    GetWorkingOutlineUseCase,
    SaveWorkingOutlineUseCase,
)

router = APIRouter()

GetOutlineDep = Annotated[GetWorkingOutlineUseCase, Depends(Provide["get_working_outline"])]
SaveOutlineDep = Annotated[SaveWorkingOutlineUseCase, Depends(Provide["save_working_outline"])]
CmdOutlineDep = Annotated[ApplyWorkingCommandsUseCase, Depends(Provide["apply_working_commands"])]
PreviewDep = Annotated[CompilePreviewUseCase, Depends(Provide["compile_outline_preview"])]
CommitDep = Annotated[CommitOutlineToDocumentsUseCase, Depends(Provide["commit_outline_to_documents"])]


@router.get("/{project_id}/working-outline", response_model=WorkingOutlineResponse)
@inject
def get_working_outline(
    project_id: str,
    use_case: GetOutlineDep,
    refresh: bool = Query(default=False),
) -> JSONResponse:
    record = use_case.execute(project_id, force_refresh=refresh)
    return JSONResponse(content=working_outline_to_dict(record))


@router.put("/{project_id}/working-outline", response_model=WorkingOutlineResponse)
@inject
def save_working_outline(
    project_id: str,
    body: SaveWorkingOutlineRequest,
    use_case: SaveOutlineDep,
) -> JSONResponse:
    record = use_case.execute(project_id, body.model_dump(by_alias=True))
    return JSONResponse(content=working_outline_to_dict(record))


@router.post("/{project_id}/working-outline/commands", response_model=WorkingOutlineBatchResponse)
@inject
def apply_working_outline_commands(
    project_id: str,
    body: WorkingOutlineBatchRequest,
    use_case: CmdOutlineDep,
) -> WorkingOutlineBatchResponse:
    result = use_case.execute(project_id, body.commands)
    return WorkingOutlineBatchResponse(
        outline=WorkingOutlineResponse.model_validate(working_outline_to_dict(result.outline)),
        createdNodeIds=result.created_node_ids,
    )


@router.post("/{project_id}/working-outline/compile-preview", response_model=CompilePreviewResponse)
@inject
def compile_working_outline_preview(
    project_id: str,
    use_case: PreviewDep,
    body: CompilePreviewRequest = Body(default_factory=CompilePreviewRequest),
) -> CompilePreviewResponse:
    override = body.outline.model_dump(by_alias=True) if body.outline is not None else None
    result = use_case.execute(project_id, override)
    return CompilePreviewResponse(
        projectId=result.project_id,
        dirty=result.dirty,
        documents=result.documents,
    )


@router.post("/{project_id}/working-outline/commit", response_model=CommitOutlineResponse)
@inject
def commit_working_outline(
    project_id: str,
    use_case: CommitDep,
    body: CommitOutlineRequest = Body(default_factory=CommitOutlineRequest),
) -> CommitOutlineResponse:
    override = body.outline.model_dump(by_alias=True) if body.outline is not None else None
    result = use_case.execute(project_id, override)
    return CommitOutlineResponse(
        projectId=result.project_id,
        documents=result.documents,
        outline=WorkingOutlineResponse.model_validate(working_outline_to_dict(result.outline)),
    )
