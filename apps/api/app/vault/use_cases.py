"""로컬 Vault 유스케이스 (`app.vault.use_cases`)."""
from __future__ import annotations

import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .adapters import LocalVaultRepository
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


class VaultService:
    """볼트 레지스트리 · 파일 CRUD · `.vibe/` 세션 · 워처 스트림을 조율하는 도메인 서비스."""

    def __init__(self, repo: LocalVaultRepository) -> None:
        self._repo = repo

    def list_vaults(self) -> VaultListResponse:
        vaults = self._repo.list_vaults()
        state = self._repo.get_app_state()
        return VaultListResponse(vaults=vaults, activeVaultId=state.activeVaultId)

    def create_or_mount_vault(self, req: CreateVaultRequest) -> VaultSummary:
        return self._repo.create_or_mount_vault(
            name=req.name,
            root_path=req.rootPath,
            explicit_id=req.id,
        )

    def unregister_vault(self, vault_id: str) -> None:
        self._repo.unregister_vault(vault_id)

    def get_app_state(self) -> VaultAppState:
        return self._repo.get_app_state()

    def save_app_state(self, state: VaultAppState) -> VaultAppState:
        return self._repo.save_app_state(state)

    def get_tree(self, vault_id: str, *, include_contents: bool = True) -> VaultTreeResponse:
        return self._repo.get_tree(vault_id, include_contents=include_contents)

    def seed_vault(self, vault_id: str, req: SeedVaultRequest) -> SeedVaultResponse:
        seeded, count = self._repo.seed_vault(
            vault_id,
            [(e.path, e.content) for e in req.entries],
            only_if_empty=req.onlyIfEmpty,
            client_id=req.clientId,
        )
        return SeedVaultResponse(seeded=seeded, createdCount=count)

    def read_file(self, vault_id: str, path: str) -> VaultFileResponse:
        return self._repo.read_file(vault_id, path)

    def resolve_raw_file(self, vault_id: str, path: str) -> Path:
        return self._repo.resolve_raw_file(vault_id, path)

    def create_file(self, vault_id: str, req: CreateFileRequest) -> VaultNodeDto:
        return self._repo.create_file(vault_id, req.path, req.content, client_id=req.clientId)

    def upload_binary(
        self, vault_id: str, folder: str, file_name: str, data: bytes, client_id: str | None = None
    ) -> VaultNodeDto:
        return self._repo.upload_binary(vault_id, folder, file_name, data, client_id=client_id)

    def write_file(self, vault_id: str, req: WriteFileRequest) -> VaultNodeDto:
        return self._repo.write_file(
            vault_id,
            req.path,
            req.content,
            client_id=req.clientId,
            expected_mtime=req.expectedMtime,
        )

    def create_folder(self, vault_id: str, req: CreateFolderRequest) -> VaultNodeDto:
        return self._repo.create_folder(vault_id, req.path, client_id=req.clientId)

    def rename_entry(self, vault_id: str, req: RenameEntryRequest) -> VaultRenameResponse:
        return self._repo.rename_entry(
            vault_id, req.oldPath, req.newNameOrPath, client_id=req.clientId
        )

    def move_entry(self, vault_id: str, req: MoveEntryRequest) -> VaultRenameResponse:
        return self._repo.move_entry(
            vault_id, req.sourcePath, req.targetFolderPath, client_id=req.clientId
        )

    def duplicate_entry(self, vault_id: str, req: DuplicateEntryRequest) -> VaultNodeDto:
        return self._repo.duplicate_entry(vault_id, req.sourcePath, client_id=req.clientId)

    def delete_entry(self, vault_id: str, path: str, client_id: str | None = None) -> VaultDeleteResponse:
        return self._repo.delete_entry(vault_id, path, client_id=client_id)

    def reveal_entry(self, vault_id: str, req: RevealEntryRequest) -> RevealEntryResponse:
        resolved = self._repo.reveal_in_os_explorer(vault_id, req.path)
        return RevealEntryResponse(ok=True, resolvedPath=str(resolved))

    def read_workspace_session(self, vault_id: str) -> VaultSessionPayload:
        return self._repo.read_workspace_session(vault_id)

    def write_workspace_session(
        self, vault_id: str, payload: VaultSessionPayload
    ) -> VaultSessionPayload:
        return self._repo.write_workspace_session(vault_id, payload)

    def read_metadata_cache(self, vault_id: str) -> VaultMetadataCachePayload:
        return self._repo.read_metadata_cache(vault_id)

    def write_metadata_cache(
        self, vault_id: str, payload: VaultMetadataCachePayload
    ) -> VaultMetadataCachePayload:
        return self._repo.write_metadata_cache(vault_id, payload)

    def watch_events(
        self,
        vault_id: str,
        stop_event: threading.Event,
        *,
        client_id: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        return self._repo.iter_watch_events(
            vault_id,
            stop_event,
            subscriber_client_id=client_id,
        )

    def shutdown(self) -> None:
        self._repo.shutdown()
