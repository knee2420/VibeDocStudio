"""assistant 도메인 HTTP 라우터 (`/api/assistant`) — 대화 세션 · 인라인 실행 · 엔진 상태.

스트리밍 응답은 SSE(`text/event-stream`) 한 줄 = 이벤트 하나(`data: {json}`)다.
하네스 · 사용량 원장(`/api/assistant/harness/*`, `/ledger`, `/evidence/status`)은 authoring 도메인이 같은 접두사로 연다.
"""
import threading
from typing import Annotated, Any

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse

from app.core.sse import sse_response

from .schemas import (
    CreateSessionRequest,
    CreateSessionResponse,
    InlineRunRequest,
    SendMessageRequest,
    SubmitToolResultsRequest,
)
from .use_cases import AssistantService

router = APIRouter()

ServiceDep = Annotated[AssistantService, Depends(Provide["assistant_service"])]


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
    return sse_response(events, lambda: service.interrupt_quietly(session_id))


@router.post("/sessions/{session_id}/tool-results")
@inject
def submit_tool_results(session_id: str, payload: SubmitToolResultsRequest, service: ServiceDep) -> StreamingResponse:
    events = service.submit_tool_results(session_id, [r.model_dump() for r in payload.results])
    return sse_response(events, lambda: service.interrupt_quietly(session_id))


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
    return sse_response(events, cancel.set)
