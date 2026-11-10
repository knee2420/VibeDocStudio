"""Composer · 인라인 공용 프롬프트 조립.

규칙 글은 코드가 아니라 하네스 팩에 있다 (`packages/harness-packs`): core 팩의 조립 순서(`compose`)대로
영역 팩(editor · reference · resource · authoring)의 조각을 이어 붙인다. 이 모듈은 자리 · 순서만 정한다.

agy 는 시스템 프롬프트 플래그가 없으므로, 세션 첫 턴(또는 도구 목록이 바뀐 턴)의
사용자 메시지 앞에 운영 규칙과 도구 목록을 붙인다.
"""
from __future__ import annotations

from typing import Iterable

from harness_kit import packs

from .models import ContextItem, ToolSpec

_MESSAGES = "core:messages.json"

def composer_rules() -> str:
    return packs.compose("composer")


def workspace_rules() -> str:
    return packs.compose("workspace")


def inline_rules() -> str:
    return packs.compose("inline")


def output_formats() -> dict[str, str]:
    return packs.data("core:output-formats.json")


#: 시작 시점의 값 (테스트 · 진단용). 실행 중에는 위 함수가 팩을 다시 읽는다.
COMPOSER_RULES = composer_rules()
WORKSPACE_RULES = workspace_rules()
INLINE_RULES = inline_rules()
OUTPUT_FORMATS = output_formats()

def workspace_system_prompt(*, has_vibefs: bool = True) -> str:
    """ACP 세션 시작 시 _meta.systemPrompt.append 로 전달할 운영 규칙."""
    if has_vibefs:
        return f"{composer_rules()}\n\n{workspace_rules()}"
    return composer_rules()



def _signature(schema: dict) -> str:
    """JSON 스키마 → `slotId*: string, html*: string` 같은 한 줄 시그니처 (토큰 절약)."""
    props = (schema or {}).get("properties") or {}
    required = set((schema or {}).get("required") or [])
    parts = []
    for name, spec in props.items():
        kind = spec.get("type", "any") if isinstance(spec, dict) else "any"
        if isinstance(spec, dict) and spec.get("enum"):
            kind = "|".join(map(str, spec["enum"]))
        parts.append(f"{name}{'*' if name in required else ''}: {kind}")
    return ", ".join(parts)


def render_tools(tools: Iterable[ToolSpec]) -> str:
    lines = [packs.message(_MESSAGES, "composer.toolsHeader")]
    for tool in tools:
        lines.append(f"- {tool.name}({_signature(tool.input_schema)}) [{tool.risk}] {tool.description}")
    if len(lines) == 1:
        lines.append(packs.message(_MESSAGES, "composer.toolsEmpty"))
    return "\n".join(lines)


def _attr(value: str) -> str:
    return value.replace('"', "'").replace("\n", " ")


#: 자르지 않고 맨 앞에 두는 첨부 (작업 범위 · 리소스 작업 공간 지도)
_ALWAYS_FULL = ("scope", "resource-mount", "workbench")


def render_contexts(contexts: Iterable[ContextItem], limit: int = 24000) -> str:
    raw_list = list(contexts)
    if not raw_list:
        return ""

    # 1. 우선순위 정렬: 작업 범위 · 리소스 작업 공간 지도(0) -> 명시적 지목/타깃(@첨부, target)(1) -> 일반 배경 참조(2)
    def _priority(item: ContextItem) -> int:
        if item.kind in _ALWAYS_FULL:
            return 0
        if item.handle or item.role == "target":
            return 1
        return 2

    sorted_items = sorted(raw_list, key=_priority)
    blocks: list[str] = []
    budget = limit
    num_items = len(sorted_items)

    for item in sorted_items:
        content = item.content or ""

        # 높은 우선순위(scope · 작업 공간 지도, @핸들, target)는 넉넉하게, 일반 배경 참조는 독식 방지 상한 적용
        is_high_priority = item.kind in _ALWAYS_FULL or bool(item.handle) or item.role == "target"
        item_cap = budget if is_high_priority else max(1500, min(6000, budget // max(1, num_items)))

        if len(content) > item_cap:
            content = content[:item_cap] + "\n…(truncated)"

        if len(content) > budget:
            content = content[: max(budget, 0)] + "\n…(truncated)"

        budget -= len(content)

        attrs = f'kind="{item.kind}" id="{item.ref_id}" label="{_attr(item.label)}"'
        if item.role:
            attrs += f' role="{item.role}"'
        if item.handle:
            attrs += f' handle="{_attr(item.handle)}"'
        blocks.append(f"<context {attrs}>\n{content}\n</context>")

        if budget <= 0:
            break

    if not blocks:
        return ""
    return "<workspace_context>\n" + "\n".join(blocks) + "\n</workspace_context>"


def composer_message(
    text: str,
    contexts: list[ContextItem],
    *,
    tools: list[ToolSpec] | None,
    mode: str,
    skill: str = "",
    workspace: bool = False,
) -> str:
    """Composer 한 턴의 사용자 메시지. `tools` 가 주어지면(첫 턴 · 변경 시) 규칙과 목록을 앞에 붙인다.

    `skill` 은 서버 도구(지식 덱 등)를 쓰는 절차 — 도구 목록과 함께 한 번만 보낸다.
    `workspace` 는 리소스 작업 공간이 이 대화에서 처음 마운트(또는 바뀜)된 턴 — 탐색 규칙을 붙인다.
    """
    parts: list[str] = []
    if tools is not None:
        parts.append(composer_rules())
        if skill:
            parts.append(packs.message(_MESSAGES, "composer.skillHeader", skill=skill))
        parts.append(render_tools(tools))
    if workspace:
        parts.append(workspace_rules())
    if mode == "plan":
        parts.append(packs.message(_MESSAGES, "composer.planMode"))
    ctx = render_contexts(contexts)
    if ctx:
        parts.append(ctx)
    parts.append(f"<user_request>\n{text}\n</user_request>")
    return "\n\n".join(parts)


def inline_message(instruction: str, contexts: list[ContextItem], output_format: str) -> str:
    formats = output_formats()
    parts = [inline_rules(), formats.get(output_format, formats["text"])]
    ctx = render_contexts(contexts)
    if ctx:
        parts.append(ctx)
    parts.append(f"<instruction>\n{instruction}\n</instruction>")
    return "\n\n".join(parts)


def clean_inline_output(text: str) -> str:
    """모델이 규칙을 어기고 코드펜스를 둘렀을 때 걷어 낸다."""
    body = text.strip()
    if body.startswith("```"):
        first_nl = body.find("\n")
        body = body[first_nl + 1:] if first_nl >= 0 else ""
        if body.rstrip().endswith("```"):
            body = body.rstrip()[:-3]
    return body.strip()
