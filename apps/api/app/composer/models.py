"""composer 도메인의 프레임워크 독립 모델 및 Provenance 기록."""
from __future__ import annotations

from dataclasses import dataclass


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


@dataclass(frozen=True)
class SlotCompositionProvenance:
    run_id: str
    slot_id: str
    model_name: str
    prompt: str
    preset_id: str
    source_chunk_ids: tuple[str, ...]
    created_at: str


@dataclass(frozen=True)
class SlotCompositionResultModel:
    slot_id: str
    html: str
    provenance: SlotCompositionProvenance

