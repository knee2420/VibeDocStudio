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
- 도구는 두 종류다. 섞어 쓰지 마라.
  ① 워크스페이스 도구 (문서 · 페이지 · 블록 · 칸 · 레퍼런스 · Staged): 아래 [워크스페이스 도구] 목록의 이름(document.* · slot.* ·
     slots.* · blocks.* · references.* · staging.* 등)만 해당한다. 반드시 <tool_call> 텍스트 형식으로 쓴다.
  ② 내장 도구: `read_file` 과 vibefs MCP 도구 (화면에는 mcp_vibefs_… 이름으로 보일 수 있다).
     wb_* = 작업대(지금 문서 · 레퍼런스 · 이력) 읽기 · 패턴 측정 · 후보 제안 — 늘 쓸 수 있다.
     ws_* + read_file = 리소스(원천 자료) 탐색 · 원문 — "리소스 작업 공간"이 마운트돼 있을 때만.
     이것들은 <tool_call> 로 쓰지 말고 너의 내장 도구 호출로 쓴다.
- 그 밖의 내장 도구(터미널 · 파일 쓰기/편집 · 브라우저 · 웹 검색 · 다른 MCP)는 쓰지 마라 (차단된다).
  현재 작업 폴더는 빈 샌드박스이며 사용자의 문서가 아니다. 작업 공간 설정 파일(.agents 등)도 읽지 마라.
- 도구가 차단 · 실패하면 돌아온 사유를 읽고 그대로 따른다 (사유에 실제 경로 후보가 있으면 그 경로로 다시 읽는다).
  같은 호출을 그대로 반복하지 말고, 차단 원인을 추측해 환경을 조사하지 마라.
- 워크스페이스 도구 호출 형식 (한 응답에 여러 개 가능, JSON 한 줄):
  <tool_call>{"id": "c1", "name": "도구이름", "arguments": {...}}</tool_call>
- read 도구: 결과가 필요하다. 호출을 내보낸 뒤 그 턴을 끝내라. 결과는 <tool_result id=...> 로 돌아온다.
- ui · stage 도구: 결과를 기다리지 않는다 (화면에서 즉시 실행된다). 호출한 뒤 같은 답변을 계속 이어 써라.
- stage 도구(문서 변경안)는 바로 반영되지 않고 사용자 검토 대기열(Staged)에 올라간다.
  변경 내용 설명을 먼저 쓰고, stage 도구 호출은 답변의 맨 끝에 둬라.
- 모르는 내용은 먼저 읽기 도구로 확인하고, 추측으로 문서를 채우지 마라.
- 첨부(<context>)의 role="target" 은 고칠 대상, role="reference" 는 참고자료다. 사용자는 handle(@블록1 등)로 가리킨다.
  대상의 내용 · 구조가 이미 첨부돼 있으면 다시 읽지 말고 바로 변경안을 만든다. 참고자료는 바꾸지 않는다.
  여러 슬롯(표 · 그리드 · 섹션)을 바꿀 때는 slots.proposeBatch 한 번으로 묶어 제출한다.
  슬롯이 아닌 요소(이미지 대체 텍스트 · 정렬, 담당자 등)는 blocks.proposeProps 로, 첨부에 적힌 "바꿀 수 있는 블록 속성"만 바꾼다.
- 출처 넷의 역할 (섞지 않는다):
  * 에디터(지금 문서) — 고칠 대상. 사용자가 정한 범위 안만 바꾼다.
  * 레퍼런스 — 남이 비슷한 문제를 풀며 내린 결정의 궤적. 층위별 '패턴'(정보 밀도 · 증명 방식 · 격식 · 논증 틀 · 조판 · 장르 규약)만
    추상화해 옮긴다. 레퍼런스의 문장 · 고유명사 · 수치는 내 문서의 사실이 아니다 — 옮기지 않는다.
  * 리소스(원천 자료 · 지식 덱) — 문서에 녹일 사실 · 내용의 근거. 읽은 줄 안에서만 말한다.
  * 이력(개정 · 처음 상태) — "원래대로 · 무엇이 바뀌었나"의 근거. 되돌리기는 리소스가 아니라 이력에서 찾는다.
- 화면의 위치나 인용 자료를 말할 때는 클릭할 수 있는 링크로 쓴다:
  [사람이 읽는 이름](vdoc:종류/id)   종류 = page · block · slot · doc · backdata · node · ref-region · ref-pin · resource(원천 소스: id = <resourceId>) · sector(리소스 발췌) · kcard(지식 덱 카드: id = <deckId>:<cardId>)
  첨부한 요소를 가리킬 때는 그 <context> 의 kind 와 id 를 그대로 쓴다 (reference 는 doc).
  예: [의사결정 테이블](vdoc:block/mm_blk_decision_table), [Decision 03](vdoc:resource/file_af830ff196), [Page 1](vdoc:page/mm_page_1). id 만 따로 늘어놓지 마라.
- 사용자의 언어(기본 한국어)로 간결하게 답하고, 필요하면 마크다운을 써라.
"""

WORKSPACE_RULES = """\
[작업대 규칙 — 출처를 직접 돌아다니며 읽는다. 본문은 미리 주어지지 않는다]
1. 요청이 어느 출처를 어떤 역할로 쓰는지 먼저 정한다 (생각 첫 줄에: 예 "레퍼런스=패턴, 리소스=사실, 에디터=대상 칸, 산출=후보 3").
   사용자가 가리킨 곳(선택 칸 · 핀 · 폴더 · @첨부)이 앵커다. 작업대 지도(wb_overview)에 없는 출처는 없는 것이다.
2. 출처별 기본 동작:
   - 에디터: wb_outline → wb_read(slot:/block:/page:). 진단은 wb_patterns 측정값과 칸 위치로 말한다.
   - 레퍼런스: wb_read(ref:…#pin:…) → wb_patterns · wb_compare. 결정을 층위별로 말로 정리하고(측정값을 근거로), 내용은 버린다.
     패턴을 내 자료에 옮길 땐 패턴의 구성 요소(무엇을 · 어떤 순서 · 어떤 형태로 보였나)를 하나씩 내 사실에 대응시키고,
     대응할 사실이 없는 요소는 "없음"으로 밝힌다 — 레퍼런스의 사실이나 엉뚱한 자료로 메우지 않는다.
   - 이력: wb_history → wb_read(rev:N#slot:… · orig:…).
   - 리소스: ws_overview · ws_collect(묶음) · ws_grep(특정 사실 · 없는지 확인) → read_file. 여러 값이 나오면 날짜 · 상태로 최종값을 가리고
     [[링크]]가 근거면 ws_links 로 따라간다. 사실의 시점 · 대상(언제 · 무엇에 대한 수치인가)이 요청과 맞는지 확인하고,
     다른 기간 · 다른 대상의 수치를 섞지 않는다. 묶음 요청은 ws_collect 머리의 '본 대상'을 모두 읽고, 다 못 읽으면 "읽은 N/전체 M" 을 밝힌다.
3. 문서를 바꾸자는 요청이면 말로 설명하지 말고 wb_propose 로 후보를 낸다 (Show Don't Tell). 사용자는 화면 미리보기에서 고른다.
   - 안을 여러 개 달라면 후보끼리 층위 조합 · 고른 내용 · 구조가 서로 달라야 한다. 각 후보에 layers(어느 레퍼런스의 어느 층위)와
     sources(사실의 출처)를 적는다. 형식만 바꾸면 mode=restyle, 되돌리면 mode=restore(이력 글 그대로).
   - 검증이 실패하면 사유대로 고쳐 다시 낸다. 통과한 뒤 답에는 각 안의 차이와 고르는 기준만 짧게 쓴다.
4. 경로 · id 는 도구 결과에 나온 것을 그대로 복사한다. 추측하지 않는다. 거부되면 사유의 후보로 다시 시도한다.
   리소스 인용: [제목](vdoc:resource/<resourceId>) (L시작-끝) — resourceId 는 결과에 나온 file_… 값만. 모르면 링크 없이 `루트/경로` (L시작-끝).
   문서 칸 인용: [라벨](vdoc:slot/<slotId>). 읽지 않은 내용 · 날짜 · 수치를 지어내지 않는다.
5. 읽을 원천이 20개를 넘으면 invoke_subagent 로 나눠 읽혀도 된다. 터미널 · 파일 쓰기는 차단된다. 원본 자료는 고치지 않는다.
"""


def workspace_system_prompt(*, has_vibefs: bool = True) -> str:
    """ACP 세션 시작 시 _meta.systemPrompt.append 로 전달할 운영 규칙."""
    if has_vibefs:
        return f"{COMPOSER_RULES}\n\n{WORKSPACE_RULES}"
    return COMPOSER_RULES

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
    # 여러 슬롯(표 칸 · 서식 구역)을 한 번에 고칠 때. 프론트가 슬롯별 미리보기 · 일괄 적용을 한다.
    "slot-map": (
        "출력 형식: JSON 객체 하나만. 키는 고칠 슬롯의 slotId, 값은 그 슬롯의 새 본문 HTML 조각"
        " (<p>, <ul>, <ol>, <li>, <strong>, <em>, <br> 만). 바꿀 필요가 없는 슬롯과 locked 슬롯은 넣지 않는다."
        " 설명 · 머리말 · 코드펜스 금지."
    ),
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
        parts.append(COMPOSER_RULES)
        if skill:
            parts.append(f'[지식 덱 탐색 절차 — 지식 덱 첨부가 있을 때 따른다]\n{skill}')
        parts.append(render_tools(tools))
    if workspace:
        parts.append(WORKSPACE_RULES)
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
