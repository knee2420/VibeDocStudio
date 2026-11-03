"""유스케이스: Phase 1 스토리라인 스캐폴드 (참조 프로젝트 근거 기반 Staged Diff 생성)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.storage import RUN_PREFIX, new_id

from ..agents import StorylineScaffoldAgent


class ComposeStorylinePhase1UseCase:
    def __init__(self, agent: StorylineScaffoldAgent) -> None:
        self._agent = agent

    def execute(
        self,
        *,
        project_id: str,
        prompt: str,
        reference_nodes: list[dict[str, Any]],
        target_parent_id: str | None = None,
    ) -> dict[str, Any]:
        run_id = new_id(RUN_PREFIX)
        diffs = self._agent.synthesize_storyline_diffs(
            project_id=project_id,
            prompt=prompt,
            reference_nodes=reference_nodes,
            target_parent_id=target_parent_id,
        )
        return {
            "runId": run_id,
            "phase": "storylining",
            "modelName": self._agent.model_name,
            "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "stagedDiffs": [d.to_dict() for d in diffs],
        }

