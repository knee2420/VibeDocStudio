"""documents 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.bootstrap.container import Container

from .errors import VDocDocumentNotFoundError, VDocSlotNotFoundError
from .schemas import (
    PatchDocumentStructureRequest,
    PatchSlotContentRequest,
    SaveVDocRequest,
    VDocDocumentResponse,
    VDocPageChunkResponse,
    VDocSummaryResponse,
)
from .service import DocumentService

router = APIRouter()

DocumentServiceDep = Annotated[
    DocumentService,
    Depends(Provide[Container.document_service]),
]


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (VDocDocumentNotFoundError, VDocSlotNotFoundError)):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail="Document operation failed")


@router.get("", response_model=list[VDocSummaryResponse])
@inject
def list_documents(service: DocumentServiceDep) -> list[VDocSummaryResponse]:
    return [
        VDocSummaryResponse(
            docId=item.doc_id,
            title=item.title,
            status=item.status,
            updatedAt=item.updated_at,
            pageCount=item.page_count,
            slotCount=item.slot_count,
        )
        for item in service.list_documents()
    ]


@router.get("/{doc_id}", response_model=VDocDocumentResponse)
@inject
def get_document(doc_id: str, service: DocumentServiceDep) -> VDocDocumentResponse:
    try:
        record = service.get_document(doc_id)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return VDocDocumentResponse(docId=record.doc_id, document=record.payload)


@router.get("/{doc_id}/chunks", response_model=VDocPageChunkResponse)
@inject
def get_document_page_chunk(
    doc_id: str,
    service: DocumentServiceDep,
    start_page: int = Query(default=1, ge=1, alias="startPage"),
    end_page: int = Query(default=15, ge=1, alias="endPage"),
) -> VDocPageChunkResponse:
    try:
        chunk = service.get_document_page_chunk(
            doc_id=doc_id,
            start_page=start_page,
            end_page=end_page,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
    return VDocPageChunkResponse.model_validate(chunk)


@router.put("/{doc_id}", response_model=VDocDocumentResponse)
@inject
def save_document(
    doc_id: str,
    body: SaveVDocRequest,
    service: DocumentServiceDep,
) -> VDocDocumentResponse:
    try:
        record = service.save_document(doc_id, body.document)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return VDocDocumentResponse(docId=record.doc_id, document=record.payload)


@router.patch("/{doc_id}/slots/{slot_id}", response_model=VDocDocumentResponse)
@inject
def patch_slot_content(
    doc_id: str,
    slot_id: str,
    body: PatchSlotContentRequest,
    service: DocumentServiceDep,
) -> VDocDocumentResponse:
    try:
        record = service.update_slot_content(doc_id, slot_id, body.content)
    except Exception as exc:
        raise _translate_error(exc) from exc
    return VDocDocumentResponse(docId=record.doc_id, document=record.payload)


@router.patch("/{doc_id}/structure", response_model=VDocDocumentResponse)
@inject
def patch_document_structure(
    doc_id: str,
    body: PatchDocumentStructureRequest,
    service: DocumentServiceDep,
) -> VDocDocumentResponse:
    try:
        record = service.patch_document_structure(
            doc_id=doc_id,
            operation=body.operation,
            payload=body.payload,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
    return VDocDocumentResponse(docId=record.doc_id, document=record.payload)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
def delete_document(doc_id: str, service: DocumentServiceDep) -> None:
    try:
        service.delete_document(doc_id)
    except Exception as exc:
        raise _translate_error(exc) from exc
