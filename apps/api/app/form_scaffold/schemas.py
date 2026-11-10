"""form_scaffold HTTP 응답 스키마."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class ScaffoldDocumentResponse(BaseModel):
    docId: str
    title: str
    totalPages: int
    checkedBlocks: int
    checkedSlots: int
    document: dict[str, Any]
    fidelityMode: str = "balanced"
    #: CLI 에이전트 루프 실행 정보 (runId · runDir · 반복별 판정). 루프가 돌지 않았으면 None.
    agentRun: Optional[dict[str, Any]] = None
