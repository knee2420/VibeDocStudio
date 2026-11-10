"""assistant 도메인 값 객체."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ContextItem:
    """프론트의 컨텍스트 제공자가 만든 한 조각 (`@슬롯`, `@참조`, 현재 선택 …)."""

    kind: str
    ref_id: str
    label: str
    content: str = ""
    #: "target"(고칠 대상) · "reference"(참고자료) · "" (자동 첨부 등 역할 없음)
    role: str = ""
    #: 프롬프트에서 사용자가 가리킬 때 쓰는 짧은 이름 (`@블록1`)
    handle: str = ""


@dataclass(frozen=True)
class ToolSpec:
    """프론트 도구 레지스트리가 알려준 워크스페이스 도구 한 개."""

    name: str
    description: str
    risk: str = "read"
    input_schema: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    call_id: str
    name: str
    ok: bool
    output: Any = None
