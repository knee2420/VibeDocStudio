"""composer 도메인 외부 의존 계약 (Protocol)."""
from __future__ import annotations

from typing import Protocol

from app.core.observation.cancellation_registry import CancellationEntry

from .models import (
    ReferenceNodeInput,
    SlotCompositionRequestModel,
    SlotCompositionResultModel,
    StagedAiDiffItem,
    StorylineNodeInput,
)


class SlotComposerHarnessPort(Protocol):
    """단일 슬롯 범위 내에서 백데이터 근거를 바탕으로 HTML 초안을 합성하는 포트."""

    def synthesize_slot_html(
        self,
        request: SlotCompositionRequestModel,
    ) -> tuple[str, str]: ...


class CompositionArchivePort(Protocol):
    """생성된 슬롯 초안과 출처(provenance.json + HEAD.json)를 `data/` 등급에 영속화하는 포트."""

    def record_composition(self, result: SlotCompositionResultModel) -> None: ...


class StorylineScaffolderPort(Protocol):
    """Phase 1: 참조 노드를 근거로 아웃라인 노드 삽입안을 만든다."""

    @property
    def engine_name(self) -> str: ...

    def synthesize_storyline_diffs(
        self,
        *,
        project_id: str,
        prompt: str,
        reference_nodes: tuple[ReferenceNodeInput, ...],
        target_parent_id: str | None,
    ) -> list[StagedAiDiffItem]: ...


class TemplateRecommenderPort(Protocol):
    """Phase 2: 스토리라인 노드마다 서식 블록 배정안을 만든다."""

    @property
    def engine_name(self) -> str: ...

    def recommend_templates(
        self,
        *,
        project_id: str,
        doc_id: str,
        nodes: tuple[StorylineNodeInput, ...],
        tuning_prompt: str,
    ) -> list[StagedAiDiffItem]: ...


class RunCancellationPort(Protocol):
    """실행 단위 협력적 취소 토큰."""

    def begin(self, run_id: str) -> None: ...

    def finish(self, run_id: str) -> None: ...

    def is_cancelled(self, run_id: str) -> bool: ...

    def request_cancel(self, run_id: str, reason: str = "user_aborted") -> CancellationEntry: ...
