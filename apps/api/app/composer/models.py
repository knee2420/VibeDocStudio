"""composer 도메인의 프레임워크 독립 모델 및 Provenance 기록."""
from __future__ import annotations

from dataclasses import dataclass, field
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


@dataclass(frozen=True)
class StagedAiDiffItem:
    """AI가 인메모리 작업대를 직접 조작할 때 생성되는 Staged 변경안 (Accept/Reject 대상)."""

    diff_id: str
    phase: str  # "storylining" | "templating" | "drafting"
    target_kind: str  # "outline-node" | "template-block" | "slot-html"
    target_id: str
    title: str
    before_summary: str
    after_summary: str
    payload: dict[str, Any]
    source_reference_ids: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "diffId": self.diff_id,
            "phase": self.phase,
            "targetKind": self.target_kind,
            "targetId": self.target_id,
            "title": self.title,
            "beforeSummary": self.before_summary,
            "afterSummary": self.after_summary,
            "payload": self.payload,
            "sourceReferenceIds": list(self.source_reference_ids),
        }
