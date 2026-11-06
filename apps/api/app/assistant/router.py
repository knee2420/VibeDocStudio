"""assistant 도메인 HTTP 라우터 (`/api/assistant`).

스트리밍 응답은 SSE(`text/event-stream`) 한 줄 = 이벤트 하나(`data: {json}`)다.
"""
import json
import threading
from typing import Annotated, Any, Callable, Iterator, Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse

from .schemas import (
    CreateSessionRequest,
    CreateSessionResponse,
    InlineRunRequest,
    SendMessageRequest,
    SubmitToolResultsRequest,
)
from .streaming import pump_events
from .use_cases import AssistantService, HarnessJobRunner, HarnessService

router = APIRouter()

ServiceDep = Annotated[AssistantService, Depends(Provide["assistant_service"])]
HarnessDep = Annotated[HarnessService, Depends(Provide["harness_service"])]
LedgerDep = Annotated[Any, Depends(Provide["usage_ledger"])]
JobsDep = Annotated[HarnessJobRunner, Depends(Provide["harness_jobs"])]

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _sse(events: Iterator[dict[str, Any]], on_disconnect: Optional[Callable[[], None]] = None) -> StreamingResponse:
    """이벤트는 전용 스레드가 끝까지 소비한다 (연결이 끊겨도 세션 잠금 · agy 정리가 실행된다)."""
    return StreamingResponse(pump_events(events, on_disconnect), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.get("/engines")
@inject
def get_engines(service: ServiceDep) -> dict[str, Any]:
    return service.engines_status()


@router.post("/warmup")
@inject
def warmup(service: ServiceDep) -> dict[str, Any]:
    return service.warmup()


@router.post("/sessions", response_model=CreateSessionResponse)
@inject
def create_session(service: ServiceDep, payload: CreateSessionRequest | None = None) -> CreateSessionResponse:
    req = payload or CreateSessionRequest()
    return CreateSessionResponse(**service.create_session(req.provider, req.model))


@router.delete("/sessions/{session_id}", status_code=204)
@inject
def close_session(session_id: str, service: ServiceDep) -> Response:
    service.close_session(session_id)
    return Response(status_code=204)


@router.post("/sessions/{session_id}/messages")
@inject
def send_message(session_id: str, payload: SendMessageRequest, service: ServiceDep) -> StreamingResponse:
    events = service.send_message(
        session_id,
        text=payload.text,
        contexts=[c.to_model() for c in payload.contexts],
        tools=[t.to_model() for t in payload.tools],
        mode=payload.mode,
        provider=payload.provider,
        model=payload.model,
        deferred_results=[r.model_dump() for r in payload.deferredResults],
    )
    return _sse(events, lambda: service.interrupt_quietly(session_id))


@router.post("/sessions/{session_id}/tool-results")
@inject
def submit_tool_results(session_id: str, payload: SubmitToolResultsRequest, service: ServiceDep) -> StreamingResponse:
    events = service.submit_tool_results(session_id, [r.model_dump() for r in payload.results])
    return _sse(events, lambda: service.interrupt_quietly(session_id))


@router.post("/sessions/{session_id}/interrupt", status_code=204)
@inject
def interrupt(session_id: str, service: ServiceDep) -> Response:
    service.interrupt(session_id)
    return Response(status_code=204)


@router.post("/inline/run")
@inject
def run_inline(payload: InlineRunRequest, service: ServiceDep) -> StreamingResponse:
    cancel = threading.Event()
    events = service.run_inline(
        instruction=payload.instruction,
        contexts=[c.to_model() for c in payload.contexts],
        output_format=payload.outputFormat,
        model=payload.model,
        cancel=cancel,
    )
    return _sse(events, cancel.set)


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
    return _sse(harness.run(payload, cancel), cancel.set)


@router.get("/ledger")
@inject
def usage_ledger(ledger: LedgerDep) -> dict[str, Any]:
    return ledger.summary()


# --- 일괄 채우기 작업 (fill.scope) — 칸마다 하네스 → 프로젝트 Staged 대기열에 덧붙임 ------------------


@router.post("/harness/batch")
@inject
def submit_harness_batch(payload: dict[str, Any], jobs: JobsDep) -> dict[str, Any]:
    """payload: {harnessId, runId?, projectId, docId, instruction?, deckIds?, items: [{target, evidence, baseHash}]}"""
    return jobs.submit(payload)


@router.get("/harness/jobs/{job_id}")
@inject
def get_harness_job(job_id: str, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job


@router.post("/harness/jobs/{job_id}/cancel")
@inject
def cancel_harness_job(job_id: str, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job


@router.get("/harness/jobs/{job_id}/events")
@inject
def harness_job_events(job_id: str, jobs: JobsDep, after: int = 0) -> StreamingResponse:
    if jobs.get(job_id) is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    def pump() -> Iterator[str]:
        cursor = after
        while True:
            batch = jobs.wait_events(job_id, cursor)
            for event in batch:
                cursor += 1
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            job = jobs.get(job_id)
            if job is None or (job["status"] != "running" and not batch):
                return
            if not batch:
                yield ": keep-alive\n\n"

    return StreamingResponse(pump(), media_type="text/event-stream", headers=_SSE_HEADERS)
