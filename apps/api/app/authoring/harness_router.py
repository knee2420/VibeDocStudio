"""하네스 HTTP 라우터 — `/api/assistant` 접두사 그대로 (`/harness/*` · `/evidence/status` · `/ledger`).

하네스: 근거 묶음 → 단발 실행 → 출력 계약 · 게이트.
"""
import threading
from typing import Annotated, Any

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.sse import sse_response

from .use_cases import HarnessService

router = APIRouter()

HarnessDep = Annotated[HarnessService, Depends(Provide["harness_service"])]
LedgerDep = Annotated[Any, Depends(Provide["usage_ledger"])]


# --- 하네스 (선언형 동작: 근거 묶음 → 단발 실행 → 출력 계약 · 게이트) ------------------------


@router.get("/harness/specs")
@inject
def harness_specs(harness: HarnessDep) -> dict[str, Any]:
    return {"specs": harness.specs()}


@router.post("/evidence/status")
@inject
def evidence_status(payload: dict[str, Any], harness: HarnessDep) -> dict[str, Any]:
    """근거 무효화 검사. payload: {locators: [locator…]} → {items: [{kind, refId, status, sourceSha}]}"""
    return {"items": harness.evidence_status(list(payload.get("locators") or []))}


@router.post("/harness/run")
@inject
def run_harness(payload: dict[str, Any], harness: HarnessDep) -> StreamingResponse:
    """하네스 한 번 (SSE). payload: {harnessId, runId?, instruction?, target, evidence: [locator…], deckIds?, model?}"""
    cancel = threading.Event()
    return sse_response(harness.run(payload, cancel), cancel.set)


@router.get("/ledger")
@inject
def usage_ledger(ledger: LedgerDep) -> dict[str, Any]:
    return ledger.summary()

