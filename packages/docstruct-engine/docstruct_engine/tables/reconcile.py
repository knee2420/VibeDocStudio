"""Reconcile HTML edits and multi-word fixes into TableIR / PageIR with invariant enforcement & image fallback."""
from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any, Optional

import pymupdf
from PIL import Image
from pydantic import BaseModel, Field

from ..acquire.figures import crop_bbox_jpeg_data_uri
from ..blocks.text_join import join_words_smart
from ..config import load_thresholds
from ..ir.model import (
    BBox,
    CellIR,
    PageIR,
    Ruling,
    TableIR,
    Word,
    bbox_center,
    point_in_bbox,
)
from ..ir.validate import validate_page_ir
from .assign import sort_words_reading_order
from .html_io import ParsedTableGrid, validate_table_html_grid
from .props import enrich_table_properties


class ReconcileResult(BaseModel):
    ok: bool
    table: Optional[TableIR] = None
    page: Optional[PageIR] = None
    errors: list[str] = Field(default_factory=list)
    rejectCount: int = 0
    fallbackToImage: bool = False


def validate_and_apply_word_fixes(
    page: PageIR,
    fixes: list[dict[str, Any]],
) -> tuple[bool, list[str]]:
    """Validate and apply multi-word OCR/text fixes (§12.7).

    Rules:
    - Each fix accepts `wordIds: list[str]` (or legacy `wordId: str`) and `text: str`.
    - All `wordIds` in a fix must exist, belong to a single container (cell or non-table block),
      and form a contiguous slice in that container's reading-order `wordIds`.
    - Sequential fixes compose deterministically with last-fix-wins per `wordId`.
    """
    if not fixes:
        return True, []

    words_by_id = {w.id: w for w in page.words}

    # Build container index: list of (container_key, ordered wordIds)
    containers: list[tuple[str, list[str]]] = []
    word_to_containers: dict[str, list[int]] = {}

    def _register_container(key: str, wids: list[str]) -> None:
        idx = len(containers)
        containers.append((key, list(wids)))
        for wid in wids:
            word_to_containers.setdefault(wid, []).append(idx)

    for blk in page.blocks:
        if isinstance(blk, TableIR):
            for cell in sorted(blk.cells, key=lambda c: (c.r, c.c)):
                _register_container(f"{blk.id}:r{cell.r}c{cell.c}", cell.wordIds)
        else:
            wids = getattr(blk, "wordIds", None)
            if wids:
                _register_container(blk.id, wids)

    errors: list[str] = []
    staged: list[tuple[list[str], str]] = []

    for f_idx, fx in enumerate(fixes):
        raw_ids = fx.get("wordIds")
        if raw_ids is None and fx.get("wordId"):
            raw_ids = [fx["wordId"]]
        if not isinstance(raw_ids, list) or not raw_ids:
            errors.append(f"FIX_EMPTY_WORD_IDS: fix[{f_idx}] missing non-empty wordIds")
            continue
        wids = [str(w) for w in raw_ids]
        new_text = str(fx.get("text") if fx.get("text") is not None else "")

        unknown = [w for w in wids if w not in words_by_id]
        if unknown:
            errors.append(f"FIX_UNKNOWN_WORD: fix[{f_idx}] references unknown wordIds {unknown}")
            continue

        # Every word in a single fix must sit inside the same single container
        common_cids = set(word_to_containers.get(wids[0], []))
        for wid in wids[1:]:
            common_cids &= set(word_to_containers.get(wid, []))
        if not common_cids:
            errors.append(f"FIX_CROSS_CONTAINER: fix[{f_idx}] wordIds {wids} span different or unassigned containers")
            continue

        # Check contiguous reading order slice inside that container
        cid = next(iter(common_cids))
        _, c_order = containers[cid]
        pos = {wid: idx for idx, wid in enumerate(c_order)}
        indices = [pos[w] for w in wids]
        sorted_indices = sorted(indices)
        expected = list(range(sorted_indices[0], sorted_indices[0] + len(sorted_indices)))
        if indices != sorted_indices or sorted_indices != expected:
            errors.append(
                f"FIX_NON_CONTIGUOUS: fix[{f_idx}] wordIds {wids} are not contiguous in container '{containers[cid][0]}'"
            )
            continue

        staged.append((wids, new_text))

    if errors:
        return False, errors

    # Last fix wins per wordId across sequential fixes
    fixed_ids: set[str] = set()
    for wids, new_text in staged:
        fixed_ids.update(wids)
        first_w = words_by_id[wids[0]]
        first_w.text = new_text
        first_w.src = "vlm"
        first_w.needsReview = False
        first_w.conf = max(first_w.conf, 0.95)
        for rest_id in wids[1:]:
            rw = words_by_id[rest_id]
            rw.text = ""
            rw.src = "vlm"
            rw.needsReview = False
            rw.conf = max(rw.conf, 0.95)

    # Refresh container plain texts from updated words
    for blk in page.blocks:
        if isinstance(blk, TableIR):
            for cell in blk.cells:
                if cell.wordIds:
                    cwords = [words_by_id[w] for w in cell.wordIds if w in words_by_id and words_by_id[w].text]
                    cell.text = join_words_smart(cwords, preserve_line_breaks=True)
        elif hasattr(blk, "wordIds") and getattr(blk, "wordIds"):
            bwords = [words_by_id[w] for w in blk.wordIds if w in words_by_id and words_by_id[w].text]  # type: ignore[union-attr]
            blk.text = join_words_smart(bwords)  # type: ignore[union-attr]
            spans = getattr(blk, "spans", None)
            if spans and any(w in fixed_ids for w in getattr(blk, "wordIds")):
                for sp in spans:
                    if sp.wordIds:
                        sp_words = [
                            words_by_id[w]
                            for w in sp.wordIds
                            if w in words_by_id and words_by_id[w].text
                        ]
                        sp.text = join_words_smart(sp_words)
                    elif len(spans) == 1:
                        sp.text = blk.text  # type: ignore[union-attr]

    return True, []


def _crop_png_jpeg_data_uri(
    png_path: Path,
    bbox_pt: BBox,
    page_size_pt: tuple[float, float],
    *,
    max_edge_px: int = 1600,
    quality: int = 82,
) -> str:
    with Image.open(png_path) as img:
        iw, ih = img.size
        sx = iw / max(1.0, page_size_pt[0])
        sy = ih / max(1.0, page_size_pt[1])
        crop_box = (
            max(0, int(round(bbox_pt[0] * sx))),
            max(0, int(round(bbox_pt[1] * sy))),
            min(iw, int(round(bbox_pt[2] * sx))),
            min(ih, int(round(bbox_pt[3] * sy))),
        )
        cropped = img.crop(crop_box).convert("RGB")
        cw, ch = cropped.size
        if max(cw, ch) > max_edge_px and max(cw, ch) > 0:
            r = max_edge_px / float(max(cw, ch))
            cropped = cropped.resize((max(1, round(cw * r)), max(1, round(ch * r))), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        cropped.save(buf, format="JPEG", quality=quality, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"


def _merge_coords(vals: list[float], *, tol: float = 2.0) -> list[float]:
    if not vals:
        return []
    s = sorted(vals)
    groups: list[list[float]] = [[s[0]]]
    for v in s[1:]:
        if v - groups[-1][-1] <= tol:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [round(sum(g) / len(g), 2) for g in groups]


def _snap_axis(
    *,
    lo: float,
    hi: float,
    target_count: int,
    orig_count: int,
    orig_coords: list[float],
    ruling_candidates: list[float],
    cell_spans: list[tuple[int, int, tuple[float, float]]],
) -> list[float]:
    """Snap grid axis breaks to existing grid/rulings/word gutters before uniform interpolation."""
    if orig_count == target_count and len(orig_coords) == target_count + 1:
        return list(orig_coords)
    if target_count <= 1:
        return [round(lo, 2), round(hi, 2)]

    merged_cand = _merge_coords([lo, *ruling_candidates, hi], tol=2.0)
    merged_cand[0] = round(lo, 2)
    merged_cand[-1] = round(hi, 2)
    if len(merged_cand) == target_count + 1:
        return merged_cand

    slot_min: dict[int, float] = {}
    slot_max: dict[int, float] = {}
    for idx0, span, (w_lo, w_hi) in cell_spans:
        if span == 1:
            slot_min[idx0] = min(slot_min.get(idx0, w_lo), w_lo)
            slot_max[idx0] = max(slot_max.get(idx0, w_hi), w_hi)

    pool = sorted(set(_merge_coords([*orig_coords[1:-1], *ruling_candidates], tol=1.5)))
    anchors: list[Optional[float]] = [round(lo, 2)] + [None] * (target_count - 1) + [round(hi, 2)]

    for b in range(1, target_count):
        prev_end = slot_max.get(b - 1)
        next_start = slot_min.get(b)
        if prev_end is not None and next_start is not None and prev_end < next_start - 0.5:
            in_gap = [p for p in pool if prev_end - 0.5 <= p <= next_start + 0.5]
            mid = (prev_end + next_start) * 0.5
            anchors[b] = round(min(in_gap, key=lambda p: abs(p - mid)) if in_gap else mid, 2)
        elif prev_end is not None:
            after = [p for p in pool if p >= prev_end + 0.5 and p < hi - 1.0]
            if after:
                anchors[b] = round(after[0], 2)
        elif next_start is not None:
            before = [p for p in pool if lo + 1.0 < p <= next_start - 0.5]
            if before:
                anchors[b] = round(before[-1], 2)

    prev_anchor = anchors[0]
    assert prev_anchor is not None
    for b in range(1, target_count):
        val = anchors[b]
        if val is not None and prev_anchor + 1.0 < val < hi - 1.0:
            prev_anchor = val
        elif val is not None:
            anchors[b] = None

    i = 0
    while i < target_count:
        if anchors[i + 1] is not None:
            i += 1
            continue
        j = i + 1
        while j <= target_count and anchors[j] is None:
            j += 1
        left_v = anchors[i]
        right_v = anchors[j]
        assert left_v is not None and right_v is not None
        steps = j - i
        for k in range(1, steps):
            anchors[i + k] = round(left_v + (right_v - left_v) * k / steps, 2)
        i = j

    return [round(float(v), 2) for v in anchors if v is not None]


def _snap_uniform_grid(
    bbox: BBox,
    n_rows: int,
    n_cols: int,
    orig: TableIR,
    *,
    page_rulings: Optional[list[Ruling]] = None,
    words_by_id: Optional[dict[str, Word]] = None,
    grid: Optional[ParsedTableGrid] = None,
) -> tuple[list[float], list[float]]:
    bw = max(1.0, bbox[2] - bbox[0])
    bh = max(1.0, bbox[3] - bbox[1])
    v_cands: list[float] = []
    h_cands: list[float] = []
    for r in page_rulings or []:
        if r.orient == "v":
            rx = (r.x0 + r.x1) * 0.5
            inter_y = max(0.0, min(r.y1, bbox[3]) - max(r.y0, bbox[1]))
            if bbox[0] + 2.0 < rx < bbox[2] - 2.0 and inter_y >= bh * 0.20:
                v_cands.append(rx)
        elif r.orient == "h":
            ry = (r.y0 + r.y1) * 0.5
            inter_x = max(0.0, min(r.x1, bbox[2]) - max(r.x0, bbox[0]))
            if bbox[1] + 2.0 < ry < bbox[3] - 2.0 and inter_x >= bw * 0.20:
                h_cands.append(ry)

    x_spans: list[tuple[int, int, tuple[float, float]]] = []
    y_spans: list[tuple[int, int, tuple[float, float]]] = []
    if grid is not None and words_by_id is not None:
        for pc in grid.cells:
            wboxes = [words_by_id[w].bbox for w in pc.word_ids if w in words_by_id and words_by_id[w].bbox is not None]
            if not wboxes:
                continue
            wx0 = min(wb[0] for wb in wboxes if wb is not None)
            wx1 = max(wb[2] for wb in wboxes if wb is not None)
            wy0 = min(wb[1] for wb in wboxes if wb is not None)
            wy1 = max(wb[3] for wb in wboxes if wb is not None)
            x_spans.append((pc.c, pc.cs, (wx0, wx1)))
            y_spans.append((pc.r, pc.rs, (wy0, wy1)))

    col_xs = _snap_axis(
        lo=bbox[0],
        hi=bbox[2],
        target_count=n_cols,
        orig_count=orig.nCols,
        orig_coords=list(orig.colXs),
        ruling_candidates=v_cands,
        cell_spans=x_spans,
    )
    row_ys = _snap_axis(
        lo=bbox[1],
        hi=bbox[3],
        target_count=n_rows,
        orig_count=orig.nRows,
        orig_coords=list(orig.rowYs),
        ruling_candidates=h_cands,
        cell_spans=y_spans,
    )
    return col_xs, row_ys


def _build_reconciled_table(
    orig: TableIR,
    grid: ParsedTableGrid,
    page: PageIR,
    *,
    raw_html: str,
    orphan_inset_pt: float,
) -> tuple[TableIR, list[str]]:
    words_by_id = {w.id: w for w in page.words}
    outside_claimed: set[str] = set()
    for blk in page.blocks:
        if blk.id == orig.id:
            continue
        if isinstance(blk, TableIR):
            for c in blk.cells:
                outside_claimed.update(c.wordIds)
        elif hasattr(blk, "wordIds"):
            outside_claimed.update(getattr(blk, "wordIds") or [])

    bbox = orig.bbox or (0.0, 0.0, page.size.width, page.size.height)
    col_xs, row_ys = _snap_uniform_grid(
        bbox,
        grid.n_rows,
        grid.n_cols,
        orig,
        page_rulings=page.rulings,
        words_by_id=words_by_id,
        grid=grid,
    )

    # Determine whether the parsed HTML carried explicit data-w / data-word-ids provenance
    explicit_wids = [wid for pc in grid.cells for wid in pc.word_ids]
    errors: list[str] = []
    seen_wids: set[str] = set()
    if explicit_wids:
        for wid in explicit_wids:
            if wid not in words_by_id:
                errors.append(f"RECONCILE_UNKNOWN_WORD: wordId '{wid}' not in page.words")
            elif wid in outside_claimed:
                errors.append(f"RECONCILE_WORD_CONFLICT: wordId '{wid}' already assigned outside table '{orig.id}'")
            elif wid in seen_wids:
                errors.append(f"RECONCILE_DUPLICATE_WORD: wordId '{wid}' repeated across cells")
            seen_wids.add(wid)
        if errors:
            return orig, errors

    # Pool candidate words belonging to original table or inside table.bbox
    pool_ids: set[str] = set()
    for c in orig.cells:
        pool_ids.update(c.wordIds)
    for w in page.words:
        if w.id not in outside_claimed and w.bbox is not None:
            if point_in_bbox(bbox_center(w.bbox), bbox, tol=1.0):
                pool_ids.add(w.id)
    pool_words = [words_by_id[wid] for wid in pool_ids if wid in words_by_id]

    new_cells: list[CellIR] = []
    used_from_pool: set[str] = set()

    for pcell in grid.cells:
        cbx: BBox = (
            col_xs[pcell.c],
            row_ys[pcell.r],
            col_xs[pcell.c + pcell.cs],
            row_ys[pcell.r + pcell.rs],
        )
        if explicit_wids:
            cell_wids = [w for w in pcell.word_ids if w in words_by_id]
            used_from_pool.update(cell_wids)
        else:
            inside = [
                w
                for w in pool_words
                if w.id not in used_from_pool and w.bbox is not None and point_in_bbox(bbox_center(w.bbox), cbx, tol=0.5)
            ]
            ordered = sort_words_reading_order(inside)
            cell_wids = [w.id for w in ordered]
            used_from_pool.update(cell_wids)

        cwords = [words_by_id[w] for w in cell_wids if w in words_by_id]
        # If VLM altered cell text relative to matched word text, promote clean VLM text cleanly
        joined_words_txt = join_words_smart(cwords, preserve_line_breaks=True)
        final_text = pcell.text.strip() or joined_words_txt
        if cwords and pcell.text.strip() and " ".join(pcell.text.split()) != " ".join(joined_words_txt.split()):
            cwords[0].text = pcell.text.strip()
            cwords[0].src = "vlm"
            cwords[0].conf = max(cwords[0].conf, 0.95)
            for rw in cwords[1:]:
                rw.text = ""
                rw.src = "vlm"

        new_cells.append(
            CellIR(
                r=pcell.r,
                c=pcell.c,
                rs=pcell.rs,
                cs=pcell.cs,
                role="th" if pcell.role == "th" else "td",
                bbox=cbx,
                wordIds=cell_wids,
                text=final_text,
            )
        )

    # §12.7 / #3: Snap any unallocated pool word inside table.bbox inset `1pt` into nearest cell with needsReview
    for w in pool_words:
        if w.id in used_from_pool or w.bbox is None or not w.text.strip():
            continue
        ctr = bbox_center(w.bbox)
        if point_in_bbox(ctr, bbox, inset=orphan_inset_pt):
            best_cell = min(
                new_cells,
                key=lambda c: (
                    max((c.bbox[0] - ctr[0]) if c.bbox else 0.0, 0.0, (ctr[0] - c.bbox[2]) if c.bbox else 0.0) ** 2
                    + max((c.bbox[1] - ctr[1]) if c.bbox else 0.0, 0.0, (ctr[1] - c.bbox[3]) if c.bbox else 0.0) ** 2
                ),
            )
            best_cell.wordIds.append(w.id)
            best_cell.needsReview = True
            w.needsReview = True
            used_from_pool.add(w.id)
            cwords = [words_by_id[wid] for wid in best_cell.wordIds if wid in words_by_id and words_by_id[wid].text]
            best_cell.text = join_words_smart(cwords, preserve_line_breaks=True)

    width_pt = round(col_xs[-1] - col_xs[0], 2)
    width_ratio = [round((col_xs[i + 1] - col_xs[i]) / width_pt, 4) for i in range(grid.n_cols)] if width_pt > 0 else None

    reconciled = TableIR(
        id=orig.id,
        bbox=bbox,
        nRows=grid.n_rows,
        nCols=grid.n_cols,
        colXs=col_xs,
        rowYs=row_ys,
        widthRatio=width_ratio,
        widthPt=width_pt if width_pt > 0 else None,
        title=orig.title,
        cells=new_cells,
        repeatHeader=orig.repeatHeader,
        needsReview=any(c.needsReview for c in new_cells),
        rawHtml=raw_html,
    )
    reconciled = enrich_table_properties(reconciled, words_by_id, page.rulings)
    # Preserve explicit VLM th roles parsed from HTML even if style heuristics didn't re-promote them
    for nc, pc in zip(reconciled.cells, grid.cells):
        if pc.role == "th":
            nc.role = "th"
    return reconciled, []


def reconcile_table(
    page: PageIR,
    table_id: str,
    *,
    html: Optional[str] = None,
    fixes: Optional[list[dict[str, Any]]] = None,
    reject_count: int = 0,
    page_obj: Optional[pymupdf.Page] = None,
    page_png_path: Optional[Path] = None,
    thresholds: Optional[dict[str, Any]] = None,
) -> ReconcileResult:
    """Apply VLM HTML structure and/or multi-word fixes to one table, with 2-reject image fallback."""
    th = thresholds or load_thresholds()
    max_rejects = int(th.get("maxTableRejects", 2))
    orphan_inset = float(th.get("orphanInsetPt", 1.0))
    containment_tol = float(th.get("containmentTolPt", 2.0))

    working = page.model_copy(deep=True)
    tbl_idx = next((i for i, b in enumerate(working.blocks) if isinstance(b, TableIR) and b.id == table_id), None)
    if tbl_idx is None:
        return ReconcileResult(ok=False, errors=[f"TABLE_NOT_FOUND: '{table_id}'"], rejectCount=reject_count)
    orig_tbl = working.blocks[tbl_idx]
    assert isinstance(orig_tbl, TableIR)

    errors: list[str] = []

    if html is not None:
        grid, html_errs = validate_table_html_grid(html)
        if html_errs or grid is None:
            errors.extend(html_errs or ["HTML_PARSE_FAILED"])
        else:
            reconciled, rec_errs = _build_reconciled_table(
                orig_tbl,
                grid,
                working,
                raw_html=html,
                orphan_inset_pt=orphan_inset,
            )
            if rec_errs:
                errors.extend(rec_errs)
            else:
                working.blocks[tbl_idx] = reconciled

    if not errors and fixes:
        ok_fix, fix_errs = validate_and_apply_word_fixes(working, fixes)
        if not ok_fix:
            errors.extend(fix_errs)

    if not errors:
        vres = validate_page_ir(working, containment_tol_pt=containment_tol, orphan_inset_pt=orphan_inset)
        tbl_errors = [
            f"{v.code}: {v.detail}"
            for v in vres.violations
            if v.severity == "error" and (v.blockId == table_id or table_id in vres.failedTables or v.invariant in (1, 2, 3, 4))
        ]
        if tbl_errors:
            errors.extend(tbl_errors)

    if not errors:
        final_tbl = working.blocks[tbl_idx]
        assert isinstance(final_tbl, TableIR)
        return ReconcileResult(ok=True, table=final_tbl, page=working, rejectCount=reject_count)

    next_rejects = reject_count + 1
    if next_rejects >= max_rejects:
        # Fallback to raster image block snapshot after `maxTableRejects` failures (§12.7)
        fb_tbl = orig_tbl.model_copy(deep=True)
        fb_tbl.needsReview = True
        bx = fb_tbl.bbox
        if bx is not None:
            dpi = int(th.get("figureDpi", 150))
            max_px = int(th.get("figureMaxEdgePx", 1600))
            qual = int(th.get("figureJpegQuality", 82))
            if page_obj is not None:
                fb_tbl.imageFallbackSrc = crop_bbox_jpeg_data_uri(
                    page_obj,
                    bx,
                    dpi=dpi,
                    max_edge_px=max_px,
                    quality=qual,
                )
            elif page_png_path is not None and page_png_path.is_file():
                fb_tbl.imageFallbackSrc = _crop_png_jpeg_data_uri(
                    page_png_path,
                    bx,
                    (working.size.width, working.size.height),
                    max_edge_px=max_px,
                    quality=qual,
                )
        working_fb = page.model_copy(deep=True)
        working_fb.blocks[tbl_idx] = fb_tbl
        return ReconcileResult(
            ok=True,
            table=fb_tbl,
            page=working_fb,
            errors=errors,
            rejectCount=next_rejects,
            fallbackToImage=True,
        )

    return ReconcileResult(
        ok=False,
        errors=errors,
        rejectCount=next_rejects,
        fallbackToImage=False,
    )
