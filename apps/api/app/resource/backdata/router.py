"""backdata 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from .models import BackdataChunkRecord
from .schemas import (
    BackdataChunkResponse,
    BackdataImportRequest,
    BackdataImportResponse,
)
from .use_cases import ImportRawBackdataUseCase, ListBackdataChunksUseCase

router = APIRouter()

ListDep = Annotated[ListBackdataChunksUseCase, Depends(Provide["list_backdata_chunks"])]
ImportDep = Annotated[ImportRawBackdataUseCase, Depends(Provide["import_raw_backdata"])]


def _to_chunk_response(record: BackdataChunkRecord) -> BackdataChunkResponse:
    return BackdataChunkResponse(
        chunkId=record.chunk_id,
        sourceTitle=record.source_title,
        sourceType=record.source_type,
        excerpt=record.excerpt,
        updatedAt=record.updated_at,
        tags=list(record.tags),
    )


@router.get("", response_model=list[BackdataChunkResponse])
@inject
def list_backdata(use_case: ListDep) -> list[BackdataChunkResponse]:
    return [_to_chunk_response(item) for item in use_case.execute()]


@router.post("/import", response_model=BackdataImportResponse)
@inject
def import_backdata(
    payload: BackdataImportRequest,
    use_case: ImportDep,
) -> BackdataImportResponse:
    chunks = use_case.execute(
        source_title=payload.source_title,
        source_type=payload.source_type,
        raw_text=payload.raw_text,
        tags=payload.tags,
    )

    responses = [_to_chunk_response(item) for item in chunks]
    return BackdataImportResponse(count=len(responses), chunks=responses)
