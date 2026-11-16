"""WorkingOutline JSON 직렬화 및 `.vdoc` 양방향 변환 매퍼."""
from __future__ import annotations

import copy
import hashlib
from html import escape, unescape
from html.parser import HTMLParser
from typing import Any

from app.core.clock import utc_now_iso
from app.core.storage import new_id

from .models import (
    WorkingOutlineNode,
    WorkingOutlineRecord,
    WorkingOutlineSourceRef,
)

_BLOCK_BREAK_TAGS = frozenset({
    "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
    "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
    "table", "td", "th", "tr", "ul",
})
_SKIP_TEXT_TAGS = frozenset({"script", "style", "noscript"})


class _HtmlPlainTextParser(HTMLParser):
    """WHATWG HTML5 엔티티 디코딩과 블록 공백 분리를 처리하는 표준 파서."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lower = tag.lower()
        if lower in _SKIP_TEXT_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth == 0 and lower in _BLOCK_BREAK_TAGS:
            self._parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower in _SKIP_TEXT_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth == 0 and lower in _BLOCK_BREAK_TAGS:
            self._parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data:
            self._parts.append(data.replace("\u00a0", " "))

    def text(self) -> str:
        return " ".join("".join(self._parts).split()).strip()


def _plain_text(html_or_text: Any) -> str:
    if not isinstance(html_or_text, str):
        return ""
    if "<" not in html_or_text:
        decoded = unescape(html_or_text) if "&" in html_or_text else html_or_text
        return " ".join(decoded.replace("\u00a0", " ").split()).strip()
    parser = _HtmlPlainTextParser()
    try:
        parser.feed(html_or_text)
        parser.close()
        return parser.text()
    except Exception:
        decoded = unescape(html_or_text)
        return " ".join(decoded.replace("\u00a0", " ").split()).strip()


def _to_html(text: str) -> str:
    trimmed = text.strip()
    if trimmed.startswith("<"):
        return trimmed
    return f"<p>{escape(trimmed)}</p>" if trimmed else "<p></p>"


def _content_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def source_ref_from_dict(raw: Any) -> WorkingOutlineSourceRef | None:
    if not isinstance(raw, dict):
        return None
    doc_id = str(raw.get("docId") or "").strip()
    if not doc_id:
        return None
    return WorkingOutlineSourceRef(
        doc_id=doc_id,
        page_id=raw.get("pageId"),
        block_id=raw.get("blockId"),
        slot_id=raw.get("slotId"),
        row_id=raw.get("rowId"),
        cell_id=raw.get("cellId"),
        section_id=raw.get("sectionId"),
        base_hash=raw.get("baseHash"),
    )


def source_ref_to_dict(ref: WorkingOutlineSourceRef | None) -> dict[str, Any] | None:
    if ref is None:
        return None
    data: dict[str, Any] = {"docId": ref.doc_id}
    if ref.page_id is not None:
        data["pageId"] = ref.page_id
    if ref.block_id is not None:
        data["blockId"] = ref.block_id
    if ref.slot_id is not None:
        data["slotId"] = ref.slot_id
    if ref.row_id is not None:
        data["rowId"] = ref.row_id
    if ref.cell_id is not None:
        data["cellId"] = ref.cell_id
    if ref.section_id is not None:
        data["sectionId"] = ref.section_id
    if ref.base_hash is not None:
        data["baseHash"] = ref.base_hash
    return data


def node_from_dict(raw: dict[str, Any]) -> WorkingOutlineNode:
    children_raw = raw.get("children") or []
    children = tuple(node_from_dict(c) for c in children_raw if isinstance(c, dict))
    return WorkingOutlineNode(
        node_id=str(raw.get("nodeId") or new_id("wo")),
        text=str(raw.get("text") or ""),
        element_kind=str(raw.get("elementKind") or "text"),
        note=str(raw.get("note") or ""),
        is_folded=bool(raw.get("isFolded", False)),
        is_completed=bool(raw.get("isCompleted", False)),
        media_target=raw.get("mediaTarget"),
        recommended_template_id=raw.get("recommendedTemplateId"),
        source_ref=source_ref_from_dict(raw.get("sourceRef")),
        children=children,
    )


def node_to_dict(node: WorkingOutlineNode) -> dict[str, Any]:
    out: dict[str, Any] = {
        "nodeId": node.node_id,
        "text": node.text,
        "elementKind": node.element_kind,
        "children": [node_to_dict(c) for c in node.children],
    }
    if node.note:
        out["note"] = node.note
    if node.is_folded:
        out["isFolded"] = True
    if node.is_completed:
        out["isCompleted"] = True
    if node.media_target is not None:
        out["mediaTarget"] = node.media_target
    if node.recommended_template_id is not None:
        out["recommendedTemplateId"] = node.recommended_template_id
    if node.source_ref is not None:
        out["sourceRef"] = source_ref_to_dict(node.source_ref)
    return out


def working_outline_from_dict(payload: dict[str, Any]) -> WorkingOutlineRecord:
    nodes_raw = payload.get("nodes") or []
    base_revs_raw = payload.get("baseDocRevisions") or {}
    base_revs = {str(k): int(v) for k, v in base_revs_raw.items()} if isinstance(base_revs_raw, dict) else {}
    return WorkingOutlineRecord(
        project_id=str(payload.get("projectId") or ""),
        revision=int(payload.get("revision") or 1),
        base_doc_revisions=base_revs,
        dirty=bool(payload.get("dirty", False)),
        updated_at=str(payload.get("updatedAt") or utc_now_iso()),
        nodes=tuple(node_from_dict(n) for n in nodes_raw if isinstance(n, dict)),
    )


def working_outline_to_dict(record: WorkingOutlineRecord) -> dict[str, Any]:
    return {
        "projectId": record.project_id,
        "revision": record.revision,
        "baseDocRevisions": dict(record.base_doc_revisions),
        "dirty": record.dirty,
        "updatedAt": record.updated_at,
        "nodes": [node_to_dict(n) for n in record.nodes],
    }


def _safe_media_url(raw: Any) -> str | None:
    if isinstance(raw, str) and raw and not raw.startswith("data:"):
        return raw
    return None


def _summary_item_slot_ids(items: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(items, list):
        return out
    for item in items:
        if not isinstance(item, dict):
            continue
        for key in ("slotId", "labelSlotId", "valueSlotId"):
            val = item.get(key)
            if isinstance(val, str) and val:
                out.append(val)
    return out


def _block_slot_ids(blk: dict[str, Any]) -> list[str]:
    kind = str(blk.get("kind") or "")
    if kind in {"structured-table", "table"}:
        ids = [
            cell["slotId"]
            for row in (blk.get("rows") or []) if isinstance(row, dict)
            for cell in (row.get("cells") or []) if isinstance(cell, dict) and isinstance(cell.get("slotId"), str)
        ]
        footer = blk.get("footerSummary")
        if isinstance(footer, dict):
            ids.extend(_summary_item_slot_ids(footer.get("items")))
        return ids
    if kind == "composite-form-frame":
        return [
            cell["slotId"]
            for sec in (blk.get("sections") or []) if isinstance(sec, dict)
            for row in (sec.get("rows") or []) if isinstance(row, dict)
            for cell in (row.get("cells") or []) if isinstance(cell, dict) and isinstance(cell.get("slotId"), str)
        ]
    if kind == "columns-grid":
        cols = blk.get("columns")
        if isinstance(cols, list):
            return [c["slotId"] for c in cols if isinstance(c, dict) and isinstance(c.get("slotId"), str)]
        return [s for s in (blk.get("slotIds") or []) if isinstance(s, str) and s]
    if kind == "section-block":
        return [
            s for s in (blk.get("headingSlotId") or blk.get("headerSlotId"), blk.get("bodySlotId"))
            if isinstance(s, str) and s
        ]
    if kind == "hero":
        return [s for s in (blk.get("titleSlotId"), blk.get("subtitleSlotId")) if isinstance(s, str) and s]
    if kind == "cover-banner":
        return [
            s for s in (blk.get("headlineSlotId"), blk.get("preparedBySlotId"), blk.get("preparedForSlotId"))
            if isinstance(s, str) and s
        ]
    if kind == "summary-list":
        return _summary_item_slot_ids(blk.get("items"))
    if kind in {"image", "divider", "spacer"}:
        return []
    sid = blk.get("slotId")
    return [sid] if isinstance(sid, str) and sid else []


def _slot_plain(slots: dict[str, Any], slot_id: str | None) -> str:
    if not slot_id:
        return ""
    slot = slots.get(slot_id)
    if not isinstance(slot, dict):
        return ""
    return _plain_text(slot.get("content"))


def _block_to_working_node(doc: dict[str, Any], page: dict[str, Any], blk: dict[str, Any]) -> WorkingOutlineNode:
    doc_id = str(doc.get("docId") or "")
    page_id = str(page.get("pageId") or "")
    blk_id = str(blk.get("blockId") or "")
    kind = str(blk.get("kind") or "text")
    slots = doc.get("slots") if isinstance(doc.get("slots"), dict) else {}

    def ref(slot_id: str | None = None, row_id: str | None = None, cell_id: str | None = None, section_id: str | None = None, text_hash: str | None = None) -> WorkingOutlineSourceRef:
        return WorkingOutlineSourceRef(
            doc_id=doc_id,
            page_id=page_id,
            block_id=blk_id,
            slot_id=slot_id,
            row_id=row_id,
            cell_id=cell_id,
            section_id=section_id,
            base_hash=text_hash,
        )

    if kind in {"structured-table", "table"}:
        row_nodes: list[WorkingOutlineNode] = []
        for r_idx, row in enumerate(blk.get("rows") or []):
            if not isinstance(row, dict):
                continue
            row_id = str(row.get("rowId") or f"row_{r_idx}")
            cells: list[WorkingOutlineNode] = []
            for c_idx, cell in enumerate(row.get("cells") or []):
                if not isinstance(cell, dict):
                    continue
                sid = cell.get("slotId")
                text = _slot_plain(slots, sid)
                slot_obj = slots.get(sid) if sid else None
                cells.append(
                    WorkingOutlineNode(
                        node_id=f"wo-cell-{doc_id}-{blk_id}-{cell.get('cellId') or c_idx}",
                        text=text or (slot_obj.get("label") if isinstance(slot_obj, dict) else f"C{c_idx + 1}"),
                        element_kind="table-cell",
                        note=str(slot_obj.get("label") or "") if isinstance(slot_obj, dict) else "",
                        source_ref=ref(slot_id=sid, row_id=row_id, cell_id=cell.get("cellId"), text_hash=_content_hash(text)),
                    )
                )
            row_nodes.append(
                WorkingOutlineNode(
                    node_id=f"wo-row-{doc_id}-{blk_id}-{row_id}",
                    text=f"{r_idx + 1}행",
                    element_kind="table-row",
                    source_ref=ref(row_id=row_id),
                    children=tuple(cells),
                )
            )
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=str(blk.get("title") or "표"),
            element_kind=kind,
            is_folded=len(row_nodes) >= 2,
            source_ref=ref(),
            children=tuple(row_nodes),
        )

    if kind == "composite-form-frame":
        sec_nodes: list[WorkingOutlineNode] = []
        for s_idx, sec in enumerate(blk.get("sections") or []):
            if not isinstance(sec, dict):
                continue
            sec_id = str(sec.get("sectionId") or f"sec_{s_idx}")
            r_nodes: list[WorkingOutlineNode] = []
            for r_idx, row in enumerate(sec.get("rows") or []):
                if not isinstance(row, dict):
                    continue
                row_id = str(row.get("rowId") or f"row_{r_idx}")
                c_nodes = []
                for c_idx, cell in enumerate(row.get("cells") or []):
                    if not isinstance(cell, dict):
                        continue
                    sid = cell.get("slotId")
                    text = _slot_plain(slots, sid)
                    slot_obj = slots.get(sid) if sid else None
                    c_nodes.append(
                        WorkingOutlineNode(
                            node_id=f"wo-cell-{doc_id}-{blk_id}-{sec_id}-{cell.get('cellId') or c_idx}",
                            text=text or (slot_obj.get("label") if isinstance(slot_obj, dict) else f"C{c_idx + 1}"),
                            element_kind="table-cell",
                            note=str(slot_obj.get("label") if isinstance(slot_obj, dict) else ""),
                            source_ref=ref(slot_id=sid, row_id=row_id, cell_id=cell.get("cellId"), section_id=sec_id, text_hash=_content_hash(text)),
                        )
                    )
                r_nodes.append(
                    WorkingOutlineNode(
                        node_id=f"wo-row-{doc_id}-{blk_id}-{sec_id}-{row_id}",
                        text=f"{r_idx + 1}행",
                        element_kind="table-row",
                        source_ref=ref(row_id=row_id, section_id=sec_id),
                        children=tuple(c_nodes),
                    )
                )
            sec_nodes.append(
                WorkingOutlineNode(
                    node_id=f"wo-sec-{doc_id}-{blk_id}-{sec_id}",
                    text=str(sec.get("title") or f"{s_idx + 1}구역"),
                    element_kind="section",
                    source_ref=ref(section_id=sec_id),
                    children=tuple(r_nodes),
                )
            )
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=str(blk.get("title") or "서식 프레임"),
            element_kind=kind,
            is_folded=True,
            source_ref=ref(),
            children=tuple(sec_nodes),
        )

    if kind == "columns-grid":
        col_nodes: list[WorkingOutlineNode] = []
        raw_cols = blk.get("columns")
        if isinstance(raw_cols, list):
            for idx, col in enumerate(raw_cols):
                if not isinstance(col, dict):
                    continue
                img = col.get("image")
                if isinstance(img, dict):
                    col_nodes.append(
                        WorkingOutlineNode(
                            node_id=f"wo-col-{doc_id}-{blk_id}-{idx}",
                            text=str(img.get("alt") or f"{idx + 1}단 이미지"),
                            element_kind="image",
                            media_target=_safe_media_url(img.get("src")),
                            source_ref=ref(),
                        )
                    )
                    continue
                col_sid = col.get("slotId")
                if isinstance(col_sid, str) and col_sid:
                    text = _slot_plain(slots, col_sid)
                    slot_obj = slots.get(col_sid)
                    label = str(slot_obj.get("label") or "") if isinstance(slot_obj, dict) else ""
                    col_nodes.append(
                        WorkingOutlineNode(
                            node_id=f"wo-col-{doc_id}-{blk_id}-{col_sid}",
                            text=text or label or f"{idx + 1}단",
                            element_kind="grid-col",
                            note=label if (label and text and label != text) else "",
                            source_ref=ref(slot_id=col_sid, text_hash=_content_hash(text)),
                        )
                    )
                    continue
                nested = tuple(_block_to_working_node(doc, page, nb) for nb in (col.get("blocks") or []) if isinstance(nb, dict))
                col_nodes.append(
                    WorkingOutlineNode(
                        node_id=f"wo-col-{doc_id}-{blk_id}-{idx}",
                        text=f"{idx + 1}단",
                        element_kind="grid-col",
                        source_ref=ref(),
                        children=nested,
                    )
                )
        else:
            for idx, col_sid in enumerate(blk.get("slotIds") or []):
                if not isinstance(col_sid, str) or not col_sid:
                    continue
                text = _slot_plain(slots, col_sid)
                slot_obj = slots.get(col_sid)
                label = str(slot_obj.get("label") or "") if isinstance(slot_obj, dict) else ""
                col_nodes.append(
                    WorkingOutlineNode(
                        node_id=f"wo-col-{doc_id}-{blk_id}-{col_sid}",
                        text=text or label or f"{idx + 1}단",
                        element_kind="grid-col",
                        note=label if (label and text and label != text) else "",
                        source_ref=ref(slot_id=col_sid, text_hash=_content_hash(text)),
                    )
                )
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=str(blk.get("title") or "다단 레이아웃"),
            element_kind=kind,
            source_ref=ref(),
            children=tuple(col_nodes),
        )

    if kind == "image":
        text = str(blk.get("caption") or blk.get("alt") or blk.get("title") or "이미지")
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=text,
            element_kind="image",
            media_target=_safe_media_url(blk.get("src")),
            source_ref=ref(),
        )

    if kind in {"divider", "spacer"}:
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=str(blk.get("title") or ("구분선" if kind == "divider" else "여백")),
            element_kind=kind,
            source_ref=ref(),
        )

    slot_ids = _block_slot_ids(blk)
    if len(slot_ids) == 1:
        sid = slot_ids[0]
        text = _slot_plain(slots, sid) or str(blk.get("title") or "")
        slot_obj = slots.get(sid)
        label = str(slot_obj.get("label") or "") if isinstance(slot_obj, dict) else ""
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=text or kind,
            element_kind=kind,
            note=label if (label and text and label != text and kind not in {"heading", "text"}) else "",
            source_ref=ref(slot_id=sid, text_hash=_content_hash(text)),
        )

    if len(slot_ids) > 1:
        slot_children: list[WorkingOutlineNode] = []
        for sid in slot_ids:
            text = _slot_plain(slots, sid)
            slot_obj = slots.get(sid)
            label = str(slot_obj.get("label") or "") if isinstance(slot_obj, dict) else ""
            slot_children.append(
                WorkingOutlineNode(
                    node_id=f"wo-slot-{doc_id}-{sid}",
                    text=text or label or sid,
                    element_kind="slot",
                    note=label if (label and text and label != text) else "",
                    source_ref=ref(slot_id=sid, text_hash=_content_hash(text)),
                )
            )
        return WorkingOutlineNode(
            node_id=f"wo-blk-{doc_id}-{blk_id}",
            text=str(blk.get("title") or kind),
            element_kind=kind,
            media_target=_safe_media_url(blk.get("image")) if kind == "hero" else None,
            source_ref=ref(),
            children=tuple(slot_children),
        )

    return WorkingOutlineNode(
        node_id=f"wo-blk-{doc_id}-{blk_id}",
        text=str(blk.get("title") or kind),
        element_kind=kind,
        source_ref=ref(),
    )


def extract_working_outline_from_docs(
    project_id: str,
    project_title: str,
    docs: list[dict[str, Any]],
    *,
    now: str = "",
) -> WorkingOutlineRecord:
    base_revs: dict[str, int] = {}
    doc_nodes: list[WorkingOutlineNode] = []
    for doc_idx, doc in enumerate(docs):
        doc_id = str(doc.get("docId") or "")
        if not doc_id:
            continue
        base_revs[doc_id] = int(doc.get("revision") or 1)
        page_nodes: list[WorkingOutlineNode] = []
        for p_idx, page in enumerate(doc.get("pages") or []):
            if not isinstance(page, dict):
                continue
            page_id = str(page.get("pageId") or f"p_{p_idx + 1}")
            blk_nodes = tuple(
                _block_to_working_node(doc, page, blk)
                for blk in (page.get("blocks") or [])
                if isinstance(blk, dict)
            )
            page_nodes.append(
                WorkingOutlineNode(
                    node_id=f"wo-page-{doc_id}-{page_id}",
                    text=str(page.get("pageLabel") or f"Page {page.get('pageNumber') or p_idx + 1}"),
                    element_kind="page",
                    is_folded=p_idx > 0 and len(doc.get("pages") or []) > 3,
                    source_ref=WorkingOutlineSourceRef(doc_id=doc_id, page_id=page_id),
                    children=blk_nodes,
                )
            )
        doc_nodes.append(
            WorkingOutlineNode(
                node_id=f"wo-doc-{doc_id}",
                text=str(doc.get("title") or project_title or "문서"),
                element_kind="document",
                is_folded=doc_idx > 0,
                source_ref=WorkingOutlineSourceRef(doc_id=doc_id),
                children=tuple(page_nodes),
            )
        )

    if not doc_nodes:
        doc_nodes.append(
            WorkingOutlineNode(
                node_id=new_id("wo_doc"),
                text=project_title or "새 문서",
                element_kind="document",
                children=(
                    WorkingOutlineNode(
                        node_id=new_id("wo_page"),
                        text="페이지 1",
                        element_kind="page",
                        children=(
                            WorkingOutlineNode(
                                node_id=new_id("wo_txt"),
                                text="문서 핵심 요약",
                                element_kind="text",
                            ),
                        ),
                    ),
                ),
            )
        )

    return WorkingOutlineRecord(
        project_id=project_id,
        revision=1,
        base_doc_revisions=base_revs,
        dirty=False,
        updated_at=now or utc_now_iso(),
        nodes=tuple(doc_nodes),
    )


def _iter_doc_blocks(blocks: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for blk in blocks:
        if not isinstance(blk, dict):
            continue
        out.append(blk)
        for col in blk.get("columns") or []:
            if isinstance(col, dict) and isinstance(col.get("blocks"), list):
                out.extend(_iter_doc_blocks(col["blocks"]))
    return out


def _find_base_block(base_doc: dict[str, Any] | None, block_id: str | None) -> dict[str, Any] | None:
    if not base_doc or not block_id:
        return None
    for page in base_doc.get("pages") or []:
        for blk in _iter_doc_blocks(page.get("blocks") or []):
            if blk.get("blockId") == block_id:
                return blk
    return None


def _find_base_cell(base_block: dict[str, Any] | None, cell_id: str | None, slot_id: str | None) -> dict[str, Any] | None:
    if not base_block:
        return None
    row_groups: list[list[dict[str, Any]]] = []
    if isinstance(base_block.get("rows"), list):
        row_groups.append(base_block["rows"])
    for sec in base_block.get("sections") or []:
        if isinstance(sec, dict) and isinstance(sec.get("rows"), list):
            row_groups.append(sec["rows"])
    for rows in row_groups:
        for row in rows:
            if not isinstance(row, dict):
                continue
            for cell in row.get("cells") or []:
                if not isinstance(cell, dict):
                    continue
                if (cell_id and cell.get("cellId") == cell_id) or (slot_id and cell.get("slotId") == slot_id):
                    return cell
    return None


def _replace_slot_id_in_block(blk: dict[str, Any], old_sid: str, new_sid: str) -> None:
    if not old_sid or old_sid == new_sid:
        return
    for key in ("slotId", "headingSlotId", "headerSlotId", "bodySlotId", "titleSlotId", "subtitleSlotId", "headlineSlotId", "preparedBySlotId", "preparedForSlotId"):
        if blk.get(key) == old_sid:
            blk[key] = new_sid
    if isinstance(blk.get("items"), list):
        for item in blk["items"]:
            if isinstance(item, dict):
                for key in ("slotId", "labelSlotId", "valueSlotId"):
                    if item.get(key) == old_sid:
                        item[key] = new_sid
    if isinstance(blk.get("slotIds"), list):
        blk["slotIds"] = [new_sid if s == old_sid else s for s in blk["slotIds"]]
    if isinstance(blk.get("columns"), list):
        for col in blk["columns"]:
            if isinstance(col, dict) and col.get("slotId") == old_sid:
                col["slotId"] = new_sid


def compile_preview_docs(
    record: WorkingOutlineRecord,
    project_title: str,
    base_docs: list[dict[str, Any]],
    *,
    now: str = "",
) -> list[dict[str, Any]]:
    base_by_id = {str(d.get("docId")): d for d in base_docs if isinstance(d, dict) and d.get("docId")}
    ts = now or utc_now_iso()
    seq = 0

    def next_id(prefix: str) -> str:
        nonlocal seq
        seq += 1
        return f"{prefix}_cmp_{seq}"

    def make_slot(slots: dict[str, Any], slot_id: str, label: str, text: str, base_slot: dict[str, Any] | None) -> str:
        html = _to_html(text)
        if base_slot:
            cloned = copy.deepcopy(base_slot)
            if _plain_text(base_slot.get("content")) != _plain_text(html):
                cloned["content"] = html
                cloned["isEdited"] = True
            cloned["slotId"] = slot_id
            slots[slot_id] = cloned
        else:
            slots[slot_id] = {
                "slotId": slot_id,
                "label": label,
                "role": "editable-slot",
                "content": html,
                "backDataRefs": [],
            }
        return slot_id

    def alloc_slot(raw_sid: str | None, prefix: str) -> str:
        sid = raw_sid if raw_sid and raw_sid not in used_slots else next_id(prefix)
        used_slots.add(sid)
        return sid

    def copy_base_slots(sids: list[str], base_slots: dict[str, Any], slots: dict[str, Any]) -> None:
        for sid in sids:
            if not sid or sid in slots:
                continue
            base_slot = base_slots.get(sid)
            if isinstance(base_slot, dict):
                cloned = copy.deepcopy(base_slot)
                cloned["slotId"] = sid
                slots[sid] = cloned
                used_slots.add(sid)

    def _compile_rows(
        row_nodes: list[WorkingOutlineNode],
        base_blk: dict[str, Any] | None,
        base_slots: dict[str, Any],
        slots: dict[str, Any],
        existing_cols: Any = None,
        default_header_first: bool = False,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        max_cols = max(
            1,
            len(existing_cols) if isinstance(existing_cols, list) else 0,
            *(max(1, len(r.children)) for r in row_nodes) if row_nodes else [1],
        )
        col_widths = (
            existing_cols
            if isinstance(existing_cols, list) and len(existing_cols) >= max_cols
            else [f"{100 // max_cols}%" for _ in range(max_cols)]
        )
        rows: list[dict[str, Any]] = []
        for r_idx, r_node in enumerate(row_nodes):
            cell_nodes = list(r_node.children) if r_node.children else [r_node]
            cells: list[dict[str, Any]] = []
            for c_idx, c_node in enumerate(cell_nodes):
                raw_sid = c_node.source_ref.slot_id if c_node.source_ref else None
                sid = alloc_slot(raw_sid, "slot_tc")
                make_slot(
                    slots,
                    sid,
                    c_node.note or f"{r_idx + 1}행 {c_idx + 1}열",
                    c_node.text,
                    base_slots.get(raw_sid) if raw_sid else None,
                )
                base_cell = _find_base_cell(
                    base_blk,
                    c_node.source_ref.cell_id if c_node.source_ref else None,
                    raw_sid,
                )
                if base_cell:
                    c_copy = copy.deepcopy(base_cell)
                    c_copy["slotId"] = sid
                    cells.append(c_copy)
                else:
                    cells.append({
                        "cellId": next_id("cell"),
                        "slotId": sid,
                        "isHeader": r_idx == 0 and default_header_first,
                        "vAlign": "middle",
                    })
            rows.append({
                "rowId": (
                    r_node.source_ref.row_id
                    if r_node.source_ref and r_node.source_ref.row_id
                    else next_id("row")
                ),
                "cells": cells,
            })
        if not rows:
            s1, s2 = alloc_slot(None, "slot_tc1"), alloc_slot(None, "slot_tc2")
            make_slot(slots, s1, "항목", "항목", None)
            make_slot(slots, s2, "내용", "내용", None)
            rows = [{
                "rowId": next_id("row"),
                "cells": [
                    {"cellId": next_id("cell"), "slotId": s1, "isHeader": True},
                    {"cellId": next_id("cell"), "slotId": s2, "isHeader": True},
                ],
            }]
        return rows, col_widths

    def compile_block(node: WorkingOutlineNode, base_doc: dict[str, Any] | None, slots: dict[str, Any], used_slots: set[str]) -> list[dict[str, Any]]:
        base_slots = base_doc.get("slots", {}) if isinstance(base_doc, dict) else {}
        base_blk = _find_base_block(base_doc, node.source_ref.block_id if node.source_ref else None)
        kind = node.element_kind

        if kind in {"structured-table", "table"}:
            existing = copy.deepcopy(base_blk) if base_blk and base_blk.get("kind") in {"structured-table", "table"} else None
            row_nodes = [c for c in node.children if c.element_kind == "table-row"] or list(node.children)
            rows, col_widths = _compile_rows(
                row_nodes,
                base_blk,
                base_slots,
                slots,
                existing_cols=existing.get("columnWidths") if isinstance(existing, dict) else None,
                default_header_first=existing is None,
            )
            if existing is not None:
                existing["title"] = node.text or existing.get("title") or "표"
                existing["columnWidths"] = col_widths
                existing["rows"] = rows
                footer = existing.get("footerSummary")
                if isinstance(footer, dict):
                    copy_base_slots(_summary_item_slot_ids(footer.get("items")), base_slots, slots)
                return [existing]
            return [{
                "blockId": next_id("blk_tbl"),
                "kind": "structured-table",
                "title": node.text or "표",
                "columnWidths": col_widths,
                "borderRules": {"outer": "1px solid #eaeaea", "rowBottom": "1px solid #eaeaea", "vertical": "1px solid #eaeaea"},
                "headerStyle": {"bg": "#f5f5f6", "fontWeight": "600", "padding": "8px"},
                "cellPadding": "8px",
                "rows": rows,
            }]

        if kind == "composite-form-frame":
            existing = copy.deepcopy(base_blk) if base_blk and base_blk.get("kind") == "composite-form-frame" else None
            base_sections = existing.get("sections") if isinstance(existing, dict) and isinstance(existing.get("sections"), list) else []
            sec_nodes = [c for c in node.children if c.element_kind == "section"]
            if not sec_nodes and node.children:
                sec_nodes = [
                    WorkingOutlineNode(
                        node_id=next_id("wo_sec"),
                        text=node.text or "1구역",
                        element_kind="section",
                        children=node.children,
                    )
                ]
            compiled_sections: list[dict[str, Any]] = []
            for s_idx, sec_node in enumerate(sec_nodes):
                req_sec_id = sec_node.source_ref.section_id if sec_node.source_ref else None
                base_sec = next(
                    (s for s in base_sections if isinstance(s, dict) and req_sec_id and s.get("sectionId") == req_sec_id),
                    base_sections[s_idx] if s_idx < len(base_sections) and isinstance(base_sections[s_idx], dict) else None,
                )
                r_nodes = [r for r in sec_node.children if r.element_kind == "table-row"] or list(sec_node.children)
                rows, col_widths = _compile_rows(
                    r_nodes,
                    base_blk,
                    base_slots,
                    slots,
                    existing_cols=base_sec.get("columnWidths") if isinstance(base_sec, dict) else None,
                    default_header_first=base_sec is None,
                )
                sec_obj = copy.deepcopy(base_sec) if base_sec else {
                    "sectionId": req_sec_id or next_id("sec"),
                    "title": sec_node.text or f"{s_idx + 1}구역",
                    "columnWidths": col_widths,
                    "rows": [],
                }
                sec_obj["title"] = sec_node.text or sec_obj.get("title") or f"{s_idx + 1}구역"
                sec_obj["rows"] = rows
                compiled_sections.append(sec_obj)
            if not compiled_sections and base_sections:
                copy_base_slots(_block_slot_ids(existing), base_slots, slots)
                compiled_sections = base_sections
            if existing is not None:
                existing["title"] = node.text or existing.get("title") or "서식 프레임"
                existing["sections"] = compiled_sections
                return [existing]
            return [{
                "blockId": next_id("blk_frame"),
                "kind": "composite-form-frame",
                "title": node.text or "서식 프레임",
                "sections": compiled_sections,
            }]

        if kind == "columns-grid":
            existing = copy.deepcopy(base_blk) if base_blk and base_blk.get("kind") == "columns-grid" else None
            col_nodes = list(node.children)
            orig_cols = existing.get("columns") if isinstance(existing, dict) and isinstance(existing.get("columns"), list) else None
            has_structured_cols = orig_cols is not None or any(c.element_kind in {"image", "media"} or bool(c.children) for c in col_nodes)
            if has_structured_cols:
                cols_out: list[dict[str, Any]] = []
                for idx, c_node in enumerate(col_nodes):
                    orig_col = copy.deepcopy(orig_cols[idx]) if orig_cols and idx < len(orig_cols) and isinstance(orig_cols[idx], dict) else {}
                    if c_node.element_kind in {"image", "media"} or (isinstance(orig_col.get("image"), dict) and not (c_node.source_ref and c_node.source_ref.slot_id) and not c_node.children):
                        orig_img = orig_col.get("image") if isinstance(orig_col.get("image"), dict) else {}
                        col_obj = {k: v for k, v in orig_col.items() if k not in {"slotId", "blocks"}}
                        col_obj["image"] = {
                            **orig_img,
                            "src": c_node.media_target or orig_img.get("src") or "",
                            "alt": orig_img.get("alt") or c_node.text or f"{idx + 1}단 이미지",
                        }
                        cols_out.append(col_obj)
                    elif c_node.children:
                        nested_blocks: list[dict[str, Any]] = []
                        for child in c_node.children:
                            nested_blocks.extend(compile_block(child, base_doc, slots, used_slots))
                        col_obj = {k: v for k, v in orig_col.items() if k not in {"slotId", "image"}}
                        col_obj["blocks"] = nested_blocks
                        cols_out.append(col_obj)
                    else:
                        raw_sid = (c_node.source_ref.slot_id if c_node.source_ref else None) or orig_col.get("slotId")
                        sid = alloc_slot(raw_sid, "slot_col")
                        make_slot(
                            slots,
                            sid,
                            c_node.note or f"{idx + 1}단",
                            c_node.text,
                            base_slots.get(raw_sid) if raw_sid else None,
                        )
                        col_obj = {k: v for k, v in orig_col.items() if k not in {"blocks", "image"}}
                        col_obj["slotId"] = sid
                        cols_out.append(col_obj)
                if not cols_out and orig_cols:
                    for oc in orig_cols:
                        if isinstance(oc, dict) and isinstance(oc.get("slotId"), str) and oc["slotId"]:
                            copy_base_slots([oc["slotId"]], base_slots, slots)
                    cols_out = orig_cols
                if existing is not None:
                    existing["title"] = node.text or existing.get("title") or "다단 레이아웃"
                    existing["columns"] = cols_out
                    return [existing]
                return [{
                    "blockId": next_id("blk_cols"),
                    "kind": "columns-grid",
                    "title": node.text or "다단 레이아웃",
                    "widths": ["1fr" for _ in cols_out] or ["1fr", "1fr"],
                    "cardStyle": "plain",
                    "columns": cols_out,
                }]

            orig_sids = existing.get("slotIds") if isinstance(existing, dict) and isinstance(existing.get("slotIds"), list) else []
            col_sids: list[str] = []
            for idx, c_node in enumerate(col_nodes):
                raw_sid = (c_node.source_ref.slot_id if c_node.source_ref else None) or (orig_sids[idx] if idx < len(orig_sids) else None)
                sid = alloc_slot(raw_sid, "slot_col")
                make_slot(
                    slots,
                    sid,
                    c_node.note or f"{idx + 1}단",
                    c_node.text,
                    base_slots.get(raw_sid) if raw_sid else None,
                )
                col_sids.append(sid)
            if not col_sids and orig_sids:
                copy_base_slots([s for s in orig_sids if isinstance(s, str)], base_slots, slots)
                col_sids = list(orig_sids)
            if existing is not None:
                existing["title"] = node.text or existing.get("title") or "다단 레이아웃"
                existing["slotIds"] = col_sids
                return [existing]
            return [{
                "blockId": next_id("blk_cols"),
                "kind": "columns-grid",
                "title": node.text or "다단 레이아웃",
                "widths": ["1fr" for _ in col_sids] or ["1fr", "1fr"],
                "cardStyle": "plain",
                "slotIds": col_sids,
            }]

        if kind == "section":
            blocks: list[dict[str, Any]] = []
            if node.text:
                sid = alloc_slot(None, "slot_sec")
                make_slot(slots, sid, "구역 제목", f"<h3>{escape(node.text)}</h3>", None)
                blocks.append({"blockId": next_id("blk_sec"), "kind": "text", "slotId": sid, "variant": "h3"})
            for child in node.children:
                blocks.extend(compile_block(child, base_doc, slots, used_slots))
            return blocks

        if kind in {"divider", "spacer"}:
            if base_blk and base_blk.get("kind") == kind:
                out_div = copy.deepcopy(base_blk)
                return [out_div]
            return [{"blockId": next_id("blk"), "kind": kind}]

        if kind == "image":
            if base_blk and base_blk.get("kind") == "image":
                out_img = copy.deepcopy(base_blk)
                if node.media_target:
                    out_img["src"] = node.media_target
                if node.text and not out_img.get("alt"):
                    out_img["alt"] = node.text
                return [out_img]
            return [{
                "blockId": next_id("blk_img"),
                "kind": "image",
                "src": node.media_target or "",
                "alt": node.text or "이미지",
            }]

        slot_children = [c for c in node.children if c.element_kind == "slot"]

        if base_blk and base_blk.get("kind") == kind:
            out_blk = copy.deepcopy(base_blk)
            base_slot_ids = _block_slot_ids(out_blk)
            if kind == "hero" and node.media_target:
                if isinstance(out_blk.get("image"), dict):
                    out_blk["image"]["src"] = node.media_target
                else:
                    out_blk["image"] = {"src": node.media_target, "alt": node.text or "히어로 이미지"}
            if slot_children:
                for idx, sc in enumerate(slot_children):
                    raw_sid = (sc.source_ref.slot_id if sc.source_ref else None) or (base_slot_ids[idx] if idx < len(base_slot_ids) else None)
                    sid = alloc_slot(raw_sid, "slot")
                    make_slot(
                        slots,
                        sid,
                        sc.note or sc.text[:24] or "본문",
                        sc.text,
                        base_slots.get(raw_sid) if raw_sid else None,
                    )
                    if raw_sid and sid != raw_sid:
                        _replace_slot_id_in_block(out_blk, raw_sid, sid)
                copy_base_slots(base_slot_ids, base_slots, slots)
            elif base_slot_ids:
                raw_sid = (node.source_ref.slot_id if node.source_ref and node.source_ref.slot_id else None) or base_slot_ids[0]
                sid = alloc_slot(raw_sid, "slot")
                make_slot(
                    slots,
                    sid,
                    node.note or node.text[:24] or "본문",
                    node.text,
                    base_slots.get(raw_sid) if raw_sid else None,
                )
                if raw_sid and sid != raw_sid:
                    _replace_slot_id_in_block(out_blk, raw_sid, sid)
                copy_base_slots(base_slot_ids, base_slots, slots)
            return [out_blk]

        if kind == "section-block":
            h_node = slot_children[0] if len(slot_children) >= 1 else node
            b_node = slot_children[1] if len(slot_children) >= 2 else None
            h_sid = alloc_slot(h_node.source_ref.slot_id if h_node.source_ref else None, "slot_sec_h")
            b_sid = alloc_slot(b_node.source_ref.slot_id if b_node and b_node.source_ref else None, "slot_sec_b")
            make_slot(slots, h_sid, "섹션 제목", h_node.text or "새 섹션", base_slots.get(h_sid))
            make_slot(slots, b_sid, "섹션 본문", b_node.text if b_node else (node.note or ""), base_slots.get(b_sid))
            return [{"blockId": next_id("blk_secb"), "kind": "section-block", "title": node.text or "텍스트 섹션", "headingSlotId": h_sid, "bodySlotId": b_sid}]

        if kind == "hero":
            t_node = slot_children[0] if len(slot_children) >= 1 else node
            s_node = slot_children[1] if len(slot_children) >= 2 else None
            t_sid = alloc_slot(t_node.source_ref.slot_id if t_node.source_ref else None, "slot_hero_t")
            make_slot(slots, t_sid, "제목", t_node.text or "히어로 제목", base_slots.get(t_sid))
            hero_blk: dict[str, Any] = {"blockId": next_id("blk_hero"), "kind": "hero", "title": node.text or "히어로", "titleSlotId": t_sid}
            if s_node is not None:
                s_sid = alloc_slot(s_node.source_ref.slot_id if s_node.source_ref else None, "slot_hero_s")
                make_slot(slots, s_sid, "부제", s_node.text, base_slots.get(s_sid))
                hero_blk["subtitleSlotId"] = s_sid
            if node.media_target:
                hero_blk["image"] = {"src": node.media_target, "alt": node.text or "히어로 이미지"}
            return [hero_blk]

        if kind == "cover-banner":
            c_nodes = slot_children or [node]
            sids: list[str] = []
            for idx, cn in enumerate(c_nodes[:3]):
                cid = alloc_slot(cn.source_ref.slot_id if cn.source_ref else None, f"slot_cov_{idx}")
                make_slot(slots, cid, cn.note or f"표지 {idx + 1}", cn.text, base_slots.get(cid))
                sids.append(cid)
            while len(sids) < 3:
                pad_id = alloc_slot(None, f"slot_cov_{len(sids)}")
                make_slot(slots, pad_id, f"표지 {len(sids) + 1}", "", None)
                sids.append(pad_id)
            return [{
                "blockId": next_id("blk_cov"),
                "kind": "cover-banner",
                "title": node.text or "표지 배너",
                "backgroundTheme": "dark-architecture",
                "headlineSlotId": sids[0],
                "preparedBySlotId": sids[1],
                "preparedForSlotId": sids[2],
            }]

        if kind == "summary-list":
            s_nodes = slot_children or [node]
            items = []
            for idx, sn in enumerate(s_nodes):
                item_sid = alloc_slot(sn.source_ref.slot_id if sn.source_ref else None, f"slot_sum_{idx}")
                make_slot(slots, item_sid, sn.note or f"요약 {idx + 1}", sn.text, base_slots.get(item_sid))
                items.append({"itemId": next_id("sum"), "slotId": item_sid})
            return [{"blockId": next_id("blk_sum"), "kind": "summary-list", "title": node.text or "핵심 요약", "items": items}]

        raw_sid = node.source_ref.slot_id if node.source_ref else None
        sid = alloc_slot(raw_sid, "slot")
        make_slot(slots, sid, node.note or node.text[:24] or "본문", node.text, base_slots.get(raw_sid) if raw_sid else None)
        out_kind = kind if kind in {"text", "heading", "form-title", "callout-box", "fillable-group", "link-card"} else "text"
        return [{
            "blockId": next_id("blk"),
            "kind": out_kind,
            "slotId": sid,
        }]

    top_docs = list(record.nodes)
    if top_docs and not any(n.element_kind == "document" for n in top_docs):
        top_docs = [
            WorkingOutlineNode(
                node_id=next_id("wo_doc"),
                text=project_title or "새 문서",
                element_kind="document",
                children=tuple(top_docs),
            )
        ]

    compiled_docs: list[dict[str, Any]] = []
    for doc_idx, doc_node in enumerate(top_docs):
        doc_id = (
            doc_node.source_ref.doc_id
            if doc_node.source_ref and doc_node.source_ref.doc_id
            else (next(iter(base_by_id)) if doc_idx == 0 and base_by_id else f"vdoc-{doc_node.node_id}")
        )
        base_doc = base_by_id.get(doc_id)
        slots: dict[str, Any] = {}
        used_slots: set[str] = set()
        page_nodes: list[WorkingOutlineNode] = []
        loose: list[WorkingOutlineNode] = []
        for child in doc_node.children:
            if child.element_kind == "page":
                if loose:
                    page_nodes.append(WorkingOutlineNode(node_id=next_id("wo_p"), text="페이지", element_kind="page", children=tuple(loose)))
                    loose = []
                page_nodes.append(child)
            else:
                loose.append(child)
        if loose or not page_nodes:
            page_nodes.append(WorkingOutlineNode(node_id=next_id("wo_p"), text="페이지 1", element_kind="page", children=tuple(loose)))

        base_slots = base_doc.get("slots", {}) if isinstance(base_doc, dict) else {}
        pages = []
        for p_idx, p_node in enumerate(page_nodes):
            base_page = next((p for p in (base_doc.get("pages") or []) if p_node.source_ref and p.get("pageId") == p_node.source_ref.page_id), None) if base_doc else None
            blocks: list[dict[str, Any]] = []
            for child in p_node.children:
                blocks.extend(compile_block(child, base_doc, slots, used_slots))
            page_obj = copy.deepcopy(base_page) if base_page else {"pageId": next_id("page"), "pageNumber": p_idx + 1, "pageLabel": p_node.text or f"페이지 {p_idx + 1}", "blocks": []}
            if isinstance(base_page, dict):
                copy_base_slots(
                    [s for s in (base_page.get("headerSlotId"), base_page.get("footerSlotId")) if isinstance(s, str) and s],
                    base_slots,
                    slots,
                )
            page_obj["pageNumber"] = p_idx + 1
            page_obj["pageLabel"] = p_node.text or page_obj.get("pageLabel") or f"페이지 {p_idx + 1}"
            page_obj["blocks"] = blocks
            pages.append(page_obj)

        compiled_docs.append({
            "version": "1.0.0",
            "docId": doc_id,
            "title": doc_node.text or (base_doc.get("title") if base_doc else "새 문서"),
            "status": base_doc.get("status", "Draft") if base_doc else "Draft",
            "updatedAt": ts,
            "variables": copy.deepcopy(base_doc.get("variables", {})) if base_doc else {},
            "pages": pages,
            "slots": slots,
            "backdata": copy.deepcopy(base_doc.get("backdata", {})) if base_doc else {},
            "revision": base_doc.get("revision") if base_doc else 1,
            "projectId": record.project_id,
        })
    return compiled_docs
