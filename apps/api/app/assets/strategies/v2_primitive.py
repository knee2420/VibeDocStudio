"""Variant B (`v2-primitive`) Backend AI Strategy — Import · Apply · Select.

표(table)에 억지로 우겨넣지 않고, 글 중심 폼(prose-form: 무테두리 KV · 계층번호 산문 · 구분자 · 서명란)과
표 중심 폼(grid-form), 하이브리드(hybrid)를 조합 가능한 7대 프리미티브(`VDocAssetV2Spec`)로 추출·적용·추천한다.
"""
from __future__ import annotations

import re
from typing import Any

from ..schemas import (
    AssetApplyPreviewRequest,
    AssetApplyPreviewResponse,
    AssetNuanceDto,
    AssetParseFromRefRequest,
    AssetParseResponse,
    AssetRecommendHitDto,
    AssetRecommendSelectRequest,
    AssetRecommendSelectResponse,
)

V2_PRIMITIVES_PRIMER = """
[VibeDoc Asset Schema v2 — 조합 가능한 프리미티브 정본]
- flowMode: "prose-form" (글로만 된 법률·공문·계약 서면) | "grid-form" (표 중심 서식) | "hybrid" (이미지+속성+본문)
- zones: { header?: Node[], body: Node[], footer?: Node[] }
- 프리미티브 종류:
  1) header-band   : { id, type:"header-band", left, right }
  2) title-block   : { id, type:"title-block", fixedText, traits:{ align:"center", letterSpacing:"wide"|"normal" } }
  3) kv-block      : { id, type:"kv-block", traits:{ border:"none"|"underline"|"grid", labelWidth:"120px" }, rows:[{label,value}] }
  4) prose         : { id, type:"prose", fixedText|templateText, traits:{ firstLineIndent:true, align:"justify" } }
  5) divider-band  : { id, type:"divider-band", fixedText:"- 아  래 -", traits:{ variant:"spread-text"|"line" } }
  6) clause-tree   : { id, type:"clause-tree", repeatable:true, traits:{ numberingScheme:"legal-kr"|"article-kr"|"official-kr"|"decimal", hangingIndent:true }, items:[{title,lead,children:[{text}]}] }
  7) table-grid    : { id, type:"table-grid", tableDsl:[...] }
  8) signoff-block : { id, type:"signoff-block", rows:[{label,value}] }
- fields: [{ id, label, type:"string"|"date"|"currency"|"party"|"rich-text"|"image"|"list", required, repeatable, evidenceHint }]
- 중요 원칙: 표 격자가 없는 법률 서면·계약서·공문은 절대 table-grid 로 변환하지 말고 kv-block(border:"none") + clause-tree 로 표현하라!
""".strip()

_PROSE_LEGAL_RE = re.compile(r"상고|이유서|소장|계약서|내용증명|위임장|진술서|제\d+조|원고|피고|귀중|아\s*래")
_CONTRACT_RE = re.compile(r"계약서|제\d+조|위탁|수탁")


def build_v2_ref_fallback(req: AssetParseFromRefRequest) -> AssetParseResponse:
    """오프라인/LLM 폴백 시 레퍼런스 텍스트에서 v2 프리미티브 정본을 결정적으로 추출한다."""
    joined = f"{req.refTitle} {req.extractedText} {' '.join(req.frameLabels)}"
    is_prose = bool(_PROSE_LEGAL_RE.search(joined))
    is_contract = bool(_CONTRACT_RE.search(joined))

    if is_prose:
        v2_spec: dict[str, Any] = {
            "flowMode": "prose-form",
            "zones": {
                "header": [
                    {"id": "h-band", "type": "header-band", "left": f"[서식 예] {req.refTitle}", "right": "[기관 배지]"},
                    {"id": "h-ttl", "type": "title-block", "fixedText": req.refTitle, "traits": {"align": "center", "letterSpacing": "wide"}},
                    {
                        "id": "h-kv",
                        "type": "kv-block",
                        "traits": {"border": "underline" if is_contract else "none", "labelWidth": "120px"},
                        "rows": (
                            [
                                {"label": "계약건명", "value": "{{contract_title}}"},
                                {"label": "갑(위탁인)", "value": "{{party_a}}"},
                                {"label": "을(수탁인)", "value": "{{party_b}}"},
                            ]
                            if is_contract
                            else [
                                {"label": "사 건", "value": "{{case_no}} {{case_title}}"},
                                {"label": "원 고(상고인)", "value": "{{party_a}}"},
                                {"label": "피 고(피상고인)", "value": "{{party_b}}"},
                            ]
                        ),
                    },
                    {"id": "h-div", "type": "divider-band", "fixedText": "- 아  래 -", "traits": {"variant": "spread-text", "align": "center"}},
                ],
                "body": [
                    {
                        "id": "b-clause",
                        "type": "clause-tree",
                        "repeatable": True,
                        "traits": {"numberingScheme": "article-kr" if is_contract else "legal-kr", "hangingIndent": True, "align": "justify"},
                        "items": [
                            {
                                "title": "(목적)" if is_contract else "상고이유 제1점",
                                "lead": "{{main_summary}}",
                                "children": [{"text": "{{detail_argument_1}}"}],
                            }
                        ],
                    }
                ],
                "footer": [
                    {
                        "id": "f-sign",
                        "type": "signoff-block",
                        "rows": [
                            {"label": "", "value": "{{submit_date}}"},
                            {"label": "작성인", "value": "{{party_a}} (인)"},
                            {"label": "", "value": "{{recipient}} 귀중"},
                        ],
                    }
                ],
            },
            "fields": [
                {"id": "case_no", "label": "계약건명" if is_contract else "사건번호", "type": "string", "required": True, "evidenceHint": "원천 문서 상단 식별번호"},
                {"id": "party_a", "label": "갑(위탁인)" if is_contract else "원고(상고인)", "type": "party", "required": True},
                {"id": "party_b", "label": "을(수탁인)" if is_contract else "피고(피상고인)", "type": "party", "required": True},
                {"id": "main_summary", "label": "핵심 요지", "type": "rich-text", "required": True, "repeatable": True, "evidenceHint": "원심판결문/과업지시서 (<<resource:...>>)"},
            ],
        }
        return AssetParseResponse(
            schemaVersion="v2",
            title=f"{req.refTitle} (v2 글 중심 폼)",
            assetKind=req.assetKind,
            category="A4 법률 · 산문 서식",
            tags=["v2-primitive", "prose-form", "무테두리KV", "계층번호"],
            nuance=AssetNuanceDto(
                summary=f"'{req.refTitle}'에서 표를 쓰지 않고 무테두리 KV + 계층 번호 산문 트리로 추출한 v2 에셋입니다.",
                structureRules=["kv-block(border:none)으로 메타 정렬", "clause-tree로 반복 조항·내어쓰기 구성"],
                adaptationHints=["쟁점/조항 수에 따라 clause-tree 반복 확장"],
            ),
            outlineDsl=[
                f"<<view:section>> {req.refTitle}",
                f"  <<view:title>> {req.refTitle}",
                "  사 건 :: {{case_no}} {{case_title}}",
                "  - 아  래 -",
                "  1. {{핵심 요지}}",
                "    가. {{세부 논거}}",
            ],
            v2Spec=v2_spec,
            engine="fallback",
        )

    # Default grid-form fallback
    v2_spec = {
        "flowMode": "hybrid" if req.assetKind == "blog-section" else "grid-form",
        "zones": {
            "header": [{"id": "g-ttl", "type": "title-block", "fixedText": req.refTitle, "traits": {"align": "center"}}],
            "body": [
                {
                    "id": "g-tbl",
                    "type": "table-grid",
                    "tableDsl": [
                        f"<<view:table:header>> {req.refTitle}",
                        "  {{구분}} | {{항목}}",
                        "  {{분류 1}} | {{세부 내용}}",
                    ],
                }
            ],
        },
        "fields": [{"id": "items", "label": "주요 항목", "type": "list", "required": True, "repeatable": True}],
    }
    return AssetParseResponse(
        schemaVersion="v2",
        title=f"{req.refTitle} (v2 구조 에셋)",
        assetKind=req.assetKind,
        category="A4 표 · 서식" if req.assetKind != "blog-section" else "블로그 · 웹 콘텐츠",
        tags=["v2-primitive", v2_spec["flowMode"], req.assetKind],
        nuance=AssetNuanceDto(
            summary=f"'{req.refTitle}'에서 추출한 v2({v2_spec['flowMode']}) 구조 에셋입니다.",
            structureRules=["zones + fields 계약 기반 구조 유지"],
        ),
        outlineDsl=[f"<<view:section>> {req.refTitle}", f"  <<view:title>> {req.refTitle}", "  <<view:table:header>> 세부 항목", "    {{구분}} | {{항목}}"],
        v2Spec=v2_spec,
        engine="fallback",
    )


def apply_v2_fallback(req: AssetApplyPreviewRequest) -> AssetApplyPreviewResponse:
    """v2 prose-form / grid-form 에 사용자 데이터와 `<<resource:...>>` 근거를 보존해 적용한다."""
    spec = req.assetV2Spec or {}
    flow_mode = str(spec.get("flowMode") or "")
    lines = [ln.strip() for ln in (req.userOutlineDsl or req.userPlainText.splitlines()) if ln.strip()]
    if flow_mode == "prose-form":
        doc_title = req.documentTitle.strip() or req.assetTitle
        kv_lines: list[str] = []
        body_items: list[str] = []
        for ln in lines:
            if "::" in ln or (":" in ln and not ln.startswith("<<")):
                sep = "::" if "::" in ln else ":"
                k, _, v = ln.partition(sep)
                if len(k.strip()) <= 16:
                    kv_lines.append(f"  {k.strip()} :: {v.strip()}")
                    continue
            body_items.append(ln)
        dsl = [
            f"<<view:section>> {doc_title}",
            f"  <<view:title>> {doc_title}",
            *(kv_lines or ["  사 건 :: {{사건번호}} {{사건명}}"]),
            "  - 아  래 -",
        ]
        if body_items:
            dsl.append("  1. 핵심 주장 및 이유")
            kr = ["가", "나", "다", "라", "마", "바", "사", "아"]
            for idx, item in enumerate(body_items):
                if item.startswith("<<resource:"):
                    dsl.append(f"      {item}")
                else:
                    prefix = kr[idx] if idx < len(kr) else str(idx + 1)
                    dsl.append(f"    {prefix}. {item}")
        return AssetApplyPreviewResponse(
            schemaVersion="v2",
            outlineDsl=dsl,
            rationale=f"v2 글 중심 폼('{req.assetTitle}') 규칙에 따라 표 없이 무테두리 KV + 계층번호 본문으로 매핑했습니다.",
            engine="fallback",
        )
    # Non-prose fallback: reuse outlineDsl with sequential placeholder fill
    return AssetApplyPreviewResponse(
        schemaVersion="v2",
        outlineDsl=list(req.assetOutlineDsl),
        rationale=f"v2 에셋('{req.assetTitle}') 골격을 유지해 미리보기를 구성했습니다.",
        engine="fallback",
    )


def recommend_select_heuristic(req: AssetRecommendSelectRequest) -> AssetRecommendSelectResponse:
    """3단계(Select): 쿼리 의도(글 중심 폼 vs 표 중심 폼 vs 하이브리드 + 키워드)로 에셋 추천 순위를 계산한다."""
    q = req.query.strip().lower()
    tokens = [t for t in re.split(r"[\s,./()\[\]{}|:;\-_]+", q) if len(t) >= 2]
    wants_prose = bool(re.search(r"서면|법원|소장|상고|이유서|내용증명|계약서|조항|공문|진술서|위임장|독촉|글로", q))
    wants_grid = bool(re.search(r"표|증명서|실적|견적|명세|계획표|체크리스트|비교표", q))
    wants_blog = bool(re.search(r"블로그|리뷰|후기|여행|스팟|포스팅", q))

    hits: list[AssetRecommendHitDto] = []
    for item in req.catalog:
        hay = f"{item.title} {item.category} {item.summary}".lower()
        score = 0.0
        reasons: list[str] = []
        if req.schemaVersion == "v2":
            if wants_prose and "prose-form" in hay:
                score += 4.0
                reasons.append("글 중심 폼(prose-form) 매칭")
            if wants_grid and "grid-form" in hay:
                score += 4.0
                reasons.append("표 중심 폼(grid-form) 매칭")
            if wants_blog and "hybrid" in hay:
                score += 4.0
                reasons.append("하이브리드 콘텐츠 매칭")
        for tok in tokens:
            if tok in item.title.lower():
                score += 3.0
                reasons.append(f"제목 일치('{tok}')")
            elif tok in hay:
                score += 1.5
                reasons.append(f"구조/필드 일치('{tok}')")
        if score > 0:
            hits.append(AssetRecommendHitDto(assetId=item.assetId, score=score, reasons=list(dict.fromkeys(reasons))[:4]))

    hits.sort(key=lambda h: h.score, reverse=True)
    return AssetRecommendSelectResponse(
        schemaVersion=req.schemaVersion,
        engine="heuristic",
        hits=hits[:5],
    )
