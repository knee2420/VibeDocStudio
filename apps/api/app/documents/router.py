"""documents 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status

from app.bootstrap.container import Container

from .errors import VDocDocumentNotFoundError, VDocSlotNotFoundError
from .schemas import (
    PatchSlotContentRequest,
    SaveVDocRequest,
    VDocDocumentResponse,
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


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
def delete_document(doc_id: str, service: DocumentServiceDep) -> None:
    try:
        service.delete_document(doc_id)
    except Exception as exc:
        raise _translate_error(exc) from exc
