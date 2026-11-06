"""projects 도메인 HTTP 라우터 (`/api/projects`).

도메인 오류는 `app.bootstrap.error_handlers` 가 HTTP 응답으로 번역하므로 여기서는 잡지 않는다.
"""
from typing import Annotated, Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, Query

from .mappers import manifest_from_dict
from .models import ZoomLevel
from .schemas import (
    BindReferenceProjectsRequest,
    CloneReferenceNodeRequest,
    CloneReferenceNodeResponse,
    OutlineBreadcrumbSchema,
    OutlineCommandRequest,
    OutlineCommandResponse,
    ProjectOutlineTreeResponse,
    ProvenanceLineageSchema,
    SaveVProjectRequest,
    StorylineNodeSchema,
    VProjectManifestResponse,
)
from .use_cases import (
    ApplyOutlineCommandUseCase,
    BindReferenceProjectsUseCase,
    CloneNodeWithProvenanceUseCase,
    GetProjectOutlineTreeUseCase,
    GetProjectUseCase,
    ListProjectsUseCase,
    SaveProjectUseCase,
    StagingQueueUseCase,
)

router = APIRouter()

PROJECT_ROOT_CRUMB_ID = "project-root"

ListDep = Annotated[ListProjectsUseCase, Depends(Provide["list_projects"])]
GetDep = Annotated[GetProjectUseCase, Depends(Provide["get_project"])]
SaveDep = Annotated[SaveProjectUseCase, Depends(Provide["save_project"])]
OutlineDep = Annotated[GetProjectOutlineTreeUseCase, Depends(Provide["get_project_outline_tree"])]
BindDep = Annotated[BindReferenceProjectsUseCase, Depends(Provide["bind_reference_projects"])]
CloneDep = Annotated[CloneNodeWithProvenanceUseCase, Depends(Provide["clone_node_with_provenance"])]
CommandDep = Annotated[ApplyOutlineCommandUseCase, Depends(Provide["apply_outline_command"])]
StagingDep = Annotated[StagingQueueUseCase, Depends(Provide["staging_queue"])]


@router.get("", response_model=list[VProjectManifestResponse])
@inject
def list_projects(use_case: ListDep) -> list[VProjectManifestResponse]:
    return [VProjectManifestResponse.from_record(item) for item in use_case.execute()]


@router.get("/{project_id}", response_model=VProjectManifestResponse)
@inject
def get_project(project_id: str, use_case: GetDep) -> VProjectManifestResponse:
    return VProjectManifestResponse.from_record(use_case.execute(project_id))


@router.put("/{project_id}", response_model=VProjectManifestResponse)
@inject
def save_project(
    project_id: str,
    body: SaveVProjectRequest,
    use_case: SaveDep,
) -> VProjectManifestResponse:
    record = manifest_from_dict({"projectId": project_id, **body.model_dump()})
    return VProjectManifestResponse.from_record(use_case.execute(project_id, record))


@router.get("/{project_id}/outline", response_model=ProjectOutlineTreeResponse)
@inject
def get_project_outline(
    project_id: str,
    use_case: OutlineDep,
    root_node_id: Optional[str] = Query(default=None, alias="rootNodeId"),
) -> ProjectOutlineTreeResponse:
    projection = use_case.execute(project_id, root_node_id=root_node_id)
    project, subtree = projection.project, projection.subtree
    breadcrumbs = [
        OutlineBreadcrumbSchema(nodeId=PROJECT_ROOT_CRUMB_ID, title=project.title, zoomLevel=ZoomLevel.PROJECT),
        *(
            OutlineBreadcrumbSchema(nodeId=n.node_id, title=n.title, zoomLevel=n.zoom_level)
            for n in subtree.ancestors
        ),
    ]
    return ProjectOutlineTreeResponse(
        projectId=project.project_id,
        title=project.title,
        isReferenceOnly=project.is_reference_only,
        activePhase=project.active_phase,
        activeZoomLevel=subtree.active_zoom_level,
        rootNodeId=subtree.root.node_id if subtree.root else PROJECT_ROOT_CRUMB_ID,
        breadcrumbs=breadcrumbs,
        nodes=[StorylineNodeSchema.from_record(n) for n in subtree.nodes],
        totalNodeCount=len(project.storyline_nodes),
    )


@router.put("/{project_id}/references", response_model=VProjectManifestResponse)
@inject
def bind_reference_projects(
    project_id: str,
    body: BindReferenceProjectsRequest,
    use_case: BindDep,
) -> VProjectManifestResponse:
    return VProjectManifestResponse.from_record(use_case.execute(project_id, body.referenceProjectIds))


@router.post("/{project_id}/clone-node", response_model=CloneReferenceNodeResponse)
@inject
def clone_reference_node(
    project_id: str,
    body: CloneReferenceNodeRequest,
    use_case: CloneDep,
) -> CloneReferenceNodeResponse:
    clone = use_case.execute(
        target_project_id=project_id,
        source_project_id=body.sourceProjectId,
        source_node_id=body.sourceNodeId,
        target_parent_id=body.targetParentId,
    )
    return CloneReferenceNodeResponse(
        project=VProjectManifestResponse.from_record(clone.project),
        clonedNode=StorylineNodeSchema.from_record(clone.node),
        provenance=ProvenanceLineageSchema.from_record(clone.provenance),
    )


@router.post("/{project_id}/commands", response_model=OutlineCommandResponse)
@inject
def apply_outline_command(
    project_id: str,
    use_case: CommandDep,
    body: OutlineCommandRequest = Body(...),
) -> OutlineCommandResponse:
    result = use_case.execute(project_id, body.to_command())
    return OutlineCommandResponse(
        project=VProjectManifestResponse.from_record(result.project),
        affectedNodeId=result.affected_node_id,
    )


# --- Staged 변경안 대기열 (승인 전 AI 변경안 — 새로고침 · 서버 일괄 작업을 넘어 유지) ---------------


@router.get("/{project_id}/staging")
@inject
def get_staging(project_id: str, use_case: StagingDep) -> dict:
    return {"projectId": project_id, "changes": use_case.list(project_id)}


@router.put("/{project_id}/staging")
@inject
def replace_staging(
    project_id: str,
    use_case: StagingDep,
    changes: list[dict] = Body(..., embed=True),
    removed: Optional[list[str]] = Body(default=None, embed=True),
) -> dict:
    """`removed` 를 주면 병합 — 화면이 지운 것만 지우고, 화면이 아직 못 본 서버 쪽 변경안은 남긴다."""
    return {"projectId": project_id, "changes": use_case.replace(project_id, changes, removed)}


@router.post("/{project_id}/staging/append")
@inject
def append_staging(project_id: str, use_case: StagingDep, changes: list[dict] = Body(..., embed=True)) -> dict:
    return {"projectId": project_id, "changes": use_case.append(project_id, changes)}
