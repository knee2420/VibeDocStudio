"""composer 도메인의 프레임워크 독립 모델 및 Provenance 기록."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


@dataclass(frozen=True)
class SlotBackdataInput:
    chunk_id: str
    source_title: str
    excerpt: str


@dataclass(frozen=True)
class SlotCompositionRequestModel:
    slot_id: str
    slot_label: str
    current_content: str
    prompt: str
    preset_id: str
    max_lines: int | None
    backdata: tuple[SlotBackdataInput, ...]
    reference_node_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class SlotCompositionProvenance:
    run_id: str
    slot_id: str
    model_name: str
    prompt: str
    preset_id: str
    source_chunk_ids: tuple[str, ...]
    created_at: str
    reference_node_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class SlotCompositionResultModel:
    slot_id: str
    html: str
    provenance: SlotCompositionProvenance


class StagedPhase(StrEnum):
    STORYLINING = "storylining"
    TEMPLATING = "templating"
    DRAFTING = "drafting"


class StagedTargetKind(StrEnum):
    OUTLINE_NODE = "outline-node"
    TEMPLATE_BLOCK = "template-block"
    SLOT_HTML = "slot-html"


@dataclass(frozen=True)
class ReferenceNodeInput:
    """Phase 1 근거로 쓰는 참조 프로젝트 노드."""

    node_id: str
    title: str
    summary: str = ""
    source_project_id: str | None = None
    recommended_template_id: str | None = None


@dataclass(frozen=True)
class StorylineNodeInput:
    """Phase 2 서식 추천 대상 노드."""

    node_id: str
    title: str
    summary: str = ""
    recommended_template_id: str | None = None


@dataclass(frozen=True)
class StagedAiDiffItem:
    """AI가 작업대에 제안하는 Staged 변경안 (Accept/Reject 대상).

    `payload` 의 모양은 `target_kind` 마다 정해져 있다 (프론트 `StagedAiChange` 합 타입과 같은 계약).
    """

    diff_id: str
    phase: StagedPhase
    target_kind: StagedTargetKind
    target_id: str
    title: str
    before_summary: str
    after_summary: str
    payload: dict[str, Any]
    source_reference_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class StagedPhaseResult:
    run_id: str
    phase: StagedPhase
    engine_name: str
    created_at: str
    staged_diffs: tuple[StagedAiDiffItem, ...]
