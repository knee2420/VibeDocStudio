"""저장 경로와 원자적 파일 입출력 공통 계층 (`app.core.storage`)."""
from .atomic_json import read_json, write_json
from .ids import (
    BACKDATA_PREFIX,
    CATALOG_PREFIX,
    DOCUMENT_PREFIX,
    PROJECT_PREFIX,
    PROVENANCE_PREFIX,
    RUN_PREFIX,
    STAGING_PREFIX,
    is_safe_segment,
    new_id,
    safe_segment,
)
from .paths import STORAGE_VERSION, StorageRoots

__all__ = [
    "StorageRoots",
    "STORAGE_VERSION",
    "write_json",
    "read_json",
    "new_id",
    "safe_segment",
    "is_safe_segment",
    "DOCUMENT_PREFIX",
    "PROJECT_PREFIX",
    "CATALOG_PREFIX",
    "BACKDATA_PREFIX",
    "RUN_PREFIX",
    "PROVENANCE_PREFIX",
    "STAGING_PREFIX",
]

