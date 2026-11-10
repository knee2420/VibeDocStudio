"""Phase 2 서식 추천기 (키워드 규칙 엔진).

노드 제목 · 요약 · 튜닝 지시문의 키워드로 서식 블록을 고른다. 규칙은 `TEMPLATE_RULES` 표 한 곳에
있고 위에서부터 처음 맞는 규칙을 쓴다. LLM 엔진으로 바꿀 때는 `TemplateRecommenderPort` 를
구현한 다른 어댑터를 컨테이너에서 갈아 끼운다.
"""
from __future__ import annotations

from dataclasses import dataclass

from harness_kit import packs

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


def _rule(raw: dict) -> TemplateRule:
    return TemplateRule(raw["template_id"], tuple(raw["keywords"]), raw["rationale"])


#: 서식 추천 규칙표 — 하네스 authoring 팩(`template-rules.json`)
_RULES = packs.data("authoring:template-rules.json")
TEMPLATE_RULES: tuple[TemplateRule, ...] = tuple(_rule(r) for r in _RULES["rules"])
FALLBACK_RULE = _rule(_RULES["fallback"])


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
