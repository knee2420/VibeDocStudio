"""로컬 Vault FastAPI 라우터 (`app.vault.router`, 접두사 `/api/vaults`)."""
from __future__ import annotations

import threading

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.sse import sse_response

from .schemas import (
    CreateFileRequest,
    CreateFolderRequest,
    CreateVaultRequest,
    DuplicateEntryRequest,
    MoveEntryRequest,
    RenameEntryRequest,
    RevealEntryRequest,
    RevealEntryResponse,
    SeedVaultRequest,
    SeedVaultResponse,
    VaultAppState,
    VaultDeleteResponse,
    VaultFileResponse,
    VaultListResponse,
    VaultMetadataCachePayload,
    VaultNodeDto,
    VaultRenameResponse,
    VaultSessionPayload,
    VaultSummary,
    VaultTreeResponse,
    WriteFileRequest,
)
from .use_cases import VaultService

router = APIRouter()


@router.get("", response_model=VaultListResponse)
@inject
def list_vaults(
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultListResponse:
    return service.list_vaults()


@router.post("", response_model=VaultSummary)
@inject
def create_or_mount_vault(
    req: CreateVaultRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultSummary:
    return service.create_or_mount_vault(req)


@router.get("/state", response_model=VaultAppState)
@inject
def get_app_state(
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultAppState:
    return service.get_app_state()


@router.put("/state", response_model=VaultAppState)
@inject
def save_app_state(
    req: VaultAppState,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultAppState:
    return service.save_app_state(req)


@router.delete("/{vault_id}")
@inject
def unregister_vault(
    vault_id: str,
    service: VaultService = Depends(Provide["vault_service"]),
) -> dict[str, str]:
    service.unregister_vault(vault_id)
    return {"status": "unregistered", "vaultId": vault_id}


@router.get("/{vault_id}/tree", response_model=VaultTreeResponse)
@inject
def get_vault_tree(
    vault_id: str,
    includeContents: bool = Query(default=True),
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultTreeResponse:
    return service.get_tree(vault_id, include_contents=includeContents)


@router.post("/{vault_id}/seed", response_model=SeedVaultResponse)
@inject
def seed_vault(
    vault_id: str,
    req: SeedVaultRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> SeedVaultResponse:
    return service.seed_vault(vault_id, req)


@router.get("/{vault_id}/file", response_model=VaultFileResponse)
@inject
def read_vault_file(
    vault_id: str,
    path: str = Query(...),
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultFileResponse:
    return service.read_file(vault_id, path)


@router.get("/{vault_id}/raw")
@inject
def stream_vault_raw_file(
    vault_id: str,
    path: str = Query(...),
    service: VaultService = Depends(Provide["vault_service"]),
) -> FileResponse:
    resolved = service.resolve_raw_file(vault_id, path)
    # 화면(이미지·PDF 뷰어 iframe)에서 바로 보이도록 inline 으로 내려준다.
    # attachment 로 주면 브라우저가 열 때마다 내려받기를 시작한다.
    return FileResponse(path=str(resolved), filename=resolved.name, content_disposition_type="inline")


@router.post("/{vault_id}/file", response_model=VaultNodeDto)
@inject
def create_vault_file(
    vault_id: str,
    req: CreateFileRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultNodeDto:
    return service.create_file(vault_id, req)


@router.post("/{vault_id}/upload", response_model=VaultNodeDto)
@inject
async def upload_vault_binary(
    vault_id: str,
    file: UploadFile = File(...),
    folder: str = Form(""),
    clientId: str | None = Form(default=None),
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultNodeDto:
    """이미지·PDF 같은 바이너리 파일을 볼트 폴더에 저장한다 (같은 이름이면 번호를 붙인다)."""
    data = await file.read()
    return service.upload_binary(vault_id, folder, file.filename or "file", data, client_id=clientId)


@router.put("/{vault_id}/file", response_model=VaultNodeDto)
@inject
def write_vault_file(
    vault_id: str,
    req: WriteFileRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultNodeDto:
    return service.write_file(vault_id, req)


@router.post("/{vault_id}/folder", response_model=VaultNodeDto)
@inject
def create_vault_folder(
    vault_id: str,
    req: CreateFolderRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultNodeDto:
    return service.create_folder(vault_id, req)


@router.post("/{vault_id}/rename", response_model=VaultRenameResponse)
@inject
def rename_vault_entry(
    vault_id: str,
    req: RenameEntryRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultRenameResponse:
    return service.rename_entry(vault_id, req)


@router.post("/{vault_id}/move", response_model=VaultRenameResponse)
@inject
def move_vault_entry(
    vault_id: str,
    req: MoveEntryRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultRenameResponse:
    return service.move_entry(vault_id, req)


@router.post("/{vault_id}/duplicate", response_model=VaultNodeDto)
@inject
def duplicate_vault_entry(
    vault_id: str,
    req: DuplicateEntryRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultNodeDto:
    return service.duplicate_entry(vault_id, req)


@router.delete("/{vault_id}/entry", response_model=VaultDeleteResponse)
@inject
def delete_vault_entry(
    vault_id: str,
    path: str = Query(...),
    clientId: str | None = Query(default=None),
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultDeleteResponse:
    return service.delete_entry(vault_id, path, client_id=clientId)


@router.post("/{vault_id}/reveal", response_model=RevealEntryResponse)
@inject
def reveal_vault_entry(
    vault_id: str,
    req: RevealEntryRequest,
    service: VaultService = Depends(Provide["vault_service"]),
) -> RevealEntryResponse:
    return service.reveal_entry(vault_id, req)


@router.get("/{vault_id}/session", response_model=VaultSessionPayload)
@inject
def get_vault_session(
    vault_id: str,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultSessionPayload:
    return service.read_workspace_session(vault_id)


@router.put("/{vault_id}/session", response_model=VaultSessionPayload)
@inject
def put_vault_session(
    vault_id: str,
    req: VaultSessionPayload,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultSessionPayload:
    return service.write_workspace_session(vault_id, req)


@router.get("/{vault_id}/cache", response_model=VaultMetadataCachePayload)
@inject
def get_vault_cache(
    vault_id: str,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultMetadataCachePayload:
    return service.read_metadata_cache(vault_id)


@router.put("/{vault_id}/cache", response_model=VaultMetadataCachePayload)
@inject
def put_vault_cache(
    vault_id: str,
    req: VaultMetadataCachePayload,
    service: VaultService = Depends(Provide["vault_service"]),
) -> VaultMetadataCachePayload:
    return service.write_metadata_cache(vault_id, req)


@router.get("/{vault_id}/events")
@inject
def watch_vault_events(
    vault_id: str,
    clientId: str | None = Query(default=None),
    service: VaultService = Depends(Provide["vault_service"]),
):
    stop_event = threading.Event()
    events = service.watch_events(vault_id, stop_event, client_id=clientId)
    return sse_response(events, on_disconnect=stop_event.set)
