"""composer 도메인 서비스."""
from __future__ import annotations

from typing import Any

from .models import (
    SlotCompositionRequestModel,
    SlotCompositionResultModel,
)
from .use_cases import (
    CancelCompositionRunUseCase,
    ComposeSlotDraftUseCase,
    ComposeStorylinePhase1UseCase,
    RecommendTemplatesPhase2UseCase,
)


class ComposerService:
    def __init__(
        self,
        compose_draft: ComposeSlotDraftUseCase,
        compose_storyline: ComposeStorylinePhase1UseCase | None = None,
        recommend_templates: RecommendTemplatesPhase2UseCase | None = None,
        cancel_run: CancelCompositionRunUseCase | None = None,
    ) -> None:
        self._compose_draft = compose_draft
        self._compose_storyline = compose_storyline
        self._recommend_templates = recommend_templates
        self._cancel_run = cancel_run

    def compose_slot(
        self,
        request: SlotCompositionRequestModel,
    ) -> SlotCompositionResultModel:
        return self._compose_draft.execute(request)

    def compose_storyline_phase1(
        self,
        *,
        project_id: str,
        prompt: str,
        reference_nodes: list[dict[str, Any]],
        target_parent_id: str | None = None,
    ) -> dict[str, Any]:
        if self._compose_storyline is None:
            raise ValueError("ComposeStorylinePhase1UseCase is not configured")
        return self._compose_storyline.execute(
            project_id=project_id,
            prompt=prompt,
            reference_nodes=reference_nodes,
            target_parent_id=target_parent_id,
        )

    def recommend_templates_phase2(
        self,
        *,
        project_id: str,
        doc_id: str,
        nodes: list[dict[str, Any]],
        tuning_prompt: str = "",
    ) -> dict[str, Any]:
        if self._recommend_templates is None:
            raise ValueError("RecommendTemplatesPhase2UseCase is not configured")
        return self._recommend_templates.execute(
            project_id=project_id,
            doc_id=doc_id,
            nodes=nodes,
            tuning_prompt=tuning_prompt,
        )

    def cancel_composition_run(self, run_id: str, reason: str = "user_aborted") -> dict[str, str]:
        if self._cancel_run is None:
            raise ValueError("CancelCompositionRunUseCase is not configured")
        return self._cancel_run.execute(run_id, reason=reason)
