"""IR models, JSON schema helper, HTML table codec, and structural invariant checks."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .html_codec import (
    ParsedCellIR,
    ParsedTableGrid,
    cell_plain_text,
    parse_table_html,
    table_to_html,
)
from .model import (
    BBox,
    BorderEdge,
    CaptionBlock,
    CellBorders,
    CellFieldMeta,
    CellFont,
    CellIR,
    CellPadding,
    DocIR,
    FieldBlock,
    FigureBlock,
    HeadingBlock,
    LineGroupBlock,
    LineGroupSegment,
    ListItemBlock,
    NoteBlock,
    PageIR,
    PageMargins,
    PageSize,
    ParagraphBlock,
    Ruling,
    Span,
    TableIR,
    Word,
    bbox_area,
    bbox_center,
    bbox_iou,
    point_in_bbox,
)
from .validate import (
    InvariantViolation,
    ValidationResult,
    validate_doc_ir,
    validate_page_ir,
)


def build_json_schema() -> dict[str, Any]:
    return DocIR.model_json_schema()


def export_json_schema(target: Path | None = None) -> dict[str, Any]:
    schema = build_json_schema()
    out = target or (Path(__file__).with_name("schema.json"))
    out.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return schema


__all__ = [
    "BBox",
    "BorderEdge",
    "CaptionBlock",
    "CellBorders",
    "CellFieldMeta",
    "CellFont",
    "CellIR",
    "CellPadding",
    "DocIR",
    "FieldBlock",
    "FigureBlock",
    "HeadingBlock",
    "InvariantViolation",
    "ListItemBlock",
    "NoteBlock",
    "PageIR",
    "PageMargins",
    "PageSize",
    "ParagraphBlock",
    "ParsedCellIR",
    "ParsedTableGrid",
    "Ruling",
    "Span",
    "TableIR",
    "ValidationResult",
    "Word",
    "bbox_area",
    "bbox_center",
    "bbox_iou",
    "build_json_schema",
    "cell_plain_text",
    "export_json_schema",
    "parse_table_html",
    "point_in_bbox",
    "table_to_html",
    "validate_doc_ir",
    "validate_page_ir",
]
