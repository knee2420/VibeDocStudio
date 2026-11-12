"""HWPX parsed document -> canonical DocIR converter."""
from __future__ import annotations

import hashlib
import os
import re
from typing import Any, Optional, Union

from docstruct_engine.ir.model import (
    BorderEdge,
    CellBorders,
    CellFieldMeta,
    CellFont,
    CellIR,
    CellPadding,
    DocIR,
    PageIR,
    PageMargins,
    PageSize,
    ParagraphBlock,
    TableIR,
    Word,
)

from . import hwpx

_ALIGN_MAP = {
    "left": "left",
    "center": "center",
    "right": "right",
    "justify": "left",
}


def _norm_txt(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def trim_hwpx_items(
    pages: list[hwpx.Page],
    *,
    start_at: str = "",
    end_before: str = "",
) -> list[list[hwpx.Item]]:
    """Slice HWPX page item lists at optional `start_at` (first page) and `end_before` (last page) markers."""
    if not pages:
        return []
    start_norm = _norm_txt(start_at)
    end_norm = _norm_txt(end_before)
    selected: list[list[hwpx.Item]] = []
    for i, pg in enumerate(pages):
        items = list(pg.items)
        if i == 0 and start_norm:
            hit = next(
                (idx for idx, it in enumerate(items) if start_norm in _norm_txt(hwpx.item_text(it))),
                None,
            )
            if hit is None:
                raise ValueError(f"start_at not found on first page: '{start_at}'")
            items = items[hit:]
        if i == len(pages) - 1 and end_norm:
            hit = next(
                (idx for idx, it in enumerate(items) if end_norm in _norm_txt(hwpx.item_text(it))),
                None,
            )
            if hit is not None:
                items = items[:hit]
        selected.append(items)
    return selected


def _serialize_runs(
    para: hwpx.Para,
    words: list[Word],
    word_seq: list[int],
) -> tuple[list[str], list[dict[str, Any]]]:
    wids: list[str] = []
    runs_meta: list[dict[str, Any]] = []
    for run in para.runs:
        wid = ""
        if run.text.strip():
            word_seq[0] += 1
            wid = f"w{word_seq[0]}"
            words.append(
                Word(
                    id=wid,
                    text=run.text.strip(),
                    bbox=None,
                    conf=1.0,
                    src="hwpx",
                    font=run.style.font or None,
                    size=run.style.size_pt,
                    bold=run.style.bold,
                    italic=run.style.italic,
                    underline=run.style.underline,
                    color=run.style.color or "#000000",
                )
            )
            wids.append(wid)
        runs_meta.append(
            {
                "wordId": wid,
                "text": run.text,
                "sizePt": run.style.size_pt,
                "bold": run.style.bold,
                "italic": run.style.italic,
                "underline": run.style.underline,
                "color": run.style.color or "#000000",
                "font": run.style.font or "",
            }
        )
    return wids, runs_meta


def _convert_table(
    table: hwpx.Table,
    *,
    prefix: str,
    setup: hwpx.PageSetup,
    words: list[Word],
    word_seq: list[int],
    tbl_seq: list[int],
) -> TableIR:
    tbl_seq[0] += 1
    tid = f"{prefix}{tbl_seq[0]}"

    col_widths_hu = table.column_widths()
    total_w = sum(col_widths_hu) or 1.0
    width_ratio = [w / total_w for w in col_widths_hu]
    col_xs: list[float] = [0.0]
    acc_x = 0.0
    for w_hu in col_widths_hu:
        acc_x += w_hu / 100.0
        col_xs.append(round(acc_x, 4))

    row_heights_hu = table.row_heights()
    row_heights_pt = [round(h / 100.0, 4) for h in row_heights_hu]
    has_zero_row = any(h <= 0 for h in row_heights_hu)
    row_ys: list[float] = []
    if not has_zero_row and row_heights_pt:
        row_ys = [0.0]
        acc_y = 0.0
        for h_pt in row_heights_pt:
            acc_y += h_pt
            row_ys.append(round(acc_y, 4))

    cells_ir: list[CellIR] = []
    title_parts: list[str] = []

    for r_idx, row in enumerate(table.grid()):
        for c_idx, cell in enumerate(row):
            if cell is None:
                continue
            cell_word_ids: list[str] = []
            nested_tables: list[TableIR] = []
            content_meta: list[dict[str, Any]] = []
            cell_text_parts: list[str] = []

            for it in cell.content:
                t_piece = hwpx.item_text(it)
                if t_piece:
                    cell_text_parts.append(t_piece)
                if isinstance(it, hwpx.Para):
                    pwids, pruns = _serialize_runs(it, words, word_seq)
                    cell_word_ids.extend(pwids)
                    content_meta.append(
                        {
                            "kind": "para",
                            "align": _ALIGN_MAP.get(it.style.align, "left"),
                            "linePct": it.style.line_pct,
                            "runs": pruns,
                        }
                    )
                elif isinstance(it, hwpx.Table):
                    sub_ir = _convert_table(
                        it,
                        prefix=f"{tid}_n",
                        setup=setup,
                        words=words,
                        word_seq=word_seq,
                        tbl_seq=[0],
                    )
                    nested_idx = len(nested_tables)
                    nested_tables.append(sub_ir)
                    content_meta.append({"kind": "table", "nestedIdx": nested_idx})

            raw_text = " ".join(p for p in cell_text_parts if p).strip()
            if raw_text:
                title_parts.append(raw_text)

            # Cell base typography matching hwpx_vdoc semantics
            paras = cell.paras
            non_empty_runs = [r for p in paras for r in p.runs if r.text.strip()]
            first_run = non_empty_runs[0] if non_empty_runs else None
            if first_run is not None:
                base_size_pt = first_run.style.size_pt
                base_family = first_run.style.font
                base_color = (
                    first_run.style.color
                    if all(r.style.color == first_run.style.color for r in non_empty_runs)
                    else "#000000"
                )
            else:
                base_size_pt = 10.0
                base_family = ""
                base_color = "#000000"

            all_bold = bool(paras) and all(r.style.bold for r in non_empty_runs)
            h_align = _ALIGN_MAP.get(paras[0].style.align, "left") if paras else "left"
            line_pct = paras[0].style.line_pct if paras else 130

            # Cell margin tuple in hwpx.py is (left, right, top, bottom) in HWPUNIT -> pt (hu / 100.0)
            m_l, m_r, m_t, m_b = cell.margin
            edges = cell.fill.edges
            borders = CellBorders(
                top=BorderEdge.from_css(edges.get("top")),
                right=BorderEdge.from_css(edges.get("right")),
                bottom=BorderEdge.from_css(edges.get("bottom")),
                left=BorderEdge.from_css(edges.get("left")),
            )

            is_empty_fillable = (not cell.continued) and (not raw_text)
            cells_ir.append(
                CellIR(
                    r=cell.row,
                    c=cell.col,
                    rs=cell.row_span,
                    cs=cell.col_span,
                    role="td",
                    bbox=None,
                    wordIds=cell_word_ids,
                    text=raw_text or None,
                    paragraphs=content_meta,
                    align=h_align,  # type: ignore[arg-type]
                    valign=cell.valign if cell.valign in ("top", "middle", "bottom") else "middle",  # type: ignore[arg-type]
                    bg=cell.fill.background or None,
                    borders=borders,
                    padding=CellPadding(
                        t=m_t / 100.0,
                        r=m_r / 100.0,
                        b=m_b / 100.0,
                        l=m_l / 100.0,
                    ),
                    font=CellFont(
                        family=base_family or None,
                        color=base_color,
                        size=base_size_pt,
                        bold=all_bold,
                    ),
                    lineHeight=round(line_pct / 100.0, 2),
                    nested=nested_tables,
                    continued=cell.continued,
                    field=CellFieldMeta(kind="text") if is_empty_fillable else None,
                )
            )

    table_title = " ".join(title_parts).strip()[:32]
    return TableIR(
        id=tid,
        bbox=None,
        nRows=table.rows,
        nCols=table.cols,
        colXs=col_xs,
        rowYs=row_ys,
        widthRatio=width_ratio,
        widthPt=round(table.width / 100.0, 4),
        borderRules={
            "outer": "none",
            "rowBottom": "none",
            "vertical": "none",
            "rowHeightsPt": row_heights_pt,
        },
        title=table_title or None,
        cells=cells_ir,
        repeatHeader=table.repeat_header,
    )


def hwpx_doc_to_ir(
    doc: hwpx.HwpxDoc,
    numbers: Optional[list[int]] = None,
    *,
    start_at: str = "",
    end_before: str = "",
    source_path: Optional[str] = None,
    src_hash: str = "",
) -> DocIR:
    """Convert an in-memory `hwpx.HwpxDoc` into canonical `DocIR`."""
    total = len(doc.pages)
    if numbers is None:
        selected_numbers = [p.number for p in doc.pages]
    else:
        selected_numbers = list(numbers)

    if not selected_numbers:
        return DocIR(
            docId="",
            title=os.path.basename(source_path or ""),
            srcHash=src_hash,
            sourcePath=source_path,
            pages=[],
        )

    by_num = {pg.number: pg for pg in doc.pages}
    missing = [n for n in selected_numbers if n not in by_num]
    if missing:
        raise ValueError(f"no such source pages: {missing} (1-{total})")

    selected_pages = [by_num[n] for n in selected_numbers]
    trimmed_items = trim_hwpx_items(selected_pages, start_at=start_at, end_before=end_before)

    setup = doc.setup
    base_char = doc.styles.char(None)
    base_para = doc.styles.para(None)
    fallback_font = base_char.font or next((cs.font for cs in doc.styles.chars.values() if cs.font), "")
    margins = PageMargins(
        left=setup.margin[0] / 100.0,
        right=setup.margin[1] / 100.0,
        top=setup.margin[2] / 100.0,
        bottom=setup.margin[3] / 100.0,
    )
    page_size = PageSize(
        width=max(1.0, setup.width / 100.0),
        height=max(1.0, setup.height / 100.0),
    )

    ir_pages: list[PageIR] = []
    for pg, items in zip(selected_pages, trimmed_items):
        words: list[Word] = []
        word_seq = [0]
        para_seq = [0]
        tbl_seq = [0]
        blocks: list[Union[ParagraphBlock, TableIR]] = []
        pictures = 0

        for it in items:
            if isinstance(it, hwpx.Para):
                if not it.text:
                    continue
                para_seq[0] += 1
                bid = f"b{para_seq[0]}"
                pwids, pruns = _serialize_runs(it, words, word_seq)
                align = _ALIGN_MAP.get(it.style.align, "left")
                blocks.append(
                    ParagraphBlock(
                        id=bid,
                        bbox=None,
                        wordIds=pwids,
                        text=it.text,
                        align=align,  # type: ignore[arg-type]
                        lineHeight=round(it.style.line_pct / 100.0, 2),
                        paragraphs=[
                            {
                                "align": align,
                                "linePct": it.style.line_pct,
                                "runs": pruns,
                            }
                        ],
                    )
                )
            elif isinstance(it, hwpx.Table):
                tbl_ir = _convert_table(
                    it,
                    prefix="t",
                    setup=setup,
                    words=words,
                    word_seq=word_seq,
                    tbl_seq=tbl_seq,
                )
                blocks.append(tbl_ir)
            elif isinstance(it, hwpx.Picture):
                pictures += 1

        font_weights: dict[str, int] = {}
        for w in words:
            if w.font:
                font_weights[w.font] = font_weights.get(w.font, 0) + len(w.text)
        dom_font = max(font_weights.items(), key=lambda kv: kv[1])[0] if font_weights else fallback_font

        ir_pages.append(
            PageIR(
                pageIndex=pg.number,
                sourceKind="hwpx",
                size=page_size,
                margins=margins,
                words=words,
                rulings=[],
                blocks=blocks,  # type: ignore[arg-type]
                readingOrder=[b.id for b in blocks],
                metrics={
                    "pictures": pictures,
                    "layoutDefaults": {
                        "font": dom_font,
                        "sizePt": base_char.size_pt,
                        "linePct": base_para.line_pct,
                    },
                },
            )
        )

    return DocIR(
        docId="",
        title=os.path.basename(source_path or ""),
        srcHash=src_hash,
        sourcePath=source_path,
        pages=ir_pages,
    )


def hwpx_to_doc_ir(
    path: str,
    numbers: Optional[list[int]] = None,
    *,
    start_at: str = "",
    end_before: str = "",
) -> DocIR:
    """Parse an HWPX file on disk into canonical `DocIR`."""
    data = open(path, "rb").read()
    src_hash = hashlib.sha256(data).hexdigest()[:16]
    parsed = hwpx.parse(path)
    return hwpx_doc_to_ir(
        parsed,
        numbers,
        start_at=start_at,
        end_before=end_before,
        source_path=path,
        src_hash=src_hash,
    )
