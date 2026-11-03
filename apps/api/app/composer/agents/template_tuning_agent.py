"""Phase 2 템플릿 추천·튜닝 에이전트: 스토리라인 노드의 의미에 맞춰 최적의 서식 블록·테이블 레이아웃을 매핑한다."""
from __future__ import annotations

from typing import Any

from app.core.storage import STAGING_PREFIX, new_id

from ..models import StagedAiDiffItem


class TemplateTuningAgent:
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name

    @property
    def model_name(self) -> str:
        return self._model_name

    def recommend_templates(
        self,
        *,
        project_id: str,
        doc_id: str,
        nodes: list[dict[str, Any]],
        tuning_prompt: str = "",
    ) -> list[StagedAiDiffItem]:
        diffs: list[StagedAiDiffItem] = []
        for idx, node in enumerate(nodes[:5], start=1):
            node_id = str(node.get("nodeId") or f"node-{idx}")
            title = str(node.get("title") or f"섹션 {idx}")
            prev_tpl = str(node.get("recommendedTemplateId") or "section-block")

            lowered = (title + " " + str(node.get("summary", "")) + " " + tuning_prompt).lower()
            if any(k in lowered for k in ("표", "테이블", "매트릭스", "정산", "단가", "sla", "table")):
                next_tpl = "structured-table"
                rationale = "다중 행·열 수치 및 SLA 비교에 최적화된 그리드 테이블 블록"
            elif any(k in lowered for k in ("결재", "심사", "양식", "프레임", "공문", "audit")):
                next_tpl = "composite-form-frame"
                rationale = "한국형 공공/엔터프라이즈 복합 테두리 양식 프레임"
            elif any(k in lowered for k in ("비교", "2단", "병행", "컬럼", "컷오버", "grid")):
                next_tpl = "columns-grid"
                rationale = "좌우 대조 및 다단 레이아웃 비교 그리드 블록"
            elif any(k in lowered for k in ("표지", "배너", "제안", "cover")):
                next_tpl = "cover-banner"
                rationale = "타이틀 헤드라인 및 작성/수신 메타데이터 표지 블록"
            else:
                next_tpl = "section-block"
                rationale = "소제목 + 리치 텍스트 본문 슬롯 결합 표준 섹션 블록"

            diffs.append(
                StagedAiDiffItem(
                    diff_id=new_id(STAGING_PREFIX),
                    phase="templating",
                    target_kind="template-block",
                    target_id=node_id,
                    title=f"[Phase 2 서식 매핑] {title}",
                    before_summary=f"기존 서식: {prev_tpl}",
                    after_summary=f"추천 서식: {next_tpl} ({rationale})",
                    payload={
                        "operation": "assign_template_block",
                        "projectId": project_id,
                        "docId": doc_id,
                        "nodeId": node_id,
                        "templateKind": next_tpl,
                        "rationale": rationale,
                    },
                )
            )
        return diffs

