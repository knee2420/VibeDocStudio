"""backdata 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException

from app.bootstrap.container import Container

from .errors import EmptyBackdataSourceError
from .models import BackdataChunkRecord
from .schemas import (
    BackdataChunkResponse,
    BackdataImportRequest,
    BackdataImportResponse,
)
from .service import BackdataService

router = APIRouter()

BackdataServiceDep = Annotated[
    BackdataService,
    Depends(Provide[Container.backdata_service]),
]


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
def list_backdata(service: BackdataServiceDep) -> list[BackdataChunkResponse]:
    return [_to_chunk_response(item) for item in service.list_chunks()]


@router.post("/import", response_model=BackdataImportResponse)
@inject
def import_backdata(
    payload: BackdataImportRequest,
    service: BackdataServiceDep,
) -> BackdataImportResponse:
    try:
        chunks = service.import_raw_backdata(
            source_title=payload.source_title,
            source_type=payload.source_type,
            raw_text=payload.raw_text,
            tags=payload.tags,
        )
    except (EmptyBackdataSourceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    responses = [_to_chunk_response(item) for item in chunks]
    return BackdataImportResponse(count=len(responses), chunks=responses)
