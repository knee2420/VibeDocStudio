"""`.vdoc` 블록·슬롯 참조 무결성 검증기."""
from __future__ import annotations

from typing import Any

REGISTERED_BLOCK_KINDS = frozenset({
    "image",
    "text",
    "section-block",
    "structured-table",
    "table",
    "columns-grid",
    "fillable-group",
    "heading",
    "form-title",
    "composite-form-frame",
    "summary-list",
    "cover-banner",
    "callout-box",
    "link-card",
    "divider",
    "hero",
})


def _collect_block_slot_ids(block: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    for key in ("slotId", "headingSlotId", "bodySlotId"):
        val = block.get(key)
        if isinstance(val, str) and val:
            ids.append(val)
    for sid in block.get("slotIds") or []:
        if isinstance(sid, str) and sid:
            ids.append(sid)
    for col in block.get("columns") or []:
        if isinstance(col, dict) and isinstance(col.get("slotId"), str) and col["slotId"]:
            ids.append(col["slotId"])
    for row in block.get("rows") or []:
        if not isinstance(row, dict):
            continue
        for cell in row.get("cells") or []:
            if isinstance(cell, dict) and isinstance(cell.get("slotId"), str) and cell["slotId"]:
                ids.append(cell["slotId"])
    return ids


def validate_vdoc_document(doc: dict[str, Any]) -> list[str]:
    """불변식 위반 사항 문자열 목록을 반환한다 (빈 리스트면 통과)."""
    errors: list[str] = []
    slots = doc.get("slots")
    pages = doc.get("pages")
    if not isinstance(slots, dict):
        return ["slots 딕셔너리가 없습니다."]
    if not isinstance(pages, list) or not pages:
        return ["최소 1개 이상의 페이지가 필요합니다."]

    for idx, page in enumerate(pages):
        pid = page.get("pageId") or f"page#{idx + 1}"
        for hf in ("headerSlotId", "footerSlotId"):
            sid = page.get(hf)
            if sid and sid not in slots:
                errors.append(f"{pid}: 누락된 슬롯 {hf}={sid}")
        for b in page.get("blocks") or []:
            kind = b.get("kind")
            if kind not in REGISTERED_BLOCK_KINDS:
                errors.append(f"{pid}/{b.get('blockId')}: 미등록 블록 kind={kind!r}")
            for sid in _collect_block_slot_ids(b):
                if sid not in slots:
                    errors.append(f"{pid}/{b.get('blockId')}: 슬롯 누락 {sid}")
                elif not isinstance(slots[sid].get("content"), str):
                    errors.append(f"{pid}/{sid}: 슬롯 content 가 문자열이 아닙니다.")
    return errors

