"""Phase 2 서식 추천기 (키워드 규칙 엔진).

노드 제목 · 요약 · 튜닝 지시문의 키워드로 서식 블록을 고른다. 규칙은 `TEMPLATE_RULES` 표 한 곳에
있고 위에서부터 처음 맞는 규칙을 쓴다. LLM 엔진으로 바꿀 때는 `TemplateRecommenderPort` 를
구현한 다른 어댑터를 컨테이너에서 갈아 끼운다.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.storage import STAGING_PREFIX, new_id

from ..models import StagedAiDiffItem, StagedPhase, StagedTargetKind, StorylineNodeInput

MAX_NODES = 5


@dataclass(frozen=True)
class TemplateRule:
    template_id: str
    keywords: tuple[str, ...]
    rationale: str

    def matches(self, text: str) -> bool:
        return any(keyword in text for keyword in self.keywords)


TEMPLATE_RULES: tuple[TemplateRule, ...] = (
    TemplateRule(
        "structured-table",
        ("표", "테이블", "매트릭스", "정산", "단가", "sla", "table"),
        "다중 행·열 수치 및 SLA 비교에 최적화된 그리드 테이블 블록",
    ),
    TemplateRule(
        "composite-form-frame",
        ("결재", "심사", "양식", "프레임", "공문", "audit"),
        "한국형 공공/엔터프라이즈 복합 테두리 양식 프레임",
    ),
    TemplateRule(
        "columns-grid",
        ("비교", "2단", "병행", "컬럼", "컷오버", "grid"),
        "좌우 대조 및 다단 레이아웃 비교 그리드 블록",
    ),
    TemplateRule(
        "cover-banner",
        ("표지", "배너", "제안", "cover"),
        "타이틀 헤드라인 및 작성/수신 메타데이터 표지 블록",
    ),
)
FALLBACK_RULE = TemplateRule("section-block", (), "소제목 + 리치 텍스트 본문 슬롯 결합 표준 섹션 블록")


def choose_template(text: str) -> TemplateRule:
    lowered = text.lower()
    return next((rule for rule in TEMPLATE_RULES if rule.matches(lowered)), FALLBACK_RULE)


class KeywordTemplateRecommender:
    engine_name = "rule/keyword-template-v1"

    def recommend_templates(
        self,
        *,
        project_id: str,
        doc_id: str,
        nodes: tuple[StorylineNodeInput, ...],
        tuning_prompt: str,
    ) -> list[StagedAiDiffItem]:
        diffs: list[StagedAiDiffItem] = []
        for node in nodes[:MAX_NODES]:
            rule = choose_template(f"{node.title} {node.summary} {tuning_prompt}")
            previous = node.recommended_template_id or FALLBACK_RULE.template_id
            diffs.append(
                StagedAiDiffItem(
                    diff_id=new_id(STAGING_PREFIX),
                    phase=StagedPhase.TEMPLATING,
                    target_kind=StagedTargetKind.TEMPLATE_BLOCK,
                    target_id=node.node_id,
                    title=f"[Phase 2 서식 매핑] {node.title}",
                    before_summary=f"기존 서식: {previous}",
                    after_summary=f"추천 서식: {rule.template_id} ({rule.rationale})",
                    payload={
                        "operation": "assign_template_block",
                        "projectId": project_id,
                        "docId": doc_id,
                        "nodeId": node.node_id,
                        "templateKind": rule.template_id,
                        "rationale": rule.rationale,
                    },
                )
            )
        return diffs
