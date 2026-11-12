"""C3 deterministic CSS box & line-wrap height predictor (zero browser needed).

Computes expected wrapped line counts, block heights, total flow page height,
and cell wrap counts directly from a compiled ``vdoc`` page and its slot map.
"""
from __future__ import annotations

import html as html_lib
import re
from typing import Any, Optional

from pydantic import BaseModel, Field

PX_PER_PT = 96.0 / 72.0
_TAG_RE = re.compile(r"<[^>]+>")
_P_SPLIT_RE = re.compile(r"</(?:p|div|li|tr|h[1-6])>|<br\s*/?>", re.I)


def _parse_px(val: Any, *, default_px: float = 0.0, ref_px: float = 0.0) -> float:
    if val is None or val == "":
        return default_px
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().lower()
    try:
        if s.endswith("px"):
            return float(s[:-2].strip())
        if s.endswith("pt"):
            return float(s[:-2].strip()) * PX_PER_PT
        if s.endswith("%") and ref_px > 0.0:
            return (float(s[:-1].strip()) / 100.0) * ref_px
        return float(s)
    except ValueError:
        return default_px


def _parse_padding_px(pad: Optional[str]) -> tuple[float, float, float, float]:
    """Parse CSS padding shorthand into (top, right, bottom, left) px."""
    if not pad:
        return 3.0, 4.0, 3.0, 4.0
    parts = [p for p in str(pad).strip().split() if p]
    vals = [_parse_px(p, default_px=0.0) for p in parts]
    if len(vals) == 1:
        return vals[0], vals[0], vals[0], vals[0]
    if len(vals) == 2:
        return vals[0], vals[1], vals[0], vals[1]
    if len(vals) == 3:
        return vals[0], vals[1], vals[2], vals[1]
    if len(vals) >= 4:
        return vals[0], vals[1], vals[2], vals[3]
    return 3.0, 4.0, 3.0, 4.0


def _html_paragraphs(html_str: str) -> list[str]:
    if not html_str:
        return [""]
    chunks = _P_SPLIT_RE.split(html_str)
    paras = [html_lib.unescape(_TAG_RE.sub("", ch)).replace("\xa0", " ").strip() for ch in chunks]
    non_empty = [p for p in paras if p]
    return non_empty if non_empty else [""]


def _char_advance_em(ch: str) -> float:
    cp = ord(ch)
    if (
        0xAC00 <= cp <= 0xD7A3
        or 0x1100 <= cp <= 0x11FF
        or 0x3130 <= cp <= 0x318F
        or 0x4E00 <= cp <= 0x9FFF
        or 0xFF00 <= cp <= 0xFFEF
        or 0x2460 <= cp <= 0x24FF
    ):
        return 1.0
    if ch in " \t":
        return 0.28
    if ch in "iljtfI1.,;:'\"!|()[]{}`":
        return 0.34
    if ch in "mwMW@%#&":
        return 0.82
    if "A" <= ch <= "Z":
        return 0.68
    return 0.54


def estimate_text_width_px(text: str, font_size_px: float, *, bold: bool = False) -> float:
    scale = 1.04 if bold else 1.0
    return sum(_char_advance_em(ch) for ch in text) * font_size_px * scale


def estimate_wrapped_lines(
    html_str: str,
    inner_width_px: float,
    font_size_px: float,
    *,
    bold: bool = False,
) -> int:
    """Count visual lines produced when ``html_str`` wraps inside ``inner_width_px``."""
    avail = max(8.0, inner_width_px)
    total = 0
    for para in _html_paragraphs(html_str):
        if not para:
            total += 1
            continue
        cur_w = 0.0
        lines_in_para = 1
        # Tokenize by spaces while preserving word breaks and CJK char-level wrapping
        tokens = re.findall(r"\S+\s*", para)
        for tok in tokens:
            tok_w = estimate_text_width_px(tok.rstrip(), font_size_px, bold=bold)
            space_w = estimate_text_width_px(tok[len(tok.rstrip()):], font_size_px, bold=bold)
            if cur_w > 0.0 and cur_w + tok_w > avail + 0.5:
                lines_in_para += 1
                cur_w = tok_w + space_w
            else:
                cur_w += tok_w + space_w
            while cur_w > avail + 0.5 and tok_w > avail:
                lines_in_para += 1
                cur_w -= avail
                tok_w -= avail
        total += lines_in_para
    return max(1, total)


def _line_height_px(lh_raw: Any, font_size_px: float) -> float:
    if lh_raw is None or lh_raw == "":
        return font_size_px * 1.4
    s = str(lh_raw).strip().lower()
    if s.endswith("px"):
        return _parse_px(s, default_px=font_size_px * 1.4)
    if s.endswith("pt"):
        return _parse_px(s, default_px=font_size_px * 1.4)
    try:
        return font_size_px * float(s)
    except ValueError:
        return font_size_px * 1.4


class PredictedCellWrap(BaseModel):
    tableIndex: int = 0
    cellId: str
    slotId: str
    r: int
    c: int
    rs: int = 1
    cs: int = 1
    text: str = ""
    predLines: int
    innerWidthPx: float
    predictedHeightPx: float
    rowHeightPx: Optional[float] = None


class PredictedBlockBox(BaseModel):
    blockId: str
    kind: str
    spaceBeforePx: float = 0.0
    predictedHeightPx: float = 0.0
    fontSizePx: float = 13.3
    lineHeightPx: float = 18.6


class PageLayoutPrediction(BaseModel):
    pageNumber: int
    pageWidthPx: float
    pageHeightPx: float
    contentWidthPx: float
    contentBottomLimitPx: float
    predictedContentEndPx: float
    overflowPx: float
    hasOverflow: bool
    blockGapPx: float
    dominantFontSizePx: float
    dominantLineHeightPx: float
    blocks: list[PredictedBlockBox] = Field(default_factory=list)
    cellWraps: list[PredictedCellWrap] = Field(default_factory=list)
    predictedRowHeightsPx: list[float] = Field(default_factory=list)


def predict_vdoc_page_layout(
    page: dict[str, Any],
    slots: dict[str, Any],
    *,
    overflow_tol_px: float = 2.0,
) -> PageLayoutPrediction:
    """Predict CSS box flow, row heights, and cell wrapping for a compiled vdoc page."""
    rect = page.get("pageRect") or {}
    page_w_px = float(rect.get("width") or 794.0)
    page_h_px = float(rect.get("height") or 1123.0)
    layout = page.get("layout") or {}
    margin = layout.get("margin") or {"top": 48, "right": 56, "bottom": 48, "left": 56}
    m_top = float(margin.get("top", 48))
    m_right = float(margin.get("right", 56))
    m_bot = float(margin.get("bottom", 48))
    m_left = float(margin.get("left", 56))
    content_w = max(40.0, page_w_px - m_left - m_right)
    block_gap = float(layout.get("blockGap", 20.0 if page.get("hideHeaderFooter") else 24.0))
    page_fs_px = _parse_px(layout.get("fontSize"), default_px=13.33)
    page_lh_px = _line_height_px(layout.get("lineHeight"), page_fs_px)

    cur_y = m_top
    flow_started = False
    pred_blocks: list[PredictedBlockBox] = []
    cell_wraps: list[PredictedCellWrap] = []
    row_heights: list[float] = []
    table_idx = 0

    for blk in page.get("blocks") or []:
        bid = str(blk.get("blockId") or "")
        kind = str(blk.get("kind") or "text")
        frame = blk.get("frame")
        if frame:
            # Fixed-positioned blocks do not consume vertical flow space.
            pred_blocks.append(
                PredictedBlockBox(
                    blockId=bid,
                    kind=kind,
                    spaceBeforePx=0.0,
                    predictedHeightPx=float(frame.get("h") or 0.0),
                    fontSizePx=page_fs_px,
                    lineHeightPx=page_lh_px,
                )
            )
            continue

        space_before = float(blk.get("spaceBefore") or 0.0)
        if flow_started:
            cur_y += block_gap
        cur_y += space_before
        flow_started = True

        blk_h = 0.0
        blk_fs = page_fs_px
        blk_lh = page_lh_px

        if kind in {"text", "heading", "form-title"}:
            sid = str(blk.get("slotId") or "")
            slot = slots.get(sid) or {}
            cons = slot.get("constraints") or {}
            blk_fs = _parse_px(cons.get("fontSize"), default_px=page_fs_px)
            blk_lh = _line_height_px(cons.get("lineHeight") or layout.get("lineHeight"), blk_fs)
            bold = str(cons.get("fontWeight") or "") in {"600", "700", "bold"} or kind == "heading"
            n_lines = estimate_wrapped_lines(str(slot.get("content") or ""), content_w, blk_fs, bold=bold)
            blk_h = n_lines * blk_lh
        elif kind == "columns-grid":
            widths_raw = blk.get("widths") or []
            cols = blk.get("columns") or [{"slotId": sid} for sid in (blk.get("slotIds") or [])]
            gap_px = float(blk.get("gap") if blk.get("gap") is not None else 0.0)
            total_gap = gap_px * max(0, len(cols) - 1)
            usable_w = max(20.0, content_w - total_gap)
            fr_vals: list[float] = []
            for wr in widths_raw:
                s_wr = str(wr).strip()
                if s_wr.endswith("fr"):
                    try:
                        fr_vals.append(max(0.1, float(s_wr[:-2])))
                    except ValueError:
                        fr_vals.append(1.0)
                elif s_wr.endswith("%"):
                    fr_vals.append(max(1.0, _parse_px(s_wr, ref_px=100.0)))
                else:
                    fr_vals.append(1.0)
            if len(fr_vals) != len(cols):
                fr_vals = [1.0] * max(1, len(cols))
            fr_sum = max(0.1, sum(fr_vals))
            max_col_h = page_lh_px
            for ci, col in enumerate(cols):
                col_w = usable_w * (fr_vals[ci] / fr_sum)
                if col.get("image"):
                    ih = _parse_px((col["image"] or {}).get("height") or (col["image"] or {}).get("maxHeight"), default_px=40.0)
                    max_col_h = max(max_col_h, ih)
                elif col.get("slotId"):
                    slot = slots.get(str(col["slotId"])) or {}
                    cons = slot.get("constraints") or {}
                    cfs = _parse_px(cons.get("fontSize"), default_px=page_fs_px)
                    clh = _line_height_px(cons.get("lineHeight") or layout.get("lineHeight"), cfs)
                    n_ln = estimate_wrapped_lines(str(slot.get("content") or ""), col_w, cfs)
                    max_col_h = max(max_col_h, n_ln * clh)
            blk_h = max_col_h
        elif kind in {"structured-table", "table"}:
            col_widths_raw = blk.get("columnWidths") or []
            tbl_ratio = float(blk.get("tableWidthRatio") or 1.0)
            tbl_w = max(24.0, content_w * tbl_ratio)
            col_pcts: list[float] = []
            for cw in col_widths_raw:
                col_pcts.append(max(1.0, _parse_px(cw, default_px=10.0, ref_px=100.0)))
            pct_sum = max(1.0, sum(col_pcts))
            col_px = [tbl_w * (p / pct_sum) for p in col_pcts]

            active_rowspans: dict[int, int] = {}
            for r_idx, row in enumerate(blk.get("rows") or []):
                min_row_h = _parse_px(row.get("height"), default_px=0.0)
                needed_row_h = min_row_h
                c_cursor = 0
                row_cells = list(row.get("cells") or [])
                for cell in row_cells:
                    while active_rowspans.get(c_cursor, 0) > 0:
                        c_cursor += 1
                    cs = int(cell.get("colSpan") or 1)
                    rs = int(cell.get("rowSpan") or 1)
                    for k in range(cs):
                        if rs > 1:
                            active_rowspans[c_cursor + k] = rs
                    if c_cursor + cs <= len(col_px):
                        cell_w = sum(col_px[c_cursor : c_cursor + cs])
                    elif col_px:
                        cell_w = col_px[min(c_cursor, len(col_px) - 1)]
                    else:
                        cell_w = tbl_w
                    pt, pr, pb, pl = _parse_padding_px(cell.get("padding") or blk.get("cellPadding"))
                    inner_w = max(6.0, cell_w - pl - pr)
                    sid = str(cell.get("slotId") or "")
                    slot = slots.get(sid) or {}
                    cons = slot.get("constraints") or {}
                    cfs = _parse_px(cell.get("fontSize") or cons.get("fontSize"), default_px=page_fs_px)
                    clh = _line_height_px(cell.get("lineHeight") or cons.get("lineHeight"), cfs)
                    cbold = str(cell.get("fontWeight") or cons.get("fontWeight") or "") in {"600", "700", "bold"}
                    n_ln = estimate_wrapped_lines(str(slot.get("content") or ""), inner_w, cfs, bold=cbold)
                    c_txt = " ".join(_html_paragraphs(str(slot.get("content") or ""))).strip()
                    c_h = n_ln * clh + pt + pb
                    if rs == 1:
                        needed_row_h = max(needed_row_h, c_h)
                    cell_wraps.append(
                        PredictedCellWrap(
                            tableIndex=table_idx,
                            cellId=str(cell.get("cellId") or f"r{r_idx}c{c_cursor}"),
                            slotId=sid,
                            r=r_idx,
                            c=c_cursor,
                            rs=rs,
                            cs=cs,
                            text=c_txt[:80],
                            predLines=n_ln,
                            innerWidthPx=round(inner_w, 1),
                            predictedHeightPx=round(c_h, 1),
                            rowHeightPx=round(min_row_h, 1) if min_row_h > 0 else None,
                        )
                    )
                    c_cursor += cs
                for k in list(active_rowspans):
                    active_rowspans[k] -= 1
                    if active_rowspans[k] <= 0:
                        del active_rowspans[k]
                row_heights.append(round(needed_row_h, 1))
                blk_h += needed_row_h
            table_idx += 1
        elif kind == "image":
            blk_h = _parse_px(blk.get("height") or blk.get("maxHeight"), default_px=120.0)
        else:
            blk_h = page_lh_px

        cur_y += blk_h
        pred_blocks.append(
            PredictedBlockBox(
                blockId=bid,
                kind=kind,
                spaceBeforePx=round(space_before, 1),
                predictedHeightPx=round(blk_h, 1),
                fontSizePx=round(blk_fs, 2),
                lineHeightPx=round(blk_lh, 2),
            )
        )

    bottom_limit = page_h_px - m_bot
    overflow = max(0.0, cur_y - page_h_px)
    return PageLayoutPrediction(
        pageNumber=int(page.get("pageNumber") or 1),
        pageWidthPx=round(page_w_px, 1),
        pageHeightPx=round(page_h_px, 1),
        contentWidthPx=round(content_w, 1),
        contentBottomLimitPx=round(bottom_limit, 1),
        predictedContentEndPx=round(cur_y, 1),
        overflowPx=round(overflow, 1),
        hasOverflow=overflow > overflow_tol_px,
        blockGapPx=round(block_gap, 1),
        dominantFontSizePx=round(page_fs_px, 2),
        dominantLineHeightPx=round(page_lh_px, 2),
        blocks=pred_blocks,
        cellWraps=cell_wraps,
        predictedRowHeightsPx=row_heights,
    )

