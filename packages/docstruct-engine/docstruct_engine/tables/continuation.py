"""Cross-page table continuation detection."""
from __future__ import annotations

from typing import Optional

from ..ir.model import BlockIR, PageIR, TableIR


def _first_and_last_table(page: PageIR) -> tuple[Optional[TableIR], Optional[TableIR]]:
    by_id: dict[str, BlockIR] = {b.id: b for b in page.blocks}
    ordered = [by_id[bid] for bid in page.readingOrder if bid in by_id] or list(page.blocks)
    first_non_header = None
    for blk in ordered:
        if getattr(blk, "noteKind", None) in ("header", "footer"):
            continue
        first_non_header = blk
        break
    last_non_footer = None
    for blk in reversed(ordered):
        if getattr(blk, "noteKind", None) in ("header", "footer"):
            continue
        last_non_footer = blk
        break
    t_first = first_non_header if isinstance(first_non_header, TableIR) else None
    t_last = last_non_footer if isinstance(last_non_footer, TableIR) else None
    return t_first, t_last


def _columns_compatible(a: TableIR, b: TableIR, ratio_tol: float = 0.035) -> bool:
    if a.nCols != b.nCols or a.nCols < 1:
        return False
    ra = a.widthRatio or []
    rb = b.widthRatio or []
    if len(ra) == a.nCols and len(rb) == b.nCols:
        return all(abs(x - y) <= ratio_tol for x, y in zip(ra, rb))
    if len(a.colXs) == len(b.colXs) == a.nCols + 1:
        return all(abs(x - y) <= 6.0 for x, y in zip(a.colXs, b.colXs))
    return True


def _headers_match(a: TableIR, b: TableIR) -> bool:
    ha = [" ".join((c.text or "").split()) for c in sorted(a.cells, key=lambda c: (c.r, c.c)) if c.r == 0]
    hb = [" ".join((c.text or "").split()) for c in sorted(b.cells, key=lambda c: (c.r, c.c)) if c.r == 0]
    return bool(ha) and ha == hb and any(ha)


def detect_table_continuations(pages: list[PageIR], *, ratio_tol: float = 0.035) -> list[tuple[str, str]]:
    """Link page-end and next-page-start tables sharing column geometry and flag repeated headers."""
    links: list[tuple[str, str]] = []
    for idx in range(len(pages) - 1):
        p_cur, p_nxt = pages[idx], pages[idx + 1]
        _, t_end = _first_and_last_table(p_cur)
        t_start, _ = _first_and_last_table(p_nxt)
        if t_end is None or t_start is None:
            continue
        if not _columns_compatible(t_end, t_start, ratio_tol=ratio_tol):
            continue
        if _headers_match(t_end, t_start):
            t_start.repeatHeader = True
        else:
            # First row continues body flow across the page break
            for c in t_start.cells:
                if c.r == 0:
                    c.continued = True
        links.append((t_end.id, t_start.id))
    return links

