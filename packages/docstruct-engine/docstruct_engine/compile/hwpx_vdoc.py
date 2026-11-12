"""HWPX -> .vdoc builder (delegated through DocIR + docstruct_vdoc)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from .. import _packs as packs
from ..acquire import hwpx
from ..acquire import hwpx_ir as docstruct_hwpx
from . import docstruct_vdoc

BLOCK_GAP = docstruct_vdoc.BLOCK_GAP


@dataclass
class PageReport:
    source: int
    paragraphs: int = 0
    tables: int = 0
    fill_cells: int = 0
    pictures: int = 0


@dataclass
class BuildResult:
    pages: list[dict[str, Any]] = field(default_factory=list)
    slots: dict[str, dict[str, Any]] = field(default_factory=dict)
    reports: list[PageReport] = field(default_factory=list)


def parse_numbers(spec: Any) -> list[int]:
    """Parse page specifier string/iterable (e.g. '1, 3-5, p7') into ordered unique 1-based page ints."""
    if spec is None:
        return []
    if isinstance(spec, int):
        return [spec] if spec > 0 else []
    if isinstance(spec, (list, tuple, set)):
        out: list[int] = []
        seen: set[int] = set()
        for item in spec:
            for n in parse_numbers(item):
                if n not in seen:
                    seen.add(n)
                    out.append(n)
        return out

    raw = str(spec).strip()
    if not raw:
        return []
    out = []
    seen = set()
    for part in re.split(r"[\s,;]+", raw):
        token = part.strip().lower().lstrip("p")
        if not token:
            continue
        m_range = re.fullmatch(r"(\d+)\s*[-~]\s*p?(\d+)", token)
        if m_range:
            a, b = int(m_range.group(1)), int(m_range.group(2))
            step = 1 if a <= b else -1
            for n in range(a, b + step, step):
                if n > 0 and n not in seen:
                    seen.add(n)
                    out.append(n)
            continue
        if token.isdigit():
            n = int(token)
            if n > 0 and n not in seen:
                seen.add(n)
                out.append(n)
    return out


def page_summary(page: hwpx.Page, width: int = 70) -> str:
    """Short preview string for a parsed HWPX page."""
    snippets: list[str] = []
    tables = 0
    empty_cells = 0
    for it in page.items:
        txt = hwpx.item_text(it).strip()
        if txt:
            snippets.append(txt)
        if isinstance(it, hwpx.Table):
            tables += 1
            for cell in it.cells:
                if not cell.continued and not " ".join(hwpx.item_text(c) for c in cell.content).strip():
                    empty_cells += 1
    body = " / ".join(snippets)
    if len(body) > width:
        body = body[: max(1, width - 1)].rstrip() + "…"
    parts = [body] if body else []
    if tables:
        parts.append(f"tables {tables}")
    if empty_cells:
        parts.append(f"empty cells {empty_cells}")
    return " · ".join(parts)


def labels() -> dict[str, str]:
    data = packs.data("resource:index/lexicon.ko.json")
    return dict(data.get("docText") or {})


def build_pages(
    doc: hwpx.HwpxDoc,
    numbers: list[int],
    *,
    start_at: str = "",
    end_before: str = "",
    uid: Callable[[], str],
    first_page_number: int = 1,
) -> BuildResult:
    """Convert selected HWPX pages via DocIR + docstruct_vdoc while preserving full field parity."""
    doc_ir = docstruct_hwpx.hwpx_doc_to_ir(
        doc,
        numbers,
        start_at=start_at,
        end_before=end_before,
    )
    pages, slots, compiled_reports = docstruct_vdoc.doc_ir_pages_to_vdoc(
        doc_ir.pages,
        uid=uid,
        first_page_number=first_page_number,
    )
    reports = [
        PageReport(
            source=r.source,
            paragraphs=r.paragraphs,
            tables=r.tables,
            fill_cells=r.fill_cells,
            pictures=r.pictures,
        )
        for r in compiled_reports
    ]
    return BuildResult(pages=pages, slots=slots, reports=reports)
