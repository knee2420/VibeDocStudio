"""Page and document IR construction pipeline from vector PDF / raster scan / OCR."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Optional

import pymupdf
from PIL import Image

from .acquire.figures import extract_figures
from .acquire.page_mode import classify_page_mode
from .acquire.render import render_page_png
from .acquire.rulings import extract_vector_rulings_and_fills
from .acquire.words import extract_vector_words
from .blocks.order import compute_reading_order
from .blocks.reflow import reflow_non_table_blocks
from .cache import doc_cache_dir, file_src_hash, load_page_ir, save_page_ir, write_json
from .config import load_registry, load_thresholds
from .ir.model import (
    BlockIR,
    DocIR,
    FigureBlock,
    PageIR,
    PageMargins,
    PageSize,
    Ruling,
    TableIR,
    Word,
    point_in_bbox,
)
from .ir.validate import validate_page_ir
from .tables.assign import assign_words_to_table
from .tables.candidates import propose_table_candidates
from .tables.continuation import detect_table_continuations
from .tables.props import enrich_table_properties
from .tables.snap import snap_candidate_grid
from .telemetry import emit_stage_event, summarize_doc_metrics, summarize_page_metrics


@dataclass
class AcquiredPage:
    pageIndex: int
    sourceKind: Literal["pdf-vector", "pdf-scan", "pdf-hybrid", "image"]
    size: PageSize
    words: list[Word]
    rulings: list[Ruling]
    fillsPt: list[dict[str, Any]]
    imagePath: Optional[Path] = None
    ocrAvgConf: Optional[float] = None
    occludedCharsFiltered: int = 0


def _estimate_margins(blocks: list[BlockIR], size: PageSize) -> PageMargins:
    boxes = [b.bbox for b in blocks if b.bbox is not None]
    if not boxes:
        return PageMargins(top=36.0, right=36.0, bottom=36.0, left=36.0)
    x0 = max(0.0, min(b[0] for b in boxes))
    y0 = max(0.0, min(b[1] for b in boxes))
    x1 = min(size.width, max(b[2] for b in boxes))
    y1 = min(size.height, max(b[3] for b in boxes))
    return PageMargins(
        top=round(y0, 1),
        right=round(max(0.0, size.width - x1), 1),
        bottom=round(max(0.0, size.height - y1), 1),
        left=round(x0, 1),
    )


def _merge_hybrid_words(vec_words: list[Word], ocr_words: list[Word]) -> list[Word]:
    """Keep vector words where present and add OCR words only in uncovered areas."""
    out = list(vec_words)
    seq = len(out)
    for ow in ocr_words:
        if ow.bbox is None:
            out.append(ow)
            continue
        cx = (ow.bbox[0] + ow.bbox[2]) * 0.5
        cy = (ow.bbox[1] + ow.bbox[3]) * 0.5
        covered = any(
            vw.bbox is not None and point_in_bbox((cx, cy), vw.bbox, tol=2.0)
            for vw in vec_words
        )
        if not covered:
            ow.id = f"w{seq}"
            seq += 1
            out.append(ow)
    return out


def acquire_pdf_page(
    page: pymupdf.Page,
    page_index: int,
    *,
    cache_dir: Optional[Path] = None,
    ocr_port: Optional[Any] = None,
    thresholds: Optional[dict[str, Any]] = None,
    render_png: bool = True,
) -> AcquiredPage:
    """Acquire words, rulings, fills, and page PNG in upright pt for one PDF page."""
    th = thresholds or load_thresholds()
    mode = classify_page_mode(page)
    rect = page.rect
    size = PageSize(width=round(float(rect.width), 2), height=round(float(rect.height), 2))
    dash_gap = float(th.get("dashMaxGapPt", 6.0))

    word_stats: dict[str, int] = {}
    rulings, fills_pt = extract_vector_rulings_and_fills(page, dash_max_gap_pt=dash_gap)
    words = extract_vector_words(page, rulings=rulings, stats_out=word_stats)
    occluded_count = int(word_stats.get("occludedCharsFiltered", 0))

    png_path: Optional[Path] = None
    if cache_dir is not None and (render_png or mode.kind != "pdf-vector"):
        dpi = int(th.get("scanRenderDpi", 300) if mode.kind != "pdf-vector" else th.get("renderDpi", 200))
        png_path = render_page_png(page, cache_dir / f"p{page_index}.png", dpi=dpi)

    ocr_confs: list[float] = []
    if mode.kind in ("pdf-scan", "pdf-hybrid") and ocr_port is not None and png_path is not None:
        dpi_used = int(th.get("scanRenderDpi", 300))
        ocr_words = list(ocr_port.recognize(png_path, (size.width, size.height), dpi=dpi_used))
        ocr_confs = [w.conf for w in ocr_words]
        if mode.kind == "pdf-scan":
            words = ocr_words
        else:
            words = _merge_hybrid_words(words, ocr_words)

    avg_conf = round(sum(ocr_confs) / len(ocr_confs), 4) if ocr_confs else None
    h_rulings = sum(1 for r in rulings if r.orient == "h")
    v_rulings = sum(1 for r in rulings if r.orient == "v")
    acq_metrics = {
        "sourceKind": mode.kind,
        "wordCount": len(words),
        "rulingCount": len(rulings),
        "rulingsH": h_rulings,
        "rulingsV": v_rulings,
        "fillCount": len(fills_pt),
        "ocrAvgConf": avg_conf,
        "occludedCharsFiltered": occluded_count,
    }
    if cache_dir is not None:
        write_json(
            cache_dir / f"p{page_index}.acq.json",
            {
                "pageIndex": page_index,
                "size": size.model_dump(),
                **acq_metrics,
            },
        )
    emit_stage_event("acquire", page_index=page_index, metrics=acq_metrics, cache_dir=cache_dir)

    return AcquiredPage(
        pageIndex=page_index,
        sourceKind=mode.kind,
        size=size,
        words=words,
        rulings=rulings,
        fillsPt=fills_pt,
        imagePath=png_path,
        ocrAvgConf=avg_conf,
        occludedCharsFiltered=occluded_count,
    )


def acquire_pages(
    path: str | Path,
    *,
    page_indices: Optional[list[int]] = None,
    cache_root: Optional[str | Path] = None,
    ocr_port: Optional[Any] = None,
    thresholds: Optional[dict[str, Any]] = None,
    render_png: bool = True,
) -> tuple[str, list[AcquiredPage]]:
    """Acquire all or selected pages of a PDF or standalone raster image."""
    src = Path(path)
    src_hash = file_src_hash(src)
    cache_dir = doc_cache_dir(cache_root, src_hash) if cache_root is not None else None
    th = thresholds or load_thresholds()

    if src.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        with Image.open(src) as img:
            w_px, h_px = img.size
        size = PageSize(width=round(w_px * 72.0 / 96.0, 2), height=round(h_px * 72.0 / 96.0, 2))
        words = list(ocr_port.recognize(src, (size.width, size.height), dpi=96)) if ocr_port is not None else []
        avg_conf = round(sum(w.conf for w in words) / len(words), 4) if words else None
        return src_hash, [
            AcquiredPage(
                pageIndex=1,
                sourceKind="image",
                size=size,
                words=words,
                rulings=[],
                fillsPt=[],
                imagePath=src,
                ocrAvgConf=avg_conf,
            )
        ]

    acquired: list[AcquiredPage] = []
    with pymupdf.open(str(src)) as doc:
        wanted = set(page_indices) if page_indices else None
        for idx, page in enumerate(doc, start=1):
            if wanted is not None and idx not in wanted:
                continue
            acquired.append(
                acquire_pdf_page(
                    page,
                    idx,
                    cache_dir=cache_dir,
                    ocr_port=ocr_port,
                    thresholds=th,
                    render_png=render_png,
                )
            )
    return src_hash, acquired


def build_page_ir(
    words: list[Word],
    rulings: list[Ruling],
    *,
    page_index: int,
    page_size: PageSize,
    source_kind: Literal["pdf-vector", "pdf-scan", "pdf-hybrid", "hwpx", "image"] = "pdf-vector",
    fills_pt: Optional[list[dict[str, Any]]] = None,
    page: Optional[pymupdf.Page] = None,
    figures_override: Optional[list[FigureBlock]] = None,
    thresholds: Optional[dict[str, Any]] = None,
    registry: Optional[dict[str, Any]] = None,
    ocr_avg_conf: Optional[float] = None,
    occluded_chars_filtered: int = 0,
) -> PageIR:
    """Build a validated PageIR from acquired primitives (tables, figures, fields, text, readingOrder)."""
    th = thresholds or load_thresholds()
    reg = registry or load_registry()
    snap_tol = float(th.get("snapTolPt", 1.8))
    orphan_inset = float(th.get("orphanInsetPt", 1.0))

    raw_cands = propose_table_candidates(
        rulings,
        words,
        fills_pt=fills_pt,
        page=page,
        thresholds=th,
    )
    snapped_cands = [
        snap_candidate_grid(
            c,
            rulings,
            snap_tol_pt=snap_tol,
            page_size=(page_size.width, page_size.height),
        )
        for c in raw_cands
    ]

    if figures_override is not None:
        figures = list(figures_override)
    elif page is not None:
        figures = extract_figures(
            page,
            exclude_boxes=[c.bbox for c in snapped_cands],
            dpi=int(th.get("figureDpi", 150)),
            max_edge_px=int(th.get("figureMaxEdgePx", 1600)),
            quality=int(th.get("figureJpegQuality", 82)),
        )
    else:
        figures = []

    keep_text_wids: set[str] = set()
    for fig in figures:
        if fig.keepText and fig.bbox is not None:
            for w in words:
                if w.bbox is not None:
                    cx = (w.bbox[0] + w.bbox[2]) * 0.5
                    cy = (w.bbox[1] + w.bbox[3]) * 0.5
                    if point_in_bbox((cx, cy), fig.bbox, tol=1.0):
                        keep_text_wids.add(w.id)

    words_by_id = {w.id: w for w in words}
    claimed_wids: set[str] = set(keep_text_wids)
    tables: list[TableIR] = []
    for cand in snapped_cands:
        tbl, newly_assigned = assign_words_to_table(
            cand,
            words,
            excluded_word_ids=claimed_wids,
            orphan_inset_pt=orphan_inset,
        )
        claimed_wids.update(newly_assigned)
        tbl = enrich_table_properties(
            tbl,
            words_by_id,
            rulings,
            fills_pt=fills_pt,
            thresholds=th,
            registry=reg,
        )
        tables.append(tbl)

    remaining_words = [w for w in words if w.id not in claimed_wids]
    non_table_blocks = reflow_non_table_blocks(
        remaining_words,
        rulings,
        tables=tables,
        figures=figures,
        page_width=page_size.width,
        page_height=page_size.height,
        thresholds=th,
        registry=reg,
    )

    all_blocks: list[BlockIR] = []
    all_blocks.extend(tables)
    all_blocks.extend(figures)
    all_blocks.extend(non_table_blocks)

    reading_order = compute_reading_order(all_blocks, page_width=page_size.width)
    margins = _estimate_margins(all_blocks, page_size)

    page_ir = PageIR(
        pageIndex=page_index,
        sourceKind=source_kind,
        size=page_size,
        margins=margins,
        words=list(words),
        rulings=list(rulings),
        blocks=all_blocks,
        readingOrder=reading_order,
        metrics={
            "ocrAvgConf": ocr_avg_conf,
            "rulingCount": len(rulings),
            "tableCount": len(tables),
            "wordCount": len(words),
            "occludedCharsFiltered": occluded_chars_filtered,
        },
    )
    val_res = validate_page_ir(
        page_ir,
        containment_tol_pt=float(th.get("containmentTolPt", 2.0)),
        orphan_inset_pt=orphan_inset,
    )
    if page_ir.metrics is not None:
        page_ir.metrics["invariantErrors"] = [f"{v.code}: {v.detail}" for v in val_res.violations]
        page_ir.metrics = summarize_page_metrics(page_ir)
    emit_stage_event(
        "build_page",
        page_index=page_index,
        metrics={
            "tableShapes": (page_ir.metrics or {}).get("tableShapes", []),
            "blockCounts": (page_ir.metrics or {}).get("blockCounts", {}),
            "headingSummary": (page_ir.metrics or {}).get("headingSummary", []),
            "headerTexts": (page_ir.metrics or {}).get("headerTexts", []),
            "captionCount": (page_ir.metrics or {}).get("captionCount", 0),
            "headerFooterCount": (page_ir.metrics or {}).get("headerFooterCount", 0),
            "needsReviewCells": (page_ir.metrics or {}).get("needsReviewCells", 0),
            "invariantErrorCount": len((page_ir.metrics or {}).get("invariantErrors") or []),
        },
    )
    return page_ir


def build_doc_ir(
    path: str | Path,
    *,
    page_indices: Optional[list[int]] = None,
    cache_root: Optional[str | Path] = None,
    ocr_port: Optional[Any] = None,
    force: bool = False,
    thresholds: Optional[dict[str, Any]] = None,
    registry: Optional[dict[str, Any]] = None,
    render_png: bool = True,
) -> DocIR:
    """Build (or load cached) DocIR across all or selected pages, plus cross-page table links."""
    src = Path(path)
    src_hash = file_src_hash(src)
    th = thresholds or load_thresholds()
    reg = registry or load_registry()
    cache_dir = doc_cache_dir(cache_root, src_hash) if cache_root is not None else None

    if src.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        if cache_dir is not None and not force:
            cached = load_page_ir(cache_dir, 1)
            if cached is not None:
                return DocIR(docId=src.stem, title=src.stem, srcHash=src_hash, sourcePath=str(src), pages=[cached])
        _, acq_list = acquire_pages(src, cache_root=cache_root, ocr_port=ocr_port, thresholds=th, render_png=False)
        acq = acq_list[0]
        pir = build_page_ir(
            acq.words,
            acq.rulings,
            page_index=1,
            page_size=acq.size,
            source_kind="image",
            fills_pt=acq.fillsPt,
            thresholds=th,
            registry=reg,
            ocr_avg_conf=acq.ocrAvgConf,
        )
        if cache_dir is not None:
            save_page_ir(cache_dir, pir)
        return DocIR(docId=src.stem, title=src.stem, srcHash=src_hash, sourcePath=str(src), pages=[pir])

    pages: list[PageIR] = []
    wanted = set(page_indices) if page_indices else None
    with pymupdf.open(str(src)) as doc:
        for idx, page in enumerate(doc, start=1):
            if wanted is not None and idx not in wanted:
                continue
            if cache_dir is not None and not force:
                cached = load_page_ir(cache_dir, idx)
                if cached is not None:
                    if render_png:
                        png_path = cache_dir / f"p{idx}.png"
                        if not png_path.is_file():
                            dpi = int(
                                th.get("scanRenderDpi", 300)
                                if cached.sourceKind != "pdf-vector"
                                else th.get("renderDpi", 200)
                            )
                            render_page_png(page, png_path, dpi=dpi)
                    pages.append(cached)
                    continue
            acq = acquire_pdf_page(
                page,
                idx,
                cache_dir=cache_dir,
                ocr_port=ocr_port,
                thresholds=th,
                render_png=render_png,
            )
            pir = build_page_ir(
                acq.words,
                acq.rulings,
                page_index=idx,
                page_size=acq.size,
                source_kind=acq.sourceKind,
                fills_pt=acq.fillsPt,
                page=page,
                thresholds=th,
                registry=reg,
                ocr_avg_conf=acq.ocrAvgConf,
                occluded_chars_filtered=acq.occludedCharsFiltered,
            )
            if cache_dir is not None:
                save_page_ir(cache_dir, pir)
                emit_stage_event(
                    "page_ir_saved",
                    page_index=idx,
                    metrics=summarize_page_metrics(pir),
                    cache_dir=cache_dir,
                )
            pages.append(pir)

    links = detect_table_continuations(pages)
    if links and cache_dir is not None:
        linked_targets = {dst for _, dst in links}
        for pir in pages:
            if any(b.id in linked_targets for b in pir.blocks):
                save_page_ir(cache_dir, pir)

    doc_ir = DocIR(
        docId=src.stem,
        title=src.stem,
        srcHash=src_hash,
        sourcePath=str(src),
        pages=pages,
    )
    emit_stage_event("build_doc", metrics=summarize_doc_metrics(doc_ir), cache_dir=cache_dir)
    return doc_ir