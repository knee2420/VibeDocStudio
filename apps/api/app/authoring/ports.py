"""authoring 도메인 외부 의존 계약 (Protocol) — 초안기 · 하네스 근거 · 사용량 원장 · 대기열."""
from __future__ import annotations

from typing import Any, Protocol

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


class EvidenceSource(Protocol):
    """근거 위치(예: kcard) → 위치 + 본문 발췌(`excerpt`) · 원문 지문(`sourceSha`). 하네스의 근거 묶음용.

    지식 덱 도구 묶음(`resource.index` 의 `KnowledgeToolbox`)이 구현한다.
    """

    def resolve_evidence(self, locators: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    def suggest_evidence(self, scope: list[str], query: str, limit: int = 4) -> list[dict[str, Any]]:
        """질의로 근거 후보를 찾는다 (지식 덱 lookup) — 같은 모양의 위치 + excerpt."""
        ...


class UsageLedger(Protocol):
    """하네스 · 실행별 토큰 · 시간 원장 (비용 예산 · 관측)."""

    def record(self, entry: dict[str, Any]) -> None: ...

    def summary(self, limit: int = 2000) -> dict[str, Any]: ...


class StagingStorePort(Protocol):
    """프로젝트별 Staged 변경안 대기열 (승인 전 AI 변경안, `staging.json`)."""

    def list(self, project_id: str) -> list[dict[str, Any]]: ...

    def replace(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    def append(self, project_id: str, changes: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    def merge(self, project_id: str, changes: list[dict[str, Any]], removed: list[str]) -> list[dict[str, Any]]: ...
