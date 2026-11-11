"""form_scaffold HTTP 라우터 — `/api/catalog` 접두사 그대로.

- `POST /scaffold`: 기존 동기 스캐폴딩 엔드포인트 (호환 유지)
- `POST /pdf-preview`: 파싱 전 PDF 페이지별 썸네일 및 텍스트 레이어 진단
- `POST /scaffold-jobs`, `GET /scaffold-jobs/...`, SSE `/events`, `/cancel`, `/retry`:
  선택된 페이지만 순차 실행하는 비동기 스캐폴딩 작업 API
"""
import json
from collections.abc import Iterator
from typing import Annotated, Any, Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.core.errors import NotFoundError, ValidationError
from app.core.sse import SSE_HEADERS

from .schemas import (
    PdfPreviewResponse,
    ScaffoldDocumentResponse,
    UrlScaffoldRequest,
    UrlScaffoldResponse,
)
from .use_cases import (
    PreviewPdfUseCase,
    ScaffoldJobRunner,
    ScaffoldPdfToDocumentUseCase,
    ScaffoldUrlToDocumentUseCase,
)

router = APIRouter()

ScaffoldDep = Annotated[ScaffoldPdfToDocumentUseCase, Depends(Provide["scaffold_pdf_to_document"])]
PreviewDep = Annotated[PreviewPdfUseCase, Depends(Provide["preview_pdf"])]
JobsDep = Annotated[ScaffoldJobRunner, Depends(Provide["scaffold_jobs"])]
UrlScaffoldDep = Annotated[ScaffoldUrlToDocumentUseCase, Depends(Provide["scaffold_url_to_document"])]


@router.post("/scaffold", response_model=ScaffoldDocumentResponse)
@inject
async def scaffold_pdf_form(
    use_case: ScaffoldDep,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    fidelity_mode: str = Form(default="balanced"),
) -> ScaffoldDocumentResponse:
    pdf_bytes = await file.read()
    raw_name = file.filename or "추출된 양식 문서"
    fallback_title = raw_name[:-4] if raw_name.lower().endswith(".pdf") else raw_name
    resolved_title = title.strip() or fallback_title
    vdoc, total_pages, checked_blocks, checked_slots, agent_run = await run_in_threadpool(
        use_case.execute,
        pdf_bytes=pdf_bytes,
        title=resolved_title,
        fidelity_mode=fidelity_mode,
    )

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


@router.post("/pdf-preview", response_model=PdfPreviewResponse)
@inject
async def preview_pdf_pages(
    use_case: PreviewDep,
    file: UploadFile = File(...),
    title: str = Form(default=""),
) -> PdfPreviewResponse:
    pdf_bytes = await file.read()
    raw_name = file.filename or "PDF 문서"
    fallback_title = raw_name[:-4] if raw_name.lower().endswith(".pdf") else raw_name
    resolved_title = title.strip() or fallback_title
    result = await run_in_threadpool(use_case.execute, pdf_bytes=pdf_bytes, title=resolved_title)
    return PdfPreviewResponse(**result)


@router.post("/url-scaffold", response_model=UrlScaffoldResponse)
@inject
async def scaffold_url_form(
    body: UrlScaffoldRequest,
    use_case: UrlScaffoldDep,
) -> UrlScaffoldResponse:
    vdoc, metrics, warnings = await run_in_threadpool(
        use_case.execute,
        url=body.url,
        title=body.title,
        split_mode=body.splitMode,
        target_height_px=body.targetHeightPx,
        include_images=body.includeImages,
        use_browser_fallback=body.useBrowserFallback,
    )
    pages = vdoc.get("pages") or []
    return UrlScaffoldResponse(
        docId=vdoc.get("docId", ""),
        title=vdoc.get("title", ""),
        sourceUrl=body.url.strip(),
        totalPages=len(pages),
        checkedBlocks=int(metrics.get("blockCount") or sum(len(p.get("blocks", [])) for p in pages)),
        checkedSlots=int(metrics.get("slotCount") or len(vdoc.get("slots", {}))),
        document=vdoc,
        metrics=metrics,
        warnings=warnings,
    )


@router.post("/scaffold-jobs")
@inject
async def submit_scaffold_job(
    jobs: JobsDep,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    target_doc_id: str = Form(default=""),
    mode: str = Form(default="insert-pages"),
    fidelity_mode: str = Form(default="balanced"),
    pages_json: str = Form(default="[]"),
) -> dict[str, Any]:
    pdf_bytes = await file.read()
    raw_name = file.filename or "추출된 양식 문서"
    fallback_title = raw_name[:-4] if raw_name.lower().endswith(".pdf") else raw_name
    resolved_title = title.strip() or fallback_title
    try:
        parsed_pages = json.loads(pages_json)
    except ValueError as exc:
        raise ValidationError(f"잘못된 pages_json 형식입니다: {exc}") from exc
    if not isinstance(parsed_pages, list) or not parsed_pages:
        raise ValidationError("최소 1개 이상의 페이지를 지정해야 합니다.")

    job = await run_in_threadpool(
        jobs.submit,
        pdf_bytes=pdf_bytes,
        title=resolved_title,
        target_doc_id=target_doc_id,
        selected_pages=parsed_pages,
        mode=mode,
        fidelity_mode=fidelity_mode,
    )
    return job.to_dict(include_payload=False)


@router.get("/scaffold-jobs")
@inject
def list_scaffold_jobs(
    jobs: JobsDep,
    target_doc_id: Optional[str] = Query(default=None, alias="targetDocId"),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[dict[str, Any]]:
    return [j.to_dict(include_payload=False) for j in jobs.list_jobs(target_doc_id=target_doc_id, limit=limit)]


@router.get("/scaffold-jobs/{job_id}")
@inject
def get_scaffold_job(job_id: str, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise NotFoundError("PDF 변환 작업을 찾을 수 없습니다.")
    return job.to_dict(include_payload=True)


@router.post("/scaffold-jobs/{job_id}/cancel")
@inject
def cancel_scaffold_job(job_id: str, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.cancel(job_id)
    if job is None:
        raise NotFoundError("PDF 변환 작업을 찾을 수 없습니다.")
    return job.to_dict(include_payload=False)


@router.post("/scaffold-jobs/{job_id}/pages/{page_number}/retry")
@inject
def retry_scaffold_job_page(job_id: str, page_number: int, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.retry_page(job_id, page_number)
    if job is None:
        raise NotFoundError("재시도할 페이지 작업을 찾을 수 없습니다.")
    return job.to_dict(include_payload=False)


@router.get("/scaffold-jobs/{job_id}/events")
@inject
def stream_scaffold_job_events(job_id: str, jobs: JobsDep, after: int = 0) -> StreamingResponse:
    if jobs.get(job_id) is None:
        raise NotFoundError("PDF 변환 작업을 찾을 수 없습니다.")

    def pump() -> Iterator[str]:
        cursor = after
        idle = 0
        while True:
            batch = jobs.wait(job_id, cursor, timeout=15.0)
            for event in batch:
                cursor += 1
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            job = jobs.get(job_id)
            if job is None or (job.terminal and not jobs.events(job_id, cursor)):
                return
            if not batch:
                idle += 1
                yield ": keep-alive\n\n"
                if idle > 240:
                    return
            else:
                idle = 0

    return StreamingResponse(pump(), media_type="text/event-stream", headers=SSE_HEADERS)
