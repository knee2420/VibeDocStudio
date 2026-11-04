"""assistant 도메인 HTTP 스키마 (camelCase — 프론트 `@vibe/ai-kernel` 계약과 1:1)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .models import ContextItem, ToolSpec


class ContextItemPayload(BaseModel):
    kind: str
    id: str
    label: str = ""
    content: str = ""

    def to_model(self) -> ContextItem:
        return ContextItem(kind=self.kind, ref_id=self.id, label=self.label or self.id, content=self.content)


class ToolSpecPayload(BaseModel):
    name: str
    description: str = ""
    risk: str = "read"
    inputSchema: dict[str, Any] = Field(default_factory=dict)

    def to_model(self) -> ToolSpec:
        return ToolSpec(name=self.name, description=self.description, risk=self.risk, input_schema=self.inputSchema)


class CreateSessionRequest(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None


class CreateSessionResponse(BaseModel):
    sessionId: str
    provider: str
    model: str


class ToolResultPayload(BaseModel):
    id: str
    name: str
    ok: bool = True
    output: Any = None


class SendMessageRequest(BaseModel):
    text: str
    contexts: list[ContextItemPayload] = Field(default_factory=list)
    tools: list[ToolSpecPayload] = Field(default_factory=list)
    mode: Literal["agent", "plan"] = "agent"
    provider: Optional[str] = None
    model: Optional[str] = None
    #: 지난 답변 중 즉시 실행된(결과를 기다리지 않은) 도구들의 결과.
    deferredResults: list[ToolResultPayload] = Field(default_factory=list)


class SubmitToolResultsRequest(BaseModel):
    results: list[ToolResultPayload]


class InlineRunRequest(BaseModel):
    actionId: Optional[str] = None
    instruction: str
    contexts: list[ContextItemPayload] = Field(default_factory=list)
    outputFormat: Literal["html", "text", "markdown"] = "html"
    model: Optional[str] = None
