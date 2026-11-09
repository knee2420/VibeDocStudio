"""reference 도메인 HTTP 라우터 (`/api/reference`).

    라이브러리   GET  /items · POST /items/file · POST /items/url · GET|PATCH|DELETE /items/{refId}
    원본·해체   GET  /items/{refId}/source · /extraction · /layers · POST /items/{refId}/reanalyze
    핀          GET|POST /items/{refId}/pins · PATCH|DELETE /items/{refId}/pins/{pinId}
    연결        GET /projects/{projectId} · PUT|PATCH|DELETE /projects/{projectId}/items/{refId}
    앵커        GET /resolve?anchor=ref:<refId>#pin:<id>

도메인 오류는 `app.bootstrap.error_handlers` 가 HTTP 응답으로 번역한다.
"""

from typing import Annotated, Any
from urllib.parse import quote

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response

from .models import ProjectBinding
from .schemas import AddUrlRequest, CreatePinRequest, RenameRequest, UpdateBindingRequest, UpdatePinRequest
from .use_cases import ReferenceLibraryService

router = APIRouter()

ServiceDep = Annotated[ReferenceLibraryService, Depends(Provide["reference_library"])]


def _binding_view(service: ReferenceLibraryService, binding: ProjectBinding) -> dict[str, Any]:
    entries = []
    for entry in binding.entries:
        item = service.library.get_item(entry.ref_id)
        if item is not None:
            entries.append({**entry.to_dict(), "item": item.to_dict()})
    return {"projectId": binding.project_id, "entries": entries, "updatedAt": binding.updated_at}


# --- 라이브러리 ---------------------------------------------------------------------------------

@router.get("/items")
@inject
def list_items(service: ServiceDep) -> list[dict[str, Any]]:
    return [item.to_dict() for item in service.list_items()]


@router.post("/items/file")
@inject
async def add_file(service: ServiceDep, file: UploadFile = File(...), title: str = Form("")) -> dict[str, Any]:
    data = await file.read()
    return service.add_file(file.filename or "", data, title).to_dict()


@router.post("/items/url")
@inject
def add_url(body: AddUrlRequest, service: ServiceDep) -> dict[str, Any]:
    return service.add_url(body.url, body.title).to_dict()


@router.get("/items/{ref_id}")
@inject
def get_item(ref_id: str, service: ServiceDep) -> dict[str, Any]:
    return service.get(ref_id).to_dict()


@router.patch("/items/{ref_id}")
@inject
def rename_item(ref_id: str, body: RenameRequest, service: ServiceDep) -> dict[str, Any]:
    return service.rename(ref_id, body.title).to_dict()


@router.delete("/items/{ref_id}")
@inject
def delete_item(ref_id: str, service: ServiceDep) -> dict[str, bool]:
    service.delete(ref_id)
    return {"deleted": True}


@router.get("/items/{ref_id}/source")
@inject
def get_source(ref_id: str, service: ServiceDep) -> Response:
    data, mime, filename = service.source(ref_id)
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}", "Cache-Control": "private, max-age=300"},
    )


@router.get("/items/{ref_id}/extraction")
@inject
def get_extraction(ref_id: str, service: ServiceDep) -> dict[str, Any]:
    return service.extraction(ref_id)


@router.get("/items/{ref_id}/layers")
@inject
def get_layers(ref_id: str, service: ServiceDep) -> dict[str, Any]:
    return service.layers(ref_id)


@router.post("/items/{ref_id}/reanalyze")
@inject
def reanalyze(ref_id: str, service: ServiceDep) -> dict[str, Any]:
    return service.reanalyze(ref_id).to_dict()


# --- 핀 ---------------------------------------------------------------------------------------

@router.get("/items/{ref_id}/pins")
@inject
def list_pins(ref_id: str, service: ServiceDep) -> list[dict[str, Any]]:
    return [pin.to_dict() for pin in service.list_pins(ref_id)]


@router.post("/items/{ref_id}/pins")
@inject
def create_pin(ref_id: str, body: CreatePinRequest, service: ServiceDep) -> dict[str, Any]:
    return service.add_pin(ref_id, body.model_dump()).to_dict()


@router.patch("/items/{ref_id}/pins/{pin_id}")
@inject
def update_pin(ref_id: str, pin_id: str, body: UpdatePinRequest, service: ServiceDep) -> dict[str, Any]:
    return service.update_pin(ref_id, pin_id, body.model_dump()).to_dict()


@router.delete("/items/{ref_id}/pins/{pin_id}")
@inject
def delete_pin(ref_id: str, pin_id: str, service: ServiceDep) -> dict[str, bool]:
    service.delete_pin(ref_id, pin_id)
    return {"deleted": True}


# --- 프로젝트 연결 -------------------------------------------------------------------------------

@router.get("/projects/{project_id}")
@inject
def get_binding(project_id: str, service: ServiceDep) -> dict[str, Any]:
    return _binding_view(service, service.binding(project_id))


@router.put("/projects/{project_id}/items/{ref_id}")
@inject
def bind_item(project_id: str, ref_id: str, service: ServiceDep) -> dict[str, Any]:
    return _binding_view(service, service.bind(project_id, ref_id))


@router.patch("/projects/{project_id}/items/{ref_id}")
@inject
def update_binding(project_id: str, ref_id: str, body: UpdateBindingRequest, service: ServiceDep) -> dict[str, Any]:
    binding = service.update_binding(project_id, ref_id, enabled=body.enabled, layers=body.layers)
    return _binding_view(service, binding)


@router.delete("/projects/{project_id}/items/{ref_id}")
@inject
def unbind_item(project_id: str, ref_id: str, service: ServiceDep) -> dict[str, Any]:
    return _binding_view(service, service.unbind(project_id, ref_id))


@router.get("/resolve")
@inject
def resolve_anchor(service: ServiceDep, anchor: str = Query(..., description="ref:<refId>[#p<쪽>][#pin:<id>][#blk:<id>]")) -> dict[str, Any]:
    return service.resolve_anchor(anchor)
