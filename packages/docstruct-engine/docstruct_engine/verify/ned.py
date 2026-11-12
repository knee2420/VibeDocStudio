"""Reading-order Normalized Edit Distance (NED) metrics for DocIR pages."""
from __future__ import annotations

from ..ir.html_codec import cell_plain_text
from ..ir.model import FigureBlock, PageIR, TableIR, Word
from .teds import levenshtein, normalize_text


def compute_ned(pred_text: str, gold_text: str) -> float:
    a = normalize_text(pred_text)
    b = normalize_text(gold_text)
    if not a and not b:
        return 0.0
    denom = max(len(a), len(b))
    return levenshtein(a, b) / float(denom)


def _block_text(block: object, words_by_id: dict[str, Word]) -> str:
    if isinstance(block, TableIR):
        row_texts: list[str] = []
        for cell in sorted(block.cells, key=lambda c: (c.r, c.c)):
            parts: list[str] = []
            txt = cell_plain_text(cell, words_by_id)
            if txt:
                parts.append(txt)
            for nt in cell.nested:
                nt_txt = _block_text(nt, words_by_id)
                if nt_txt:
                    parts.append(nt_txt)
            joined = " ".join(parts).strip()
            if joined:
                row_texts.append(joined)
        return " ".join(row_texts)
    if isinstance(block, FigureBlock):
        return normalize_text(block.alt) if block.alt else ""
    wids = getattr(block, "wordIds", None) or []
    if wids and words_by_id:
        tokens = [words_by_id[w].text for w in wids if w in words_by_id and words_by_id[w].text]
        if tokens:
            return " ".join(tokens)
    text = getattr(block, "text", None) or ""
    return normalize_text(text)


def page_reading_order_text(page: PageIR) -> str:
    words_by_id = {w.id: w for w in page.words}
    blocks_by_id = {b.id: b for b in page.blocks}
    order = page.readingOrder if page.readingOrder else [b.id for b in page.blocks]
    chunks: list[str] = []
    for bid in order:
        blk = blocks_by_id.get(bid)
        if blk is None:
            continue
        t = _block_text(blk, words_by_id)
        if t:
            chunks.append(t)
    return normalize_text(" ".join(chunks))


def page_ned(pred_page: PageIR, gold_page: PageIR) -> float:
    return compute_ned(page_reading_order_text(pred_page), page_reading_order_text(gold_page))

