"""Page and document IR construction pipeline from vector PDF / raster scan / OCR."""
from __future__ import annotations

import math
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

import pymupdf
from PIL import Image, ImageDraw

from .acquire.figures import detect_raster_photo_boxes, extract_figures
from .acquire.page_mode import classify_page_mode
from .acquire.render import render_page_png
from .acquire.rulings import extract_vector_rulings_and_fills
from .acquire.words import extract_vector_words
from .blocks.order import compute_reading_order
from .blocks.reflow import reflow_non_table_blocks
from .cache import doc_cache_dir, file_src_hash, load_page_ir, save_page_ir, write_json
from .config import load_registry, load_thresholds
from .ir.model import (
    BBox,
    BlockIR,
    DocIR,
    FieldBlock,
    FigureBlock,
    LineGroupBlock,
    NoteBlock,
    PageIR,
    PageMargins,
    PageSize,
    Ruling,
    TableIR,
    Word,
    bbox_iou,
    point_in_bbox,
)
from .ir.validate import validate_page_ir
from .tables.assign import assign_words_to_table
from .tables.candidates import CandidateCell, TableCandidate, propose_table_candidates
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
    scanPhotoBoxes: list[BBox] = field(default_factory=list)


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

    scan_photo_boxes: list[BBox] = []
    if mode.kind in ("pdf-scan", "pdf-hybrid"):
        scan_photo_boxes = detect_raster_photo_boxes(page, dpi=int(th.get("figureDpi", 150)))

    def _recognize_with_photo_mask(src_png: Path) -> list[Word]:
        assert ocr_port is not None
        dpi_used = int(th.get("scanRenderDpi", 300))
        if not scan_photo_boxes:
            return list(ocr_port.recognize(src_png, (size.width, size.height), dpi=dpi_used))
        # White-mask continuous-tone photo rectangles so OCR does not hallucinate glyphs from textures
        with Image.open(src_png) as orig_im:
            masked_im = orig_im.convert("RGB")
            mx = masked_im.width / max(1.0, float(size.width))
            my = masked_im.height / max(1.0, float(size.height))
            drawer = ImageDraw.Draw(masked_im)
            for pb in scan_photo_boxes:
                drawer.rectangle(
                    [pb[0] * mx, pb[1] * my, pb[2] * mx, pb[3] * my],
                    fill=(255, 255, 255),
                )
            with tempfile.TemporaryDirectory(prefix="docstruct_ocr_mask_") as mask_dir:
                masked_path = Path(mask_dir) / "ocr_masked.png"
                masked_im.save(masked_path, format="PNG")
                raw_ocr = list(ocr_port.recognize(masked_path, (size.width, size.height), dpi=dpi_used))
        kept_ocr: list[Word] = []
        for w in raw_ocr:
            if w.bbox is not None and scan_photo_boxes:
                cx = (w.bbox[0] + w.bbox[2]) * 0.5
                cy = (w.bbox[1] + w.bbox[3]) * 0.5
                if any(point_in_bbox((cx, cy), pb, tol=2.0) for pb in scan_photo_boxes):
                    continue
            kept_ocr.append(w)
        return kept_ocr

    png_path: Optional[Path] = None
    ocr_confs: list[float] = []
    if cache_dir is not None and (render_png or mode.kind != "pdf-vector"):
        dpi = int(th.get("scanRenderDpi", 300) if mode.kind != "pdf-vector" else th.get("renderDpi", 200))
        png_path = render_page_png(page, cache_dir / f"p{page_index}.png", dpi=dpi)
        if mode.kind in ("pdf-scan", "pdf-hybrid") and ocr_port is not None:
            ocr_words = _recognize_with_photo_mask(png_path)
            ocr_confs = [w.conf for w in ocr_words]
            words = ocr_words if mode.kind == "pdf-scan" else _merge_hybrid_words(words, ocr_words)
    elif mode.kind in ("pdf-scan", "pdf-hybrid") and ocr_port is not None:
        dpi_used = int(th.get("scanRenderDpi", 300))
        with tempfile.TemporaryDirectory(prefix="docstruct_scan_") as tmp_dir:
            tmp_png = render_page_png(page, Path(tmp_dir) / f"p{page_index}.png", dpi=dpi_used)
            ocr_words = _recognize_with_photo_mask(tmp_png)
        ocr_confs = [w.conf for w in ocr_words]
        words = ocr_words if mode.kind == "pdf-scan" else _merge_hybrid_words(words, ocr_words)

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
        scanPhotoBoxes=scan_photo_boxes,
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


def _apply_ocr_text_rules(text: str, rules: list[dict[str, Any]]) -> str:
    """Apply contextual OCR confusion fixes without mutating raw word tokens."""
    out = text
    for rule in rules:
        kind = str(rule.get("kind") or "")
        if kind == "article_zero_oh" and rule.get("wrong"):
            def _fix_art(m: re.Match[str]) -> str:
                num = m.group(1).translate(str.maketrans({"o": "0", "O": "0", "l": "1", "I": "1"}))
                return f"제 {num} 조"
            out = re.sub(str(rule["wrong"]), _fix_art, out)
            continue
        frm = str(rule.get("from") or "")
        to = str(rule.get("to") or "")
        when = str(rule.get("when") or "")
        if frm and to:
            if when == "ko_context":
                esc = re.escape(frm)
                out = re.sub(rf"(?<=[가-힣]){esc}|{esc}(?=[가-힣])", to, out)
            elif when == "roman_or_latin":
                esc = re.escape(frm)
                out = re.sub(rf"(?<=[A-Za-z0-9\s(]){esc}(?=[A-Za-z0-9\s).])", to, out)
    return out


def _apply_ocr_confusions_overlay(
    blocks: list[BlockIR],
    words_by_id: dict[str, Word],
    registry: dict[str, Any],
) -> list[dict[str, str]]:
    """Apply registry ocrConfusions onto block text/span overlays and log fixes (`by: ocr-rule`)."""
    rules = list(registry.get("ocrConfusions") or [])
    if not rules:
        return []
    fixes: list[dict[str, str]] = []
    for blk in blocks:
        cur_txt = getattr(blk, "text", None)
        if not cur_txt:
            continue
        new_txt = _apply_ocr_text_rules(str(cur_txt), rules)
        if new_txt != cur_txt:
            fixes.append({"blockId": blk.id, "from": str(cur_txt), "to": new_txt, "by": "ocr-rule"})
            setattr(blk, "text", new_txt)
            spans = getattr(blk, "spans", None)
            if spans:
                for sp in spans:
                    sp_txt = sp.text
                    if sp_txt is None and getattr(sp, "wordIds", None):
                        sp_txt = " ".join(
                            words_by_id[wid].text for wid in sp.wordIds if wid in words_by_id and words_by_id[wid].text
                        )
                    if sp_txt:
                        fixed_sp = _apply_ocr_text_rules(sp_txt, rules)
                        if fixed_sp != sp_txt:
                            sp.text = fixed_sp
    return fixes


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
    scan_photo_boxes: Optional[list[BBox]] = None,
) -> PageIR:
    """Build a validated PageIR from acquired primitives (tables, figures, fields, text, readingOrder)."""
    th = thresholds or load_thresholds()
    reg = registry or load_registry()
    snap_tol = float(th.get("snapTolPt", 1.8))
    orphan_inset = float(th.get("orphanInsetPt", 1.0))
    lth = th.get("layout") or {}
    bg_cover = float(lth.get("pageBgCoverRatio", 0.75))
    page_area = max(1.0, float(page_size.width) * float(page_size.height))

    # WP4: Separate full-page tinted background from local panel/cell fills
    page_bg_color: Optional[str] = None
    local_fills: list[dict[str, Any]] = []
    for fl in fills_pt or []:
        fw = max(0.0, float(fl["x1"]) - float(fl["x0"]))
        fh = max(0.0, float(fl["y1"]) - float(fl["y0"]))
        col = str(fl.get("color") or "").strip().lower()
        if not col or col in {"#ffffff", "#fefefe", "#fdfdfd", "transparent"}:
            continue
        if (fw * fh) / page_area >= bg_cover:
            page_bg_color = str(fl.get("color") or "").upper()
        else:
            local_fills.append(fl)

    raw_cands = propose_table_candidates(
        rulings,
        words,
        fills_pt=local_fills,
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

    def _bbox_area(bx: tuple[float, float, float, float]) -> float:
        return max(0.0, bx[2] - bx[0]) * max(0.0, bx[3] - bx[1])

    def _encloses(outer: tuple[float, float, float, float], inner: tuple[float, float, float, float]) -> bool:
        return (
            outer[0] <= inner[0] + 2.0
            and outer[1] <= inner[1] + 2.0
            and outer[2] >= inner[2] - 2.0
            and outer[3] >= inner[3] - 2.0
            and _bbox_area(outer) > _bbox_area(inner) * 1.4
        )

    # WP4: Promote filled non-table rectangular panels enclosing words to 1x1 TableCandidates
    for fl in local_fills:
        fw = max(0.0, float(fl["x1"]) - float(fl["x0"]))
        fh = max(0.0, float(fl["y1"]) - float(fl["y0"]))
        if fw < 80.0 or fh < 14.0 or (fw * fh) / page_area > 0.45:
            continue
        col_hex = str(fl.get("color") or "").strip().lower()
        top_edge = any(
            abs((r.y0 + r.y1) * 0.5 - float(fl["y0"])) <= 3.0
            for r in rulings
            if r.orient == "h"
        )
        bot_edge = any(
            abs((r.y0 + r.y1) * 0.5 - float(fl["y1"])) <= 3.0
            for r in rulings
            if r.orient == "h"
        )
        has_panel_border = top_edge and bot_edge
        lum_ok = False
        if len(col_hex) == 7 and col_hex.startswith("#"):
            try:
                lum = (int(col_hex[1:3], 16) + int(col_hex[3:5], 16) + int(col_hex[5:7], 16)) / 3.0
                lum_ok = lum <= 242.0
            except ValueError:
                lum_ok = True
        if not (has_panel_border or (lum_ok and fh <= 90.0)):
            continue
        bx: BBox = (
            round(float(fl["x0"]), 2),
            round(float(fl["y0"]), 2),
            round(float(fl["x1"]), 2),
            round(float(fl["y1"]), 2),
        )
        if any(bbox_iou(bx, c.bbox) >= 0.25 or _encloses(c.bbox, bx) or _encloses(bx, c.bbox) for c in snapped_cands):
            continue
        has_word = any(
            w.bbox is not None
            and point_in_bbox(((w.bbox[0] + w.bbox[2]) * 0.5, (w.bbox[1] + w.bbox[3]) * 0.5), bx, tol=1.0)
            for w in words
        )
        if not has_word:
            continue
        snapped_cands.append(
            TableCandidate(
                id=f"panel_{len(snapped_cands)}",
                bbox=bx,
                colXs=[bx[0], bx[2]],
                rowYs=[bx[1], bx[3]],
                cells=[
                    CandidateCell(
                        r=0,
                        c=0,
                        rs=1,
                        cs=1,
                        bbox=bx,
                        bg=str(fl.get("color") or "").upper() or None,
                    )
                ],
                hasRulings=True,
                source="rulings",
            )
        )

    if figures_override is not None:
        figures = list(figures_override)
    elif page is not None:
        figures = extract_figures(
            page,
            exclude_boxes=[c.bbox for c in snapped_cands],
            extra_photo_boxes=scan_photo_boxes,
            is_scan=(source_kind in ("pdf-scan", "pdf-hybrid", "image")),
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

    # WP1/WP2: Assign words to inner/more-granular tables BEFORE outer enclosing container frames,
    # and skip outer container frames that wrap multi-cell tables (preventing double-height overflow).
    inner_multis = [c for c in snapped_cands if len(c.cells) >= 4]
    filtered_cands: list[Any] = []
    for cand in snapped_cands:
        is_outer_wrapper = (
            len(cand.cells) <= 3
            and any(_encloses(cand.bbox, inner.bbox) for inner in inner_multis)
        )
        if not is_outer_wrapper:
            filtered_cands.append(cand)

    ordered_cands = sorted(filtered_cands, key=lambda c: (_bbox_area(c.bbox), c.bbox[1], c.bbox[0]))
    tables: list[TableIR] = []
    for cand in ordered_cands:
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
            fills_pt=local_fills,
            thresholds=th,
            registry=reg,
        )
        tables.append(tbl)
    tables.sort(key=lambda t: (t.bbox[1] if t.bbox else 0.0, t.bbox[0] if t.bbox else 0.0))

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

    # WP1: Compute vertical spaceBeforePt along reading order for flowing body blocks
    by_id_blk = {b.id: b for b in all_blocks}
    prev_bot: Optional[float] = None
    for bid in reading_order:
        blk = by_id_blk.get(bid)
        if blk is None:
            continue
        if isinstance(blk, NoteBlock) and blk.noteKind in ("header", "footer"):
            continue
        if blk.bbox is None:
            continue
        if prev_bot is None:
            if hasattr(blk, "spaceBeforePt"):
                blk.spaceBeforePt = 0.0
            prev_bot = float(blk.bbox[3])
        else:
            gap = float(blk.bbox[1]) - prev_bot
            if gap >= -2.0 and hasattr(blk, "spaceBeforePt"):
                blk.spaceBeforePt = round(max(0.0, gap), 2)
            prev_bot = max(prev_bot, float(blk.bbox[3]))

    # WP1/WP5: Infer page layoutDefaults (font, sizePt, linePct) from non-table body words & block pitches
    from statistics import median as _median

    non_table_wids = {
        wid
        for b in non_table_blocks
        if not (isinstance(b, NoteBlock) and b.noteKind in ("header", "footer"))
        for wid in (getattr(b, "wordIds", None) or [])
    }
    body_words = [words_by_id[wid] for wid in non_table_wids if wid in words_by_id]
    if not body_words or sum(len(w.text.strip()) for w in body_words) < 10:
        body_words = [w for w in words if w.size is not None and float(w.size) >= 6.0]
    word_size_weights: dict[float, int] = {}
    for w in body_words:
        if w.size is not None and float(w.size) >= 6.0:
            sk = round(float(w.size), 1)
            word_size_weights[sk] = word_size_weights.get(sk, 0) + max(1, len(w.text.strip()))
    dom_size_pt = max(word_size_weights.items(), key=lambda kv: (kv[1], -kv[0]))[0] if word_size_weights else 10.0
    dom_fonts = [str(w.font).strip() for w in body_words if w.font]
    dom_font = max(set(dom_fonts), key=dom_fonts.count) if dom_fonts else ""
    multi_line_ratios = [
        float(b.lineHeight)
        for b in non_table_blocks
        if getattr(b, "lineHeight", None) is not None
        and 0.95 <= float(b.lineHeight) <= 2.2
        and ((getattr(b, "lineCount", None) or 0) >= 2 or len(getattr(b, "wordIds", None) or []) >= 6)
    ]
    line_ratios = multi_line_ratios or [
        float(b.lineHeight)
        for b in non_table_blocks
        if getattr(b, "lineHeight", None) is not None and 0.95 <= float(b.lineHeight) <= 2.2
    ]
    if not line_ratios:
        single_ys = sorted(
            (b.bbox[1], b.bbox[3], float(getattr(b, "fontSizePt", None) or dom_size_pt))
            for b in non_table_blocks
            if b.bbox is not None and not (isinstance(b, NoteBlock) and b.noteKind in ("header", "footer"))
        )
        for (_, ay1, asz), (_, by1, bsz) in zip(single_ys, single_ys[1:]):
            dy = by1 - ay1
            ref = min(asz, bsz)
            if ref >= 6.0 and 0.95 <= (dy / ref) <= 2.2:
                line_ratios.append(dy / ref)
    dom_lh_ratio = round(max(1.15, min(2.2, float(_median(line_ratios)))), 2) if line_ratios else 1.35

    ocr_fixes: list[dict[str, str]] = []
    if source_kind in ("pdf-scan", "pdf-hybrid", "image") or any(w.src == "ocr" for w in words):
        ocr_fixes = _apply_ocr_confusions_overlay(all_blocks, words_by_id, reg)

    page_ir = PageIR(
        pageIndex=page_index,
        sourceKind=source_kind,
        size=page_size,
        margins=margins,
        words=list(words),
        rulings=list(rulings),
        blocks=all_blocks,
        readingOrder=reading_order,
        pageBgColor=page_bg_color,
        metrics={
            "ocrAvgConf": ocr_avg_conf,
            "rulingCount": len(rulings),
            "tableCount": len(tables),
            "wordCount": len(words),
            "occludedCharsFiltered": occluded_chars_filtered,
            "ocrFixes": ocr_fixes,
            "layoutDefaults": {
                "font": dom_font,
                "sizePt": dom_size_pt,
                "linePct": round(dom_lh_ratio * 100),
            },
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


def _norm_band_text(txt: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", (txt or "").strip())).strip()


def _promote_running_headers_footers(pages: list[PageIR], registry: dict[str, Any]) -> list[PageIR]:
    """Cross-page pass promoting repeated top/bottom text bands & small logos into header/footer NoteBlocks."""
    rh = registry.get("runningHeader") or {}
    min_pages = int(rh.get("minPages", 2))
    if len(pages) < min_pages:
        return pages

    top_ratio = float(rh.get("topRatio", 0.14))
    bot_ratio = float(rh.get("bottomRatio", 0.12))
    min_frac = float(rh.get("minPageFraction", 0.5))
    needed = max(min_pages, math.ceil(len(pages) * min_frac))

    top_text_pages: dict[str, set[int]] = {}
    bot_text_pages: dict[str, set[int]] = {}
    top_img_pages: dict[tuple[int, int], set[int]] = {}
    bot_img_pages: dict[tuple[int, int], set[int]] = {}

    for p in pages:
        ph = float(p.size.height)
        page_area = max(1.0, float(p.size.width) * ph)
        top_cut = ph * top_ratio
        bot_cut = ph * (1.0 - bot_ratio)
        for blk in p.blocks:
            if blk.bbox is None:
                continue
            if isinstance(blk, FigureBlock):
                area = max(0.0, blk.bbox[2] - blk.bbox[0]) * max(0.0, blk.bbox[3] - blk.bbox[1])
                if area >= page_area * 0.25:
                    continue
                bucket = (round(blk.bbox[0] / 24.0), round(blk.bbox[1] / 24.0))
                if blk.bbox[3] <= top_cut:
                    top_img_pages.setdefault(bucket, set()).add(p.pageIndex)
                elif blk.bbox[1] >= bot_cut:
                    bot_img_pages.setdefault(bucket, set()).add(p.pageIndex)
            elif not isinstance(blk, (TableIR, FieldBlock)):
                txt = _norm_band_text(getattr(blk, "text", None) or "")
                if not txt:
                    continue
                if blk.bbox[3] <= top_cut:
                    top_text_pages.setdefault(txt, set()).add(p.pageIndex)
                elif blk.bbox[1] >= bot_cut:
                    bot_text_pages.setdefault(txt, set()).add(p.pageIndex)

    repeated_top_texts = {k for k, v in top_text_pages.items() if len(v) >= needed}
    repeated_bot_texts = {k for k, v in bot_text_pages.items() if len(v) >= needed}
    repeated_top_imgs = {k for k, v in top_img_pages.items() if len(v) >= needed}
    repeated_bot_imgs = {k for k, v in bot_img_pages.items() if len(v) >= needed}

    if not (repeated_top_texts or repeated_bot_texts or repeated_top_imgs or repeated_bot_imgs):
        return pages

    modified: list[PageIR] = []
    for p in pages:
        ph = float(p.size.height)
        page_area = max(1.0, float(p.size.width) * ph)
        top_cut = ph * top_ratio
        bot_cut = ph * (1.0 - bot_ratio)
        new_blocks: list[BlockIR] = []
        hdr_logo_src: Optional[str] = None
        hdr_logo_box: Optional[BBox] = None
        ftr_logo_src: Optional[str] = None
        ftr_logo_box: Optional[BBox] = None
        changed = False

        for blk in p.blocks:
            if isinstance(blk, FigureBlock) and blk.bbox is not None:
                area = max(0.0, blk.bbox[2] - blk.bbox[0]) * max(0.0, blk.bbox[3] - blk.bbox[1])
                bucket = (round(blk.bbox[0] / 24.0), round(blk.bbox[1] / 24.0))
                if area < page_area * 0.25 and blk.bbox[3] <= top_cut and bucket in repeated_top_imgs and hdr_logo_src is None:
                    hdr_logo_src = blk.src
                    hdr_logo_box = blk.bbox
                    changed = True
                    continue
                if area < page_area * 0.25 and blk.bbox[1] >= bot_cut and bucket in repeated_bot_imgs and ftr_logo_src is None:
                    ftr_logo_src = blk.src
                    ftr_logo_box = blk.bbox
                    changed = True
                    continue
            elif not isinstance(blk, (TableIR, FieldBlock)) and blk.bbox is not None:
                norm_t = _norm_band_text(getattr(blk, "text", None) or "")
                if blk.bbox[3] <= top_cut and (
                    (norm_t and norm_t in repeated_top_texts) or (isinstance(blk, NoteBlock) and blk.noteKind == "header")
                ):
                    wids = list(getattr(blk, "wordIds", []) or [])
                    spans = (
                        list(blk.spans)
                        if hasattr(blk, "spans")
                        else [sp for sg in getattr(blk, "segments", []) for sp in sg.spans]
                    )
                    blk = NoteBlock(
                        id=blk.id,
                        noteKind="header",
                        bbox=blk.bbox,
                        wordIds=wids,
                        text=getattr(blk, "text", None),
                        spans=spans,
                        align=getattr(blk, "align", "left") or "left",
                        fontSizePt=getattr(blk, "fontSizePt", None),
                        fontFamily=getattr(blk, "fontFamily", None),
                    )
                    changed = True
                elif blk.bbox[1] >= bot_cut and (
                    (norm_t and norm_t in repeated_bot_texts) or (isinstance(blk, NoteBlock) and blk.noteKind == "footer")
                ):
                    wids = list(getattr(blk, "wordIds", []) or [])
                    spans = (
                        list(blk.spans)
                        if hasattr(blk, "spans")
                        else [sp for sg in getattr(blk, "segments", []) for sp in sg.spans]
                    )
                    blk = NoteBlock(
                        id=blk.id,
                        noteKind="footer",
                        bbox=blk.bbox,
                        wordIds=wids,
                        text=getattr(blk, "text", None),
                        spans=spans,
                        align=getattr(blk, "align", "left") or "left",
                        fontSizePt=getattr(blk, "fontSizePt", None),
                        fontFamily=getattr(blk, "fontFamily", None),
                    )
                    changed = True
            new_blocks.append(blk)

        if hdr_logo_src:
            hdr_note = next((b for b in new_blocks if isinstance(b, NoteBlock) and b.noteKind == "header"), None)
            if hdr_note is not None:
                hdr_note.imageSrc = hdr_logo_src
            else:
                new_blocks.insert(
                    0,
                    NoteBlock(id=f"hdr_logo_p{p.pageIndex}", noteKind="header", bbox=hdr_logo_box, text="", imageSrc=hdr_logo_src),
                )
        if ftr_logo_src:
            ftr_note = next((b for b in new_blocks if isinstance(b, NoteBlock) and b.noteKind == "footer"), None)
            if ftr_note is not None:
                ftr_note.imageSrc = ftr_logo_src
            else:
                new_blocks.append(
                    NoteBlock(id=f"ftr_logo_p{p.pageIndex}", noteKind="footer", bbox=ftr_logo_box, text="", imageSrc=ftr_logo_src),
                )

        if changed:
            p.blocks = new_blocks
            p.readingOrder = compute_reading_order(new_blocks, page_width=p.size.width)
            body_boxes = [
                b.bbox
                for b in new_blocks
                if b.bbox is not None and not (isinstance(b, NoteBlock) and b.noteKind in ("header", "footer"))
            ]
            if body_boxes:
                p.margins = PageMargins(
                    top=round(max(0.0, min(b[1] for b in body_boxes)), 2),
                    right=round(max(0.0, p.size.width - max(b[2] for b in body_boxes)), 2),
                    bottom=round(max(0.0, p.size.height - max(b[3] for b in body_boxes)), 2),
                    left=round(max(0.0, min(b[0] for b in body_boxes)), 2),
                )
            by_id = {b.id: b for b in new_blocks}
            prev_bot: Optional[float] = None
            for bid in p.readingOrder:
                b = by_id.get(bid)
                if b is None or b.bbox is None or (isinstance(b, NoteBlock) and b.noteKind in ("header", "footer")):
                    continue
                if prev_bot is None:
                    if hasattr(b, "spaceBeforePt"):
                        b.spaceBeforePt = 0.0
                    prev_bot = float(b.bbox[3])
                else:
                    gap = float(b.bbox[1]) - prev_bot
                    if gap >= -2.0 and hasattr(b, "spaceBeforePt"):
                        b.spaceBeforePt = round(max(0.0, gap), 2)
                    prev_bot = max(prev_bot, float(b.bbox[3]))
            modified.append(p)

    return modified


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
                scan_photo_boxes=acq.scanPhotoBoxes,
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

    modified_chrome = _promote_running_headers_footers(pages, reg)
    if modified_chrome and cache_dir is not None:
        for pir in modified_chrome:
            save_page_ir(cache_dir, pir)

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