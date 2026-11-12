"""Deterministic TableIR <-> clean HTML table codec shared by validation and VLM I/O."""
from __future__ import annotations

import html as html_lib
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Optional

from .model import CellIR, TableIR, Word


def cell_plain_text(cell: CellIR, words_by_id: Optional[dict[str, Word]] = None) -> str:
    if cell.wordIds and words_by_id is not None:
        parts = [words_by_id[wid].text for wid in cell.wordIds if wid in words_by_id and words_by_id[wid].text]
        if parts:
            return " ".join(parts).strip()
    if cell.text is not None:
        return " ".join(cell.text.split())
    if cell.html:
        stripped = re.sub(r"<[^>]+>", " ", cell.html)
        return " ".join(html_lib.unescape(stripped).split())
    return ""


def table_to_html(
    table: TableIR,
    words_by_id: Optional[dict[str, Word]] = None,
    *,
    include_word_attrs: bool = False,
) -> str:
    """Serialize TableIR grid into canonical <table><thead>/<tbody> HTML."""
    rows_cells: list[list[CellIR]] = [[] for _ in range(table.nRows)]
    for cell in sorted(table.cells, key=lambda c: (c.r, c.c)):
        if 0 <= cell.r < table.nRows:
            rows_cells[cell.r].append(cell)

    head_rows: list[str] = []
    body_rows: list[str] = []
    in_head = True

    for row in rows_cells:
        if not row:
            continue
        row_is_head = in_head and all(c.role == "th" for c in row)
        if not row_is_head:
            in_head = False
        tds: list[str] = []
        for c in row:
            tag = "th" if c.role == "th" else "td"
            attrs: list[str] = []
            if c.rs > 1:
                attrs.append(f'rowspan="{c.rs}"')
            if c.cs > 1:
                attrs.append(f'colspan="{c.cs}"')
            if include_word_attrs and c.wordIds:
                attrs.append(f'data-word-ids="{html_lib.escape(",".join(c.wordIds))}"')
            attr_s = (" " + " ".join(attrs)) if attrs else ""
            if c.nested:
                inner_parts = []
                txt = cell_plain_text(c, words_by_id)
                if txt:
                    inner_parts.append(f"<p>{html_lib.escape(txt)}</p>")
                for nt in c.nested:
                    inner_parts.append(table_to_html(nt, words_by_id, include_word_attrs=include_word_attrs))
                inner = "".join(inner_parts)
            elif include_word_attrs and words_by_id is not None and c.wordIds:
                inner = " ".join(
                    f'<span data-w="{html_lib.escape(wid)}">{html_lib.escape(words_by_id[wid].text)}</span>'
                    for wid in c.wordIds
                    if wid in words_by_id
                )
            else:
                inner = html_lib.escape(cell_plain_text(c, words_by_id))
            tds.append(f"<{tag}{attr_s}>{inner}</{tag}>")
        tr_html = f"<tr>{''.join(tds)}</tr>"
        if row_is_head:
            head_rows.append(tr_html)
        else:
            body_rows.append(tr_html)

    parts = ["<table>"]
    if head_rows:
        parts.append(f"<thead>{''.join(head_rows)}</thead>")
    if body_rows:
        parts.append(f"<tbody>{''.join(body_rows)}</tbody>")
    parts.append("</table>")
    return "".join(parts)


@dataclass
class _ParsedCell:
    role: str
    rs: int
    cs: int
    text: str
    word_ids: list[str] = field(default_factory=list)
    nested: list["ParsedTableGrid"] = field(default_factory=list)


@dataclass
class ParsedCellIR:
    r: int
    c: int
    rs: int
    cs: int
    role: str
    text: str
    word_ids: list[str] = field(default_factory=list)
    nested: list["ParsedTableGrid"] = field(default_factory=list)


@dataclass
class ParsedTableGrid:
    n_rows: int
    n_cols: int
    cells: list[ParsedCellIR]


class _TableHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[dict[str, object]] = []
        self.tables: list[list[list[_ParsedCell]]] = []
        self.section_stack: list[str] = []
        self.cell_stack: list[dict[str, object]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        t = tag.lower()
        attr_map = {k.lower(): (v or "") for k, v in attrs}
        if t == "table":
            rows: list[list[_ParsedCell]] = []
            if self.cell_stack:
                cur_cell = self.cell_stack[-1]
                cur_cell["sub_tables"].append(rows)  # type: ignore[attr-defined]
            self.tables.append(rows)
            self.stack.append({"rows": rows, "in_head": False})
        elif t == "thead" and self.stack:
            self.stack[-1]["in_head"] = True
        elif t == "tbody" and self.stack:
            self.stack[-1]["in_head"] = False
        elif t == "tr" and self.stack:
            rows = self.stack[-1]["rows"]  # type: ignore[assignment]
            rows.append([])
        elif t in ("td", "th") and self.stack:
            rows = self.stack[-1]["rows"]  # type: ignore[assignment]
            if not rows:
                rows.append([])
            in_head = bool(self.stack[-1]["in_head"])
            role = "th" if (t == "th" or in_head) else "td"
            rs = _parse_span(attr_map.get("rowspan"))
            cs = _parse_span(attr_map.get("colspan"))
            wids = [w.strip() for w in attr_map.get("data-word-ids", "").split(",") if w.strip()]
            cell_ctx: dict[str, object] = {
                "role": role,
                "rs": rs,
                "cs": cs,
                "buf": [],
                "wids": wids,
                "sub_tables": [],
                "table_depth": len(self.stack),
            }
            self.cell_stack.append(cell_ctx)
        elif self.cell_stack and len(self.stack) == self.cell_stack[-1]["table_depth"]:
            if t == "br" or t == "p":
                buf: list[str] = self.cell_stack[-1]["buf"]  # type: ignore[assignment]
                if buf and buf[-1] != "\n":
                    buf.append("\n")
            if "data-w" in attr_map and attr_map["data-w"].strip():
                wids_list: list[str] = self.cell_stack[-1]["wids"]  # type: ignore[assignment]
                wid = attr_map["data-w"].strip()
                if wid not in wids_list:
                    wids_list.append(wid)

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t == "thead" and self.stack:
            self.stack[-1]["in_head"] = False
        elif t in ("td", "th") and self.cell_stack:
            if len(self.stack) == self.cell_stack[-1]["table_depth"]:
                ctx = self.cell_stack.pop()
                rows: list[list[_ParsedCell]] = self.stack[-1]["rows"]  # type: ignore[assignment]
                raw = "".join(ctx["buf"])  # type: ignore[arg-type]
                text = "\n".join(" ".join(line.split()) for line in raw.splitlines()).strip()
                nested_grids = [_rows_to_grid(sub) for sub in ctx["sub_tables"]]  # type: ignore[arg-type]
                rows[-1].append(
                    _ParsedCell(
                        role=str(ctx["role"]),
                        rs=int(ctx["rs"]),  # type: ignore[arg-type]
                        cs=int(ctx["cs"]),  # type: ignore[arg-type]
                        text=text,
                        word_ids=list(ctx["wids"]),  # type: ignore[arg-type]
                        nested=nested_grids,
                    )
                )
        elif t == "table" and self.stack:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if self.cell_stack and self.stack and len(self.stack) == self.cell_stack[-1]["table_depth"]:
            buf: list[str] = self.cell_stack[-1]["buf"]  # type: ignore[assignment]
            buf.append(data)


def _parse_span(val: Optional[str]) -> int:
    try:
        parsed = int(val or "1")
        return max(1, parsed)
    except ValueError:
        return 1


def _rows_to_grid(rows: list[list[_ParsedCell]]) -> ParsedTableGrid:
    non_empty_rows = [r for r in rows if r]
    if not non_empty_rows:
        return ParsedTableGrid(n_rows=0, n_cols=0, cells=[])

    n_rows = len(non_empty_rows)
    occupied: dict[tuple[int, int], bool] = {}
    placed: list[ParsedCellIR] = []
    max_col = 0

    for r_idx, row in enumerate(non_empty_rows):
        c_idx = 0
        for cell in row:
            while occupied.get((r_idx, c_idx), False):
                c_idx += 1
            placed.append(
                ParsedCellIR(
                    r=r_idx,
                    c=c_idx,
                    rs=cell.rs,
                    cs=cell.cs,
                    role=cell.role,
                    text=cell.text,
                    word_ids=cell.word_ids,
                    nested=cell.nested,
                )
            )
            for rr in range(r_idx, r_idx + cell.rs):
                for cc in range(c_idx, c_idx + cell.cs):
                    occupied[(rr, cc)] = True
            max_col = max(max_col, c_idx + cell.cs)
            c_idx += cell.cs

    max_row = max([n_rows] + [cell.r + cell.rs for cell in placed])
    return ParsedTableGrid(n_rows=max_row, n_cols=max_col, cells=placed)


def parse_table_html(html: str) -> ParsedTableGrid:
    """Parse first top-level HTML <table> into explicit (r, c, rs, cs) coordinates."""
    parser = _TableHtmlParser()
    parser.feed(html or "")
    parser.close()
    if not parser.tables:
        return ParsedTableGrid(n_rows=0, n_cols=0, cells=[])
    return _rows_to_grid(parser.tables[0])

