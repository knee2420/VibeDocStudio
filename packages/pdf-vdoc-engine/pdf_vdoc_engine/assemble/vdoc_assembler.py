"""3단계(assemble): 판정된 구획과 격자 셀을 `.vdoc` (`VDocDocument`) AST로 조립한다."""
from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Any

from ..models import MeasuredGridTable, ZonePartitionResult


def _text_to_slot_html(raw_text: str) -> str:
    """원문 텍스트를 Tiptap 호환 HTML 및 인장(`data-vdoc-stamp`) 노드로 변환한다."""
    trimmed = raw_text.strip()
    if not trimmed:
        return "<p></p>"

    if trimmed == "(인)":
        return '<p><span data-vdoc-stamp="(인)" data-stamp-tone="red">(인)</span></p>'
    if trimmed == "(서명)":
        return '<p><span data-vdoc-stamp="(서명)" data-stamp-tone="blue">(서명)</span></p>'

    lines = [html.escape(line.strip()) for line in trimmed.splitlines() if line.strip()]
    return "<p>" + "<br/>".join(lines) + "</p>"


def _widths_to_percent(col_widths_pt: tuple[float, ...]) -> list[str]:
    total = sum(col_widths_pt) or 1.0
    return [f"{round((w / total) * 100.0, 2)}%" for w in col_widths_pt]


def _assemble_table_section(
    table: MeasuredGridTable,
    slots: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    rows_out: list[dict[str, Any]] = []
    for row in table.rows:
        cells_out: list[dict[str, Any]] = []
        for cell in row.cells:
            slot_id = f"{table.table_id}_r{cell.row_index}_c{cell.col_index}"
            is_locked = bool(cell.is_header_candidate)
            slots[slot_id] = {
                "slotId": slot_id,
                "label": cell.text[:24] if cell.text else f"셀 ({cell.row_index + 1},{cell.col_index + 1})",
                "role": "boilerplate" if is_locked else "editable-slot",
                "content": _text_to_slot_html(cell.text),
                "constraints": {"locked": True} if is_locked else {},
                "backDataRefs": [],
            }
            cell_dict: dict[str, Any] = {
                "cellId": f"cell_{slot_id}",
                "slotId": slot_id,
                "isHeader": is_locked,
                "vAlign": "middle" if is_locked else "top",
                "hAlign": "center" if is_locked else "left",
                "compact": True,
                "padding": "4px 6px",
            }
            if cell.col_span > 1:
                cell_dict["colSpan"] = cell.col_span
            if cell.row_span > 1:
                cell_dict["rowSpan"] = cell.row_span
            cells_out.append(cell_dict)

        rows_out.append(
            {
                "rowId": f"{table.table_id}_row_{row.row_index}",
                "height": f"{max(24, round(row.height_pt * 1.33))}px",
                "cells": cells_out,
            }
        )

    return {
        "sectionId": f"sec_{table.table_id}",
        "title": table.table_id,
        "columnWidths": _widths_to_percent(table.col_widths_pt),
        "rows": rows_out,
    }


def assemble_vdoc_document(
    *,
    doc_id: str,
    title: str,
    partitions: tuple[ZonePartitionResult, ...],
) -> dict[str, Any]:
    """페이지별 구획 판정 결과를 완전한 `.vdoc` (`VDocDocument`) JSON 사전으로 조립한다."""
    slots: dict[str, dict[str, Any]] = {}
    pages: list[dict[str, Any]] = []

    for part in partitions:
        pnum = part.page_number
        header_slot_id = f"p{pnum}_slot_header"
        footer_slot_id = f"p{pnum}_slot_footer"
        slots[header_slot_id] = {
            "slotId": header_slot_id,
            "label": f"{pnum}페이지 머리글",
            "role": "boilerplate",
            "content": f"<p>{html.escape(title)}</p>",
            "constraints": {"locked": True},
            "backDataRefs": [],
        }
        slots[footer_slot_id] = {
            "slotId": footer_slot_id,
            "label": f"{pnum}페이지 바닥글",
            "role": "boilerplate",
            "content": f"<p>Page {pnum}</p>",
            "constraints": {"locked": True},
            "backDataRefs": [],
        }

        blocks: list[dict[str, Any]] = []
        for z_idx, zone in enumerate(part.zones):
            block_id = f"p{pnum}_blk_{z_idx + 1}"
            if zone.kind == "form-title":
                title_slot_id = f"{zone.zone_id}_slot"
                slots[title_slot_id] = {
                    "slotId": title_slot_id,
                    "label": "양식 표제부",
                    "role": "boilerplate",
                    "content": f"<p><strong>{html.escape(zone.headline_text or title)}</strong></p>",
                    "constraints": {"locked": True},
                    "backDataRefs": [],
                }
                blocks.append(
                    {
                        "blockId": block_id,
                        "kind": "form-title",
                        "title": zone.title,
                        "slotId": title_slot_id,
                        "underlineWidth": "286px",
                        "underlineThickness": "2px",
                        "letterSpacing": "0.35em",
                    }
                )
            elif zone.kind == "composite-form-frame":
                sections = [
                    _assemble_table_section(tbl, slots) for tbl in zone.tables
                ]
                blocks.append(
                    {
                        "blockId": block_id,
                        "kind": "composite-form-frame",
                        "title": zone.title,
                        "outerBorderWidth": "2px",
                        "sections": sections,
                    }
                )
            elif zone.kind == "structured-table" and zone.tables:
                sec = _assemble_table_section(zone.tables[0], slots)
                blocks.append(
                    {
                        "blockId": block_id,
                        "kind": "structured-table",
                        "title": zone.title,
                        "columnWidths": sec["columnWidths"],
                        "rows": sec["rows"],
                    }
                )
            elif zone.kind == "section-block":
                h_slot = f"{zone.zone_id}_heading"
                b_slot = f"{zone.zone_id}_body"
                slots[h_slot] = {
                    "slotId": h_slot,
                    "label": "구획 제목",
                    "role": "boilerplate",
                    "content": f"<h2>{html.escape(zone.title)}</h2>",
                    "constraints": {"locked": True},
                    "backDataRefs": [],
                }
                slots[b_slot] = {
                    "slotId": b_slot,
                    "label": "구획 본문",
                    "role": "editable-slot",
                    "content": _text_to_slot_html(zone.headline_text),
                    "backDataRefs": [],
                }
                blocks.append(
                    {
                        "blockId": block_id,
                        "kind": "section-block",
                        "title": zone.title,
                        "headingSlotId": h_slot,
                        "bodySlotId": b_slot,
                    }
                )

        pages.append(
            {
                "pageId": f"page_{pnum}",
                "pageNumber": pnum,
                "pageLabel": f"{title} ({pnum}p)",
                "hideHeaderFooter": True,
                "headerSlotId": header_slot_id,
                "footerSlotId": footer_slot_id,
                "blocks": blocks,
            }
        )

    return {
        "version": "1.0.0",
        "docId": doc_id,
        "title": title,
        "status": "Draft",
        "totalValueText": "Auto-Extracted .vdoc",
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "variables": {},
        "pages": pages,
        "slots": slots,
        "backdata": {},
    }
