"""VLM/LLM table HTML serialization, structural HTML parsing, and grid validation."""
from __future__ import annotations

from ..ir.html_codec import (
    ParsedCellIR,
    ParsedTableGrid,
    _TableHtmlParser,
    cell_plain_text,
    parse_table_html,
    table_to_html,
)
from ..ir.model import TableIR, Word


def render_table_proposal_html(
    table: TableIR,
    words_by_id: dict[str, Word],
    *,
    include_word_attrs: bool = True,
) -> str:
    """Render candidate TableIR as annotated HTML for VLM / review tools."""
    return table_to_html(table, words_by_id, include_word_attrs=include_word_attrs)


def validate_table_html_grid(html_str: str) -> tuple[ParsedTableGrid | None, list[str]]:
    """Parse VLM HTML `<table>` and detect empty, overlapping, or jagged grid errors."""
    parser = _TableHtmlParser()
    parser.feed(html_str or "")
    parser.close()
    if not parser.tables:
        return None, ["HTML_PARSE_EMPTY: no <table> element found"]

    rows = [r for r in parser.tables[0] if r]
    if not rows:
        return None, ["HTML_PARSE_EMPTY: table contains no <tr> rows"]

    grid = parse_table_html(html_str)
    if grid.n_rows <= 0 or grid.n_cols <= 0:
        return None, ["HTML_PARSE_EMPTY: parsed table has zero rows or columns"]

    errors: list[str] = []
    seen: set[tuple[int, int]] = set()
    for cell in grid.cells:
        if cell.r < 0 or cell.c < 0 or cell.r + cell.rs > grid.n_rows or cell.c + cell.cs > grid.n_cols:
            errors.append(
                f"HTML_CELL_OUT_OF_BOUNDS: cell ({cell.r},{cell.c}) span ({cell.rs},{cell.cs}) "
                f"exceeds {grid.n_rows}x{grid.n_cols}"
            )
            continue
        for rr in range(cell.r, cell.r + cell.rs):
            for cc in range(cell.c, cell.c + cell.cs):
                if (rr, cc) in seen:
                    errors.append(f"HTML_SPAN_OVERLAP: duplicate occupancy at ({rr},{cc})")
                seen.add((rr, cc))

    if len(seen) < grid.n_rows * grid.n_cols:
        missing = grid.n_rows * grid.n_cols - len(seen)
        errors.append(f"HTML_JAGGED_GRID: {missing} unoccupied slot(s) in {grid.n_rows}x{grid.n_cols} matrix")

    return grid, errors


__all__ = [
    "ParsedCellIR",
    "ParsedTableGrid",
    "cell_plain_text",
    "parse_table_html",
    "render_table_proposal_html",
    "table_to_html",
    "validate_table_html_grid",
]

