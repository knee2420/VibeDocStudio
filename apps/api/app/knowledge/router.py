"""knowledge 도메인 HTTP 라우터 (`/api/knowledge`).

색인은 비동기다: `POST …/promote` 는 바로 `queued` 덱 + 작업을 돌려주고, 진행은
`GET /jobs/{jobId}/events` (SSE) 로 받는다. 연결이 끊겨도 작업은 서버에서 계속 돈다.
"""

import json
from typing import Annotated, Any, Iterator

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from .schemas import (
    ImportDeckRequest,
    PromoteToDeckRequest,
    ReindexRequest,
    SelectSectionsRequest,
    ToggleDeckChoiceRequest,
)
from .use_cases import DeckNotFoundError, IndexJobRunner, KnowledgeDeckService

router = APIRouter()

ServiceDep = Annotated[KnowledgeDeckService, Depends(Provide["knowledge_decks"])]
JobsDep = Annotated[IndexJobRunner, Depends(Provide["knowledge_jobs"])]

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=404, detail=f"지식 덱을 찾을 수 없습니다: {exc}")


# --- 작업 (경로가 `/{project_id}/…` 보다 먼저 와야 한다) ----------------------------------


@router.get("/jobs/{job_id}")
@inject
def get_job(job_id: str, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job.to_dict()


@router.post("/jobs/{job_id}/cancel")
@inject
def cancel_job(job_id: str, jobs: JobsDep) -> dict[str, Any]:
    job = jobs.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job.to_dict()


@router.get("/jobs/{job_id}/events")
@inject
def job_events(job_id: str, jobs: JobsDep, after: int = 0) -> StreamingResponse:
    if jobs.get(job_id) is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

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
                yield ": keep-alive\n\n"  # 프록시가 연결을 끊지 않게
                if idle > 240:  # 1시간 넘게 아무 일도 없으면 끊는다 (클라이언트가 다시 붙는다)
                    return
            else:
                idle = 0

    return StreamingResponse(pump(), media_type="text/event-stream", headers=_SSE_HEADERS)


# --- 덱 본체 조회 -----------------------------------------------------------------------


@router.get("/decks/{deck_id}/overview")
@inject
def deck_overview(deck_id: str, service: ServiceDep) -> dict[str, Any]:
    try:
        return service.overview(deck_id)
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/decks/{deck_id}/toc")
@inject
def deck_toc(deck_id: str, service: ServiceDep, sectionId: str | None = None) -> dict[str, Any]:  # noqa: N803
    try:
        return service.toc(deck_id, sectionId)
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/decks/{deck_id}/cards/{card_id}")
@inject
def deck_card(deck_id: str, card_id: str, service: ServiceDep) -> dict[str, Any]:
    try:
        return service.card(deck_id, card_id)
    except (DeckNotFoundError, KeyError) as exc:
        raise _not_found(exc) from exc


@router.get("/decks/{deck_id}/search")
@inject
def deck_search(deck_id: str, q: str, service: ServiceDep, mode: str = "lookup") -> dict[str, Any]:
    try:
        return service.search(deck_id, q, mode)
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- 프로젝트별 덱 목록 ------------------------------------------------------------------


@router.get("/{project_id}")
@inject
def list_knowledge_decks(project_id: str, service: ServiceDep) -> dict[str, Any]:
    return {"decks": [d.to_dict() for d in service.list_decks(project_id)]}


@router.post("/{project_id}/promote")
@inject
def promote_to_knowledge_deck(project_id: str, req: PromoteToDeckRequest, jobs: JobsDep) -> dict[str, Any]:
    """원본을 지식 덱으로 색인한다 (비동기). 즉시 `queued` 덱과 작업을 돌려준다."""
    if not req.source_paths:
        raise HTTPException(status_code=400, detail="색인할 원본 경로가 없습니다.")
    try:
        deck, job = jobs.submit(
            project_id=project_id,
            title=req.title.strip() or "지식 덱",
            source_paths=req.source_paths,
            depth=req.depth,
            language=req.language,
            profile=req.profile.to_dict() if req.profile else None,
            tags=req.tags,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deck": deck.to_dict(), "job": job.to_dict()}


@router.post("/{project_id}/{deck_id}/reindex")
@inject
def reindex_deck(project_id: str, deck_id: str, req: ReindexRequest, service: ServiceDep, jobs: JobsDep) -> dict[str, Any]:
    try:
        deck = service.get(project_id, deck_id)
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc
    if deck.status in ("queued", "indexing") and deck.job_id:
        current = jobs.get(deck.job_id)
        if current and not current.terminal:
            raise HTTPException(status_code=409, detail="이미 색인 중입니다.")
    deck, job = jobs.submit(
        project_id=project_id,
        title=deck.title,
        source_paths=deck.source_paths,
        depth=req.depth or deck.depth,
        profile=req.profile.to_dict() if req.profile else deck.profile,
        deck_id=deck.id,
    )
    return {"deck": deck.to_dict(), "job": job.to_dict()}


@router.post("/{project_id}/import")
@inject
def import_knowledge_deck(project_id: str, req: ImportDeckRequest, service: ServiceDep) -> dict[str, Any]:
    if not isinstance(req.deck_data, dict):
        raise HTTPException(status_code=400, detail="유효한 지식 덱 데이터 구조가 아닙니다.")
    return service.import_legacy(project_id, req.deck_data).to_dict()


@router.post("/{project_id}/toggle")
@inject
def toggle_deck_choice(project_id: str, req: ToggleDeckChoiceRequest, service: ServiceDep) -> dict[str, Any]:
    try:
        return service.toggle(project_id, req.deck_id, req.is_checked).to_dict()
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc


@router.post("/{project_id}/sections")
@inject
def select_deck_sections(project_id: str, req: SelectSectionsRequest, service: ServiceDep) -> dict[str, Any]:
    """덱에서 AI 가 쓸 섹션만 고른다 (RM 섹션 체크박스)."""
    try:
        return service.select_sections(project_id, req.deck_id, req.section_ids).to_dict()
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/{project_id}/{deck_id}")
@inject
def get_knowledge_deck(project_id: str, deck_id: str, service: ServiceDep) -> dict[str, Any]:
    try:
        return service.get(project_id, deck_id).to_dict()
    except DeckNotFoundError as exc:
        raise _not_found(exc) from exc


@router.delete("/{project_id}/{deck_id}")
@inject
def delete_knowledge_deck(project_id: str, deck_id: str, service: ServiceDep) -> dict[str, Any]:
    if not service.delete(project_id, deck_id):
        raise HTTPException(status_code=404, detail="삭제할 지식 덱을 찾을 수 없습니다.")
    return {"success": True, "deckId": deck_id}
