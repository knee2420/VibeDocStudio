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
  ② 내장 도구 (사용자 원천 자료 읽기): `read_file` 과 vibefs MCP 도구(ws_overview · ws_tree · ws_glob · ws_grep · ws_collect ·
     ws_outline · ws_links · ws_find · ws_duplicates · ws_diff · ws_coverage — 화면에는 mcp_vibefs_ws_… 이름으로 보일 수 있다).
     이것들은 <tool_call> 로 쓰지 말고 너의 내장 도구 호출로 쓴다. "리소스 작업 공간"이 마운트돼 있을 때만 쓴다.
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
- 자료 체계의 구분:
  * 레퍼런스(Reference): 좌측 패널의 규정·서식·참조 PDF/Doc 문서 및 지정 핀 (종류: doc, ref-region, ref-pin) — 준수해야 할 표준 서식 양식, 표 레이아웃, 심사·규정 세칙 등 규범적 제약(Normative Standard). 본문 슬롯 조립 시 이 틀과 규범을 엄격히 준수한다.
  * 리소스(Resource): 우측 패널의 원천 소스(의사결정 회의록, 기획서 등) 및 지식 덱 (종류: resource, sector, kcard) — 문서에 실제로 녹여내야 하는 사실/내용 데이터(Factual Raw Material).
- 화면의 위치나 인용 자료를 말할 때는 클릭할 수 있는 링크로 쓴다:
  [사람이 읽는 이름](vdoc:종류/id)   종류 = page · block · slot · doc · backdata · node · ref-region · ref-pin · resource(원천 소스: id = <resourceId>) · sector(리소스 발췌) · kcard(지식 덱 카드: id = <deckId>:<cardId>)
  첨부한 요소를 가리킬 때는 그 <context> 의 kind 와 id 를 그대로 쓴다 (reference 는 doc).
  예: [의사결정 테이블](vdoc:block/mm_blk_decision_table), [Decision 03](vdoc:resource/file_af830ff196), [Page 1](vdoc:page/mm_page_1). id 만 따로 늘어놓지 마라.
- 사용자의 언어(기본 한국어)로 간결하게 답하고, 필요하면 마크다운을 써라.
"""

WORKSPACE_RULES = """\
[리소스 작업 공간 규칙 — 사용자가 Resource Manager 에서 체크한 자료가 마운트돼 있다]
너는 이 자료 폴더를 IDE 탐색기처럼 직접 돌아다니며 원문을 읽는다. 자료 본문은 미리 주어지지 않는다.
먼저 요청이 아래 어느 유형인지 정하고(생각 첫 줄에 적어라), 그 순서대로 탐색한다.

A. 묶음 종합 ("X들 정리 · 비교 · 표준 · 공통점 · 패턴"): ws_collect("X")로 목록 확정 → 머리의 '본 대상'을 모두 read_file
   → 시기 · 폴더별 차이를 찾는다. 초안 · 검토 중은 확정본과 따로 다루고, 서식 · 예시는 내용으로 세지 않는다.
   일부만 읽었으면 "읽은 N/전체 M" 을 밝히고 그 범위에서만 일반화한다.
B. 특정 사실 · 수치 ("며칠 · 몇 명 · 얼마 · 어디에"): ws_grep 으로 낱말 · 숫자를 먼저 찾고, 걸린 줄 앞뒤만 읽는다.
   여러 값이 나오면 날짜 · 상태(합의 · 확정 vs 검토 · 초안)로 최종값을 가리고, 버려진 값은 그렇다고 밝힌다.
   카드가 다른 문서를 [[링크]]로 근거 삼으면 ws_links 로 따라가 원 수치를 확인한다 (계획 수치 ≠ 실측 수치).
C. 현재 유효성 ("지금 · 최종 · 유효한"): 상태 frontmatter · '대체됨 · 폐기' 표시 · 더 늦은 날짜의 같은 주제 카드를 확인한다.
D. 있는지 확인 ("~한 결정이 있어?"): ws_grep · ws_collect 로 먼저 찾는다. 없으면 "없다"고 답하고 가장 가까운 관련 내용을 덧붙인다.
E. 관례 · 구조 ("어디에 · 어떤 이름 · 형식으로"): ws_overview · ws_tree 로 실제 폴더 패턴을 보고 대표 파일 2~3개로 확인한다.

공통:
- 경로는 vibefs 결과에 나온 것을 그대로 복사해 read_file(Path, StartLine, EndLine)에 쓴다. 기억으로 다시 타이핑하거나
  파일 이름을 추측하지 마라. `루트이름/하위 경로` 형식도 받아 준다. 거부되면 사유에 나온 후보 경로로 다시 시도한다.
- 동일본(ws_duplicates · 목록의 '동일본')은 하나만 읽는다. 긴 파일은 ws_outline · ws_grep 으로 구간을 고른다
  (범위를 비우면 앞 800줄만 보인다 — 그 뒤의 내용은 없는 게 아니라 안 보인 것이다).
- 답의 근거는 실제로 read_file 로 읽은 줄 안에서만 말한다. 읽지 않은 내용 · 날짜 · 수치를 지어내지 마라.
- 인용은 [제목](vdoc:resource/<resourceId>) (L시작-끝). resourceId 는 vibefs 결과에 나온 `file_…` 값만 쓴다.
  경로를 id 자리에 넣지 마라 (vdoc:resource/폴더/파일.md ✗). id 를 모르면 링크 없이 `루트이름/하위 경로` (L시작-끝).
- 읽을 파일이 20개를 넘으면 invoke_subagent 로 폴더별로 나눠 읽혀도 된다 (서브에이전트에게도 read_file 만 쓰도록 지시).
- 터미널 · 파일 쓰기는 차단된다. 원본 자료는 고치지 않는다 — 문서 변경은 워크스페이스 도구(stage)로 제안한다.
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
_ALWAYS_FULL = ("scope", "resource-mount")


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
