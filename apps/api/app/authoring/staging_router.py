"""Staged 변경안 대기열 HTTP 라우터 — `/api/projects` 접두사 그대로 (`/{projectId}/staging*`).

승인 전 AI 변경안(초안기 · 하네스)이 새로고침 · 탭 닫기를 넘어 유지되는 곳.
"""
from typing import Annotated, Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends

from .use_cases import StagingQueueUseCase

router = APIRouter()

StagingDep = Annotated[StagingQueueUseCase, Depends(Provide["staging_queue"])]


# --- Staged 변경안 대기열 (승인 전 AI 변경안 — 새로고침 · 서버 일괄 작업을 넘어 유지) ---------------


@router.get("/{project_id}/staging")
@inject
def get_staging(project_id: str, use_case: StagingDep) -> dict:
    return {"projectId": project_id, "changes": use_case.list(project_id)}


@router.put("/{project_id}/staging")
@inject
def replace_staging(
    project_id: str,
    use_case: StagingDep,
    changes: list[dict] = Body(..., embed=True),
    removed: Optional[list[str]] = Body(default=None, embed=True),
) -> dict:
    """`removed` 를 주면 병합 — 화면이 지운 것만 지우고, 화면이 아직 못 본 서버 쪽 변경안은 남긴다."""
    return {"projectId": project_id, "changes": use_case.replace(project_id, changes, removed)}


@router.post("/{project_id}/staging/append")
@inject
def append_staging(project_id: str, use_case: StagingDep, changes: list[dict] = Body(..., embed=True)) -> dict:
    return {"projectId": project_id, "changes": use_case.append(project_id, changes)}
