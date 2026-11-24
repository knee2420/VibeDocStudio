"""AI-Native Asset Parsing & Structural Nuance Compilation Use Cases."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.llm.policy import RuntimeExecutionPolicy
from app.llm.ports import OneShotRunner

from .schemas import (
    AssetApplyPreviewRequest,
    AssetApplyPreviewResponse,
    AssetNuanceDto,
    AssetParseFromBlockRequest,
    AssetParseFromRefRequest,
    AssetParseResponse,
)

logger = logging.getLogger(__name__)

_SYNTAX_PRIMER = """
[VibeDoc 표준 .outline 구조 문법 — 반드시 이 기호만 사용할 것]
- 섹션/페이지: `<<view:section>> 섹션명` 또는 `<<view:section:hero|tip|spot|outro>> 섹션명`
- 서식 제목: `<<view:title>> 제목`
- 표 (좌측 라벨 2열/다열 폼): `<<view:table>> 표 제목`
- 표 (1행 상단 헤더): `<<view:table:header>> 표 제목`
- 표 내부 기호: `|` 열구분, `[-]` 빈 기입칸, `[<]` 왼쪽 병합(colSpan), `[^]` 위쪽 병합(rowSpan), 들여쓰기=1열 세로병합(rowSpan), `분류 | <<cell>>` = 복합 컨테이너 셀(하위에 <<view:list>>, [img], [img] | [img] 중첩 가능)
- 목록: `<<view:list>>` 하위에 2칸 들여쓰기로 항목 나열
- 인용/정보카드: `> 제목` (하위에 `키 :: 값` 메타 행)
- 강조 바: `! 강조 문구`
- 고지 배지: `[embed:disclosure | 안내 문구]`
- 이미지 / 2단 스트립: `[img:설명]` / `[img:좌측] | [img:우측]`
- CTA 버튼: `[cta:버튼 라벨 -> https://example.com]`
- 인라인 강조: `==강조할 키워드==`
- 구분선: `---`
- 들여쓰기는 반드시 2칸 스페이스 단위 사용.
""".strip()


def _extract_json_object(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _abstract_line_placeholders(line: str, idx: int) -> str:
    stripped = line.strip()
    indent = line[: len(line) - len(line.lstrip(" "))]
    if not stripped:
        return line
    if stripped.startswith("<<view:"):
        m = re.match(r"^(<<view:[^>]+>>)\s*(.*)$", stripped)
        if m:
            tag, label = m.group(1), m.group(2).strip()
            return f"{indent}{tag} {{{{{label or '제목'}}}}}" if label else f"{indent}{tag}"
    if stripped in ("---", "<<cell>>", "<<col>>", "<<row>>"):
        return line
    if " | " in stripped:
        parts = [p.strip() for p in stripped.split("|")]
        abstracted = []
        for p_idx, part in enumerate(parts):
            if part in ("[-]", "[<]", "[^]", "<<cell>>"):
                abstracted.append(part)
            elif part.startswith("[img:"):
                abstracted.append(f"[img:{{{{이미지 {idx}-{p_idx + 1}}}}}]")
            else:
                abstracted.append(f"{{{{{part[:18] or f'항목 {p_idx + 1}'}}}}}")
        return f"{indent}{' | '.join(abstracted)}"
    if stripped.startswith("[img:"):
        return f"{indent}[img:{{{{대표 이미지 {idx}}}}}]"
    if stripped.startswith("[cta:"):
        return f"{indent}[cta:{{{{액션 버튼 라벨}}}} -> https://example.com]"
    if stripped.startswith("[embed:"):
        return f"{indent}[embed:disclosure | {{{{상단 안내 문구}}}}]"
    if stripped.startswith("> "):
        return f"{indent}> {{{{{stripped[2:].strip()[:24] or '핵심 제목'}}}}}"
    if stripped.startswith("! "):
        return f"{indent}! {{{{{stripped[2:].strip()[:24] or '핵심 강조 포인트'}}}}}"
    if "::" in stripped:
        k, v = stripped.split("::", 1)
        return f"{indent}{{{{{k.strip() or '속성'}}}}} :: {{{{{v.strip()[:24] or '값'}}}}}"
    return f"{indent}{{{{{stripped[:28]}}}}}"


def _extract_user_items(user_dsl: list[str], user_plain: str) -> tuple[list[tuple[str, str]], list[str]]:
    """사용자 원문에서 Key-Value 쌍과 일반 항목 텍스트를 추출한다 (폴백 매핑용)."""
    kv_pairs: list[tuple[str, str]] = []
    plain_items: list[str] = []
    source_lines = user_dsl if user_dsl else [ln for ln in user_plain.splitlines() if ln.strip()]

    for raw in source_lines:
        s = raw.strip()
        if not s or s.startswith("<<") or s == "---":
            continue
        if "|" in s and not s.startswith("["):
            parts = [p.strip() for p in s.split("|") if p.strip() and p.strip() not in ("<<cell>>", "[<]", "[^]")]
            if len(parts) >= 2:
                kv_pairs.append((parts[0], " / ".join(parts[1:])))
                continue
        if "::" in s:
            k, v = s.split("::", 1)
            kv_pairs.append((k.strip(), v.strip()))
            continue
        cleaned = re.sub(r"^[>!•\-*]\s*", "", s).strip()
        if cleaned and not cleaned.startswith("["):
            plain_items.append(cleaned)
    return kv_pairs, plain_items


def _fallback_apply_dsl(req: AssetApplyPreviewRequest) -> AssetApplyPreviewResponse:
    """외부 LLM 비활성/오프라인 환경에서 에셋 구조 골격에 사용자 데이터를 지능적으로 이식하는 폴백."""
    kv_pairs, plain_items = _extract_user_items(req.userOutlineDsl, req.userPlainText)
    doc_title = req.documentTitle.strip() or req.assetTitle
    feedback_note = f" (피드백 반영: {req.feedback})" if req.feedback else ""

    if req.mode == "insert" and not kv_pairs and not plain_items:
        return AssetApplyPreviewResponse(
            outlineDsl=list(req.assetOutlineDsl),
            rationale=f"'{req.assetTitle}' 구조 뼈대를 현재 위치에 삽입했습니다.{feedback_note}",
            engine="fallback",
        )

    # Table asset projection
    if req.assetKind == "table":
        has_rich_cell = any("<<cell>>" in ln for ln in req.assetOutlineDsl)
        if has_rich_cell:
            dsl = [f"<<view:table:header>> {doc_title}", "  구분 | 항 목"]
            if kv_pairs:
                for k, v in kv_pairs:
                    dsl.append(f"  {k} | <<cell>>")
                    dsl.append("    <<view:list>>")
                    for sub in [x.strip() for x in re.split(r"[,/]", v) if x.strip()] or [v]:
                        dsl.append(f"      {sub}")
            elif plain_items:
                mid = max(1, (len(plain_items) + 1) // 2)
                groups = [("핵심 항목", plain_items[:mid]), ("세부 내용", plain_items[mid:])]
                for g_label, g_items in groups:
                    if not g_items:
                        continue
                    dsl.append(f"  {g_label} | <<cell>>")
                    dsl.append("    <<view:list>>")
                    for item in g_items:
                        dsl.append(f"      {item}")
            else:
                dsl = list(req.assetOutlineDsl)
            if req.feedback and ("비고" in req.feedback or "열" in req.feedback):
                dsl[1] = "  구분 | 항 목 | 비고"
            return AssetApplyPreviewResponse(
                outlineDsl=dsl,
                rationale=f"사용자 데이터를 '{req.assetTitle}'의 좌측 분류 + 우측 복합 셀 구조로 재구성했습니다.{feedback_note}",
                engine="fallback",
            )

        # 2-column meta KV form table
        dsl = [f"<<view:table>> {doc_title}"]
        if kv_pairs:
            for k, v in kv_pairs:
                dsl.append(f"  {k} | {v or '[-]'}")
        elif plain_items:
            for idx, item in enumerate(plain_items, 1):
                dsl.append(f"  항목 {idx} | {item}")
        else:
            dsl = list(req.assetOutlineDsl)
        if req.feedback and "비고" in req.feedback:
            dsl.append("  비고 | [-]")
        return AssetApplyPreviewResponse(
            outlineDsl=dsl,
            rationale=f"사용자 데이터를 '{req.assetTitle}'의 2열 메타 폼 표 구조로 정리했습니다.{feedback_note}",
            engine="fallback",
        )

    # Replace {{...}} placeholders sequentially with user items while preserving exact asset structure
    pool = [f"{k}: {v}" for k, v in kv_pairs] + plain_items
    pool_idx = 0
    out_lines: list[str] = []
    for raw in req.assetOutlineDsl:
        def _repl(match: re.Match[str]) -> str:
            nonlocal pool_idx
            placeholder = match.group(1)
            if "제목" in placeholder and doc_title:
                return doc_title
            if pool_idx < len(pool):
                val = pool[pool_idx]
                pool_idx += 1
                return val
            return placeholder

        out_lines.append(re.sub(r"\{\{([^}]+)\}\}", _repl, raw))

    return AssetApplyPreviewResponse(
        outlineDsl=out_lines,
        rationale=f"'{req.assetTitle}' 구조에 현재 문서 데이터를 매핑해 느낌 보기를 구성했습니다.{feedback_note}",
        engine="fallback",
    )


class AssetAiService:
    """AI-Native 에셋 파싱 및 뉘앙스 적용 유스케이스."""

    def __init__(
        self,
        *,
        policy: RuntimeExecutionPolicy,
        external_llm_enabled: bool,
        one_shot: OneShotRunner,
    ) -> None:
        self._policy = policy
        self._external_llm_enabled = external_llm_enabled
        self._one_shot = one_shot

    def _run_llm_json(self, prompt: str, timeout_seconds: int = 90) -> dict[str, Any] | None:
        if not self._external_llm_enabled:
            return None
        try:
            res = self._one_shot(
                prompt,
                executable=self._policy.agent_cli_bin or "agy",
                model=self._policy.agent_cli_model,
                timeout_seconds=timeout_seconds,
            )
            if not res.ok or not res.text:
                logger.warning("Asset AI one-shot failed: %s", res.error)
                return None
            return _extract_json_object(res.text)
        except Exception as exc:  # pragma: no cover - defensive runtime guard
            logger.warning("Asset AI one-shot exception: %s", exc)
            return None

    def parse_from_block(self, req: AssetParseFromBlockRequest) -> AssetParseResponse:
        prompt = f"""
너는 VibeDocStudio의 구조 에셋 파싱 전문가다.
아래 사용자가 완성한 블록의 `.outline` 원문에서 구체적인 도메인 데이터만 `{{{{자리표시자}}}}`로 추상화하여,
어떤 주제에도 재사용할 수 있는 구조 에셋 메타와 `outlineDsl`을 JSON으로만 출력하라.

{_SYNTAX_PRIMER}

[입력 정보]
- assetKind: {req.assetKind}
- targetKind: {req.targetKind}
- 기존 제목: {req.title}
- 추가 맥락: {req.contextHint or '없음'}
- 원본 outlineDsl:
{chr(10).join(req.outlineDsl)}

[출력 JSON 스키마 — 코드펜스 없이 순수 JSON 객체만]
{{
  "title": "재사용 가능한 에셋 이름 (한국어, 간결하게)",
  "category": "A4 공문 · 서식 | 블로그 · 매거진 | 표 · 서식 | 구조 요소 중 하나",
  "tags": ["태그1", "태그2", "태그3"],
  "nuance": {{
    "summary": "이 구조가 주는 뉘앙스와 활용 용도 1~2문장",
    "structureRules": ["구조 규칙 1", "구조 규칙 2"],
    "adaptationHints": ["데이터 항목 수가 다를 때 적응 힌트"]
  }},
  "outlineDsl": ["추상화된 .outline 줄 1", "  줄 2"]
}}
""".strip()

        parsed = self._run_llm_json(prompt, timeout_seconds=60)
        if parsed and isinstance(parsed.get("outlineDsl"), list) and len(parsed["outlineDsl"]) > 0:
            nuance_raw = parsed.get("nuance") or {}
            return AssetParseResponse(
                title=str(parsed.get("title") or req.title or "추출된 구조 에셋"),
                assetKind=req.assetKind,
                category=str(parsed.get("category") or "표 · 서식"),
                tags=[str(t) for t in (parsed.get("tags") or [req.assetKind])][:6],
                nuance=AssetNuanceDto(
                    summary=str(nuance_raw.get("summary") or "재사용 가능한 구조 에셋입니다."),
                    structureRules=[str(r) for r in (nuance_raw.get("structureRules") or [])],
                    visualRules=[str(r) for r in (nuance_raw.get("visualRules") or [])],
                    adaptationHints=[str(r) for r in (nuance_raw.get("adaptationHints") or [])],
                ),
                outlineDsl=[str(ln) for ln in parsed["outlineDsl"]],
                engine="llm",
            )

        # Deterministic clean abstraction fallback
        abstracted_dsl = [
            _abstract_line_placeholders(ln, i + 1) for i, ln in enumerate(req.outlineDsl)
        ]
        default_cat = (
            "A4 공문 · 서식"
            if req.assetKind == "a4-page"
            else "블로그 · 매거진"
            if req.assetKind == "blog-section"
            else "표 · 서식"
        )
        return AssetParseResponse(
            title=req.title.strip() or f"{default_cat} 구조 에셋",
            assetKind=req.assetKind,
            category=default_cat,
            tags=[req.assetKind, req.targetKind, "에셋"],
            nuance=AssetNuanceDto(
                summary=f"'{req.title or '선택 블록'}'의 구조 골격을 추상화한 재사용 에셋입니다. 항목명과 행 수를 바꿔 다른 주제에도 적용할 수 있습니다.",
                structureRules=[
                    "원본 블록의 계층·열 분할·복합 셀 구조를 보존하고 구체 내용만 사용자 데이터로 치환",
                ],
                adaptationHints=[
                    "사용자 데이터 항목 수에 따라 행 또는 하위 목록을 유연하게 증감",
                ],
            ),
            outlineDsl=abstracted_dsl,
            engine="fallback",
        )

    def parse_from_ref(self, req: AssetParseFromRefRequest) -> AssetParseResponse:
        prompt = f"""
너는 VibeDocStudio의 레퍼런스 구조 역공학 AI다.
아래 `.ref` 레퍼런스 문서의 텍스트와 프레임 정보를 바탕으로, 재사용 가능한 표준 `.outline` 구조 에셋 JSON을 생성하라.

{_SYNTAX_PRIMER}

[레퍼런스 정보]
- 제목: {req.refTitle}
- 목표 assetKind: {req.assetKind}
- 프레임 목록: {', '.join(req.frameLabels[:8]) or '없음'}
- 추출 텍스트 발췌:
{req.extractedText[:2400]}

[출력 JSON 스키마 — 순수 JSON 객체만]
{{
  "title": "에셋 이름",
  "category": "A4 공문 · 서식 | 블로그 · 매거진 | 표 · 서식",
  "tags": ["태그1", "태그2"],
  "nuance": {{
    "summary": "양식 뉘앙스 요약",
    "structureRules": ["구조 규칙 1", "구조 규칙 2"],
    "adaptationHints": ["적응 힌트"]
  }},
  "outlineDsl": ["표준 .outline 문법 줄 목록"]
}}
""".strip()

        parsed = self._run_llm_json(prompt, timeout_seconds=75)
        if parsed and isinstance(parsed.get("outlineDsl"), list) and len(parsed["outlineDsl"]) > 0:
            nuance_raw = parsed.get("nuance") or {}
            return AssetParseResponse(
                title=str(parsed.get("title") or f"{req.refTitle} 구조 에셋"),
                assetKind=req.assetKind,
                category=str(parsed.get("category") or "A4 공문 · 서식"),
                tags=[str(t) for t in (parsed.get("tags") or [req.assetKind, "ref추출"])][:6],
                nuance=AssetNuanceDto(
                    summary=str(nuance_raw.get("summary") or f"{req.refTitle}에서 추출한 구조 에셋"),
                    structureRules=[str(r) for r in (nuance_raw.get("structureRules") or [])],
                    adaptationHints=[str(r) for r in (nuance_raw.get("adaptationHints") or [])],
                ),
                outlineDsl=[str(ln) for ln in parsed["outlineDsl"]],
                engine="llm",
            )

        # Clean fallback extraction from `.ref` text
        lines = [ln.strip() for ln in req.extractedText.splitlines() if ln.strip()][:12]
        if req.assetKind == "blog-section":
            dsl = [
                f"<<view:section:spot>> {{{{{req.refTitle}}}}}",
                "  [img:{{대표 리드 이미지}}]",
                f"  > {{{{{lines[0][:28] if lines else req.refTitle}}}}}",
                "    {{핵심 정보 1}} :: {{값 1}}",
                "    {{핵심 정보 2}} :: {{값 2}}",
                f"  {{{{{lines[1][:60] if len(lines) > 1 else '핵심 본문 요약'}}}}}",
                "  [img:{{세부 컷 1}}] | [img:{{세부 컷 2}}]",
            ]
            cat = "블로그 · 매거진"
        elif req.assetKind == "table":
            dsl = [
                f"<<view:table:header>> {{{{{req.refTitle}}}}}",
                "  {{구분}} | {{항목}}",
                "  {{분류 1}} | <<cell>>",
                "    <<view:list>>",
                f"      {{{{{lines[0][:30] if lines else '세부 항목 1'}}}}}",
                f"      {{{{{lines[1][:30] if len(lines) > 1 else '세부 항목 2'}}}}}",
            ]
            cat = "표 · 서식"
        else:
            dsl = [
                f"<<view:section>> {{{{{req.refTitle}}}}}",
                f"  <<view:title>> {{{{{req.refTitle}}}}}",
                "  <<view:table>> 기본 정보",
                "    {{항목 1}} | [-]",
                "    {{항목 2}} | [-]",
                "  <<view:table:header>> 세부 내용",
                "    {{구분}} | {{내용}}",
                f"    {{{{분류 1}}}} | {{{{{lines[0][:40] if lines else '세부 내용'}}}}}",
            ]
            cat = "A4 공문 · 서식"

        return AssetParseResponse(
            title=f"{req.refTitle} 구조 에셋",
            assetKind=req.assetKind,
            category=cat,
            tags=[req.assetKind, "ref추출"],
            nuance=AssetNuanceDto(
                summary=f"레퍼런스 '{req.refTitle}'에서 추출한 구조 골격 에셋입니다.",
                structureRules=[
                    "레퍼런스 문서의 핵심 구획 흐름을 표준 .outline 기호로 정규화",
                ],
                adaptationHints=[
                    "실제 적용 시 항목명과 행 수는 대상 문서 데이터에 맞춰 자유롭게 재구성",
                ],
            ),
            outlineDsl=dsl,
            engine="fallback",
        )

    def apply_preview(self, req: AssetApplyPreviewRequest) -> AssetApplyPreviewResponse:
        feedback_block = (
            "\n".join(f"- {fb}" for fb in [*req.feedbackHistory, *([req.feedback] if req.feedback else [])])
            or "없음"
        )
        prompt = f"""
너는 VibeDocStudio의 AI 구조 에셋 컴파일러다.
사용자의 현재 데이터(항목명·칸 수·주제가 에셋 예시와 달라도 됨)를 100% 보존하면서,
선택한 에셋이 가진 **구조적 뉘앙스와 구성 논리**로 재구성한 표준 `.outline` DSL을 JSON으로 출력하라.

{_SYNTAX_PRIMER}

[적용 모드]: {req.mode} (문서 프로필: {req.profileId}, 문서 제목: {req.documentTitle})

[선택한 에셋]
- 이름: {req.assetTitle} ({req.assetKind})
- 뉘앙스 요약: {req.assetNuance.summary}
- 구조 규칙:
{chr(10).join(f'- {r}' for r in req.assetNuance.structureRules)}
- 적응 힌트:
{chr(10).join(f'- {h}' for h in req.assetNuance.adaptationHints)}
- 에셋 표준 .outline 구조 예시:
{chr(10).join(req.assetOutlineDsl)}

[사용자의 현재 데이터]
- 현재 outlineDsl:
{chr(10).join(req.userOutlineDsl) or '(비어 있음 — 문서 제목과 맥락에 맞춰 에셋 뼈대를 채워라)'}
- 현재 본문 텍스트:
{req.userPlainText[:1600] or '(없음)'}

[사용자 추가 피드백]
{feedback_block}

[중요 제약]
1. 사용자의 실제 데이터 내용(사업명, 날짜, 항목 등)을 임의로 삭제하지 말 것.
2. 에셋의 예시 자리표시자(`{{{{...}}}}`)는 사용자 데이터에 맞게 실제 항목명으로 바꿀 것 (값이 없는 기입칸은 `[-]`).
3. 출력은 반드시 아래 순수 JSON 객체 하나만 반환할 것.

{{
  "outlineDsl": ["표준 .outline 문법 줄 1", "  줄 2", ...],
  "rationale": "어떤 뉘앙스를 어떻게 재구성했는지 한국어 1문장 요약"
}}
""".strip()

        parsed = self._run_llm_json(prompt, timeout_seconds=75)
        if parsed and isinstance(parsed.get("outlineDsl"), list) and len(parsed["outlineDsl"]) > 0:
            lines = [str(ln) for ln in parsed["outlineDsl"] if str(ln).strip()]
            if lines:
                return AssetApplyPreviewResponse(
                    outlineDsl=lines,
                    rationale=str(parsed.get("rationale") or f"'{req.assetTitle}' 뉘앙스로 재구성했습니다."),
                    engine="llm",
                )

        return _fallback_apply_dsl(req)
