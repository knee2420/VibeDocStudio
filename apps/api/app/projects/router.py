"""projects 도메인 HTTP 라우터 (`/api/projects`)."""
from typing import Annotated, Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, Query

from app.bootstrap.container import Container

from .errors import (
    VProjectNotFoundError,
    VProjectReadOnlyViolationError,
    VProjectValidationError,
)
from .models import VProjectManifestRecord
from .schemas import (
    BindReferenceProjectsRequest,
    CloneReferenceNodeRequest,
    CloneReferenceNodeResponse,
    ProjectOutlineTreeResponse,
    ProvenanceLineageSchema,
    SaveVProjectRequest,
    StorylineNodeSchema,
    VProjectManifestResponse,
)
from .service import ProjectService

router = APIRouter()

ProjectServiceDep = Annotated[
    ProjectService,
    Depends(Provide[Container.project_service]),
]


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, VProjectNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, VProjectReadOnlyViolationError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (VProjectValidationError, ValueError)):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail="Project operation failed")


def _to_response(record: VProjectManifestRecord) -> VProjectManifestResponse:
    return VProjectManifestResponse.model_validate(record.to_dict())


@router.get("", response_model=list[VProjectManifestResponse])
@inject
def list_projects(service: ProjectServiceDep) -> list[VProjectManifestResponse]:
    return [_to_response(item) for item in service.list_projects()]


@router.get("/{project_id}", response_model=VProjectManifestResponse)
@inject
def get_project(project_id: str, service: ProjectServiceDep) -> VProjectManifestResponse:
    try:
        record = service.get_project(project_id)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return _to_response(record)


@router.put("/{project_id}", response_model=VProjectManifestResponse)
@inject
def save_project(
    project_id: str,
    body: SaveVProjectRequest,
    service: ProjectServiceDep,
) -> VProjectManifestResponse:
    try:
        record = VProjectManifestRecord.from_dict(
            {
                "projectId": project_id,
                **body.model_dump(),
            }
        )
        saved = service.save_project(project_id, record)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return _to_response(saved)


@router.get("/{project_id}/outline", response_model=ProjectOutlineTreeResponse)
@inject
def get_project_outline(
    project_id: str,
    service: ProjectServiceDep,
    root_node_id: Optional[str] = Query(default=None, alias="rootNodeId"),
) -> ProjectOutlineTreeResponse:
    try:
        tree = service.get_outline_tree(project_id, root_node_id=root_node_id)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return ProjectOutlineTreeResponse.model_validate(tree)


@router.put("/{project_id}/references", response_model=VProjectManifestResponse)
@inject
def bind_reference_projects(
    project_id: str,
    body: BindReferenceProjectsRequest,
    service: ProjectServiceDep,
) -> VProjectManifestResponse:
    try:
        saved = service.bind_reference_projects(project_id, body.referenceProjectIds)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return _to_response(saved)


@router.post("/{project_id}/clone-node", response_model=CloneReferenceNodeResponse)
@inject
def clone_reference_node(
    project_id: str,
    body: CloneReferenceNodeRequest,
    service: ProjectServiceDep,
) -> CloneReferenceNodeResponse:
    try:
        saved_proj, cloned_node, prov = service.clone_node_with_provenance(
            target_project_id=project_id,
            source_project_id=body.sourceProjectId,
            source_node_id=body.sourceNodeId,
            target_parent_id=body.targetParentId,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
    return CloneReferenceNodeResponse(
        project=_to_response(saved_proj),
        clonedNode=StorylineNodeSchema.model_validate(cloned_node.to_dict()),
        provenance=ProvenanceLineageSchema.model_validate(prov.to_dict()),
    )
