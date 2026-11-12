"""오피스 문서(바이너리 압축 서식) → 줄 단위 텍스트 렌더. 표준 라이브러리만 쓴다.

에이전트(agy)는 터미널이 막혀 있어 압축을 풀 수 없고, 리소스 인입도 텍스트 형식만 읽는다.
그래서 서식 파일을 PDF 정규화와 같은 모양의 텍스트로 한 번 렌더해 두고 양쪽이 같은 결과를 쓴다:
- 리소스 인입(`ingest`)은 `render()` 결과를 원문 텍스트로 색인한다.
- vibefs 색인 · 훅은 `derived_path()` 의 캐시 파일을 읽고, agy 의 `read_file` 을 그 파일로 돌린다.

렌더 규칙 (PDF 정규화와 맞춘다):
- 쪽 시작마다 `<!-- page N -->` 줄. 쪽 번호는 `hwpx.parse` 의 추정 쪽 = `dc_import` 의 원문 쪽 번호와 같다.
- 표는 `[표 pN-K]` 줄 + 마크다운 표. 병합 칸은 왼쪽 위 칸에만 글을 두고 나머지는 비운다.
  칸 안 줄바꿈은 `<br>`, 칸 안의 표는 행마다 ` · ` 로 이은 줄로 접는다.
- 한 줄짜리 짧은 표(장 제목 상자)는 `#` 제목 줄로 바꾼다.
- 짧은 문단 중 번호 제목 패턴(리소스 팩 어휘 `pdfHeading`)은 `#` 제목 줄로.
- 그림은 `![이미지 N](<형식>-image:<참조>)` 줄.

새 형식은 `CONVERTERS` 에 렌더 함수 하나를 더한다.
"""
from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from .. import _packs as packs
from . import hwpx

#: 렌더 규칙이 바뀌면 올린다 — 캐시 파일이 새로 만들어진다
VERSION = "7"
#: 장 제목 상자로 볼 한 줄 표의 글자 수 상한
BANNER_MAX_CHARS = 40
#: 번호 제목 패턴을 적용할 문단 길이 상한
HEADING_MAX_CHARS = 60

_LEX = "resource:index/lexicon.ko.json"


@dataclass
class Rendered:
    text: str
    #: `<!-- page N -->` 줄의 1부터 세는 줄 번호
    page_starts: list[int] = field(default_factory=list)
    title: str = ""
    kind: str = ""


def labels() -> dict:
    """표 · 그림 줄 표기 · 장 표지 글자 · 원문 쪽 이름 — 리소스 팩 어휘 (`docText`)."""
    return packs.data(_LEX)["docText"]


def heading_level(line: str) -> int:
    # 번호만 있는 줄(`2026. 8.`)은 제목이 아니다
    if not any(ch.isalpha() for ch in line):
        return 0
    match = packs.compile_rx(packs.data(_LEX)["pdfHeading"]).match(line.strip())
    if not match:
        return 0
    if match.group(1):
        return 1 if any(k in match.group(1) for k in labels()["chapterMarks"]) else 2
    if match.group(2):
        return min(1 + match.group(2).strip(".").count("."), 4)
    if match.group(3):
        return 1
    return 3


def _cell(text: str) -> str:
    return text.replace("|", "\\|").strip()


# --- HWPX ------------------------------------------------------------------------------


def _cell_text(content: list[hwpx.Item]) -> str:
    """칸 안 항목 → 한 줄 글 (문단은 `<br>`, 칸 안의 표는 행마다 ` · ` 로 접는다)."""
    out: list[str] = []
    for item in content:
        if isinstance(item, hwpx.Para):
            text = item.text.replace("\n", "<br>")
            if text:
                out.append(text)
        elif isinstance(item, hwpx.Table):
            for row in _grid_text(item):
                line = " · ".join(c for c in row if c)
                if line:
                    out.append(line)
    return "<br>".join(out)


def _grid_text(table: hwpx.Table) -> list[list[str]]:
    rows = [[_cell(_cell_text(c.content)) if c else "" for c in row] for row in table.grid()]
    return [row for row in rows if any(row)]


class _HwpxText:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.page_starts: list[int] = []
        self.images = 0

    def page(self, page: hwpx.Page) -> None:
        if self.lines and self.lines[-1] != "":
            self.lines.append("")
        self.page_starts.append(len(self.lines) + 1)
        self.lines.append(f"<!-- page {page.number} -->")
        tables = 0
        for item in page.items:
            if isinstance(item, hwpx.Para):
                for line in item.text.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    level = heading_level(line) if len(line) <= HEADING_MAX_CHARS else 0
                    self.lines.append(f"{'#' * level} {line}" if level else line)
            elif isinstance(item, hwpx.Picture):
                self.images += 1
                alt = labels()["imageLabel"].format(n=self.images)
                self.lines.append(f"![{alt}](hwpx-image:{item.ref})")
            elif isinstance(item, hwpx.Table):
                grid = _grid_text(item)
                if not grid:
                    continue
                joined = " ".join(c for row in grid for c in row if c)
                if item.rows == 1 and len(joined) <= BANNER_MAX_CHARS and "<br>" not in joined:
                    self.lines.append(f"# {joined}")
                    continue
                tables += 1
                width = max(len(r) for r in grid)
                rows = [r + [""] * (width - len(r)) for r in grid]
                self.lines.append("")
                self.lines.append(labels()["tableLabel"].format(page=page.number, n=tables))
                self.lines.append("| " + " | ".join(rows[0]) + " |")
                self.lines.append("|" + "---|" * width)
                for row in rows[1:]:
                    self.lines.append("| " + " | ".join(row) + " |")
                self.lines.append("")


def render_hwpx(path: str) -> Rendered:
    out = _HwpxText()
    for page in hwpx.parse(path).pages:
        out.page(page)
    # 문서 속성의 제목은 서식을 베껴 쓰며 남은 옛 값인 경우가 많다 — 파일 이름이 더 믿을 만하다
    return Rendered(
        text="\n".join(out.lines) + "\n",
        page_starts=out.page_starts,
        title=os.path.splitext(os.path.basename(path))[0],
        kind="hwpx",
    )


def _table_grid_from_ir(tbl: Any) -> list[list[str]]:
    grid = [[""] * tbl.nCols for _ in range(tbl.nRows)]
    for c in tbl.cells:
        if 0 <= c.r < tbl.nRows and 0 <= c.c < tbl.nCols:
            grid[c.r][c.c] = _cell(c.text or "")
    return grid


def render_pdf(path: str) -> Rendered:
    import sys

    from docstruct_engine.acquire.ocr import WindowsOcrAdapter
    from docstruct_engine.build import build_doc_ir
    from docstruct_engine.ir.model import (
        FieldBlock,
        FigureBlock,
        HeadingBlock,
        ListItemBlock,
        TableIR,
    )

    ocr_port = WindowsOcrAdapter() if sys.platform == "win32" else None
    doc_ir = build_doc_ir(
        path,
        cache_root=derived_dir(),
        ocr_port=ocr_port,
        render_png=False,
    )

    lbls = labels()
    lines: list[str] = []
    page_starts: list[int] = []
    images = 0

    for page in doc_ir.pages:
        if lines and lines[-1] != "":
            lines.append("")
        page_starts.append(len(lines) + 1)
        lines.append(f"<!-- page {page.pageIndex} -->")
        by_id = {b.id: b for b in page.blocks}
        words_by_id = {w.id: w for w in page.words}
        order = page.readingOrder or [b.id for b in page.blocks]
        tables = 0

        for bid in order:
            blk = by_id.get(bid)
            if blk is None:
                continue
            if isinstance(blk, FigureBlock):
                images += 1
                alt = blk.alt or lbls["imageLabel"].format(n=images)
                lines.append(f"![{alt}](pdf-image:{page.pageIndex}-{blk.id})")
            elif isinstance(blk, TableIR):
                grid = _table_grid_from_ir(blk)
                if not grid:
                    continue
                tables += 1
                width = max(len(r) for r in grid)
                rows = [r + [""] * (width - len(r)) for r in grid]
                lines.append("")
                lines.append(lbls["tableLabel"].format(page=page.pageIndex, n=tables))
                lines.append("| " + " | ".join(rows[0]) + " |")
                lines.append("|" + "---|" * width)
                for row in rows[1:]:
                    lines.append("| " + " | ".join(row) + " |")
                lines.append("")
            elif isinstance(blk, HeadingBlock):
                txt = (blk.text or "").strip()
                if not txt:
                    txt = " ".join(words_by_id[w].text for w in blk.wordIds if w in words_by_id).strip()
                if txt:
                    lvl = max(1, min(6, blk.level))
                    lines.append(f"{'#' * lvl} {txt}")
            elif isinstance(blk, ListItemBlock):
                txt = (blk.text or "").strip() or " ".join(
                    words_by_id[w].text for w in blk.wordIds if w in words_by_id
                ).strip()
                if txt:
                    lines.append("  " * blk.indentLevel + " ".join(txt.splitlines()))
            elif isinstance(blk, FieldBlock):
                txt = (blk.text or "").strip() or f"{blk.label}: {blk.placeholder}".strip(": ")
                if txt:
                    lines.append(txt)
            else:
                txt = getattr(blk, "text", None) or " ".join(
                    words_by_id[w].text for w in getattr(blk, "wordIds", []) if w in words_by_id
                )
                for raw_line in (txt or "").split("\n"):
                    s = raw_line.strip()
                    if s:
                        lines.append(s)

    return Rendered(
        text="\n".join(lines) + "\n",
        page_starts=page_starts,
        title=os.path.splitext(os.path.basename(path))[0],
        kind="pdf",
    )


#: 확장자 → 렌더 함수
CONVERTERS: dict[str, Callable[[str], Rendered]] = {
    ".hwpx": render_hwpx,
    ".pdf": render_pdf,
}


def convertible(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in CONVERTERS


def render(path: str) -> Rendered:
    fn = CONVERTERS.get(os.path.splitext(path)[1].lower())
    if fn is None:
        raise ValueError(f"cannot render as text: {path}")
    return fn(path)


# --- 렌더 캐시 (vibefs 색인 · 훅이 같은 파일을 본다) ---------------------------------------


def derived_dir() -> str:
    return os.environ.get("VIBE_DERIVED_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "vibedocstudio", "derived")


def derived_path(path: str) -> Optional[str]:
    """서식 파일 → 렌더한 텍스트 캐시 파일 경로 (없으면 만든다). 렌더할 수 없으면 None."""
    if not convertible(path):
        return None
    try:
        src = os.path.abspath(path)
        st = os.stat(src)
        key = hashlib.sha1(f"{VERSION}|{os.path.normcase(src)}|{st.st_mtime_ns}|{st.st_size}".encode("utf-8")).hexdigest()[:16]
        stem = re.sub(r"[^\w.\-]+", "_", os.path.splitext(os.path.basename(src))[0])[:60]
        out = os.path.join(derived_dir(), f"{stem}.{key}.md")
        if not os.path.isfile(out):
            rendered = render(src)
            os.makedirs(derived_dir(), exist_ok=True)
            tmp = f"{out}.{os.getpid()}.tmp"
            with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(rendered.text)
            with open(f"{out}.src", "w", encoding="utf-8") as fh:
                fh.write(src)
            os.replace(tmp, out)
        return out
    except Exception:  # 손상 · 암호 · 형식 오류는 "읽을 수 없는 파일" 로 둔다
        return None


def source_of(path: str) -> Optional[str]:
    """렌더 캐시 파일 → 원본 서식 파일 경로. 캐시 파일이 아니면 None."""
    try:
        base = os.path.normcase(os.path.abspath(derived_dir()))
        p = os.path.normcase(os.path.abspath(path))
        if not p.startswith(base + os.sep):
            return None
        with open(f"{os.path.abspath(path)}.src", encoding="utf-8") as fh:
            return fh.read().strip() or None
    except OSError:
        return None
