"""Host-independent structured stage logging and checkpoint metrics for docstruct_engine."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .ir.model import DocIR, PageIR, TableIR

logger = logging.getLogger("docstruct_engine")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def append_pipeline_log(cache_dir: Optional[Path], event: dict[str, Any]) -> Optional[Path]:
    """Append a structured JSONL trace record to `<cache_dir>/pipeline.jsonl` when caching is enabled."""
    if cache_dir is None:
        return None
    cache_dir.mkdir(parents=True, exist_ok=True)
    log_path = cache_dir / "pipeline.jsonl"
    line = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    with open(log_path, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    return log_path


def emit_stage_event(
    stage: str,
    *,
    page_index: Optional[int] = None,
    metrics: Optional[dict[str, Any]] = None,
    cache_dir: Optional[Path] = None,
) -> dict[str, Any]:
    """Log one structured pipeline stage event to Python logger and optional `pipeline.jsonl`."""
    payload: dict[str, Any] = {
        "ts": _utc_now_iso(),
        "stage": stage,
        "pageIndex": page_index,
        "metrics": dict(metrics or {}),
    }
    kv_parts = []
    for k, v in (metrics or {}).items():
        if isinstance(v, (list, dict)):
            kv_parts.append(f"{k}={json.dumps(v, ensure_ascii=False)}")
        else:
            kv_parts.append(f"{k}={v}")
    logger.info(
        "[docstruct] stage=%s page=%s %s",
        stage,
        page_index if page_index is not None else "-",
        " ".join(kv_parts),
    )
    append_pipeline_log(cache_dir, payload)
    return payload


def summarize_page_metrics(page_ir: PageIR) -> dict[str, Any]:
    """Compute machine-verifiable geometry, ruling, table, and block metrics for a `PageIR`."""
    tables = [b for b in page_ir.blocks if isinstance(b, TableIR)]
    block_counts: dict[str, int] = {}
    heading_count = 0
    caption_count = 0
    note_count = 0
    header_footer_count = 0
    heading_summary: list[str] = []
    header_texts: list[str] = []
    for blk in page_ir.blocks:
        block_counts[blk.kind] = block_counts.get(blk.kind, 0) + 1
        if blk.kind == "heading":
            heading_count += 1
            lvl = getattr(blk, "level", 2)
            txt = (getattr(blk, "text", "") or "").strip().replace("\n", " ")[:32]
            heading_summary.append(f"H{lvl}:{txt}")
        elif blk.kind == "caption":
            caption_count += 1
        elif blk.kind == "note":
            note_count += 1
            if getattr(blk, "noteKind", None) in ("header", "footer"):
                header_footer_count += 1
                ht = (getattr(blk, "text", "") or "").strip()
                if ht:
                    header_texts.append(ht)

    table_shapes = [f"{t.id}:{t.nRows}x{t.nCols}({len(t.cells)})" for t in tables]
    cell_count = sum(len(t.cells) for t in tables)
    needs_review_cells = sum(1 for t in tables for c in t.cells if c.needsReview)
    h_rulings = sum(1 for r in page_ir.rulings if r.orient == "h")
    v_rulings = sum(1 for r in page_ir.rulings if r.orient == "v")
    existing = dict(page_ir.metrics or {})

    return {
        **existing,
        "rulingCount": len(page_ir.rulings),
        "rulingsH": h_rulings,
        "rulingsV": v_rulings,
        "wordCount": len(page_ir.words),
        "tableCount": len(tables),
        "tableShapes": table_shapes,
        "cellCount": cell_count,
        "needsReviewCells": needs_review_cells,
        "headingCount": heading_count,
        "captionCount": caption_count,
        "noteCount": note_count,
        "headerFooterCount": header_footer_count,
        "headingSummary": heading_summary,
        "headerTexts": header_texts,
        "blockCounts": block_counts,
        "occludedCharsFiltered": int(existing.get("occludedCharsFiltered", 0)),
    }


def summarize_doc_metrics(doc_ir: DocIR, pending_reads: Optional[list[Any]] = None) -> dict[str, Any]:
    """Compute compact multi-page checkpoint metrics summary across a `DocIR`."""
    pages_summary: list[dict[str, Any]] = []
    for p in doc_ir.pages:
        pm = summarize_page_metrics(p)
        pages_summary.append(
            {
                "pageIndex": p.pageIndex,
                "sourceKind": p.sourceKind,
                "wordCount": pm["wordCount"],
                "rulingCount": pm["rulingCount"],
                "tableCount": pm["tableCount"],
                "tableShapes": pm["tableShapes"],
                "cellCount": pm["cellCount"],
                "needsReviewCells": pm["needsReviewCells"],
                "headingCount": pm["headingCount"],
                "captionCount": pm["captionCount"],
                "headerFooterCount": pm["headerFooterCount"],
                "headingSummary": pm["headingSummary"],
                "headerTexts": pm["headerTexts"],
                "occludedCharsFiltered": pm["occludedCharsFiltered"],
                "invariantErrors": len(pm.get("invariantErrors") or []),
            }
        )
    return {
        "docId": doc_ir.docId,
        "pageCount": len(doc_ir.pages),
        "totalTables": sum(int(p["tableCount"]) for p in pages_summary),
        "totalNeedsReviewCells": sum(int(p["needsReviewCells"]) for p in pages_summary),
        "totalOccludedFiltered": sum(int(p["occludedCharsFiltered"]) for p in pages_summary),
        "totalHeadings": sum(int(p["headingCount"]) for p in pages_summary),
        "totalCaptions": sum(int(p["captionCount"]) for p in pages_summary),
        "totalHeaderFooters": sum(int(p["headerFooterCount"]) for p in pages_summary),
        "pendingReadCount": len(pending_reads or []),
        "pages": pages_summary,
    }

