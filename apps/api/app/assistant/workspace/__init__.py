"""리소스 작업 공간 — RM 자료를 agy 에 마운트하고(읽기 전용), vibefs MCP 도구 · 훅으로 탐색 · 읽은 범위를 관리한다.

- `index` · `store` · `tools` · `hook` · `vibefs_server` 는 표준 라이브러리만 쓴다 (agy 가 띄우는 독립 스크립트가 같이 쓴다).
- `service.ResourceWorkspace` 는 API 쪽 진입점이다.
"""
from .citations import Citation, extract_citations, verify_citations
from .mapper import build_map, collect, match_cluster_query
from .service import (
    MOUNT_KIND,
    MountState,
    ResourceWorkspace,
    detect_full_read_intent,
    nudge_message,
    strip_recap,
    wants_full_read,
)

__all__ = [
    "Citation",
    "MOUNT_KIND",
    "MountState",
    "ResourceWorkspace",
    "build_map",
    "collect",
    "detect_full_read_intent",
    "extract_citations",
    "match_cluster_query",
    "nudge_message",
    "strip_recap",
    "verify_citations",
    "wants_full_read",
]
