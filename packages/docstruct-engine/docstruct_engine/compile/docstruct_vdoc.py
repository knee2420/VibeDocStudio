"""Unified DocIR -> .vdoc compiler (shared by HWPX, PDF, and scan/image sources)."""
from __future__ import annotations

import html as html_lib
import logging
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any, Callable, Optional, Union

from docstruct_engine import build_doc_ir
from docstruct_engine.acquire.ocr import WindowsOcrAdapter
from docstruct_engine.cache import doc_cache_dir, file_src_hash
from docstruct_engine.ir.model import (
    BorderEdge,
    CaptionBlock,
    CellIR,
    DocIR,
    FieldBlock,
    FigureBlock,
    HeadingBlock,
    ListItemBlock,
    NoteBlock,
    PageIR,
    ParagraphBlock,
    Span,
    TableIR,
    Word,
)
from docstruct_engine.blocks.text_join import join_words_smart, should_join_words_without_space

from .. import _packs as packs
from . import vdoc_build

PX_PER_PT = 96.0 / 72.0
BLOCK_GAP = 4
logger = logging.getLogger("docstruct_engine.compile.docstruct_vdoc")


@dataclass
class CompiledPageReport:
    source: int
    paragraphs: int = 0
    tables: int = 0
    fill_cells: int = 0
    pictures: int = 0
    headers_isolated: int = 0
    cell_paragraphs_merged: int = 0


def _labels() -> dict[str, str]:
    data = packs.data("resource:index/lexicon.ko.json")
    return dict(data.get("docText") or {})


def _font_stack(family: str) -> str:
    clean = (family or "").strip().strip("'\"")
    if not clean:
        return "'Malgun Gothic', sans-serif"
    return f"'{clean}', 'Malgun Gothic', sans-serif"


def _pt_px_round1(pt: float) -> str:
    val = round(float(pt) * PX_PER_PT, 1)
    return f"{int(val)}px" if val == int(val) else f"{val}px"


def _fmt_px(pt: float) -> str:
    val = round(float(pt) * PX_PER_PT, 1)
    return f"{int(val)}" if val == int(val) else f"{val}"


def _fmt_line_height(lh: float) -> str:
    return f"{float(lh):.2g}"


def _clip_title(text: str, limit: int = 32) -> str:
    return (text or "").strip()[:limit]


def _render_hwpx_runs_html(
    runs: list[dict[str, Any]],
    *,
    base_size_pt: float = 10.0,
    base_bold: bool = False,
    base_color: str = "#000000",
) -> str:
    parts: list[str] = []
    for run in runs:
        raw = str(run.get("text") or "")
        if not raw:
            continue
        inner = "<br>".join(html_lib.escape(seg) for seg in raw.split("\n"))
        styles: list[str] = []
        size_pt = float(run.get("sizePt") if run.get("sizePt") is not None else 10.0)
        color = str(run.get("color") or "#000000")
        if abs(size_pt - base_size_pt) >= 0.5:
            styles.append(f"font-size: {round(size_pt * PX_PER_PT)}px")
        if color and color != base_color:
            styles.append(f"color: {color}")
        if styles:
            inner = f'<span style="{"; ".join(styles)}">{inner}</span>'
        if run.get("underline"):
            inner = f"<u>{inner}</u>"
        if run.get("italic"):
            inner = f"<em>{inner}</em>"
        if bool(run.get("bold")) != base_bold:
            inner = f"<strong>{inner}</strong>"
        parts.append(inner)
    return "".join(parts)


def _render_paragraphs_html(
    paragraphs: list[dict[str, Any]],
    *,
    base_size_pt: float = 10.0,
    base_bold: bool = False,
    base_color: str = "#000000",
) -> str:
    out: list[str] = []
    for para in paragraphs:
        runs = para.get("runs") or []
        inner = _render_hwpx_runs_html(
            runs,
            base_size_pt=base_size_pt,
            base_bold=base_bold,
            base_color=base_color,
        )
        out.append(f"<p>{inner}</p>")
    return "".join(out) or "<p></p>"


def _nested_table_html(
    table: TableIR,
    words_by_id: dict[str, Word],
    *,
    base_size_pt: float,
    base_bold: bool,
    base_color: str,
) -> str:
    chunks: list[str] = []
    for cell in sorted(table.cells, key=lambda c: (c.r, c.c)):
        c_paras = [p for p in (cell.paragraphs or []) if p.get("kind") == "para"]
        if c_paras:
            chunks.append(
                _render_paragraphs_html(
                    c_paras,
                    base_size_pt=base_size_pt,
                    base_bold=base_bold,
                    base_color=base_color,
                )
            )
        elif cell.text:
            chunks.append(f"<p>{html_lib.escape(cell.text)}</p>")
        for nt in cell.nested:
            chunks.append(
                _nested_table_html(
                    nt,
                    words_by_id,
                    base_size_pt=base_size_pt,
                    base_bold=base_bold,
                    base_color=base_color,
                )
            )
    return "".join(chunks)


def _spans_to_inline_html(
    block_text: str,
    spans: list[Span],
    words_by_id: dict[str, Word],
) -> str:
    if not spans:
        return "<br>".join(html_lib.escape(seg) for seg in (block_text or "").splitlines()) or ""
    rendered: list[tuple[Span, str]] = []
    for sp in spans:
        txt = sp.text
        if txt is None:
            sp_words = [words_by_id[w] for w in sp.wordIds if w in words_by_id]
            txt = join_words_smart(sp_words)
        if not txt:
            continue
        inner = "<br>".join(html_lib.escape(seg) for seg in txt.split("\n"))
        styles: list[str] = []
        if sp.size and abs(sp.size - 10.0) >= 0.5:
            styles.append(f"font-size: {round(sp.size * PX_PER_PT)}px")
        if sp.color and sp.color.upper() != "#000000":
            styles.append(f"color: {sp.color}")
        if sp.bg:
            styles.append(f"background-color: {sp.bg}")
        if styles:
            inner = f'<span style="{"; ".join(styles)}">{inner}</span>'
        if sp.underline:
            inner = f"<u>{inner}</u>"
        if sp.italic:
            inner = f"<em>{inner}</em>"
        if sp.bold:
            inner = f"<strong>{inner}</strong>"
        rendered.append((sp, inner))
    if not rendered:
        return ""
    out: list[str] = [rendered[0][1]]
    for idx in range(1, len(rendered)):
        prev_sp, _ = rendered[idx - 1]
        curr_sp, curr_html = rendered[idx]
        prev_w = next((words_by_id[wid] for wid in reversed(prev_sp.wordIds) if wid in words_by_id), None)
        curr_w = next((words_by_id[wid] for wid in curr_sp.wordIds if wid in words_by_id), None)
        sep = "" if should_join_words_without_space(prev_w, curr_w) else " "
        out.append(sep + curr_html)
    return "".join(out)


def _block_plain_text(block: Any, words_by_id: dict[str, Word]) -> str:
    if getattr(block, "text", None):
        return str(block.text)
    wids = getattr(block, "wordIds", None) or []
    return " ".join(words_by_id[w].text for w in wids if w in words_by_id).strip()


_CELL_PARA_OPENER_RE = re.compile(
    r"^(?:[◈\u3147•·▪▫◦○●□■◆◇▶▷▹▸※★☆‣]|-\s+|\[[√✔✓xX ]?\]|\(\d+\)|\([\uac00-\ud558]\)|\uc81c\s*\d+\s*\uc870|\d{1,3}[.)]|[\uac00-\ud558][.)]|[①-⑳⑴-⒇]|\*\s*)"
)


def _group_cell_lines_into_paragraphs(
    cell_words: list[Word],
    cell_bbox: Optional[tuple[float, float, float, float]],
) -> tuple[list[list[Word]], int]:
    """Merge soft-wrapped visual lines inside a table cell into logical paragraphs."""
    line_groups: dict[int, list[Word]] = {}
    for w in cell_words:
        hint = w.lineHint if w.lineHint is not None else 0
        line_groups.setdefault(hint, []).append(w)

    lines = [line_groups[k] for k in sorted(line_groups)]
    if len(lines) <= 1:
        return lines, 0

    boxed = [w for w in cell_words if w.bbox is not None]
    if cell_bbox is not None:
        cx0, cx1 = float(cell_bbox[0]), float(cell_bbox[2])
    elif boxed:
        cx0 = min(w.bbox[0] for w in boxed if w.bbox)
        cx1 = max(w.bbox[2] for w in boxed if w.bbox)
    else:
        return [[w for ln in lines for w in ln]], len(lines) - 1
    cell_w = max(20.0, cx1 - cx0)

    def _line_y_span(ws: list[Word]) -> Optional[tuple[float, float]]:
        ys = [w.bbox for w in ws if w.bbox is not None]
        if not ys:
            return None
        return min(b[1] for b in ys), max(b[3] for b in ys)

    pos_gaps: list[float] = []
    for i in range(1, len(lines)):
        py = _line_y_span(lines[i - 1])
        cy = _line_y_span(lines[i])
        if py and cy and cy[0] >= py[1]:
            pos_gaps.append(cy[0] - py[1])
    med_gap = median(pos_gaps) if pos_gaps else 0.0

    paragraphs: list[list[Word]] = [list(lines[0])]
    merged_count = 0
    for i in range(1, len(lines)):
        prev_line = lines[i - 1]
        cur_line = lines[i]
        curr_txt = join_words_smart(cur_line).lstrip()
        prev_txt = join_words_smart(prev_line).rstrip()

        if _CELL_PARA_OPENER_RE.match(curr_txt):
            paragraphs.append(list(cur_line))
            continue

        py = _line_y_span(prev_line)
        cy = _line_y_span(cur_line)
        sz = float(prev_line[-1].size or 10.0)
        v_gap = (cy[0] - py[1]) if (py and cy) else 0.0
        if med_gap > 0 and v_gap > max(sz * 0.85, med_gap * 1.65):
            paragraphs.append(list(cur_line))
            continue

        p_boxes = [w.bbox for w in prev_line if w.bbox is not None]
        c_first_box = cur_line[0].bbox
        if p_boxes and c_first_box is not None:
            prev_x0 = min(b[0] for b in p_boxes)
            prev_x1 = max(b[2] for b in p_boxes)
            first_w = max(4.0, c_first_box[2] - c_first_box[0])
            remaining_right = max(0.0, cx1 - prev_x1)
            prev_span_w = max(1.0, prev_x1 - prev_x0)
            left_pad = max(0.0, prev_x0 - cx0)
            is_centered_short = (
                left_pad >= 8.0
                and remaining_right >= 8.0
                and abs(left_pad - remaining_right) <= max(8.0, cell_w * 0.12)
                and prev_span_w < cell_w * 0.78
            )
            if is_centered_short:
                paragraphs.append(list(cur_line))
                continue
            if prev_txt.endswith((".", "?", "!", "。")) and (
                remaining_right > first_w + 4.0 or (prev_x1 - cx0) < cell_w * 0.85
            ):
                paragraphs.append(list(cur_line))
                continue
            if remaining_right > max(first_w + 6.0, cell_w * 0.25) and (prev_x1 - cx0) < cell_w * 0.72:
                paragraphs.append(list(cur_line))
                continue

        paragraphs[-1].extend(cur_line)
        merged_count += 1

    return paragraphs, merged_count


def _cell_html_and_meta(
    cell: CellIR,
    words_by_id: dict[str, Word],
    *,
    is_hwpx: bool,
    stats_out: Optional[dict[str, int]] = None,
) -> tuple[str, float, str, str, str, str]:
    font = cell.font
    size_pt = float(font.size) if font and font.size is not None else 10.0
    family = (font.family if font and font.family else "") or ""
    color = (font.color if font and font.color else "#000000") or "#000000"
    bold = bool(font.bold) if font and font.bold is not None else False
    lh = _fmt_line_height(cell.lineHeight if cell.lineHeight is not None else 1.3)

    if is_hwpx and cell.paragraphs is not None:
        html_parts: list[str] = []
        for item in cell.paragraphs:
            if item.get("kind") == "para":
                html_parts.append(
                    _render_hwpx_runs_html(
                        item.get("runs") or [],
                        base_size_pt=size_pt,
                        base_bold=bold,
                        base_color=color,
                    )
                )
                # Wrap individual para
                html_parts[-1] = f"<p>{html_parts[-1]}</p>"
            elif item.get("kind") == "table":
                idx = int(item.get("nestedIdx", 0))
                if 0 <= idx < len(cell.nested):
                    nested_html = _nested_table_html(
                        cell.nested[idx],
                        words_by_id,
                        base_size_pt=size_pt,
                        base_bold=bold,
                        base_color=color,
                    )
                    if nested_html:
                        html_parts.append(nested_html)
        content_html = "".join(html_parts) or "<p></p>"
        return content_html, size_pt, family, color, lh, ("bold" if bold else "normal")

    if cell.html:
        return cell.html, size_pt, family, color, lh, ("bold" if bold else "normal")

    if cell.wordIds and words_by_id:
        cell_words = [words_by_id[wid] for wid in cell.wordIds if wid in words_by_id]
        if cell_words:
            first_w = cell_words[0]
            size_pt = float(first_w.size or size_pt)
            family = first_w.font or family
            bold = all(bool(w.bold) for w in cell_words)
            if first_w.color and all(w.color == first_w.color for w in cell_words):
                color = first_w.color
            para_groups, merged_lines = _group_cell_lines_into_paragraphs(cell_words, cell.bbox)
            if stats_out is not None and merged_lines > 0:
                stats_out["cell_paragraphs_merged"] = stats_out.get("cell_paragraphs_merged", 0) + merged_lines
            if para_groups:
                content_html = "".join(f"<p>{html_lib.escape(join_words_smart(pg))}</p>" for pg in para_groups)
            else:
                content_html = f"<p>{html_lib.escape(join_words_smart(cell_words))}</p>"
            return content_html, size_pt, family, color, lh, ("bold" if bold else "normal")

    if cell.text:
        content_html = "".join(f"<p>{html_lib.escape(ln)}</p>" for ln in cell.text.splitlines()) or "<p></p>"
    else:
        content_html = "<p></p>"
    if cell.nested:
        for nt in cell.nested:
            content_html += _nested_table_html(
                nt,
                words_by_id,
                base_size_pt=size_pt,
                base_bold=bold,
                base_color=color,
            )
    return content_html, size_pt, family, color, lh, ("bold" if bold else "normal")


def _border_css(edge: Optional[BorderEdge]) -> str:
    if edge is None:
        return "none"
    return edge.to_css()


def _render_table_block(
    table: TableIR,
    *,
    bid: str,
    table_no: int,
    words_by_id: dict[str, Word],
    page: PageIR,
    lbls: dict[str, str],
    slots: dict[str, dict[str, Any]],
    stats_out: Optional[dict[str, int]] = None,
) -> tuple[dict[str, Any], int]:
    if table.imageFallbackSrc:
        title = table.title or lbls["tableTitle"].format(n=table_no)
        return {
            "blockId": f"b_img_{bid}",
            "kind": "image",
            "title": title,
            "src": table.imageFallbackSrc,
            "alt": title,
            "needsReview": True,
        }, 0

    is_hwpx = page.sourceKind == "hwpx"
    if table.widthRatio:
        col_widths = [f"{w * 100:.2f}%" for w in table.widthRatio]
    elif len(table.colXs) >= 2:
        spans = [max(1.0, b - a) for a, b in zip(table.colXs, table.colXs[1:])]
        tot = sum(spans) or 1.0
        col_widths = [f"{(w / tot) * 100:.2f}%" for w in spans]
    else:
        col_widths = [f"{100.0 / table.nCols:.2f}%"] * table.nCols

    row_heights_pt: list[float] = []
    if table.borderRules and isinstance(table.borderRules.get("rowHeightsPt"), list):
        row_heights_pt = [float(x) for x in table.borderRules["rowHeightsPt"]]
    elif len(table.rowYs) == table.nRows + 1:
        row_heights_pt = [max(0.0, b - a) for a, b in zip(table.rowYs, table.rowYs[1:])]

    by_anchor: dict[tuple[int, int], CellIR] = {(c.r, c.c): c for c in table.cells}
    rows_out: list[dict[str, Any]] = []
    fill_cells = 0

    for r in range(table.nRows):
        row_cells_out: list[dict[str, Any]] = []
        for c in range(table.nCols):
            cell = by_anchor.get((r, c))
            if cell is None:
                continue
            cell_id = f"c_{bid}_{cell.r}_{cell.c}"
            slot_id = f"s_tc_{bid}_{cell.r}_{cell.c}"
            content_html, size_pt, family, color, lh, weight = _cell_html_and_meta(
                cell, words_by_id, is_hwpx=is_hwpx, stats_out=stats_out
            )
            plain_txt = (cell.text if cell.text is not None else "").strip()
            if not plain_txt and cell.wordIds and words_by_id:
                plain_txt = " ".join(words_by_id[w].text for w in cell.wordIds if w in words_by_id).strip()

            is_editable = (not cell.continued) and (
                cell.field is not None or (is_hwpx and not plain_txt)
            )
            if is_editable:
                fill_cells += 1
            slot_role = "editable-slot" if is_editable else "boilerplate"
            slot_label = (
                lbls["cellLabel"].format(r=cell.r + 1, c=cell.c + 1)
                if not plain_txt
                else _clip_title(plain_txt, 24)
            )
            if cell.field and cell.field.label:
                slot_label = _clip_title(cell.field.label, 24)

            slot_entry: dict[str, Any] = {
                "slotId": slot_id,
                "label": slot_label,
                "role": slot_role,
                "content": content_html,
                "backDataRefs": [],
            }
            if cell.needsReview:
                slot_entry["constraints"] = {"needsReview": True}
            slots[slot_id] = slot_entry

            pad = cell.padding
            if pad is not None:
                pad_css = f"{_fmt_px(pad.t)}px {_fmt_px(pad.r)}px {_fmt_px(pad.b)}px {_fmt_px(pad.l)}px"
            else:
                pad_css = "1.9px 1.9px 1.9px 1.9px"

            borders = cell.borders
            cell_dict: dict[str, Any] = {
                "cellId": cell_id,
                "slotId": slot_id,
                "vAlign": cell.valign or "middle",
                "hAlign": cell.align or "left",
                "padding": pad_css,
                "fontSize": _pt_px_round1(size_pt),
                "fontFamily": _font_stack(family),
                "lineHeight": lh,
                "fontWeight": weight,
                "borderTop": _border_css(borders.top if borders else None),
                "borderRight": _border_css(borders.right if borders else None),
                "borderBottom": _border_css(borders.bottom if borders else None),
                "borderLeft": _border_css(borders.left if borders else None),
            }
            if cell.bg:
                cell_dict["backgroundColor"] = cell.bg
            if color and color != "#000000":
                cell_dict["color"] = color
            if cell.cs > 1:
                cell_dict["colSpan"] = cell.cs
            if cell.rs > 1:
                cell_dict["rowSpan"] = cell.rs
            row_cells_out.append(cell_dict)

        row_dict: dict[str, Any] = {"rowId": f"r_{bid}_{r}", "cells": row_cells_out}
        if r < len(row_heights_pt) and row_heights_pt[r] > 0:
            row_dict["height"] = f"{_fmt_px(row_heights_pt[r])}px"
        rows_out.append(row_dict)

    table_title = table.title or lbls["tableTitle"].format(n=table_no)
    block_dict: dict[str, Any] = {
        "blockId": f"b_tbl_{bid}",
        "kind": "structured-table",
        "title": table_title,
        "columnWidths": col_widths,
        "rows": rows_out,
    }
    if table.widthPt and page.margins is not None:
        body_w_pt = max(1.0, page.size.width - page.margins.left - page.margins.right)
        block_dict["tableWidthRatio"] = round(table.widthPt / body_w_pt, 4)
    elif page.size.width > 0 and table.bbox is not None:
        block_dict["tableWidthRatio"] = round((table.bbox[2] - table.bbox[0]) / page.size.width, 4)

    if table.borderRules:
        br = {k: table.borderRules[k] for k in ("outer", "rowBottom", "vertical") if k in table.borderRules}
        if br:
            block_dict["borderRules"] = br
    else:
        block_dict["borderRules"] = {"outer": "none", "rowBottom": "none", "vertical": "none"}

    return block_dict, fill_cells


def _render_flow_text_block(
    group: list[Union[ParagraphBlock, CaptionBlock, NoteBlock, ListItemBlock]],
    *,
    bid: str,
    words_by_id: dict[str, Word],
    lbls: dict[str, str],
    slots: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    html_parts: list[str] = []
    title_text = ""
    first_align: Optional[str] = None
    needs_review = False

    for item in group:
        if item.needsReview:
            needs_review = True
        if first_align is None and item.align:
            first_align = item.align
        txt = _block_plain_text(item, words_by_id)
        if not title_text and txt:
            title_text = txt

        if isinstance(item, ListItemBlock):
            pad_px = round((item.indentLevel * 12.0 + item.hangingIndentPt) * PX_PER_PT, 1)
            hang_px = round(max(item.hangingIndentPt, 8.0 if item.marker else 0.0) * PX_PER_PT, 1)
            body_html = _spans_to_inline_html(txt, item.spans, words_by_id)
            if item.marker and not txt.startswith(item.marker):
                body_html = f"{html_lib.escape(item.marker)} {body_html}".strip()
            style_parts: list[str] = []
            if pad_px > 0:
                style_parts.append(f"padding-left: {pad_px}px")
            if hang_px > 0:
                style_parts.append(f"text-indent: -{hang_px}px")
            style_attr = f' style="{"; ".join(style_parts)}"' if style_parts else ""
            html_parts.append(f"<p{style_attr}>{body_html}</p>")
        elif isinstance(item, CaptionBlock):
            inner = _spans_to_inline_html(txt, item.spans, words_by_id)
            align_s = f'text-align: {item.align}; ' if item.align else ""
            html_parts.append(f'<p style="{align_s}font-size: 12px">{inner}</p>')
        elif isinstance(item, NoteBlock):
            inner = _spans_to_inline_html(txt, item.spans, words_by_id)
            html_parts.append(f'<p style="font-size: 11px; color: #555555">{inner}</p>')
        else:
            if item.html:
                html_parts.append(item.html if item.html.lstrip().startswith("<p") else f"<p>{item.html}</p>")
            else:
                inner = _spans_to_inline_html(txt, item.spans, words_by_id)
                block_align = first_align or "left"
                if item.align and item.align != block_align:
                    html_parts.append(f'<p style="text-align: {item.align}">{inner}</p>')
                else:
                    html_parts.append(f"<p>{inner}</p>")

    slot_id = f"s_tx_{bid}"
    slot_entry: dict[str, Any] = {
        "slotId": slot_id,
        "label": lbls["bodyLabel"],
        "role": "boilerplate",
        "content": "".join(html_parts) or "<p></p>",
        "backDataRefs": [],
    }
    if needs_review:
        slot_entry["constraints"] = {"needsReview": True}
    slots[slot_id] = slot_entry

    return {
        "blockId": f"b_tx_{bid}",
        "kind": "text",
        "title": _clip_title(title_text) or lbls["bodyLabel"],
        "slotId": slot_id,
        "align": first_align or "left",
    }


def doc_ir_pages_to_vdoc(
    pages_ir: list[PageIR],
    *,
    uid: Callable[[], str],
    first_page_number: int = 1,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[CompiledPageReport]]:
    """Compile a sequence of `PageIR` objects into `.vdoc` pages, slots, and reports."""
    lbls = _labels()
    pages_out: list[dict[str, Any]] = []
    slots_out: dict[str, dict[str, Any]] = {}
    reports_out: list[CompiledPageReport] = []

    for offset, page in enumerate(pages_ir):
        pg_uid = uid()
        pg_id = f"pg_{pg_uid}"
        pg_dict, pg_slots = vdoc_build.blank_page(pg_id, first_page_number + offset)
        pg_dict["pageLabel"] = lbls["pageLabel"].format(n=page.pageIndex)
        pg_dict["hideHeaderFooter"] = True
        pg_dict["sourcePage"] = page.pageIndex

        if page.sourceKind != "hwpx":
            pg_dict["pageRect"] = {
                "width": round(page.size.width * PX_PER_PT),
                "height": round(page.size.height * PX_PER_PT),
                "unit": "px",
            }

        defaults = (page.metrics or {}).get("layoutDefaults") or {}
        if page.margins is not None:
            pg_dict["layout"] = {
                "margin": {
                    "left": round(page.margins.left * PX_PER_PT, 1),
                    "right": round(page.margins.right * PX_PER_PT, 1),
                    "top": round(page.margins.top * PX_PER_PT, 1),
                    "bottom": round(page.margins.bottom * PX_PER_PT, 1),
                },
                "blockGap": BLOCK_GAP,
                "fontFamily": _font_stack(str(defaults.get("font") or "")),
                "fontSize": _pt_px_round1(float(defaults.get("sizePt") or 10.0)),
                "lineHeight": _fmt_line_height(float(defaults.get("linePct") or 160) / 100.0),
                "exactText": True,
            }

        slots_out.update(pg_slots)
        words_by_id = {w.id: w for w in page.words}
        blocks_by_id = {b.id: b for b in page.blocks}
        order = page.readingOrder if page.readingOrder else [b.id for b in page.blocks]
        ordered_blocks = [blocks_by_id[bid] for bid in order if bid in blocks_by_id]

        report = CompiledPageReport(
            source=page.pageIndex,
            pictures=int((page.metrics or {}).get("pictures") or 0),
        )
        vdoc_blocks: list[dict[str, Any]] = []
        table_no = 0
        image_no = 0
        tbl_stats: dict[str, int] = {}

        if page.sourceKind == "hwpx":
            for blk in ordered_blocks:
                if isinstance(blk, ParagraphBlock):
                    bid = uid()
                    slot_id = f"s_tx_{bid}"
                    align = blk.align or "left"
                    if blk.paragraphs:
                        html_content = _render_paragraphs_html(blk.paragraphs)
                        lp = float((blk.paragraphs[0]).get("linePct") or 160)
                    else:
                        txt = _block_plain_text(blk, words_by_id)
                        html_content = f"<p>{html_lib.escape(txt)}</p>"
                        lp = round((blk.lineHeight or 1.6) * 100)
                    slot_obj: dict[str, Any] = {
                        "slotId": slot_id,
                        "label": lbls["bodyLabel"],
                        "role": "boilerplate",
                        "content": html_content,
                        "backDataRefs": [],
                    }
                    if round(lp) != 160:
                        slot_obj["constraints"] = {"lineHeight": _fmt_line_height(lp / 100.0)}
                    slots_out[slot_id] = slot_obj
                    vdoc_blocks.append(
                        {
                            "blockId": f"b_tx_{bid}",
                            "kind": "text",
                            "title": _clip_title(_block_plain_text(blk, words_by_id)),
                            "slotId": slot_id,
                            "align": align,
                        }
                    )
                    report.paragraphs += 1
                elif isinstance(blk, TableIR):
                    table_no += 1
                    t_block, fills = _render_table_block(
                        blk,
                        bid=uid(),
                        table_no=table_no,
                        words_by_id=words_by_id,
                        page=page,
                        lbls=lbls,
                        slots=slots_out,
                        stats_out=tbl_stats,
                    )
                    vdoc_blocks.append(t_block)
                    report.tables += 1
                    report.fill_cells += fills
        else:
            # Non-HWPX: isolate page headers/footers to chrome slots; merge consecutive flow blocks (sec 12.1)
            flow_kinds = (ParagraphBlock, CaptionBlock, NoteBlock, ListItemBlock)

            def _is_chrome_note(b: Any) -> bool:
                return isinstance(b, NoteBlock) and b.noteKind in ("header", "footer")

            idx = 0
            while idx < len(ordered_blocks):
                blk = ordered_blocks[idx]
                if _is_chrome_note(blk):
                    slot_key = (
                        pg_dict.get("headerSlotId", f"{pg_id}_header")
                        if blk.noteKind == "header"
                        else pg_dict.get("footerSlotId", f"{pg_id}_footer")
                    )
                    txt = _block_plain_text(blk, words_by_id).strip()
                    if txt:
                        inner = _spans_to_inline_html(txt, blk.spans, words_by_id)
                        p_html = f"<p>{inner}</p>"
                        cur_slot = slots_out.get(slot_key)
                        if cur_slot is not None:
                            prev = cur_slot.get("content") or ""
                            cur_slot["content"] = f"{prev}{p_html}" if prev else p_html
                        else:
                            slots_out[slot_key] = {
                                "slotId": slot_key,
                                "label": lbls.get(
                                    "headerLabel" if blk.noteKind == "header" else "footerLabel",
                                    blk.noteKind,
                                ),
                                "role": "boilerplate",
                                "content": p_html,
                                "backDataRefs": [],
                            }
                        pg_dict["hideHeaderFooter"] = False
                        report.headers_isolated += 1
                    idx += 1
                    continue
                if isinstance(blk, flow_kinds):
                    group: list[Any] = []
                    while (
                        idx < len(ordered_blocks)
                        and isinstance(ordered_blocks[idx], flow_kinds)
                        and not _is_chrome_note(ordered_blocks[idx])
                    ):
                        group.append(ordered_blocks[idx])
                        idx += 1
                    vdoc_blocks.append(
                        _render_flow_text_block(
                            group,
                            bid=uid(),
                            words_by_id=words_by_id,
                            lbls=lbls,
                            slots=slots_out,
                        )
                    )
                    report.paragraphs += len(group)
                    continue

                idx += 1
                if isinstance(blk, HeadingBlock):
                    bid = uid()
                    slot_id = f"s_hd_{bid}"
                    txt = _block_plain_text(blk, words_by_id)
                    inner = _spans_to_inline_html(txt, blk.spans, words_by_id)
                    slots_out[slot_id] = {
                        "slotId": slot_id,
                        "label": lbls.get("headingLabel", lbls["bodyLabel"]),
                        "role": "boilerplate",
                        "content": f"<p>{inner}</p>",
                        "backDataRefs": [],
                    }
                    hd: dict[str, Any] = {
                        "blockId": f"b_hd_{bid}",
                        "kind": "heading",
                        "level": max(1, min(6, blk.level)),
                        "slotId": slot_id,
                        "title": _clip_title(txt) or lbls.get("headingLabel", lbls["bodyLabel"]),
                    }
                    if blk.align:
                        hd["align"] = blk.align
                    vdoc_blocks.append(hd)
                    report.paragraphs += 1
                elif isinstance(blk, TableIR):
                    table_no += 1
                    t_block, fills = _render_table_block(
                        blk,
                        bid=uid(),
                        table_no=table_no,
                        words_by_id=words_by_id,
                        page=page,
                        lbls=lbls,
                        slots=slots_out,
                        stats_out=tbl_stats,
                    )
                    vdoc_blocks.append(t_block)
                    if t_block.get("kind") == "image":
                        report.pictures += 1
                    else:
                        report.tables += 1
                        report.fill_cells += fills
                elif isinstance(blk, FigureBlock):
                    image_no += 1
                    bid = uid()
                    alt = blk.alt or lbls.get("imageAlt", "image")
                    fig_dict: dict[str, Any] = {
                        "blockId": f"b_img_{bid}",
                        "kind": "image",
                        "src": blk.src or "",
                        "alt": alt,
                        "title": _clip_title(blk.alt or lbls["imageLabel"].format(n=image_no)),
                    }
                    if blk.bbox is not None:
                        fig_dict["width"] = f"{max(24, round((blk.bbox[2] - blk.bbox[0]) * PX_PER_PT))}px"
                    if blk.needsReview:
                        fig_dict["needsReview"] = True
                    vdoc_blocks.append(fig_dict)
                    report.pictures += 1
                elif isinstance(blk, FieldBlock):
                    bid = uid()
                    slot_id = f"s_fld_{bid}"
                    txt = _block_plain_text(blk, words_by_id)
                    field_type_map = {
                        "date": "date",
                        "sign": "signature",
                        "box": "text-area",
                        "line": "text-area",
                    }
                    slots_out[slot_id] = {
                        "slotId": slot_id,
                        "label": blk.label or lbls.get("fieldLabel", lbls["bodyLabel"]),
                        "role": "editable-slot",
                        "content": f"<p>{html_lib.escape(blk.placeholder or txt)}</p>",
                        "backDataRefs": [],
                    }
                    vdoc_blocks.append(
                        {
                            "blockId": f"b_fld_{bid}",
                            "kind": "fillable-group",
                            "slotId": slot_id,
                            "fieldType": field_type_map.get(blk.fieldKind, "text-area"),
                            "assigneeName": blk.assigneeName or lbls.get("defaultAssignee", ""),
                            "title": _clip_title(blk.label or txt or lbls.get("fieldLabel", lbls["bodyLabel"])),
                        }
                    )
                    report.fill_cells += 1

        report.cell_paragraphs_merged = tbl_stats.get("cell_paragraphs_merged", 0)
        pg_dict["blocks"] = vdoc_blocks
        heading_cnt = sum(1 for b in vdoc_blocks if b.get("kind") == "heading")
        logger.info(
            "[docstruct.vdoc] page=%d blocks=%d headings=%d tables=%d headersIsolated=%d cellLinesMerged=%d",
            page.pageIndex,
            len(vdoc_blocks),
            heading_cnt,
            report.tables,
            report.headers_isolated,
            report.cell_paragraphs_merged,
        )
        pages_out.append(pg_dict)
        reports_out.append(report)

    return pages_out, slots_out, reports_out


def doc_ir_to_vdoc(
    doc_ir: DocIR,
    *,
    doc_id: str = "",
    title: str = "",
    uid: Optional[Callable[[], str]] = None,
    first_page_number: int = 1,
) -> tuple[dict[str, Any], list[CompiledPageReport]]:
    """Compile a full `DocIR` into a complete `.vdoc` dictionary + per-page stats."""
    counter = [0]

    def _default_uid() -> str:
        counter[0] += 1
        return f"ds{counter[0]}"

    gen_uid = uid or _default_uid
    pages, slots, reports = doc_ir_pages_to_vdoc(
        doc_ir.pages,
        uid=gen_uid,
        first_page_number=first_page_number,
    )
    vdoc = {
        "docId": doc_id or doc_ir.docId or "doc",
        "title": title or doc_ir.title or "document",
        "version": "1.0",
        "surface": {"kind": "paged"},
        "pages": pages,
        "slots": slots,
    }
    return vdoc, reports


def default_ocr_port() -> Optional[Any]:
    """Return the platform default OCR adapter when available (WinRT on win32)."""
    return WindowsOcrAdapter() if sys.platform == "win32" else None


def build_doc_ir_from_pdf_bytes(
    pdf_bytes: bytes,
    *,
    doc_path: Path,
    cache_root: Optional[Path] = None,
    ocr_port: Optional[Any] = None,
    thresholds: Optional[dict[str, Any]] = None,
    render_png: bool = True,
    force: bool = False,
) -> tuple[DocIR, Optional[Path]]:
    """Write `pdf_bytes` to `doc_path` and run `docstruct_engine.build_doc_ir`."""
    doc_path.parent.mkdir(parents=True, exist_ok=True)
    doc_path.write_bytes(pdf_bytes)
    src_hash = file_src_hash(doc_path)
    cache_dir = doc_cache_dir(cache_root, src_hash) if cache_root is not None else None
    doc_ir = build_doc_ir(
        doc_path,
        cache_root=cache_root,
        ocr_port=ocr_port,
        force=force,
        thresholds=thresholds,
        render_png=render_png,
    )
    return doc_ir, cache_dir


def finalize_vdoc_envelope(
    vdoc: dict[str, Any],
    *,
    doc_id: str,
    title: str,
    updated_at: Optional[str] = None,
) -> tuple[dict[str, Any], int, int]:
    """Normalize compiled `.vdoc` top-level metadata, page labels, and block/slot counts."""
    clean_title = (title or "").strip() or str(vdoc.get("title") or "Untitled Document")
    pages = list(vdoc.get("pages") or [])
    for idx, page in enumerate(pages, start=1):
        if isinstance(page, dict):
            page["pageLabel"] = f"{clean_title} ({idx}p)"

    slots = dict(vdoc.get("slots") or {})
    checked_blocks = sum(
        len(pg.get("blocks") or []) for pg in pages if isinstance(pg, dict)
    )
    ts = updated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    envelope: dict[str, Any] = {
        "version": "1.0.0",
        "docId": doc_id or str(vdoc.get("docId") or ""),
        "title": clean_title,
        "status": "Draft",
        "totalValueText": "Scaffolded .vdoc",
        "updatedAt": ts,
        "surface": vdoc.get("surface") or {"kind": "paged"},
        "variables": {},
        "pages": pages,
        "slots": slots,
        "backdata": {},
    }
    return envelope, checked_blocks, len(slots)
