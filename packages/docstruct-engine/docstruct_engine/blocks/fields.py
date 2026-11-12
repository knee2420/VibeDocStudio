"""Standalone form field block detection (date, sign, underline-line, box/checkbox)."""
from __future__ import annotations

import re
from typing import Any, Literal, Optional

from ..config import compile_patterns, load_registry
from ..ir.model import BBox, FieldBlock, Ruling, point_in_bbox
from .markers import VisualLine


def _clip_label(raw: str) -> str:
    return " ".join(raw.strip(" :：[]()").split())[:48]


def detect_field_blocks(
    lines: list[VisualLine],
    rulings: list[Ruling],
    *,
    table_boxes: list[BBox],
    body_size: float = 10.0,
    registry: Optional[dict[str, Any]] = None,
) -> tuple[list[FieldBlock], set[int], set[str]]:
    """Detect non-table FieldBlocks from lines and trailing/underneath rulings.

    Returns `(fields, consumed_line_indices, claimed_word_ids)`.
    """
    reg = registry or load_registry()
    fp = reg.get("fieldPatterns") or {}
    date_res = compile_patterns([str(p) for p in (fp.get("date") or [])])
    sign_res = compile_patterns([str(p) for p in (fp.get("sign") or [])])
    underline_pat = fp.get("underlineRun")
    underline_re = re.compile(str(underline_pat)) if underline_pat else None
    checkboxes = [str(g) for g in (fp.get("checkboxGlyphs") or [])]

    # Candidate standalone horizontal fill lines (not belonging to any detected table)
    free_h_rules = [
        r
        for r in rulings
        if r.orient == "h"
        and (r.x1 - r.x0) >= 24.0
        and not any(point_in_bbox(((r.x0 + r.x1) * 0.5, (r.y0 + r.y1) * 0.5), tb, tol=3.0) for tb in table_boxes)
    ]

    fields: list[FieldBlock] = []
    consumed: set[int] = set()
    claimed_wids: set[str] = set()

    for idx, line in enumerate(lines):
        txt = line.text.strip()
        if not txt or len(txt) > 90:
            continue

        field_kind: Optional[Literal["date", "sign", "box", "line"]] = None
        label = ""
        placeholder = ""

        if any(rx.search(txt) for rx in sign_res):
            field_kind = "sign"
            m = next((rx.search(txt) for rx in sign_res if rx.search(txt)), None)
            prefix = txt[: m.start()].strip() if m else ""
            label = _clip_label(prefix) or _clip_label(txt)
            placeholder = txt
        elif any(rx.search(txt) for rx in date_res):
            field_kind = "date"
            label = _clip_label(txt.split(":")[0]) if ":" in txt else "date"
            placeholder = txt
        elif underline_re and underline_re.search(txt):
            field_kind = "line"
            m = underline_re.search(txt)
            assert m is not None
            label = _clip_label(txt[: m.start()]) or "field"
            placeholder = m.group(0)
        elif checkboxes and any(txt.startswith(g) for g in checkboxes):
            # Only treat isolated short checkbox choice lines as box fields when <= 48 chars
            if len(txt) <= 48:
                field_kind = "box"
                label = _clip_label(txt.lstrip("".join(checkboxes)))
                placeholder = txt[:1]
        elif (txt.endswith(":") or txt.endswith("：")) and len(txt) <= 32:
            # Check if a standalone horizontal fill ruling continues right of this label
            match_rule = next(
                (
                    r
                    for r in free_h_rules
                    if r.x0 >= line.bbox[2] - 4.0
                    and r.x0 <= line.bbox[2] + 36.0
                    and line.bbox[1] - 4.0 <= (r.y0 + r.y1) * 0.5 <= line.bbox[3] + 6.0
                ),
                None,
            )
            if match_rule is not None:
                field_kind = "line"
                label = _clip_label(txt)
                placeholder = ""

        if field_kind is None:
            continue

        consumed.add(idx)
        for w in line.words:
            claimed_wids.add(w.id)
        fields.append(
            FieldBlock(
                id=f"fld{len(fields)}",
                bbox=line.bbox,
                wordIds=[w.id for w in line.words],
                text=line.text,
                spans=list(line.spans),
                fieldKind=field_kind,
                label=label or f"field_{len(fields) + 1}",
                assigneeName="",
                placeholder=placeholder,
            )
        )

    return fields, consumed, claimed_wids
