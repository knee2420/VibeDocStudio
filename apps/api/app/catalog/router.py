"""catalog 도메인 HTTP 라우터.

도메인 오류는 `app.bootstrap.error_handlers` 가 HTTP 응답으로 번역하므로 여기서는 잡지 않는다.
PDF 처리는 CPU · 외부 프로세스를 오래 쓰는 동기 작업이라 반드시 스레드풀에서 돌려
이벤트 루프(=다른 모든 요청)를 막지 않는다.
"""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from .models import CatalogManifestRecord
from .schemas import (
    CatalogBundleResponse,
    CatalogManifestResponse,
    PdfIngestResponse,
)
from .use_cases import (
    GetCatalogBundleUseCase,
    IngestPdfToCatalogUseCase,
    ListCatalogFormsUseCase,
)

router = APIRouter()

ListDep = Annotated[ListCatalogFormsUseCase, Depends(Provide["list_catalog_forms"])]
GetBundleDep = Annotated[GetCatalogBundleUseCase, Depends(Provide["get_catalog_bundle"])]
IngestDep = Annotated[IngestPdfToCatalogUseCase, Depends(Provide["ingest_pdf_to_catalog"])]


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


@router.get("", response_model=list[CatalogManifestResponse])
@inject
def list_catalog(use_case: ListDep) -> list[CatalogManifestResponse]:
    return [_to_manifest_response(item) for item in use_case.execute()]


@router.get("/{catalog_id}", response_model=CatalogBundleResponse)
@inject
def get_catalog_bundle(
    catalog_id: str,
    use_case: GetBundleDep,
) -> CatalogBundleResponse:
    bundle = use_case.execute(catalog_id)
    return CatalogBundleResponse(
        manifest=_to_manifest_response(bundle.manifest),
        document=bundle.document,
    )


@router.post("/ingest-pdf", response_model=PdfIngestResponse)
@inject
async def ingest_pdf_to_catalog(
    use_case: IngestDep,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    category: str = Form(default="자동추출 서식"),
) -> PdfIngestResponse:
    pdf_bytes = await file.read()
    resolved_title = title.strip() or (file.filename or "추출된 양식")
    bundle, checked_tables, checked_slots = await run_in_threadpool(
        use_case.execute,
        pdf_bytes=pdf_bytes,
        title=resolved_title,
        category=category,
    )

    return PdfIngestResponse(
        catalogId=bundle.manifest.catalog_id,
        title=bundle.manifest.title,
        checkedTables=checked_tables,
        checkedSlots=checked_slots,
        document=bundle.document,
    )
