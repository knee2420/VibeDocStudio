"""4단계(validate): `.vdoc` 문서의 표 격자 보존 불변식(`Σ colSpan == N_cols`)과 슬롯 참조 무결성을 검증한다."""
from __future__ import annotations

from typing import Any

from ..models import ValidationScore


def _validate_table_matrix(
    table_label: str,
    column_widths: list[str],
    rows: list[dict[str, Any]],
    slots: dict[str, Any],
    errors: list[str],
) -> None:
    expected_cols = len(column_widths)
    if expected_cols == 0:
        errors.append(f"[{table_label}] columnWidths is empty")
        return

    # rowSpan으로 인해 아래 행에서 이미 점유된 열 개수를 추적
    carry_over: dict[int, int] = {}

    for r_idx, row in enumerate(rows):
        inherited_cols = carry_over.pop(r_idx, 0)
        row_span_sum = inherited_cols
        for cell in row.get("cells", []):
            slot_id = str(cell.get("slotId", ""))
            if slot_id not in slots:
                errors.append(f"[{table_label}] row {r_idx} references missing slotId '{slot_id}'")
            c_span = int(cell.get("colSpan", 1))
            r_span = int(cell.get("rowSpan", 1))
            row_span_sum += c_span
            if r_span > 1:
                for delta in range(1, r_span):
                    carry_over[r_idx + delta] = carry_over.get(r_idx + delta, 0) + c_span

        if row_span_sum != expected_cols:
            errors.append(
                f"[{table_label}] row {r_idx} active colSpan sum ({row_span_sum}) != columnWidths count ({expected_cols})"
            )


def validate_vdoc_invariants(vdoc: dict[str, Any]) -> ValidationScore:
    """`.vdoc` AST의 격자 불변식과 슬롯 참조 무결성을 채점한다."""
    errors: list[str] = []
    slots = vdoc.get("slots", {})
    pages = vdoc.get("pages", [])

    checked_tables = 0
    referenced_slots: set[str] = set()

    for page in pages:
        for hf_key in ("headerSlotId", "footerSlotId"):
            hf_slot = page.get(hf_key)
            if hf_slot:
                referenced_slots.add(str(hf_slot))
                if hf_slot not in slots:
                    errors.append(f"[page {page.get('pageId')}] missing {hf_key} '{hf_slot}'")

        for block in page.get("blocks", []):
            kind = block.get("kind")
            block_id = block.get("blockId", "unknown_block")
            if kind == "form-title":
                sid = block.get("slotId")
                referenced_slots.add(str(sid))
                if sid not in slots:
                    errors.append(f"[{block_id}] missing slotId '{sid}'")
            elif kind == "composite-form-frame":
                for sec in block.get("sections", []):
                    checked_tables += 1
                    for r in sec.get("rows", []):
                        for c in r.get("cells", []):
                            referenced_slots.add(str(c.get("slotId", "")))
                    _validate_table_matrix(
                        f"{block_id}/{sec.get('sectionId')}",
                        sec.get("columnWidths", []),
                        sec.get("rows", []),
                        slots,
                        errors,
                    )
            elif kind == "structured-table":
                checked_tables += 1
                for r in block.get("rows", []):
                    for c in r.get("cells", []):
                        referenced_slots.add(str(c.get("slotId", "")))
                _validate_table_matrix(
                    block_id,
                    block.get("columnWidths", []),
                    block.get("rows", []),
                    slots,
                    errors,
                )
            elif kind == "columns-grid":
                for sid in block.get("slotIds", []):
                    referenced_slots.add(str(sid))
                    if sid not in slots:
                        errors.append(f"[{block_id}] missing slotId '{sid}'")
            elif kind == "section-block":
                for key in ("headingSlotId", "bodySlotId"):
                    sid = block.get(key)
                    referenced_slots.add(str(sid))
                    if sid not in slots:
                        errors.append(f"[{block_id}] missing {key} '{sid}'")
            elif kind == "cover-banner":
                for key in ("headlineSlotId", "preparedBySlotId", "preparedForSlotId"):
                    sid = block.get(key)
                    referenced_slots.add(str(sid))
                    if sid not in slots:
                        errors.append(f"[{block_id}] missing {key} '{sid}'")
            elif kind == "fillable-group":
                sid = block.get("slotId")
                referenced_slots.add(str(sid))
                if sid not in slots:
                    errors.append(f"[{block_id}] missing slotId '{sid}'")

    grid_errors = [e for e in errors if "colSpan sum" in e or "columnWidths" in e]
    slot_errors = [e for e in errors if "missing" in e]

    return ValidationScore(
        valid=len(errors) == 0,
        grid_invariant_passed=len(grid_errors) == 0,
        slot_integrity_passed=len(slot_errors) == 0,
        checked_tables=checked_tables,
        checked_slots=len(referenced_slots),
        errors=tuple(errors),
    )

