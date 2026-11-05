"""Resource Manager REST API 라우터."""
from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path
from typing import Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.resources.adapters.file_provider import FileDirectoryProvider
from app.resources.adapters.local_resource_repository import LocalResourceRepository
from app.resources.adapters.web_provider import WebArticleProvider
from app.resources.models import ResourceItem, ResourceSector, ResourceSession
from app.resources.schemas import (
    AiContextBundleResponse,
    AiContextSource,
    ExtractSectorRequest,
    IngestDirectoryRequest,
    IngestWebUrlRequest,
    ResourceSectorDto,
    ResourceSessionResponse,
    ToggleChoiceRequest,
)

router = APIRouter()
_repo = LocalResourceRepository()
_file_provider = FileDirectoryProvider()
_web_provider = WebArticleProvider()


def _find_item_recursive(items: list[ResourceItem], target_id: str) -> ResourceItem | None:
    for item in items:
        if item.id == target_id:
            return item
        if item.children:
            found = _find_item_recursive(item.children, target_id)
            if found:
                return found
    return None


def _set_checked_recursive(item: ResourceItem, is_checked: bool) -> None:
    item.is_checked = is_checked
    for child in item.children:
        _set_checked_recursive(child, is_checked)


def _collect_checked_leaf_items(items: list[ResourceItem]) -> list[ResourceItem]:
    result: list[ResourceItem] = []
    for item in items:
        if item.is_checked:
            if not item.children:
                result.append(item)
            else:
                result.extend(_collect_checked_leaf_items(item.children))
    return result


@router.get("/{project_id}/session", response_model=ResourceSessionResponse)
def get_resource_session(project_id: str) -> dict:
    """프로젝트의 리소스 세션(트리 및 Choice 상태)을 반환합니다."""
    session = _repo.get_session(project_id)
    return session.to_dict()


@router.post("/{project_id}/ingest-directory", response_model=ResourceSessionResponse)
def ingest_directory(project_id: str, req: IngestDirectoryRequest) -> dict:
    """로컬 디렉토리 경로를 스캔하여 프로젝트 리소스 트리에 추가합니다."""
    new_items = _file_provider.ingest(req.directory_path)
    if not new_items:
        raise HTTPException(status_code=400, detail="디렉토리를 찾을 수 없거나 접근할 수 없습니다.")

    session = _repo.get_session(project_id)
    # 기존 목록에 추가 (동일 경로면 대체)
    existing_paths = {it.path_or_url for it in session.items if it.path_or_url}
    for item in new_items:
        if item.path_or_url and item.path_or_url in existing_paths:
            session.items = [it for it in session.items if it.path_or_url != item.path_or_url]
        session.items.insert(0, item)

    _repo.save_session(session)
    return session.to_dict()


@router.post("/{project_id}/ingest-url", response_model=ResourceSessionResponse)
def ingest_url(project_id: str, req: IngestWebUrlRequest) -> dict:
    """웹 URL을 아티클 리소스로 프로젝트에 추가합니다."""
    new_items = _web_provider.ingest(req.url, req.title)
    session = _repo.get_session(project_id)
    for item in new_items:
        session.items.insert(0, item)

    _repo.save_session(session)
    return session.to_dict()


@router.patch("/{project_id}/choice", response_model=ResourceSessionResponse)
def toggle_choice(project_id: str, req: ToggleChoiceRequest) -> dict:
    """특정 소스의 Choice(체크박스) 상태를 토글합니다 (하위 폴더/파일 연쇄 지원)."""
    session = _repo.get_session(project_id)
    target = _find_item_recursive(session.items, req.item_id)
    if not target:
        raise HTTPException(status_code=404, detail="해당 리소스를 찾을 수 없습니다.")

    if req.cascade:
        _set_checked_recursive(target, req.is_checked)
    else:
        target.is_checked = req.is_checked

    _repo.save_session(session)
    return session.to_dict()


@router.post("/{project_id}/sectors", response_model=ResourceSectorDto)
def extract_sector(project_id: str, req: ExtractSectorRequest) -> dict:
    """문서 원본에서 BBox 영역이나 텍스트를 발라내어 카드로 저장합니다."""
    session = _repo.get_session(project_id)
    target = _find_item_recursive(session.items, req.resource_id)
    if not target:
        raise HTTPException(status_code=404, detail="해당 리소스를 찾을 수 없습니다.")

    sector = ResourceSector(
        sector_id=f"sec_{uuid.uuid4().hex[:8]}",
        resource_id=req.resource_id,
        title=req.title or "발췌 섹터",
        page=req.page,
        bbox=req.bbox,
        text_snippet=req.text_snippet,
        label=req.label,
    )
    target.sectors.insert(0, sector)
    _repo.save_session(session)
    return sector.to_dict()


@router.get("/{project_id}/ai-context", response_model=AiContextBundleResponse)
def get_ai_context(project_id: str) -> dict:
    """우측 AI Composer를 위해 현재 Choice(체크)된 소스들의 요약 스니펫 번들을 반환합니다."""
    session = _repo.get_session(project_id)
    checked_items = _collect_checked_leaf_items(session.items)

    sources = []
    for it in checked_items:
        snippets = [s.text_snippet for s in it.sectors if s.text_snippet]
        sources.append(
            AiContextSource(
                id=it.id,
                title=it.title,
                type=it.type,
                snippets=snippets[:5],  # 최대 5개 스니펫
            ).model_dump()
        )

    return {
        "totalSources": len(sources),
        "sources": sources,
    }


@router.get("/raw-file")
def get_raw_file(path: str) -> FileResponse:
    """로컬 파일 경로의 원본 바이너리(PDF, 이미지, 텍스트 등)를 브라우저 뷰어용으로 스트리밍합니다."""
    target_path = Path(path)
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    media_type, _ = mimetypes.guess_type(target_path.name)
    if not media_type:
        ext = target_path.suffix.lower()
        if ext in (".md", ".markdown"):
            media_type = "text/markdown; charset=utf-8"
        elif ext in (".json", ".ts", ".tsx", ".js", ".py", ".csv"):
            media_type = "text/plain; charset=utf-8"
        else:
            media_type = "application/octet-stream"

    return FileResponse(target_path, media_type=media_type)


