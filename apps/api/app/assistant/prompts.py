"""Composer · 인라인 공용 프롬프트 조립.

agy 는 시스템 프롬프트 플래그가 없으므로, 세션 첫 턴(또는 도구 목록이 바뀐 턴)의
사용자 메시지 앞에 운영 규칙과 도구 목록을 붙인다.
"""
from __future__ import annotations

from typing import Iterable

from .models import ContextItem, ToolSpec

COMPOSER_RULES = """\
[VibeDocStudio AI Composer — 운영 규칙]
너는 문서 작성 워크스페이스(VibeDocStudio)에 내장된 AI Composer 다.
- 이 워크스페이스는 아래 "워크스페이스 도구"로만 읽고 조작한다.
- 너의 내장 도구(파일 읽기/쓰기, 터미널, 브라우저, 웹 검색, 서브에이전트)는 절대 쓰지 마라.
  현재 작업 폴더는 빈 샌드박스이며 사용자의 문서가 아니다.
- 도구 호출 형식 (한 응답에 여러 개 가능, JSON 한 줄):
  <tool_call>{"id": "c1", "name": "도구이름", "arguments": {...}}</tool_call>
- read 도구: 결과가 필요하다. 호출을 내보낸 뒤 그 턴을 끝내라. 결과는 <tool_result id=...> 로 돌아온다.
- ui · stage 도구: 결과를 기다리지 않는다 (화면에서 즉시 실행된다). 호출한 뒤 같은 답변을 계속 이어 써라.
- stage 도구(문서 변경안)는 바로 반영되지 않고 사용자 검토 대기열(Staged)에 올라간다.
  변경 내용 설명을 먼저 쓰고, stage 도구 호출은 답변의 맨 끝에 둬라.
- 모르는 내용은 먼저 읽기 도구로 확인하고, 추측으로 문서를 채우지 마라.
- 사용자의 언어(기본 한국어)로 간결하게 답하고, 필요하면 마크다운을 써라.
"""

INLINE_RULES = """\
[VibeDocStudio 인라인 AI — 운영 규칙]
너는 문서 편집기 안의 인라인 AI 다. 주어진 대상 하나만 고쳐서 결과물만 출력한다.
- 내장 도구(파일, 터미널, 브라우저, 검색)는 쓰지 마라. 필요한 정보는 아래에 모두 있다.
- 설명, 인사, 머리말, 코드펜스 없이 결과 본문만 출력하라.
"""

OUTPUT_FORMATS = {
    "html": "출력 형식: HTML 조각만 (<p>, <ul>, <ol>, <li>, <strong>, <em>, <br> 만 사용). 마크다운 금지.",
    "text": "출력 형식: 일반 텍스트만.",
    "markdown": "출력 형식: 마크다운.",
}


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
    lines = ["[워크스페이스 도구]  (* = 필수 인자)"]
    for tool in tools:
        lines.append(f"- {tool.name}({_signature(tool.input_schema)}) [{tool.risk}] {tool.description}")
    if len(lines) == 1:
        lines.append("- (현재 사용 가능한 도구 없음)")
    return "\n".join(lines)


def render_contexts(contexts: Iterable[ContextItem], limit: int = 24000) -> str:
    blocks: list[str] = []
    budget = limit
    for item in contexts:
        content = item.content or ""
        if len(content) > budget:
            content = content[: max(budget, 0)] + "…(truncated)"
        budget -= len(content)
        blocks.append(
            f'<context kind="{item.kind}" id="{item.ref_id}" label="{item.label}">\n{content}\n</context>'
        )
    if not blocks:
        return ""
    return "<workspace_context>\n" + "\n".join(blocks) + "\n</workspace_context>"


def composer_message(
    text: str,
    contexts: list[ContextItem],
    *,
    tools: list[ToolSpec] | None,
    mode: str,
) -> str:
    """Composer 한 턴의 사용자 메시지. `tools` 가 주어지면(첫 턴 · 변경 시) 규칙과 목록을 앞에 붙인다."""
    parts: list[str] = []
    if tools is not None:
        parts.append(COMPOSER_RULES)
        parts.append(render_tools(tools))
    if mode == "plan":
        parts.append("[모드: plan] 문서를 바꾸는 도구는 호출하지 말고, 실행 계획만 제시하라.")
    ctx = render_contexts(contexts)
    if ctx:
        parts.append(ctx)
    parts.append(f"<user_request>\n{text}\n</user_request>")
    return "\n\n".join(parts)


def inline_message(instruction: str, contexts: list[ContextItem], output_format: str) -> str:
    parts = [INLINE_RULES, OUTPUT_FORMATS.get(output_format, OUTPUT_FORMATS["text"])]
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
