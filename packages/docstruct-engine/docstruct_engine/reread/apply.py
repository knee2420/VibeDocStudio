"""Apply reread / VLM annotation patches cleanly while maintaining PageIR invariants #1-#6."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import pymupdf

from ..config import load_thresholds
from ..ir.model import (
    BlockIR,
    CaptionBlock,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    NoteBlock,
    PageIR,
    ParagraphBlock,
    TableIR,
)
from ..ir.validate import validate_page_ir
from ..tables.reconcile import (
    ReconcileResult,
    reconcile_table,
    validate_and_apply_word_fixes,
)


def _retype_text_block(blk: BlockIR, spec: dict[str, Any]) -> tuple[BlockIR, Optional[str]]:
    new_kind = str(spec.get("kind") or getattr(blk, "kind", ""))
    if isinstance(blk, FigureBlock):
        if "figureKind" in spec and spec["figureKind"]:
            blk.figureKind = spec["figureKind"]
        if "keepText" in spec and spec["keepText"] is not None:
            blk.keepText = bool(spec["keepText"])
        if "alt" in spec and spec["alt"] is not None:
            blk.alt = str(spec["alt"])
        if "captionBlockId" in spec:
            blk.captionBlockId = spec["captionBlockId"]
        if "needsReview" in spec:
            blk.needsReview = bool(spec["needsReview"])
        return blk, None

    if isinstance(blk, TableIR):
        if "title" in spec and spec["title"] is not None:
            blk.title = str(spec["title"])
        if "needsReview" in spec:
            blk.needsReview = bool(spec["needsReview"])
        return blk, None

    base = {
        "id": blk.id,
        "bbox": blk.bbox,
        "wordIds": list(getattr(blk, "wordIds", [])),
        "text": spec.get("text") if spec.get("text") is not None else getattr(blk, "text", None),
        "align": spec.get("align") if spec.get("align") is not None else getattr(blk, "align", None),
        "spans": list(getattr(blk, "spans", [])),
        "needsReview": bool(spec.get("needsReview", False)),
    }

    if new_kind == "heading":
        lvl = max(1, min(6, int(spec.get("level") or getattr(blk, "level", 2))))
        return HeadingBlock(**base, level=lvl), None
    if new_kind == "listItem":
        return (
            ListItemBlock(
                **base,
                marker=str(spec.get("marker") if spec.get("marker") is not None else getattr(blk, "marker", "-")),
                markerKind=str(
                    spec.get("markerKind") if spec.get("markerKind") is not None else getattr(blk, "markerKind", "bullet")
                ),  # type: ignore[arg-type]
                indentLevel=max(0, int(spec.get("indentLevel") or getattr(blk, "indentLevel", 0))),
                hangingIndentPt=max(0.0, float(spec.get("hangingIndentPt") or getattr(blk, "hangingIndentPt", 0.0))),
            ),
            None,
        )
    if new_kind == "caption":
        return (
            CaptionBlock(
                **base,
                targetBlockId=spec.get("targetBlockId") or getattr(blk, "targetBlockId", None),
            ),
            None,
        )
    if new_kind == "note":
        return (
            NoteBlock(
                **base,
                noteKind=str(spec.get("noteKind") or getattr(blk, "noteKind", "annotation")),  # type: ignore[arg-type]
            ),
            None,
        )
    if new_kind == "paragraph":
        return ParagraphBlock(**base), None
    if new_kind == "figure":
        return (
            FigureBlock(
                id=blk.id,
                bbox=blk.bbox,
                figureKind=str(spec.get("figureKind") or "diagram"),  # type: ignore[arg-type]
                keepText=bool(spec.get("keepText", True)),
                alt=str(spec.get("alt") or (getattr(blk, "text", "") or "")[:40]),
                src=spec.get("src"),
                captionBlockId=spec.get("captionBlockId"),
                needsReview=bool(spec.get("needsReview", False)),
            ),
            None,
        )
    return blk, f"UNSUPPORTED_BLOCK_KIND: '{new_kind}' on block '{blk.id}'"


def apply_reread_patch(
    page: PageIR,
    *,
    block_id: Optional[str] = None,
    table_html: Optional[str] = None,
    fixes: Optional[list[dict[str, Any]]] = None,
    block_annotations: Optional[list[dict[str, Any]]] = None,
    reading_order: Optional[list[str]] = None,
    reject_count: int = 0,
    page_obj: Optional[pymupdf.Page] = None,
    page_png_path: Optional[Path] = None,
    thresholds: Optional[dict[str, Any]] = None,
) -> tuple[PageIR, ReconcileResult]:
    """Apply a reread patch (table HTML, multi-word OCR fixes, or block annotations) safely."""
    th = thresholds or load_thresholds()
    working = page.model_copy(deep=True)

    if block_id is not None and table_html is not None:
        res = reconcile_table(
            working,
            block_id,
            html=table_html,
            fixes=fixes,
            reject_count=reject_count,
            page_obj=page_obj,
            page_png_path=page_png_path,
            thresholds=th,
        )
        return (res.page if res.page is not None else page), res

    errors: list[str] = []
    if block_annotations:
        idx_by_id = {b.id: i for i, b in enumerate(working.blocks)}
        for ann in block_annotations:
            bid = str(ann.get("blockId") or "")
            idx = idx_by_id.get(bid)
            if idx is None:
                errors.append(f"UNKNOWN_BLOCK_ID: '{bid}'")
                continue
            updated, err = _retype_text_block(working.blocks[idx], ann)
            if err:
                errors.append(err)
            else:
                working.blocks[idx] = updated

    if not errors and reading_order is not None:
        existing_ids = [b.id for b in working.blocks]
        if sorted(reading_order) != sorted(existing_ids) or len(reading_order) != len(existing_ids):
            errors.append("READING_ORDER_MISMATCH: readingOrder must be a permutation of page block IDs")
        else:
            working.readingOrder = list(reading_order)

    if not errors and fixes:
        ok_fix, fix_errs = validate_and_apply_word_fixes(working, fixes)
        if not ok_fix:
            errors.extend(fix_errs)

    if not errors:
        vres = validate_page_ir(
            working,
            containment_tol_pt=float(th.get("containmentTolPt", 2.0)),
            orphan_inset_pt=float(th.get("orphanInsetPt", 1.0)),
        )
        if not vres.ok:
            errors.extend(f"{v.code}: {v.detail}" for v in vres.violations if v.severity == "error")

    if errors:
        return page, ReconcileResult(ok=False, errors=errors, rejectCount=reject_count + 1)

    return working, ReconcileResult(ok=True, page=working, rejectCount=reject_count)
