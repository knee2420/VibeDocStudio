"""Column-aware visual line reflow into structural blocks (headings, lists, paragraphs, captions, notes)."""
from __future__ import annotations

from statistics import median
import re
from typing import Any, Literal, Optional, Union

from ..config import load_registry, load_thresholds
from ..ir.model import (
    BBox,
    CaptionBlock,
    FieldBlock,
    FigureBlock,
    HeadingBlock,
    LineGroupBlock,
    LineGroupSegment,
    ListItemBlock,
    NoteBlock,
    ParagraphBlock,
    Ruling,
    TableIR,
    Word,
)
from .fields import detect_field_blocks
from .markers import (
    PatternMatcher,
    VisualLine,
    group_words_into_lines,
    spans_from_words,
)
from .text_join import join_lines_smart, join_words_smart

TextOrFieldBlock = Union[HeadingBlock, ParagraphBlock, ListItemBlock, CaptionBlock, NoteBlock, FieldBlock, LineGroupBlock]


_LG_INLINE_OPEN_RE = re.compile(r"[\(\[]\s*$")
_LG_INLINE_CLOSE_RE = re.compile(r"^\s*[\)\]]")


def _build_line_group_block(
    seg_lines: list[VisualLine],
    *,
    block_id: str,
    layout_mode: Literal["columns", "toc"],
    page_width: float,
    body_size: float,
) -> LineGroupBlock:
    seg_lines = sorted(seg_lines, key=lambda s: s.bbox[0])
    total_x0 = min(s.bbox[0] for s in seg_lines)
    total_x1 = max(s.bbox[2] for s in seg_lines)
    total_span = max(page_width * 0.6, total_x1 - total_x0, 40.0)
    segments: list[LineGroupSegment] = []
    all_wids: list[str] = []

    for idx, sl in enumerate(seg_lines):
        next_x0 = seg_lines[idx + 1].bbox[0] if idx + 1 < len(seg_lines) else max(total_x1, sl.bbox[2])
        slot_w = (next_x0 - sl.bbox[0]) if idx + 1 < len(seg_lines) else (sl.bbox[2] - sl.bbox[0])
        if idx == len(seg_lines) - 1 and sl.bbox[0] > total_x0 + total_span * 0.45:
            ratio = max(0.12, min(0.85, (total_x1 - sl.bbox[0]) / total_span))
        else:
            ratio = max(0.12, min(0.85, slot_w / total_span))

        seg_align: Literal["left", "center", "right"] = "left"
        if idx == len(seg_lines) - 1 and (sl.bbox[2] >= page_width * 0.72 or layout_mode == "toc"):
            seg_align = "right"
        elif idx > 0 and idx == len(seg_lines) - 1 and sl.bbox[0] > total_x0 + total_span * 0.6:
            seg_align = "right"

        words = list(sl.words)
        wids = [w.id for w in words]
        all_wids.extend(wids)
        sizes = [float(w.size) for w in words if w.size is not None and float(w.size) > 0]
        f_sz = round(float(median(sizes)), 1) if sizes else round(float(sl.font_size or body_size), 1)
        fonts = [str(w.font).strip() for w in words if w.font]
        colors = [str(w.color).strip() for w in words if w.color]
        segments.append(
            LineGroupSegment(
                id=f"{block_id}_s{idx}",
                bbox=sl.bbox,
                wordIds=wids,
                text=sl.text,
                align=seg_align,
                widthRatio=round(ratio, 3),
                fontSizePt=f_sz,
                fontFamily=fonts[0] if fonts else None,
                bold=sl.bold,
                color=colors[0] if colors else None,
                spans=list(sl.spans),
            )
        )

    norm_sum = sum(s.widthRatio for s in segments) or 1.0
    for s in segments:
        s.widthRatio = round(max(0.08, s.widthRatio / norm_sum), 3)

    return LineGroupBlock(
        id=block_id,
        bbox=_union_bboxes([s.bbox for s in seg_lines]),
        wordIds=all_wids,
        text="   ".join(s.text for s in segments),
        segments=segments,
        layoutMode=layout_mode,
        lineHeight=1.25,
    )


def _extract_line_groups(
    lines: list[VisualLine],
    *,
    page_width: float,
    body_size: float,
    registry: dict[str, Any],
    matcher: Optional[PatternMatcher] = None,
    toc_only: bool = False,
    id_prefix: str = "lg",
) -> tuple[list[LineGroupBlock], set[int]]:
    """Detect TOC dot-leader lines and same-baseline multi-column line groups."""
    if not lines:
        return [], set()

    lg_cfg = registry.get("lineGroup") or {}
    same_tol = float(lg_cfg.get("sameBaselineTolPt", 2.5))
    min_gap_ratio = float(lg_cfg.get("minGapRatio", 2.2))

    toc_cfg = registry.get("tocLeader") or {}
    leader_re = re.compile(str(toc_cfg.get("leaderPattern") or r"(?:\.{3,}|…{2,}|-{4,}|_{4,}|·{3,})"))
    page_num_re = re.compile(str(toc_cfg.get("pageNumPattern") or r"(?:^|\s)(?:\d{1,4}|-\s*\d+\s*-)\s*$"))

    # Group line indices into baseline bands preserving original indices
    indexed = sorted(enumerate(lines), key=lambda pair: (pair[1].baseline, pair[1].bbox[0]))
    clusters: list[list[tuple[int, VisualLine]]] = []
    anchors: list[float] = []
    for idx, ln in indexed:
        if not clusters or abs(ln.baseline - anchors[-1]) > same_tol:
            clusters.append([(idx, ln)])
            anchors.append(ln.baseline)
        else:
            clusters[-1].append((idx, ln))
            anchors[-1] = sum(item[1].baseline for item in clusters[-1]) / len(clusters[-1])

    paired_indices: set[int] = {
        idx
        for cl in clusters
        if len(cl) >= 2
        for idx, _ in cl
    }

    cand_rows: list[tuple[list[int], list[VisualLine], Literal["columns", "toc"], bool]] = []
    for cl in clusters:
        cl.sort(key=lambda item: item[1].bbox[0])
        if len(cl) == 1:
            raw_idx, ln = cl[0]
            # Check if a single fused TOC VisualLine contains dot leaders + page number
            if leader_re.search(ln.text) and page_num_re.search(ln.text) and len(ln.words) >= 2:
                last_w = ln.words[-1]
                if page_num_re.search(last_w.text) and last_w.bbox is not None:
                    left_words = ln.words[:-1]
                    lx0 = min(w.bbox[0] for w in left_words if w.bbox)
                    ly0 = min(w.bbox[1] for w in left_words if w.bbox)
                    lx1 = max(w.bbox[2] for w in left_words if w.bbox)
                    ly1 = max(w.bbox[3] for w in left_words if w.bbox)
                    left_vl = VisualLine(
                        words=left_words,
                        bbox=(round(lx0, 2), round(ly0, 2), round(lx1, 2), round(ly1, 2)),
                        text=join_words_smart(left_words),
                        baseline=ln.baseline,
                        font_size=ln.font_size,
                        bold=ln.bold,
                        spans=spans_from_words(left_words, default_size=ln.font_size),
                    )
                    right_vl = VisualLine(
                        words=[last_w],
                        bbox=last_w.bbox,
                        text=last_w.text.strip(),
                        baseline=ln.baseline,
                        font_size=ln.font_size,
                        bold=ln.bold,
                        spans=spans_from_words([last_w], default_size=ln.font_size),
                    )
                    cand_rows.append(([raw_idx], [left_vl, right_vl], "toc", False))
            continue

        segs = [item[1] for item in cl]
        indices = [item[0] for item in cl]
        x0 = min(s.bbox[0] for s in segs)
        x1 = max(s.bbox[2] for s in segs)
        full_text = "   ".join(s.text for s in segs)
        is_toc = bool(leader_re.search(full_text) and page_num_re.search(full_text))
        if toc_only and not is_toc:
            continue

        med_fs = max(8.0, float(median([s.font_size for s in segs])))
        min_gap = max(24.0, med_fs * min_gap_ratio)

        if not is_toc:
            if any(
                (_LG_INLINE_OPEN_RE.search(a.text) and _LG_INLINE_CLOSE_RE.search(b.text))
                or (b.bbox[0] - a.bbox[2]) < min_gap
                for a, b in zip(segs, segs[1:])
            ):
                continue
            if len(segs) <= 3 and (x1 - x0) < 150.0 and all(len(s.text.strip()) == 1 for s in segs):
                continue
            # Do not steal a single aligned row out of a 2-column vertical list or vertical continuation block
            if matcher is not None and any(matcher.match_list_marker(s.text) is not None for s in segs):
                continue
            has_col_cont = any(
                other_idx not in paired_indices
                and other_idx not in indices
                and 0.5 < (other_ln.baseline - s.baseline) <= max(28.0, body_size * 2.6)
                and other_ln.bbox[0] <= s.bbox[2] + 20.0
                and other_ln.bbox[2] >= s.bbox[0] - 12.0
                and (other_ln.bbox[2] - other_ln.bbox[0]) < page_width * 0.45
                for s in segs
                for other_idx, other_ln in enumerate(lines)
            )
            if has_col_cont:
                continue

        # Heuristic to distinguish 2-col wrapped continuous prose from structured kv/meta/TOC pairs
        has_structured_cue = (
            is_toc
            or any(":" in s.text or "：" in s.text or "|" in s.text for s in segs)
            or all((s.bbox[2] - s.bbox[0]) < page_width * 0.36 for s in segs)
        )
        cand_rows.append((indices, segs, "toc" if is_toc else "columns", not has_structured_cue))

    # Drop long runs (>= 4 consecutive rows) of unstructured prose-like 2-column bands
    out_blocks: list[LineGroupBlock] = []
    consumed: set[int] = set()
    i = 0
    while i < len(cand_rows):
        j = i
        if cand_rows[i][3]:
            while (
                j < len(cand_rows)
                and cand_rows[j][3]
                and (j == i or abs(cand_rows[j][1][0].baseline - cand_rows[j - 1][1][0].baseline) <= body_size * 2.8)
            ):
                j += 1
            if (j - i) >= 4:
                i = j
                continue
        idxs, seg_list, mode, _ = cand_rows[i]
        out_blocks.append(
            _build_line_group_block(
                seg_list,
                block_id=f"{id_prefix}{len(out_blocks)}",
                layout_mode=mode,
                page_width=page_width,
                body_size=body_size,
            )
        )
        consumed.update(idxs)
        i += 1
    return out_blocks, consumed


def _block_geometry_meta(lines: list[VisualLine], fallback_size: float) -> dict[str, Any]:
    """Compute fontSizePt, fontFamily, lineCount, linePitchPt, and lineHeight from VisualLines."""
    words = [w for ln in lines for w in ln.words]
    sizes = [float(w.size) for w in words if w.size is not None and float(w.size) > 0]
    font_sz = round(float(median(sizes)), 1) if sizes else round(float(fallback_size), 1)
    fonts = [str(w.font).strip() for w in words if w.font]
    font_fam = fonts[0] if fonts else None
    pitches = [
        b.baseline - a.baseline
        for a, b in zip(lines, lines[1:])
        if b.baseline > a.baseline and (b.baseline - a.baseline) <= max(30.0, font_sz * 2.8)
    ]
    pitch = round(float(median(pitches)), 2) if pitches else None
    lh = round(pitch / max(6.0, font_sz), 2) if pitch is not None else None
    if lh is not None and not (0.95 <= lh <= 2.4):
        lh = None
    return {
        "lineCount": len(lines),
        "linePitchPt": pitch,
        "lineHeight": lh,
        "fontSizePt": font_sz,
        "fontFamily": font_fam,
    }


def _union_bboxes(boxes: list[BBox]) -> BBox:
    return (
        round(min(b[0] for b in boxes), 2),
        round(min(b[1] for b in boxes), 2),
        round(max(b[2] for b in boxes), 2),
        round(max(b[3] for b in boxes), 2),
    )


def _detect_vertical_bands(
    lines: list[VisualLine],
    full_width_obstacles: list[BBox],
) -> list[list[VisualLine]]:
    """Split lines into horizontal page bands separated by full-width obstacles (tables/wide headings)."""
    if not lines:
        return []
    cuts = sorted(set([0.0] + [b[1] for b in full_width_obstacles] + [b[3] for b in full_width_obstacles]))
    bands: list[list[VisualLine]] = [[] for _ in cuts]
    for ln in lines:
        cy = (ln.bbox[1] + ln.bbox[3]) * 0.5
        b_idx = 0
        for idx in range(len(cuts) - 1, -1, -1):
            if cy >= cuts[idx] - 1.0:
                b_idx = idx
                break
        bands[b_idx].append(ln)
    return [b for b in bands if b]


def _split_band_into_columns(
    band_lines: list[VisualLine],
    *,
    page_width: float,
    min_gutter_pt: float = 14.0,
) -> list[list[VisualLine]]:
    """Split a horizontal band into left-to-right columns when an empty vertical gutter spans it."""
    if len(band_lines) < 4:
        return [band_lines]
    x_min = min(ln.bbox[0] for ln in band_lines)
    x_max = max(ln.bbox[2] for ln in band_lines)
    span = x_max - x_min
    if span < page_width * 0.50:
        return [band_lines]

    bins = max(40, int(round(span)))
    occ = [0] * bins
    for ln in band_lines:
        # Lines bridging > 65% of band span block multi-column splitting in this band
        if (ln.bbox[2] - ln.bbox[0]) >= span * 0.65:
            return [band_lines]
        b0 = max(0, min(bins - 1, int((ln.bbox[0] - x_min) / span * bins)))
        b1 = max(b0, min(bins - 1, int((ln.bbox[2] - x_min) / span * bins)))
        for bi in range(b0, b1 + 1):
            occ[bi] += 1

    # Look for central gutter (within middle 20%..80% of span)
    lo = int(bins * 0.20)
    hi = int(bins * 0.80)
    best_run: Optional[tuple[int, int]] = None
    run_start: Optional[int] = None
    for i in range(lo, hi):
        if occ[i] == 0:
            if run_start is None:
                run_start = i
        elif run_start is not None:
            if best_run is None or (i - run_start) > (best_run[1] - best_run[0]):
                best_run = (run_start, i)
            run_start = None
    if run_start is not None:
        if best_run is None or (hi - run_start) > (best_run[1] - best_run[0]):
            best_run = (run_start, hi)

    if best_run is None:
        return [band_lines]
    gutter_width = (best_run[1] - best_run[0]) / bins * span
    if gutter_width < min_gutter_pt:
        return [band_lines]

    split_x = x_min + ((best_run[0] + best_run[1]) * 0.5 / bins) * span
    left = [ln for ln in band_lines if (ln.bbox[0] + ln.bbox[2]) * 0.5 < split_x]
    right = [ln for ln in band_lines if (ln.bbox[0] + ln.bbox[2]) * 0.5 >= split_x]
    if len(left) < 2 or len(right) < 2:
        return [band_lines]
    return [sorted(left, key=lambda ln: (ln.bbox[1], ln.bbox[0])), sorted(right, key=lambda ln: (ln.bbox[1], ln.bbox[0]))]


def _infer_align(bbox: BBox, col_x0: float, col_x1: float) -> Literal["left", "center", "right"]:
    col_w = max(20.0, col_x1 - col_x0)
    left_gap = max(0.0, bbox[0] - col_x0)
    right_gap = max(0.0, col_x1 - bbox[2])
    line_w = max(0.0, bbox[2] - bbox[0])
    if (
        left_gap > 14.0
        and right_gap > 14.0
        and line_w <= col_w * 0.78
        and abs(left_gap - right_gap) <= max(10.0, col_w * 0.10)
    ):
        return "center"
    if right_gap <= max(16.0, col_w * 0.06) and left_gap > col_w * 0.45:
        return "right"
    return "left"


def _link_captions(
    blocks: list[TextOrFieldBlock],
    tables: list[TableIR],
    figures: list[FigureBlock],
) -> None:
    targets: list[Any] = list(tables) + list(figures)
    if not targets:
        return
    for blk in blocks:
        if not isinstance(blk, CaptionBlock) or blk.bbox is None:
            continue
        best_tgt: Optional[Any] = None
        best_dist = 32.0
        for tgt in targets:
            if tgt.bbox is None:
                continue
            ov_x = max(0.0, min(blk.bbox[2], tgt.bbox[2]) - max(blk.bbox[0], tgt.bbox[0]))
            min_w = max(1.0, min(blk.bbox[2] - blk.bbox[0], tgt.bbox[2] - tgt.bbox[0]))
            if ov_x / min_w < 0.2:
                continue
            dy = min(abs(blk.bbox[3] - tgt.bbox[1]), abs(tgt.bbox[3] - blk.bbox[1]))
            if dy < best_dist:
                best_dist = dy
                best_tgt = tgt
        if best_tgt is not None:
            blk.targetBlockId = best_tgt.id
            if isinstance(best_tgt, FigureBlock) and best_tgt.captionBlockId is None:
                best_tgt.captionBlockId = blk.id


def _is_block_opener(
    matcher: PatternMatcher,
    nxt: VisualLine,
    *,
    body_size: float,
    page_width: float,
    page_height: float,
    page_margins_x: tuple[float, float],
) -> bool:
    return (
        matcher.match_note(nxt, page_height=page_height, body_size=body_size) is not None
        or matcher.match_caption(nxt.text)
        or matcher.match_heading_level(
            nxt,
            body_size=body_size,
            page_width=page_width,
            page_margins_x=page_margins_x,
        )
        is not None
        or matcher.match_list_marker(nxt.text) is not None
        or matcher.is_article_boundary(nxt.text)
    )


def reflow_non_table_blocks(
    words: list[Word],
    rulings: list[Ruling],
    *,
    tables: list[TableIR],
    figures: list[FigureBlock],
    page_width: float,
    page_height: float,
    thresholds: Optional[dict[str, Any]] = None,
    registry: Optional[dict[str, Any]] = None,
) -> list[TextOrFieldBlock]:
    """Group non-table/non-figure words into headings, lists, fields, notes, captions, and paragraphs."""
    th = thresholds or load_thresholds()
    reg = registry or load_registry()
    if not words:
        return []

    lines = group_words_into_lines(words)
    if not lines:
        return []

    sizes = [ln.font_size for ln in lines if ln.font_size > 0]
    body_size = round(median(sizes), 1) if sizes else 10.0

    table_boxes = [t.bbox for t in tables if t.bbox is not None]
    obstacle_boxes = [
        b
        for b in table_boxes + [f.bbox for f in figures if f.bbox is not None]
        if (b[2] - b[0]) >= page_width * 0.45
    ]

    # First extract TOC dot-leader rows before field detection (so dot leaders aren't captured as underline fields),
    # then extract standalone form fields, then same-baseline multi-column line groups.
    toc_blocks, toc_consumed = _extract_line_groups(
        lines,
        page_width=page_width,
        body_size=body_size,
        registry=reg,
        toc_only=True,
        id_prefix="lgtoc",
    )
    lines_after_toc = [ln for idx, ln in enumerate(lines) if idx not in toc_consumed]

    fields, consumed_indices, _ = detect_field_blocks(
        lines_after_toc,
        rulings,
        table_boxes=table_boxes,
        body_size=body_size,
        registry=reg,
    )
    remaining_lines = [ln for idx, ln in enumerate(lines_after_toc) if idx not in consumed_indices]
    matcher = PatternMatcher(registry=reg, thresholds=th)
    lg_blocks, lg_consumed = _extract_line_groups(
        remaining_lines,
        page_width=page_width,
        body_size=body_size,
        registry=reg,
        matcher=matcher,
        id_prefix="lg",
    )
    if lg_consumed:
        remaining_lines = [ln for idx, ln in enumerate(remaining_lines) if idx not in lg_consumed]

    merge_gap_ratio = float(th.get("paragraphMergeGapRatio", 1.85))
    hanging_min = float(th.get("hangingIndentMinPt", 4.0))

    text_blocks: list[TextOrFieldBlock] = list(toc_blocks) + list(lg_blocks)
    if not remaining_lines:
        combined: list[TextOrFieldBlock] = list(fields) + text_blocks
        _link_captions(combined, tables, figures)
        return combined

    col_x0_global = min([ln.bbox[0] for ln in remaining_lines] + [b[0] for b in table_boxes])
    col_x1_global = max([ln.bbox[2] for ln in remaining_lines] + [b[2] for b in table_boxes])

    # Estimate typical baseline-to-baseline line height from consecutive non-gap lines
    line_gaps = [
        remaining_lines[i + 1].bbox[1] - remaining_lines[i].bbox[3]
        for i in range(len(remaining_lines) - 1)
        if 0.0 <= (remaining_lines[i + 1].bbox[1] - remaining_lines[i].bbox[3]) <= body_size * 1.5
    ]
    normal_gap = median(line_gaps) if line_gaps else body_size * 0.35
    max_merge_gap = max(body_size * 0.7, normal_gap * merge_gap_ratio)

    seq = 0

    for band in _detect_vertical_bands(remaining_lines, obstacle_boxes):
        band_cols = _split_band_into_columns(band, page_width=page_width)
        multi_col = len(band_cols) > 1
        for col_lines in band_cols:
            col_x0 = min(ln.bbox[0] for ln in col_lines)
            col_x1 = max(ln.bbox[2] for ln in col_lines)
            frame_x0, frame_x1 = (col_x0, col_x1) if multi_col else (col_x0_global, col_x1_global)
            col_w = max(40.0, frame_x1 - frame_x0)

            i = 0
            while i < len(col_lines):
                ln = col_lines[i]
                ln_align = _infer_align(ln.bbox, frame_x0, frame_x1)
                note_kind = matcher.match_note(ln, page_height=page_height, body_size=body_size)
                if note_kind is not None:
                    note_lines = [ln]
                    j = i + 1
                    if note_kind not in ("header", "footer"):
                        while j < len(col_lines):
                            nxt = col_lines[j]
                            v_gap = nxt.bbox[1] - note_lines[-1].bbox[3]
                            if v_gap > max_merge_gap or v_gap < -2.0:
                                break
                            if _infer_align(nxt.bbox, frame_x0, frame_x1) != ln_align:
                                break
                            if _is_block_opener(
                                matcher,
                                nxt,
                                body_size=body_size,
                                page_width=page_width,
                                page_height=page_height,
                                page_margins_x=(col_x0_global, col_x1_global),
                            ):
                                break
                            if nxt.bbox[0] < ln.bbox[0] - 4.0:
                                break
                            note_lines.append(nxt)
                            j += 1
                    note_words = [w for it in note_lines for w in it.words]
                    note_meta = _block_geometry_meta(note_lines, body_size)
                    text_blocks.append(
                        NoteBlock(
                            id=f"nt{seq}",
                            bbox=_union_bboxes([it.bbox for it in note_lines]),
                            wordIds=[w.id for w in note_words],
                            text=join_lines_smart(note_lines, newline=False),
                            align=ln_align,
                            spans=spans_from_words(note_words, default_size=body_size),
                            noteKind=note_kind,
                            **note_meta,
                        )
                    )
                    seq += 1
                    i = j
                    continue

                if matcher.match_caption(ln.text):
                    cap_meta = _block_geometry_meta([ln], body_size)
                    text_blocks.append(
                        CaptionBlock(
                            id=f"cap{seq}",
                            bbox=ln.bbox,
                            wordIds=[w.id for w in ln.words],
                            text=ln.text,
                            align=ln_align,
                            spans=ln.spans,
                            **cap_meta,
                        )
                    )
                    seq += 1
                    i += 1
                    continue

                h_level = matcher.match_heading_level(
                    ln,
                    body_size=body_size,
                    page_width=page_width,
                    page_margins_x=(col_x0_global, col_x1_global),
                )
                if h_level is not None:
                    hd_meta = _block_geometry_meta([ln], body_size)
                    text_blocks.append(
                        HeadingBlock(
                            id=f"hd{seq}",
                            level=h_level,
                            bbox=ln.bbox,
                            wordIds=[w.id for w in ln.words],
                            text=ln.text,
                            align=ln_align,
                            spans=ln.spans,
                            **hd_meta,
                        )
                    )
                    seq += 1
                    i += 1
                    continue

                lm = matcher.match_list_marker(ln.text)
                if lm is not None:
                    marker, m_kind = lm
                    marker_x0 = ln.bbox[0]
                    # Hanging indent of continuation lines relative to marker start
                    second_word_x0 = ln.words[1].bbox[0] if len(ln.words) > 1 and ln.words[1].bbox else ln.bbox[0] + 10.0
                    item_lines = [ln]
                    j = i + 1
                    while j < len(col_lines):
                        nxt = col_lines[j]
                        v_gap = nxt.bbox[1] - item_lines[-1].bbox[3]
                        if v_gap > max_merge_gap or v_gap < -2.0:
                            break
                        if _infer_align(nxt.bbox, frame_x0, frame_x1) != ln_align:
                            break
                        if _is_block_opener(
                            matcher,
                            nxt,
                            body_size=body_size,
                            page_width=page_width,
                            page_height=page_height,
                            page_margins_x=(col_x0_global, col_x1_global),
                        ):
                            break
                        # Continuation of list item should stay aligned >= marker_x0 - 3pt or indented
                        if nxt.bbox[0] < marker_x0 - 4.0:
                            break
                        item_lines.append(nxt)
                        j += 1

                    all_words = [w for it in item_lines for w in it.words]
                    li_meta = _block_geometry_meta(item_lines, body_size)
                    hang = max(0.0, round(second_word_x0 - marker_x0, 2)) if len(item_lines) > 1 and second_word_x0 - marker_x0 >= hanging_min else 0.0
                    indent_lvl = max(0, int(round(max(0.0, marker_x0 - frame_x0) / 14.0)))
                    text_blocks.append(
                        ListItemBlock(
                            id=f"li{seq}",
                            marker=marker,
                            markerKind=m_kind,  # type: ignore[arg-type]
                            indentLevel=indent_lvl,
                            hangingIndentPt=hang,
                            bbox=_union_bboxes([it.bbox for it in item_lines]),
                            wordIds=[w.id for w in all_words],
                            text=join_lines_smart(item_lines, newline=False),
                            align="left",
                            spans=spans_from_words(all_words, default_size=body_size),
                            **li_meta,
                        )
                    )
                    seq += 1
                    i = j
                    continue

                # Default: merge consecutive prose lines into one ParagraphBlock
                para_lines = [ln]
                j = i + 1
                while j < len(col_lines):
                    nxt = col_lines[j]
                    prev = para_lines[-1]
                    v_gap = nxt.bbox[1] - prev.bbox[3]
                    if v_gap > max_merge_gap or v_gap < -2.0:
                        break
                    if _infer_align(nxt.bbox, frame_x0, frame_x1) != ln_align:
                        break
                    if _is_block_opener(
                        matcher,
                        nxt,
                        body_size=body_size,
                        page_width=page_width,
                        page_height=page_height,
                        page_margins_x=(col_x0_global, col_x1_global),
                    ):
                        break
                    prev_w_ratio = (prev.bbox[2] - frame_x0) / col_w
                    nxt_indent = nxt.bbox[0] - frame_x0
                    if prev_w_ratio < 0.62 and (v_gap > normal_gap * 1.35 or nxt_indent >= hanging_min * 2.0):
                        break
                    if nxt_indent >= hanging_min * 2.5 and abs(prev.bbox[0] - frame_x0) <= 4.0 and prev_w_ratio < 0.85:
                        break
                    para_lines.append(nxt)
                    j += 1

                all_words = [w for it in para_lines for w in it.words]
                pb_bbox = _union_bboxes([it.bbox for it in para_lines])
                pb_meta = _block_geometry_meta(para_lines, body_size)
                text_blocks.append(
                    ParagraphBlock(
                        id=f"p{seq}",
                        bbox=pb_bbox,
                        wordIds=[w.id for w in all_words],
                        text=join_lines_smart(para_lines, newline=False),
                        align=ln_align,
                        spans=spans_from_words(all_words, default_size=body_size),
                        **pb_meta,
                    )
                )
                seq += 1
                i = j

    combined: list[TextOrFieldBlock] = list(fields) + text_blocks
    _link_captions(combined, tables, figures)
    return combined
