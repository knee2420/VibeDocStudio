"""Phase 1 스토리라인 스캐폴더 (결정적 규칙 엔진).

참조 프로젝트 노드를 근거로 아웃라인 노드 삽입안을 만든다. LLM 을 부르지 않으므로
`engine_name` 도 모델명이 아니라 규칙 엔진 식별자를 밝힌다. LLM 엔진으로 바꿀 때는
`StorylineScaffolderPort` 를 구현한 다른 어댑터를 컨테이너에서 갈아 끼운다.
"""
from __future__ import annotations

from app.core.storage import STAGING_PREFIX, new_id

from ..models import ReferenceNodeInput, StagedAiDiffItem, StagedPhase, StagedTargetKind

MAX_REFERENCE_NODES = 4
DEFAULT_TEMPLATE_ID = "section-block"
DEFAULT_PROMPT = "참조 레퍼런스 기반 표준 목차 구성"


class ReferenceStorylineScaffolder:
    engine_name = "rule/reference-storyline-v1"

    def synthesize_storyline_diffs(
        self,
        *,
        project_id: str,
        prompt: str,
        reference_nodes: tuple[ReferenceNodeInput, ...],
        target_parent_id: str | None,
    ) -> list[StagedAiDiffItem]:
        clean_prompt = prompt.strip() or DEFAULT_PROMPT
        if not reference_nodes:
            return [self._prompt_only_diff(project_id, clean_prompt, target_parent_id)]
        return [
            self._reference_diff(project_id, clean_prompt, ref, idx, target_parent_id)
            for idx, ref in enumerate(reference_nodes[:MAX_REFERENCE_NODES], start=1)
        ]

    @staticmethod
    def _insert_payload(project_id: str, parent_id: str | None, node: dict[str, object]) -> dict[str, object]:
        # parentId 가 없으면 적용 시점에 서버가 아웃라인 루트로 정한다.
        return {"operation": "insert_node", "projectId": project_id, "node": {"parentId": parent_id, **node}}

    def _reference_diff(
        self,
        project_id: str,
        prompt: str,
        ref: ReferenceNodeInput,
        idx: int,
        parent_id: str | None,
    ) -> StagedAiDiffItem:
        node_id = new_id("node")
        title = ref.title or f"참조 기반 섹션 {idx}"
        summary = ref.summary or prompt
        template_id = ref.recommended_template_id or DEFAULT_TEMPLATE_ID
        node: dict[str, object] = {
            "nodeId": node_id,
            "title": f"[AI 재구성] {title}",
            "summary": f"{summary} · 지시문 반영: {prompt}",
            "zoomLevel": "page",
            "recommendedTemplateId": template_id,
            "aiStatus": "staged",
        }
        source_ids: tuple[str, ...] = ()
        if ref.source_project_id:
            node["provenanceSourceProjectId"] = ref.source_project_id
            node["provenanceSourceNodeId"] = ref.node_id
            source_ids = (f"{ref.source_project_id}:{ref.node_id}",)
        return StagedAiDiffItem(
            diff_id=new_id(STAGING_PREFIX),
            phase=StagedPhase.STORYLINING,
            target_kind=StagedTargetKind.OUTLINE_NODE,
            target_id=node_id,
            title=f"[Phase 1 목차 추가] {title}",
            before_summary="(신규 아웃라인 노드 삽입)",
            after_summary=f"{title} — {summary} (추천 서식: {template_id})",
            payload=self._insert_payload(project_id, parent_id, node),
            source_reference_ids=source_ids,
        )

    def _prompt_only_diff(self, project_id: str, prompt: str, parent_id: str | None) -> StagedAiDiffItem:
        node_id = new_id("node")
        return StagedAiDiffItem(
            diff_id=new_id(STAGING_PREFIX),
            phase=StagedPhase.STORYLINING,
            target_kind=StagedTargetKind.OUTLINE_NODE,
            target_id=node_id,
            title=f"[Phase 1 목차 생성] {prompt[:40]}",
            before_summary="(신규 아웃라인 노드 삽입)",
            after_summary=f"AI 스토리라인 섹션: {prompt}",
            payload=self._insert_payload(
                project_id,
                parent_id,
                {
                    "nodeId": node_id,
                    "title": f"[AI 생성 섹션] {prompt[:48]}",
                    "summary": f"프롬프트 '{prompt}' 기반으로 구성된 핵심 아웃라인 섹션",
                    "zoomLevel": "page",
                    "recommendedTemplateId": DEFAULT_TEMPLATE_ID,
                    "aiStatus": "staged",
                },
            ),
        )
