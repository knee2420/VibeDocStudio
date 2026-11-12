"""Structural invariant validators (#1-#6) for PageIR / DocIR."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .html_codec import cell_plain_text, parse_table_html, table_to_html
from .model import (
    BBox,
    DocIR,
    FigureBlock,
    PageIR,
    TableIR,
    Word,
    bbox_center,
    point_in_bbox,
)


class InvariantViolation(BaseModel):
    invariant: int = Field(ge=1, le=6)
    code: str
    severity: Literal["error", "warn"] = "error"
    blockId: str = ""
    detail: str = ""
    bbox: Optional[BBox] = None


class ValidationResult(BaseModel):
    ok: bool
    violations: list[InvariantViolation] = Field(default_factory=list)
    failedTables: list[str] = Field(default_factory=list)
    orphanWordIds: list[str] = Field(default_factory=list)
    outOfBoundsWordIds: list[str] = Field(default_factory=list)


def _check_table_invariants(
    table: TableIR,
    words_by_id: dict[str, Word],
    source_kind: str,
    violations: list[InvariantViolation],
    failed_tables: set[str],
    assigned_word_counts: dict[str, int],
    *,
    containment_tol_pt: float,
    skip_containment: bool,
) -> None:
    # Invariant #1: exact nRows x nCols partition with no overlap and no holes
    occ: list[list[Optional[tuple[int, int]]]] = [[None] * table.nCols for _ in range(table.nRows)]
    table_broken = False
    for cell in table.cells:
        if cell.r + cell.rs > table.nRows or cell.c + cell.cs > table.nCols:
            table_broken = True
            violations.append(
                InvariantViolation(
                    invariant=1,
                    code="CELL_OUT_OF_GRID",
                    blockId=table.id,
                    detail=f"cell ({cell.r},{cell.c})+({cell.rs},{cell.cs}) exceeds {table.nRows}x{table.nCols}",
                    bbox=cell.bbox or table.bbox,
                )
            )
            continue
        for rr in range(cell.r, cell.r + cell.rs):
            for cc in range(cell.c, cell.c + cell.cs):
                if occ[rr][cc] is not None:
                    table_broken = True
                    violations.append(
                        InvariantViolation(
                            invariant=1,
                            code="CELL_OVERLAP",
                            blockId=table.id,
                            detail=f"overlap at grid ({rr},{cc}) with {occ[rr][cc]} and ({cell.r},{cell.c})",
                            bbox=cell.bbox or table.bbox,
                        )
                    )
                else:
                    occ[rr][cc] = (cell.r, cell.c)

    for rr in range(table.nRows):
        for cc in range(table.nCols):
            if occ[rr][cc] is None:
                table_broken = True
                violations.append(
                    InvariantViolation(
                        invariant=1,
                        code="GRID_HOLE",
                        blockId=table.id,
                        detail=f"uncovered slot at grid ({rr},{cc})",
                        bbox=table.bbox,
                    )
                )

    # Invariant #2: monotone coordinates (colXs, rowYs when populated)
    if table.colXs:
        if len(table.colXs) != table.nCols + 1:
            table_broken = True
            violations.append(
                InvariantViolation(
                    invariant=2,
                    code="COL_XS_LEN_MISMATCH",
                    blockId=table.id,
                    detail=f"len(colXs)={len(table.colXs)} != nCols+1={table.nCols + 1}",
                    bbox=table.bbox,
                )
            )
        elif any(a >= b - 1e-6 for a, b in zip(table.colXs, table.colXs[1:])):
            table_broken = True
            violations.append(
                InvariantViolation(
                    invariant=2,
                    code="COL_XS_NOT_MONOTONE",
                    blockId=table.id,
                    detail="colXs must strictly increase",
                    bbox=table.bbox,
                )
            )
    elif source_kind != "hwpx":
        table_broken = True
        violations.append(
            InvariantViolation(
                invariant=2,
                code="COL_XS_EMPTY",
                blockId=table.id,
                detail="colXs missing on non-hwpx table",
                bbox=table.bbox,
            )
        )

    if table.rowYs:
        if len(table.rowYs) != table.nRows + 1:
            table_broken = True
            violations.append(
                InvariantViolation(
                    invariant=2,
                    code="ROW_YS_LEN_MISMATCH",
                    blockId=table.id,
                    detail=f"len(rowYs)={len(table.rowYs)} != nRows+1={table.nRows + 1}",
                    bbox=table.bbox,
                )
            )
        elif any(a >= b - 1e-6 for a, b in zip(table.rowYs, table.rowYs[1:])):
            table_broken = True
            violations.append(
                InvariantViolation(
                    invariant=2,
                    code="ROW_YS_NOT_MONOTONE",
                    blockId=table.id,
                    detail="rowYs must strictly increase",
                    bbox=table.bbox,
                )
            )
    elif source_kind != "hwpx":
        table_broken = True
        violations.append(
            InvariantViolation(
                invariant=2,
                code="ROW_YS_EMPTY",
                blockId=table.id,
                detail="rowYs missing on non-hwpx table",
                bbox=table.bbox,
            )
        )

    # Invariant #5: Table HTML <-> IR equivalence (only when partition #1 holds)
    if not table_broken:
        rendered_html = table_to_html(table, words_by_id, include_word_attrs=False)
        parsed = parse_table_html(rendered_html)
        if parsed.n_rows != table.nRows or parsed.n_cols != table.nCols or len(parsed.cells) != len(table.cells):
            table_broken = True
            violations.append(
                InvariantViolation(
                    invariant=5,
                    code="HTML_GRID_MISMATCH",
                    blockId=table.id,
                    detail=(
                        f"roundtrip grid ({parsed.n_rows}x{parsed.n_cols}, {len(parsed.cells)} cells) "
                        f"!= IR ({table.nRows}x{table.nCols}, {len(table.cells)} cells)"
                    ),
                    bbox=table.bbox,
                )
            )
        else:
            ir_sig = sorted(
                (c.r, c.c, c.rs, c.cs, c.role, " ".join(cell_plain_text(c, words_by_id).split()))
                for c in table.cells
            )
            html_sig = sorted(
                (c.r, c.c, c.rs, c.cs, c.role, " ".join(c.text.split()))
                for c in parsed.cells
            )
            if ir_sig != html_sig:
                table_broken = True
                violations.append(
                    InvariantViolation(
                        invariant=5,
                        code="HTML_CELL_MISMATCH",
                        blockId=table.id,
                        detail="cell coordinates or text diverge after HTML roundtrip",
                        bbox=table.bbox,
                    )
                )

    if table_broken:
        failed_tables.add(table.id)

    # Track words & Invariant #4 inside cells + recurse nested tables
    for cell in table.cells:
        cbox = cell.bbox or table.bbox
        for wid in cell.wordIds:
            assigned_word_counts[wid] = assigned_word_counts.get(wid, 0) + 1
            w = words_by_id.get(wid)
            if w is None:
                violations.append(
                    InvariantViolation(
                        invariant=3,
                        code="UNKNOWN_WORD_ID",
                        blockId=table.id,
                        detail=f"cell ({cell.r},{cell.c}) references unknown wordId '{wid}'",
                        bbox=cbox,
                    )
                )
                continue
            if not skip_containment and w.src != "hwpx" and w.bbox is not None and cbox is not None:
                if not point_in_bbox(bbox_center(w.bbox), cbox, tol=containment_tol_pt):
                    violations.append(
                        InvariantViolation(
                            invariant=4,
                            code="WORD_OUTSIDE_CELL",
                            blockId=table.id,
                            detail=f"word '{wid}' center {bbox_center(w.bbox)} outside cell ({cell.r},{cell.c}) {cbox}",
                            bbox=w.bbox,
                        )
                    )
        for nested_tbl in cell.nested:
            _check_table_invariants(
                nested_tbl,
                words_by_id,
                source_kind,
                violations,
                failed_tables,
                assigned_word_counts,
                containment_tol_pt=containment_tol_pt,
                skip_containment=skip_containment,
            )


def validate_page_ir(
    page: PageIR,
    *,
    containment_tol_pt: float = 2.0,
    orphan_inset_pt: float = 1.0,
) -> ValidationResult:
    """Validate all 6 structural invariants on a PageIR."""
    violations: list[InvariantViolation] = []
    failed_tables: set[str] = set()
    words_by_id: dict[str, Word] = {w.id: w for w in page.words}
    assigned_word_counts: dict[str, int] = {}
    skip_containment = page.sourceKind == "hwpx"

    keep_text_figure_boxes: list[BBox] = [
        b.bbox
        for b in page.blocks
        if isinstance(b, FigureBlock) and b.keepText and b.bbox is not None
    ]

    # Invariant #6: readingOrder completeness (permutation of block ids)
    block_ids = [b.id for b in page.blocks]
    if len(set(block_ids)) != len(block_ids):
        violations.append(
            InvariantViolation(
                invariant=6,
                code="DUPLICATE_BLOCK_ID",
                detail="duplicate block ids found on page",
            )
        )
    if sorted(page.readingOrder) != sorted(block_ids) or len(page.readingOrder) != len(block_ids):
        violations.append(
            InvariantViolation(
                invariant=6,
                code="READING_ORDER_INCOMPLETE",
                detail=(
                    f"readingOrder count={len(page.readingOrder)} vs blocks={len(block_ids)}, "
                    f"missing={sorted(set(block_ids) - set(page.readingOrder))}, "
                    f"extra={sorted(set(page.readingOrder) - set(block_ids))}"
                ),
            )
        )

    for block in page.blocks:
        if isinstance(block, TableIR):
            _check_table_invariants(
                block,
                words_by_id,
                page.sourceKind,
                violations,
                failed_tables,
                assigned_word_counts,
                containment_tol_pt=containment_tol_pt,
                skip_containment=skip_containment,
            )
        elif not isinstance(block, FigureBlock):
            wids: list[str] = getattr(block, "wordIds", [])
            for wid in wids:
                assigned_word_counts[wid] = assigned_word_counts.get(wid, 0) + 1
                w = words_by_id.get(wid)
                if w is None:
                    violations.append(
                        InvariantViolation(
                            invariant=3,
                            code="UNKNOWN_WORD_ID",
                            blockId=block.id,
                            detail=f"block '{block.id}' references unknown wordId '{wid}'",
                            bbox=block.bbox,
                        )
                    )
                    continue
                if not skip_containment and w.src != "hwpx" and w.bbox is not None and block.bbox is not None:
                    if not point_in_bbox(bbox_center(w.bbox), block.bbox, tol=containment_tol_pt):
                        violations.append(
                            InvariantViolation(
                                invariant=4,
                                code="WORD_OUTSIDE_BLOCK",
                                blockId=block.id,
                                detail=f"word '{wid}' center {bbox_center(w.bbox)} outside block {block.bbox}",
                                bbox=w.bbox,
                            )
                        )

    # Invariant #3: zero orphan words (excluding figure.keepText words and whitespace-only words)
    orphan_ids: list[str] = []
    for w in page.words:
        if not w.text.strip():
            continue
        count = assigned_word_counts.get(w.id, 0)
        if count > 1:
            violations.append(
                InvariantViolation(
                    invariant=3,
                    code="DUPLICATE_WORD_ASSIGNMENT",
                    detail=f"wordId '{w.id}' assigned {count} times",
                    bbox=w.bbox,
                )
            )
        if count == 0:
            if w.bbox is not None and any(
                point_in_bbox(bbox_center(w.bbox), fbox, inset=orphan_inset_pt)
                for fbox in keep_text_figure_boxes
            ):
                continue
            orphan_ids.append(w.id)
            violations.append(
                InvariantViolation(
                    invariant=3,
                    code="ORPHAN_WORD",
                    detail=f"word '{w.id}' ({w.text[:24]!r}) not assigned to any block or cell",
                    bbox=w.bbox,
                )
            )

    oob_ids = sorted(
        {v.detail.split("'")[1] for v in violations if v.invariant == 4 and "'" in v.detail}
    )
    return ValidationResult(
        ok=not any(v.severity == "error" for v in violations),
        violations=violations,
        failedTables=sorted(failed_tables),
        orphanWordIds=orphan_ids,
        outOfBoundsWordIds=oob_ids,
    )


def validate_doc_ir(doc: DocIR, **kwargs: Any) -> dict[int, ValidationResult]:
    return {p.pageIndex: validate_page_ir(p, **kwargs) for p in doc.pages}

