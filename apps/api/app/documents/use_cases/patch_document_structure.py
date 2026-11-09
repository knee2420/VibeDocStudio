"""유스케이스: 아웃라이너 구조 변경, AI Staged Diff 커밋을 원자적으로 패치한다.

연산 하나는 `StructurePatch` 구현 하나이며 `STRUCTURE_PATCHES` 레지스트리에 이름으로 등록한다.
새 연산은 클래스와 등록 한 줄만 추가하면 되고 유스케이스 본문은 바뀌지 않는다.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from app.core.clock import utc_now_iso
from app.core.storage import safe_segment

from ..errors import UnsupportedStructurePatchError
from ..models import SlotUpdate, VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort


class StructurePatch(Protocol):
    def apply(self, doc: VDocAggregateRecord, *, now: str) -> VDocAggregateRecord: ...


@dataclass(frozen=True)
class CommitStagedSlots:
    """payload: `{"slotUpdates": [{"slotId": "...", "content": "<p>...</p>", "label"?: "..."}]}`"""

    updates: tuple[SlotUpdate, ...]

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> CommitStagedSlots:
        return cls(
            tuple(
                SlotUpdate(
                    slot_id=str(item.get("slotId", "")),
                    content=str(item.get("content", "")),
                    label=item.get("label"),
                )
                for item in payload.get("slotUpdates", [])
                if isinstance(item, dict)
            )
        )

    def apply(self, doc: VDocAggregateRecord, *, now: str) -> VDocAggregateRecord:
        return doc.with_slot_updates(self.updates, now=now)


@dataclass(frozen=True)
class ReorderPages:
    """payload: `{"pageOrder": ["page-2", "page-1", ...]}`"""

    page_order: tuple[str, ...]

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> ReorderPages:
        return cls(tuple(str(pid) for pid in payload.get("pageOrder", [])))

    def apply(self, doc: VDocAggregateRecord, *, now: str) -> VDocAggregateRecord:
        return doc.with_page_order(self.page_order, now=now)


@dataclass(frozen=True)
class InsertStorylinePage:
    """payload: `{"pageId"?: "...", "pageLabel"?: "...", "summary"?: "..."}`"""

    page_id: str | None
    page_label: str | None
    summary: str | None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> InsertStorylinePage:
        return cls(
            page_id=payload.get("pageId") or None,
            page_label=payload.get("pageLabel") or None,
            summary=payload.get("summary") or None,
        )

    def apply(self, doc: VDocAggregateRecord, *, now: str) -> VDocAggregateRecord:
        return doc.with_section_page(
            page_id=self.page_id,
            page_label=self.page_label,
            summary=self.summary,
            now=now,
        )


STRUCTURE_PATCHES: dict[str, Callable[[dict[str, Any]], StructurePatch]] = {
    "commit_staged_slots": CommitStagedSlots.from_payload,
    "reorder_pages": ReorderPages.from_payload,
    "insert_storyline_page": InsertStorylinePage.from_payload,
}


def parse_structure_patch(operation: str, payload: dict[str, Any]) -> StructurePatch:
    factory = STRUCTURE_PATCHES.get(operation)
    if factory is None:
        raise UnsupportedStructurePatchError(
            f"Unsupported structural patch operation: {operation} "
            f"(supported: {', '.join(sorted(STRUCTURE_PATCHES))})"
        )
    return factory(payload)


class PatchDocumentStructureUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        doc_id: str,
        operation: str,
        payload: dict[str, Any],
    ) -> VDocAggregateRecord:
        patch = parse_structure_patch(operation, payload)
        return self._repo.update(
            safe_segment(doc_id),
            lambda doc: patch.apply(doc, now=utc_now_iso()),
        )
