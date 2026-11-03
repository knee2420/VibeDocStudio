"""Phase 1 스토리라인 스캐폴드 에이전트: 참조 프로젝트 노드들을 근거로 인메모리 아웃라인 트리 조작안을 생성한다."""
from __future__ import annotations

from typing import Any

from app.core.storage import STAGING_PREFIX, new_id

from ..models import StagedAiDiffItem


class StorylineScaffoldAgent:
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name

    @property
    def model_name(self) -> str:
        return self._model_name

    def synthesize_storyline_diffs(
        self,
        *,
        project_id: str,
        prompt: str,
        reference_nodes: list[dict[str, Any]],
        target_parent_id: str | None = None,
    ) -> list[StagedAiDiffItem]:
        diffs: list[StagedAiDiffItem] = []
        clean_prompt = prompt.strip() or "참조 레퍼런스 기반 표준 목차 구성"

        if reference_nodes:
            for idx, ref in enumerate(reference_nodes[:4], start=1):
                node_id = new_id("node")
                ref_title = str(ref.get("title") or f"참조 기반 섹션 {idx}")
                ref_summary = str(ref.get("summary") or clean_prompt)
                ref_proj_id = str(ref.get("sourceProjectId") or "vproj-ref-cloud-migration-rfp")
                ref_node_id = str(ref.get("nodeId") or f"ref-{idx}")
                rec_tpl = str(ref.get("recommendedTemplateId") or "structured-table")

                diffs.append(
                    StagedAiDiffItem(
                        diff_id=new_id(STAGING_PREFIX),
                        phase="storylining",
                        target_kind="outline-node",
                        target_id=node_id,
                        title=f"[Phase 1 목차 추가] {ref_title}",
                        before_summary="(신규 아웃라인 노드 삽입)",
                        after_summary=f"{ref_title} — {ref_summary} (추천 서식: {rec_tpl})",
                        payload={
                            "operation": "insert_node",
                            "projectId": project_id,
                            "node": {
                                "nodeId": node_id,
                                "parentId": target_parent_id or "node-proj-root",
                                "depth": 1,
                                "zoomLevel": "page",
                                "title": f"[AI 재구성] {ref_title}",
                                "summary": f"{ref_summary} · 지시문 반영: {clean_prompt}",
                                "recommendedTemplateId": rec_tpl,
                                "provenanceSourceProjectId": ref_proj_id,
                                "provenanceSourceNodeId": ref_node_id,
                                "aiStatus": "staged",
                            },
                        },
                        source_reference_ids=(f"{ref_proj_id}:{ref_node_id}",),
                    )
                )
        else:
            node_id = new_id("node")
            diffs.append(
                StagedAiDiffItem(
                    diff_id=new_id(STAGING_PREFIX),
                    phase="storylining",
                    target_kind="outline-node",
                    target_id=node_id,
                    title=f"[Phase 1 목차 생성] {clean_prompt[:40]}",
                    before_summary="(신규 아웃라인 노드 삽입)",
                    after_summary=f"AI 스토리라인 섹션: {clean_prompt}",
                    payload={
                        "operation": "insert_node",
                        "projectId": project_id,
                        "node": {
                            "nodeId": node_id,
                            "parentId": target_parent_id or "node-proj-root",
                            "depth": 1,
                            "zoomLevel": "page",
                            "title": f"[AI 생성 섹션] {clean_prompt[:48]}",
                            "summary": f"프롬프트 '{clean_prompt}' 기반으로 구성된 핵심 아웃라인 섹션",
                            "recommendedTemplateId": "section-block",
                            "aiStatus": "staged",
                        },
                    },
                    source_reference_ids=(),
                )
            )
        return diffs

