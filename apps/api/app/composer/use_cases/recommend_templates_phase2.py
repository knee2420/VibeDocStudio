"""유스케이스: Phase 2 템플릿 추천 및 튜닝 (스토리라인 노드별 서식 블록 Staged Diff 생성)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.storage import RUN_PREFIX, new_id

from ..agents import TemplateTuningAgent


class RecommendTemplatesPhase2UseCase:
    def __init__(self, agent: TemplateTuningAgent) -> None:
        self._agent = agent

    def execute(
        self,
        *,
        project_id: str,
        doc_id: str,
        nodes: list[dict[str, Any]],
        tuning_prompt: str = "",
    ) -> dict[str, Any]:
        run_id = new_id(RUN_PREFIX)
        diffs = self._agent.recommend_templates(
            project_id=project_id,
            doc_id=doc_id,
            nodes=nodes,
            tuning_prompt=tuning_prompt,
        )
        return {
            "runId": run_id,
            "phase": "templating",
            "modelName": self._agent.model_name,
            "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "stagedDiffs": [d.to_dict() for d in diffs],
        }

