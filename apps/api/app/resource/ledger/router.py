"""RM 원장 HTTP 라우터 (`/api/resources`). 규칙은 `use_cases.ResourceLedgerService` 에 있다."""
import mimetypes
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse

from .schemas import (
    AiContextBundleResponse,
    BatchDecoupleRequest,
    DecoupleItemRequest,
    ExtractSectorRequest,
    IngestDirectoryRequest,
    IngestWebUrlRequest,
    ResourceSectorDto,
    ResourceSessionResponse,
    ToggleChoiceRequest,
)
from .use_cases import ResourceLedgerService

router = APIRouter()

LedgerDep = Annotated[ResourceLedgerService, Depends(Provide["resource_ledger"])]

#: 확장자로 형식을 못 정하는 텍스트 원문
_TEXT_TYPES = {".md": "text/markdown; charset=utf-8", ".markdown": "text/markdown; charset=utf-8"}
_PLAIN_EXTS = {".json", ".ts", ".tsx", ".js", ".py", ".csv"}


@router.get("/{project_id}/session", response_model=ResourceSessionResponse)
@inject
def get_resource_session(project_id: str, ledger: LedgerDep) -> dict:
    """프로젝트의 리소스 원장(트리 · Choice 상태)."""
    return ledger.session(project_id).to_dict()


@router.post("/{project_id}/ingest-directory", response_model=ResourceSessionResponse)
@inject
def ingest_directory(project_id: str, req: IngestDirectoryRequest, ledger: LedgerDep) -> dict:
    """로컬 디렉터리를 스캔해 원장에 추가한다 (같은 경로면 대체)."""
    return ledger.ingest_directory(project_id, req.directory_path).to_dict()


@router.post("/{project_id}/upload-file", response_model=ResourceSessionResponse)
@inject
async def upload_resource_file(project_id: str, ledger: LedgerDep, file: UploadFile = File(...)) -> dict:
    """브라우저에서 고른 파일을 프로젝트 업로드 폴더에 저장하고 원장에 추가한다."""
    content = await file.read()
    return ledger.upload_file(project_id, file.filename, content).to_dict()


@router.post("/{project_id}/rescan", response_model=ResourceSessionResponse)
@inject
def rescan_resources(project_id: str, ledger: LedgerDep) -> dict:
    """등록된 로컬 디렉터리를 다시 읽는다 (체크 · 섹터 상태 보존)."""
    return ledger.rescan(project_id).to_dict()


@router.post("/{project_id}/decouple", response_model=ResourceSessionResponse)
@inject
def decouple_resource(project_id: str, req: DecoupleItemRequest, ledger: LedgerDep) -> dict:
    """원장에서 연결만 해제한다. 로컬 원본 파일은 지우지 않는다."""
    return ledger.decouple(project_id, req.item_id).to_dict()


@router.post("/{project_id}/ingest-url", response_model=ResourceSessionResponse)
@inject
def ingest_url(project_id: str, req: IngestWebUrlRequest, ledger: LedgerDep) -> dict:
    """웹 URL 을 아티클 리소스로 추가한다."""
    return ledger.ingest_url(project_id, req.url, req.title).to_dict()


@router.patch("/{project_id}/choice", response_model=ResourceSessionResponse)
@inject
def toggle_choice(project_id: str, req: ToggleChoiceRequest, ledger: LedgerDep) -> dict:
    """Choice(체크) 상태를 바꾼다 (하위 폴더 · 파일 연쇄 지원)."""
    return ledger.toggle_choice(project_id, req.item_id, req.is_checked, req.cascade).to_dict()


@router.post("/{project_id}/sectors", response_model=ResourceSectorDto)
@inject
def extract_sector(project_id: str, req: ExtractSectorRequest, ledger: LedgerDep) -> dict:
    """원문에서 BBox 영역이나 텍스트를 발라내 카드(섹터)로 저장한다."""
    return ledger.add_sector(
        project_id, resource_id=req.resource_id, text_snippet=req.text_snippet, title=req.title,
        page=req.page, bbox=req.bbox, label=req.label,
    ).to_dict()


@router.get("/{project_id}/ai-context", response_model=AiContextBundleResponse)
@inject
def get_ai_context(project_id: str, ledger: LedgerDep) -> dict:
    """체크된 리소스의 발췌 묶음 (AI Composer 용)."""
    return ledger.ai_context(project_id)


@router.get("/raw-file")
@inject
def get_raw_file(path: str, ledger: LedgerDep) -> FileResponse:
    """원장에 등록된 로컬 파일의 원본을 뷰어용으로 보낸다."""
    target = ledger.raw_file(path)
    media_type, _ = mimetypes.guess_type(target.name)
    if not media_type:
        ext = target.suffix.lower()
        media_type = _TEXT_TYPES.get(ext) or ("text/plain; charset=utf-8" if ext in _PLAIN_EXTS else "application/octet-stream")
    return FileResponse(target, media_type=media_type)


@router.get("/raw/{resource_id}")
@inject
def get_raw_by_id(resource_id: str, ledger: LedgerDep) -> FileResponse:
    """문서 블록의 `resource:<id>` 사진 · 그림 — 경로가 아니라 원장 id 로 열어 문서가 다른 PC 에서도 같은 자료를 가리킨다."""
    target = ledger.raw_by_id(resource_id)
    media_type, _ = mimetypes.guess_type(target.name)
    return FileResponse(target, media_type=media_type or "application/octet-stream",
                        headers={"Cache-Control": "private, max-age=3600"})


@router.post("/{project_id}/batch-decouple", response_model=ResourceSessionResponse)
@inject
def batch_decouple_resources(project_id: str, req: BatchDecoupleRequest, ledger: LedgerDep) -> dict:
    """여러 리소스의 연결을 한 번에 해제한다. 로컬 원본 파일은 보존된다."""
    return ledger.batch_decouple(project_id, req.item_ids).to_dict()
