"""catalog 도메인 HTTP 라우터."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.bootstrap.container import Container

from .errors import CatalogEntryNotFoundError, PdfFormExtractionError
from .models import CatalogManifestRecord
from .schemas import (
    CatalogBundleResponse,
    CatalogManifestResponse,
    PdfIngestResponse,
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
