"""리소스 작업 공간 (API 쪽) — RM 자료를 agy 에 마운트하고(읽기 전용) 작업대 상태를 넘기며, 턴마다 출처 사용을 집계한다.

샌드박스 안에서 도는 쪽(MCP 서버 · 훅 · 탐색 도구 · 작업대 자료 구조)은 독립 패키지 `vibefs` 에 있다.
- `service.ResourceWorkspace`: API 쪽 진입점 (마운트 · 작업대 · 샌드박스 준비 · MCP 사양)
- `sources`: 켜진 출처별 열람 집계 · 재확인 · 출처 목록
- `citations`: 답변 인용 추출 · 검증
"""
from vibefs.mapper import build_map, collect, match_cluster_query

from .citations import (
    Citation,
    extract_citations,
    extract_citations_from_tool_calls,
    verify_citations,
)
from .service import (
    MOUNT_KIND,
    WORKBENCH_KIND,
    MountState,
    ResourceWorkspace,
    detect_full_read_intent,
    nudge_message,
    strip_recap,
    wants_full_read,
)
from .sources import (
    SourceUse,
    any_activity,
    roster,
    source_nudge_message,
    source_usage,
    unused_sources,
)

__all__ = [
    "Citation",
    "SourceUse",
    "any_activity",
    "roster",
    "source_nudge_message",
    "source_usage",
    "unused_sources",
    "MOUNT_KIND",
    "WORKBENCH_KIND",
    "MountState",
    "ResourceWorkspace",
    "build_map",
    "collect",
    "detect_full_read_intent",
    "extract_citations",
    "extract_citations_from_tool_calls",
    "match_cluster_query",
    "nudge_message",
    "strip_recap",
    "verify_citations",
    "wants_full_read",
]
