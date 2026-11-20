"""로컬 Vault API Pydantic 입출력 계약 (`app.vault.schemas`)."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

VaultEntryKind = Literal["file", "folder"]


class VaultSummary(BaseModel):
    id: str
    name: str
    rootPath: str
    isDefault: bool = False
    exists: bool = True


class VaultListResponse(BaseModel):
    vaults: list[VaultSummary]
    activeVaultId: str


class CreateVaultRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rootPath: str | None = None
    id: str | None = None


class VaultAppState(BaseModel):
    activeVaultId: str = "default-vault"
    theme: Literal["dark", "light"] = "dark"


class VaultNodeDto(BaseModel):
    path: str
    name: str
    parentPath: str
    kind: VaultEntryKind
    ctime: int
    mtime: int
    extension: str | None = None
    stem: str | None = None
    size: int | None = None
    folderKind: str | None = None


class VaultTreeResponse(BaseModel):
    vault: VaultSummary
    entries: list[VaultNodeDto]
    files: dict[str, str] = Field(default_factory=dict)
    revision: int = 0


class VaultFileResponse(BaseModel):
    node: VaultNodeDto
    content: str


class VaultPathMappingDto(BaseModel):
    oldPath: str
    newPath: str


class VaultRenameResponse(BaseModel):
    oldPath: str
    newPath: str
    affectedMap: list[VaultPathMappingDto]


class VaultDeleteResponse(BaseModel):
    deletedPaths: list[str]


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""
    clientId: str | None = None


class WriteFileRequest(BaseModel):
    path: str
    content: str
    clientId: str | None = None
    expectedMtime: int | None = None


class CreateFolderRequest(BaseModel):
    path: str
    clientId: str | None = None


class RenameEntryRequest(BaseModel):
    oldPath: str
    newNameOrPath: str
    clientId: str | None = None


class MoveEntryRequest(BaseModel):
    sourcePath: str
    targetFolderPath: str = ""
    clientId: str | None = None


class DuplicateEntryRequest(BaseModel):
    sourcePath: str
    clientId: str | None = None


class SeedVaultEntry(BaseModel):
    path: str
    content: str = ""


class SeedVaultRequest(BaseModel):
    entries: list[SeedVaultEntry]
    onlyIfEmpty: bool = True
    clientId: str | None = None


class SeedVaultResponse(BaseModel):
    seeded: bool
    createdCount: int


class VaultSessionPayload(BaseModel):
    layout: dict[str, Any] | None = None
    explorer: dict[str, Any] | None = None
    updatedAt: int | None = None


class VaultMetadataCachePayload(BaseModel):
    version: int = 1
    files: dict[str, Any] = Field(default_factory=dict)
    updatedAt: int | None = None


class RevealEntryRequest(BaseModel):
    path: str = ""


class RevealEntryResponse(BaseModel):
    ok: bool = True
    resolvedPath: str
