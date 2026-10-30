"""catalog 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.bootstrap.container import Container

from .errors import CatalogEntryNotFoundError, PdfFormExtractionError
from .models import CatalogManifestRecord
from .schemas import (
    CatalogBundleResponse,
    CatalogManifestResponse,
    PdfIngestResponse,
    ScaffoldDocumentResponse,
)
from .service import CatalogService

router = APIRouter()

CatalogServiceDep = Annotated[
    CatalogService,
    Depends(Provide[Container.catalog_service]),
]


def _to_manifest_response(record: CatalogManifestRecord) -> CatalogManifestResponse:
    return CatalogManifestResponse(
        catalogId=record.catalog_id,
        title=record.title,
        sourceOrigin=record.source_origin,
        sourceId=record.source_id,
        category=record.category,
        tags=list(record.tags),
        description=record.description,
    )


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, CatalogEntryNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, (PdfFormExtractionError, ValueError)):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail="Catalog operation failed")


@router.get("", response_model=list[CatalogManifestResponse])
@inject
def list_catalog(service: CatalogServiceDep) -> list[CatalogManifestResponse]:
    return [_to_manifest_response(item) for item in service.list_manifests()]


@router.get("/{catalog_id}", response_model=CatalogBundleResponse)
@inject
def get_catalog_bundle(
    catalog_id: str,
    service: CatalogServiceDep,
) -> CatalogBundleResponse:
    try:
        bundle = service.get_bundle(catalog_id)
    except Exception as exc:
        raise _translate_error(exc) from exc

    return CatalogBundleResponse(
        manifest=_to_manifest_response(bundle.manifest),
        document=bundle.document,
    )


@router.post("/ingest-pdf", response_model=PdfIngestResponse)
@inject
async def ingest_pdf_to_catalog(
    service: CatalogServiceDep,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    category: str = Form(default="자동추출 서식"),
) -> PdfIngestResponse:
    try:
        pdf_bytes = await file.read()
        resolved_title = title.strip() or (file.filename or "추출된 양식")
        bundle, checked_tables, checked_slots = service.ingest_pdf_form(
            pdf_bytes=pdf_bytes,
            title=resolved_title,
            category=category,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc

    return PdfIngestResponse(
        catalogId=bundle.manifest.catalog_id,
        title=bundle.manifest.title,
        checkedTables=checked_tables,
        checkedSlots=checked_slots,
        document=bundle.document,
    )


@router.post("/scaffold", response_model=ScaffoldDocumentResponse)
@inject
async def scaffold_pdf_form(
    service: CatalogServiceDep,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    fidelity_mode: str = Form(default="balanced"),
) -> ScaffoldDocumentResponse:
    try:
        pdf_bytes = await file.read()
        raw_name = file.filename or "추출된 양식 문서"
        # 파일명에서 .pdf 확장자 제거
        if raw_name.lower().endswith(".pdf"):
            fallback_title = raw_name[:-4]
        else:
            fallback_title = raw_name
        resolved_title = title.strip() or fallback_title
        # 에이전트 루프는 수 분 걸리는 동기 작업이므로 이벤트 루프를 막지 않게 스레드에서 돌린다.
        vdoc, total_pages, checked_blocks, checked_slots, agent_run = await run_in_threadpool(
            service.scaffold_pdf_document,
            pdf_bytes=pdf_bytes,
            title=resolved_title,
            fidelity_mode=fidelity_mode,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc

    return ScaffoldDocumentResponse(
        docId=vdoc.get("docId", ""),
        title=vdoc.get("title", resolved_title),
        totalPages=total_pages,
        checkedBlocks=checked_blocks,
        checkedSlots=checked_slots,
        document=vdoc,
        fidelityMode=fidelity_mode,
        agentRun=agent_run,
    )
