"""documents 도메인 모델.

`.vdoc` 본문 스키마는 TypeScript(`@vibe/vdoc-schema`)가 정본이라 여기서는 JSON 사전을
그대로 들고 다닌다. 대신 문서를 바꾸는 규칙(슬롯 갱신 · 페이지 재정렬 · 섹션 페이지 추가 ·
페이지 창 투영)은 모두 `VDocAggregateRecord` 의 메서드로 모아, 유스케이스가 사전을 직접
만지지 않게 한다. 모든 변경 메서드는 새 레코드를 돌려준다 (원본 불변).
"""
from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any

from .errors import VDocSlotNotFoundError

#: A4 한 장(1123px) + 장 사이 간격(24px). 프론트 `A4_PAGE_STRIDE_PX` 와 같은 값이어야 한다.
A4_PAGE_STRIDE_PX = 1147

#: 섹션 페이지가 만드는 슬롯 ID 접미사 규칙 (`{pageId}_{part}`).
SECTION_SLOT_PARTS = ("header", "footer", "heading", "body")


@dataclass(frozen=True)
class VDocSummaryRecord:
    doc_id: str
    title: str
    status: str
    updated_at: str
    page_count: int
    slot_count: int


@dataclass(frozen=True)
class SlotUpdate:
    slot_id: str
    content: str
    label: str | None = None


def _page_stride_px(page: dict[str, Any]) -> int:
    rect = page.get("pageRect")
    if isinstance(rect, dict):
        h = rect.get("height")
        if isinstance(h, (int, float)) and h > 0:
            unit = rect.get("unit")
            if unit == "pt":
                px = float(h) * (96.0 / 72.0)
            elif unit == "mm":
                px = float(h) * (96.0 / 25.4)
            else:
                px = float(h)
            return max(264, int(round(px)) + 24)
    return A4_PAGE_STRIDE_PX


@dataclass(frozen=True)
class VDocPageWindow:
    """대용량 문서의 페이지 창 하나와 그 창이 참조하는 슬롯 · 근거 자료만 담은 투영."""

    doc_id: str
    title: str
    total_pages: int
    start_page: int
    end_page: int
    pages: list[dict[str, Any]]
    slots: dict[str, Any]
    backdata: dict[str, Any]
    before_spacer_px: int | None = None
    after_spacer_px: int | None = None

    @property
    def window_size(self) -> int:
        return len(self.pages)

    @property
    def top_spacer_px(self) -> int:
        if self.before_spacer_px is not None:
            return self.before_spacer_px
        return max(0, (self.start_page - 1) * A4_PAGE_STRIDE_PX)

    @property
    def bottom_spacer_px(self) -> int:
        if self.after_spacer_px is not None:
            return self.after_spacer_px
        return max(0, (self.total_pages - self.end_page) * A4_PAGE_STRIDE_PX)


def iter_slot_refs(node: Any) -> Iterator[str]:
    """페이지 · 블록 구조에서 슬롯 참조(`*SlotId`, `slotIds`)를 모두 찾는다 (블록 종류와 무관)."""
    if isinstance(node, dict):
        for key, value in node.items():
            lowered = key.lower()
            if isinstance(value, str) and lowered.endswith("slotid"):
                yield value
            elif lowered == "slotids" and isinstance(value, list):
                yield from (v for v in value if isinstance(v, str))
            else:
                yield from iter_slot_refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from iter_slot_refs(item)


@dataclass(frozen=True)
class VDocAggregateRecord:
    doc_id: str
    payload: dict[str, Any]

    # --- 조회 ---------------------------------------------------------------

    @property
    def pages(self) -> list[dict[str, Any]]:
        return list(self.payload.get("pages", []))

    @property
    def slots(self) -> dict[str, Any]:
        return dict(self.payload.get("slots", {}))

    @property
    def title(self) -> str:
        return str(self.payload.get("title", self.doc_id))

    def summary(self) -> VDocSummaryRecord:
        return VDocSummaryRecord(
            doc_id=str(self.payload.get("docId", self.doc_id)),
            title=self.title,
            status=str(self.payload.get("status", "Draft")),
            updated_at=str(self.payload.get("updatedAt", "")),
            page_count=len(self.payload.get("pages", [])),
            slot_count=len(self.payload.get("slots", {})),
        )

    def page_window(self, start_page: int, end_page: int) -> VDocPageWindow:
        pages = self.pages
        total = len(pages)
        start = max(1, min(start_page, max(1, total)))
        end = max(start, min(end_page, max(1, total)))
        window_pages = pages[start - 1 : end]

        all_slots = self.payload.get("slots", {})
        slot_ids = set(iter_slot_refs(window_pages))
        slots = {sid: all_slots[sid] for sid in slot_ids if sid in all_slots}

        all_backdata = self.payload.get("backdata", {})
        backdata_ids = {
            ref
            for slot in slots.values()
            if isinstance(slot, dict)
            for ref in slot.get("backDataRefs", [])
        }
        backdata = {bid: all_backdata[bid] for bid in backdata_ids if bid in all_backdata}

        return VDocPageWindow(
            doc_id=self.doc_id,
            title=self.title,
            total_pages=total,
            start_page=start,
            end_page=end,
            pages=window_pages,
            slots=slots,
            backdata=backdata,
            before_spacer_px=sum(_page_stride_px(p) for p in pages[: max(0, start - 1)]),
            after_spacer_px=sum(_page_stride_px(p) for p in pages[end:]),
        )

    # --- 변경 ---------------------------------------------------------------

    def _with(self, *, now: str, **changes: Any) -> VDocAggregateRecord:
        # 서버 쪽 부분 변경(슬롯 패치 · 구조 패치)도 저장 버전을 올린다 — 클라이언트의 낙관적 잠금과 같은 축
        revision = int(self.payload.get("revision") or 0) + 1
        return VDocAggregateRecord(
            doc_id=self.doc_id,
            payload={**self.payload, **changes, "updatedAt": now, "revision": revision},
        )

    def with_payload(self, payload: dict[str, Any], *, now: str) -> VDocAggregateRecord:
        return VDocAggregateRecord(doc_id=self.doc_id, payload={**payload, "updatedAt": now})

    def with_slot_content(self, slot_id: str, content: str, *, now: str) -> VDocAggregateRecord:
        slots = self.slots
        if slot_id not in slots:
            raise VDocSlotNotFoundError(f"Slot '{slot_id}' not found in document '{self.doc_id}'")
        slots[slot_id] = {**slots[slot_id], "content": content}
        return self._with(now=now, slots=slots)

    def with_slot_updates(self, updates: Iterable[SlotUpdate], *, now: str) -> VDocAggregateRecord:
        """AI 초안 승인 등 여러 슬롯을 한 번에 반영한다. 없는 슬롯은 편집 슬롯으로 새로 만든다."""
        slots = self.slots
        for update in updates:
            if not update.slot_id:
                continue
            existing = slots.get(update.slot_id)
            if existing is not None:
                slots[update.slot_id] = {**existing, "content": update.content, "isEdited": True}
            else:
                slots[update.slot_id] = {
                    "slotId": update.slot_id,
                    "label": update.label or update.slot_id,
                    "role": "editable-slot",
                    "content": update.content,
                    "backDataRefs": [],
                    "isEdited": True,
                }
        return self._with(now=now, slots=slots)

    def with_page_order(self, page_order: Iterable[str], *, now: str) -> VDocAggregateRecord:
        """주어진 순서대로 페이지를 놓고, 언급되지 않은 페이지는 원래 순서로 뒤에 붙인다."""
        by_id = {str(p.get("pageId")): p for p in self.pages}
        reordered = [by_id.pop(pid) for pid in page_order if pid in by_id]
        reordered.extend(by_id.values())
        renumbered = [{**page, "pageNumber": idx} for idx, page in enumerate(reordered, start=1)]
        return self._with(now=now, pages=renumbered)

    def with_section_page(
        self,
        *,
        page_id: str | None,
        page_label: str | None,
        summary: str | None,
        now: str,
    ) -> VDocAggregateRecord:
        """머리말 · 바닥글 · 제목 · 본문 슬롯을 갖춘 표준 섹션 페이지를 끝에 붙인다."""
        pages = self.pages
        number = len(pages) + 1
        pid = page_id or f"page-{number}"
        label = page_label or f"신규 섹션 페이지 {number}"
        header, footer, heading, body = (f"{pid}_{part}" for part in SECTION_SLOT_PARTS)

        slots = self.slots
        slots[header] = _slot(header, "머리말", "boilerplate", f"<p>{self.payload.get('title', 'VibeDocStudio')}</p>")
        slots[footer] = _slot(footer, "바닥글", "boilerplate", f"<p>Page {number}</p>")
        slots[heading] = _slot(heading, f"{label} 제목", "editable-slot", f"<h2>{label}</h2>")
        slots[body] = _slot(
            body,
            f"{label} 본문",
            "editable-slot",
            f"<p>{summary or '스토리라인에서 생성된 섹션 초안입니다.'}</p>",
        )
        pages.append(
            {
                "pageId": pid,
                "pageNumber": number,
                "pageLabel": label,
                "headerSlotId": header,
                "footerSlotId": footer,
                "blocks": [
                    {
                        "blockId": f"blk_{pid}_1",
                        "kind": "section-block",
                        "headingSlotId": heading,
                        "bodySlotId": body,
                    }
                ],
            }
        )
        return self._with(now=now, pages=pages, slots=slots)


def _slot(slot_id: str, label: str, role: str, content: str) -> dict[str, Any]:
    return {"slotId": slot_id, "label": label, "role": role, "content": content, "backDataRefs": []}
