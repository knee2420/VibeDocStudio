"""유스케이스: Phase 1 스토리라인 스캐폴드 · Phase 2 서식 추천 (취소 가능한 Staged Diff 생성)."""
from __future__ import annotations

from ..models import (
    ReferenceNodeInput,
    StagedPhase,
    StagedPhaseResult,
    StorylineNodeInput,
)
from ..ports import StorylineScaffolderPort, TemplateRecommenderPort
from .staged_phase_run import StagedPhaseRunner


class ComposeStorylinePhase1UseCase:
    def __init__(self, scaffolder: StorylineScaffolderPort, runner: StagedPhaseRunner) -> None:
        self._scaffolder = scaffolder
        self._runner = runner

    def execute(
        self,
        *,
        project_id: str,
        prompt: str,
        reference_nodes: tuple[ReferenceNodeInput, ...],
        target_parent_id: str | None = None,
        run_id: str | None = None,
    ) -> StagedPhaseResult:
        return self._runner.run(
            phase=StagedPhase.STORYLINING,
            engine_name=self._scaffolder.engine_name,
            run_id=run_id,
            produce=lambda: self._scaffolder.synthesize_storyline_diffs(
                project_id=project_id,
                prompt=prompt,
                reference_nodes=reference_nodes,
                target_parent_id=target_parent_id,
            ),
        )


class RecommendTemplatesPhase2UseCase:
    def __init__(self, recommender: TemplateRecommenderPort, runner: StagedPhaseRunner) -> None:
        self._recommender = recommender
        self._runner = runner

    def execute(
        self,
        *,
        project_id: str,
        doc_id: str,
        nodes: tuple[StorylineNodeInput, ...],
        tuning_prompt: str = "",
        run_id: str | None = None,
    ) -> StagedPhaseResult:
        return self._runner.run(
            phase=StagedPhase.TEMPLATING,
            engine_name=self._recommender.engine_name,
            run_id=run_id,
            produce=lambda: self._recommender.recommend_templates(
                project_id=project_id,
                doc_id=doc_id,
                nodes=nodes,
                tuning_prompt=tuning_prompt,
            ),
        )
