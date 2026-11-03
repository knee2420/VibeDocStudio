"""유스케이스: 아웃라이너 구조 변경, 템플릿 블록 할당, AI Staged Diff 커밋을 원자적으로 패치한다."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

from app.core.storage import safe_segment

from ..models import VDocAggregateRecord
from ..ports import OutlineCachePort, VDocDocumentRepositoryPort


class PatchDocumentStructureUseCase:
    def __init__(
        self,
        repository: VDocDocumentRepositoryPort,
        outline_cache: OutlineCachePort | None = None,
    ) -> None:
        self._repo = repository
        self._cache = outline_cache

    def execute(
        self,
        doc_id: str,
        operation: str,
        payload: dict[str, Any],
    ) -> VDocAggregateRecord:
        safe_id = safe_segment(doc_id)
        record = self._repo.get(safe_id)
        doc = copy.deepcopy(record.payload)
        pages: list[dict[str, Any]] = list(doc.get("pages", []))
        slots: dict[str, Any] = dict(doc.get("slots", {}))

        if operation == "commit_staged_slots":
            # payload: {"slotUpdates": [{"slotId": "...", "content": "<p>...</p>"}]}
            for item in payload.get("slotUpdates", []):
                sid = str(item.get("slotId", ""))
                html = str(item.get("content", ""))
                if sid and sid in slots:
                    slots[sid] = {
                        **slots[sid],
                        "content": html,
                        "isEdited": True,
                    }
                elif sid:
                    slots[sid] = {
                        "slotId": sid,
                        "label": str(item.get("label", sid)),
                        "role": "editable-slot",
                        "content": html,
                        "backDataRefs": [],
                        "isEdited": True,
                    }
            doc["slots"] = slots

        elif operation == "reorder_pages":
            # payload: {"pageOrder": ["page-2", "page-1", ...]}
            order = [str(pid) for pid in payload.get("pageOrder", [])]
            by_id = {str(p.get("pageId")): p for p in pages}
            reordered: list[dict[str, Any]] = []
            for pid in order:
                if pid in by_id:
                    reordered.append(by_id.pop(pid))
            reordered.extend(by_id.values())
            for idx, page in enumerate(reordered, start=1):
                page["pageNumber"] = idx
            doc["pages"] = reordered

        elif operation == "insert_storyline_page":
            # payload: {"pageId": "...", "pageLabel": "...", "templateKind": "section-block"}
            new_page_id = str(payload.get("pageId") or f"page-{len(pages) + 1}")
            page_label = str(payload.get("pageLabel") or f"신규 섹션 페이지 {len(pages) + 1}")
            heading_slot_id = f"{new_page_id}_heading"
            body_slot_id = f"{new_page_id}_body"
            header_slot_id = f"{new_page_id}_header"
            footer_slot_id = f"{new_page_id}_footer"

            slots[header_slot_id] = {
                "slotId": header_slot_id,
                "label": "머리말",
                "role": "boilerplate",
                "content": f"<p>{doc.get('title', 'VibeDocStudio')}</p>",
                "backDataRefs": [],
            }
            slots[footer_slot_id] = {
                "slotId": footer_slot_id,
                "label": "바닥글",
                "role": "boilerplate",
                "content": f"<p>Page {len(pages) + 1}</p>",
                "backDataRefs": [],
            }
            slots[heading_slot_id] = {
                "slotId": heading_slot_id,
                "label": f"{page_label} 제목",
                "role": "editable-slot",
                "content": f"<h2>{page_label}</h2>",
                "backDataRefs": [],
            }
            slots[body_slot_id] = {
                "slotId": body_slot_id,
                "label": f"{page_label} 본문",
                "role": "editable-slot",
                "content": f"<p>{payload.get('summary') or '스토리라인에서 생성된 섹션 초안입니다.'}</p>",
                "backDataRefs": [],
            }
            pages.append(
                {
                    "pageId": new_page_id,
                    "pageNumber": len(pages) + 1,
                    "pageLabel": page_label,
                    "headerSlotId": header_slot_id,
                    "footerSlotId": footer_slot_id,
                    "blocks": [
                        {
                            "blockId": f"blk_{new_page_id}_1",
                            "kind": "section-block",
                            "headingSlotId": heading_slot_id,
                            "bodySlotId": body_slot_id,
                        }
                    ],
                }
            )
            doc["pages"] = pages
            doc["slots"] = slots

        else:
            raise ValueError(f"Unsupported structural patch operation: {operation}")

        doc["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        saved = self._repo.save(VDocAggregateRecord(doc_id=safe_id, payload=doc))
        if self._cache is not None:
            self._cache.invalidate(safe_id)
        return saved

