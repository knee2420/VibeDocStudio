"""documents 도메인 HTTP 라우터.

도메인 오류는 `app.bootstrap.error_handlers` 가 HTTP 응답으로 번역하므로 여기서는 잡지 않는다.
"""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, status

from .models import VDocAggregateRecord, VDocSummaryRecord
from .schemas import (
    PatchDocumentStructureRequest,
    PatchSlotContentRequest,
    RevisionListResponse,
    SaveVDocRequest,
    VDocDocumentResponse,
    VDocPageChunkResponse,
    VDocSummaryResponse,
)
from .use_cases import (
    DeleteDocumentUseCase,
    GetDocumentPageChunkUseCase,
    GetDocumentUseCase,
    ListDocumentsUseCase,
    ListRevisionsUseCase,
    PatchDocumentStructureUseCase,
    SaveDocumentUseCase,
    UpdateSlotContentUseCase,
)

router = APIRouter()

ListDep = Annotated[ListDocumentsUseCase, Depends(Provide["list_documents"])]
GetDep = Annotated[GetDocumentUseCase, Depends(Provide["get_document"])]
ChunkDep = Annotated[GetDocumentPageChunkUseCase, Depends(Provide["get_document_page_chunk"])]
SaveDep = Annotated[SaveDocumentUseCase, Depends(Provide["save_document"])]
UpdateSlotDep = Annotated[UpdateSlotContentUseCase, Depends(Provide["update_slot_content"])]
PatchStructureDep = Annotated[PatchDocumentStructureUseCase, Depends(Provide["patch_document_structure"])]
DeleteDep = Annotated[DeleteDocumentUseCase, Depends(Provide["delete_document"])]
RevisionsDep = Annotated[ListRevisionsUseCase, Depends(Provide["list_document_revisions"])]


def _summary_response(item: VDocSummaryRecord) -> VDocSummaryResponse:
    return VDocSummaryResponse(
        docId=item.doc_id,
        title=item.title,
        status=item.status,
        updatedAt=item.updated_at,
        pageCount=item.page_count,
        slotCount=item.slot_count,
    )


def _document_response(record: VDocAggregateRecord) -> VDocDocumentResponse:
    return VDocDocumentResponse(docId=record.doc_id, document=record.payload)


@router.get("", response_model=list[VDocSummaryResponse])
@inject
def list_documents(use_case: ListDep) -> list[VDocSummaryResponse]:
    return [_summary_response(item) for item in use_case.execute()]


@router.get("/{doc_id}", response_model=VDocDocumentResponse)
@inject
def get_document(doc_id: str, use_case: GetDep) -> VDocDocumentResponse:
    return _document_response(use_case.execute(doc_id))


@router.get("/{doc_id}/chunks", response_model=VDocPageChunkResponse)
@inject
def get_document_page_chunk(
    doc_id: str,
    use_case: ChunkDep,
    start_page: int = Query(default=1, ge=1, alias="startPage"),
    end_page: int = Query(default=15, ge=1, alias="endPage"),
) -> VDocPageChunkResponse:
    window = use_case.execute(doc_id=doc_id, start_page=start_page, end_page=end_page)
    return VDocPageChunkResponse(
        docId=window.doc_id,
        title=window.title,
        totalPages=window.total_pages,
        startPage=window.start_page,
        endPage=window.end_page,
        windowSize=window.window_size,
        topSpacerPx=window.top_spacer_px,
        bottomSpacerPx=window.bottom_spacer_px,
        pages=window.pages,
        slots=window.slots,
        backdata=window.backdata,
    )


@router.put("/{doc_id}", response_model=VDocDocumentResponse)
@inject
def save_document(doc_id: str, body: SaveVDocRequest, use_case: SaveDep) -> VDocDocumentResponse:
    return _document_response(
        use_case.execute(
            doc_id,
            body.document,
            base_revision=body.baseRevision,
            changes=[c.model_dump() for c in body.changes],
        )
    )


@router.get("/{doc_id}/revisions", response_model=RevisionListResponse)
@inject
def list_revisions(
    doc_id: str,
    use_case: RevisionsDep,
    slotId: str | None = Query(default=None),  # noqa: N803
    limit: int = Query(default=100, ge=1, le=500),
) -> RevisionListResponse:
    return RevisionListResponse(docId=doc_id, revisions=use_case.execute(doc_id, slot_id=slotId, limit=limit))


@router.patch("/{doc_id}/slots/{slot_id}", response_model=VDocDocumentResponse)
@inject
def patch_slot_content(
    doc_id: str,
    slot_id: str,
    body: PatchSlotContentRequest,
    use_case: UpdateSlotDep,
) -> VDocDocumentResponse:
    return _document_response(use_case.execute(doc_id, slot_id, body.content))


@router.patch("/{doc_id}/structure", response_model=VDocDocumentResponse)
@inject
def patch_document_structure(
    doc_id: str,
    body: PatchDocumentStructureRequest,
    use_case: PatchStructureDep,
) -> VDocDocumentResponse:
    return _document_response(
        use_case.execute(doc_id=doc_id, operation=body.operation, payload=body.payload)
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
def delete_document(doc_id: str, use_case: DeleteDep) -> None:
    use_case.execute(doc_id)
