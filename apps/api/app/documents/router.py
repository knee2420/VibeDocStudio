"""documents 도메인 HTTP 라우터.

도메인 오류는 `app.bootstrap.error_handlers` 가 HTTP 응답으로 번역하므로 여기서는 잡지 않는다.
"""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, status

from .models import VDocAggregateRecord, VDocSummaryRecord
from .schemas import (
    CreateDocumentRequest,
    DeleteDocumentResponse,
    DuplicateDocumentRequest,
    LinkDocumentRequest,
    PatchDocumentStructureRequest,
    PatchSlotContentRequest,
    RenameDocumentRequest,
    RevisionListResponse,
    SaveVDocRequest,
    VDocDocumentResponse,
    VDocPageChunkResponse,
    VDocSummaryResponse,
)
from .use_cases import (
    DocumentLifecycleUseCase,
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
LifecycleDep = Annotated[DocumentLifecycleUseCase, Depends(Provide["document_lifecycle"])]
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


@router.post("", response_model=VDocDocumentResponse, status_code=status.HTTP_201_CREATED)
@inject
def create_document(body: CreateDocumentRequest, use_case: LifecycleDep) -> VDocDocumentResponse:
    """빈 문서 한 편을 만들고 프로젝트 문서 목록에 넣는다 (지면 · 장르 · 만든 이 기록)."""
    return _document_response(
        use_case.create(
            body.projectId,
            title=body.title,
            surface=body.surface,
            surface_width=body.surfaceWidth,
            genre=body.genre,
            created_by=body.createdBy,
            session_id=body.sessionId,
        )
    )


@router.patch("/{doc_id}/title", response_model=VDocDocumentResponse)
@inject
def rename_document(doc_id: str, body: RenameDocumentRequest, use_case: LifecycleDep) -> VDocDocumentResponse:
    return _document_response(use_case.rename(doc_id, body.title))


@router.post("/{doc_id}/duplicate", response_model=VDocDocumentResponse, status_code=status.HTTP_201_CREATED)
@inject
def duplicate_document(doc_id: str, body: DuplicateDocumentRequest, use_case: LifecycleDep) -> VDocDocumentResponse:
    return _document_response(use_case.duplicate(doc_id, title=body.title, project_id=body.projectId))


@router.post("/{doc_id}/link", response_model=VDocDocumentResponse)
@inject
def link_document(doc_id: str, body: LinkDocumentRequest, use_case: LifecycleDep) -> VDocDocumentResponse:
    """이미 있는 문서를 프로젝트 문서 목록에 넣는다 (불러오기)."""
    return _document_response(use_case.link(doc_id, body.projectId))


@router.delete("/{doc_id}", response_model=DeleteDocumentResponse)
@inject
def delete_document(doc_id: str, use_case: LifecycleDep) -> DeleteDocumentResponse:
    """문서를 지우고 그 문서를 가진 프로젝트 목록에서도 뺀다."""
    return DeleteDocumentResponse(docId=doc_id, unlinkedProjects=use_case.delete(doc_id))
