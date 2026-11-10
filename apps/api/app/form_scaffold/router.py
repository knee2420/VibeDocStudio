"""form_scaffold HTTP 라우터 — `/api/catalog` 접두사 그대로 (`POST /scaffold`).

PDF 처리는 CPU · 외부 프로세스를 오래 쓰는 동기 작업이라 스레드풀에서 돌려 이벤트 루프를 막지 않는다.
"""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from .schemas import ScaffoldDocumentResponse
from .use_cases import ScaffoldPdfToDocumentUseCase

router = APIRouter()

ScaffoldDep = Annotated[ScaffoldPdfToDocumentUseCase, Depends(Provide["scaffold_pdf_to_document"])]


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
