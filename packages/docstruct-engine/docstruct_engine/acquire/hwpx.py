"""HWPX(한글 서식) 파서 — 압축 안의 XML 을 쪽 → 문단 · 표 · 그림 의 중간 모델로 읽는다. 표준 라이브러리만 쓴다.

같은 모델을 두 곳이 쓴다 (쪽 번호가 어긋나지 않게):
- `doc_text`   : 에이전트가 읽는 줄 단위 텍스트
- `hwpx_vdoc`  : 서식을 그대로 옮긴 `.vdoc` 쪽 · 블록 (표의 병합 · 너비 · 테두리 · 배경 · 글자 모양 포함)

쪽은 저장된 레이아웃 정보(문단 첫 줄의 vertpos 가 되돌아감 · 쪽 나눔 표식)로 추정한다.
여러 쪽에 걸친 표 안의 쪽 나눔은 잡히지 않는다 — 그 표는 시작한 쪽에 통째로 들어간다.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from typing import Optional, Union

#: 압축을 푼 본문 XML 크기 상한 (압축 폭탄 방지)
MAX_XML_BYTES = 64 * 1024 * 1024
#: 1 HWPUNIT = 1/7200 inch → CSS px (96dpi)
HU_PER_PX = 75.0
#: 표의 첫 행이 이만큼(본문 높이 비율)만 넘치면 칸 안에서 자르지 않는다
CUT_TOLERANCE = 0.03

_HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
_HH = "{http://www.hancom.co.kr/hwpml/2011/head}"
_HC = "{http://www.hancom.co.kr/hwpml/2011/core}"

_ALIGN = {"LEFT": "left", "CENTER": "center", "RIGHT": "right", "JUSTIFY": "justify", "DISTRIBUTE": "justify",
          "DISTRIBUTE_SPACE": "justify"}
_VALIGN = {"TOP": "top", "CENTER": "middle", "BOTTOM": "bottom"}
_LINE = {"SOLID": "solid", "DASH": "dashed", "DOT": "dotted", "DASH_DOT": "dashed", "DASH_DOT_DOT": "dashed",
         "LONG_DASH": "dashed", "CIRCLE": "dotted", "DOUBLE_SLIM": "double", "SLIM_THICK": "double",
         "THICK_SLIM": "double", "SLIM_THICK_SLIM": "double", "WAVE": "solid", "DOUBLE_WAVE": "double"}


def hu_to_px(value: float) -> float:
    return round(value / HU_PER_PX, 1)


# --- 스타일 (header.xml) ---------------------------------------------------------------------


@dataclass
class CharStyle:
    size_pt: float = 10.0
    bold: bool = False
    italic: bool = False
    underline: bool = False
    color: str = "#000000"
    font: str = ""


@dataclass
class ParaStyle:
    align: str = "left"
    line_pct: int = 160


@dataclass
class BorderFill:
    #: 변 이름(left · right · top · bottom) → CSS border 값 (선 없음은 "none")
    edges: dict[str, str] = field(default_factory=dict)
    background: str = ""


@dataclass
class Styles:
    chars: dict[str, CharStyle] = field(default_factory=dict)
    paras: dict[str, ParaStyle] = field(default_factory=dict)
    fills: dict[str, BorderFill] = field(default_factory=dict)

    def char(self, ref: Optional[str]) -> CharStyle:
        return self.chars.get(ref or "", CharStyle())

    def para(self, ref: Optional[str]) -> ParaStyle:
        return self.paras.get(ref or "", ParaStyle())

    def fill(self, ref: Optional[str]) -> BorderFill:
        return self.fills.get(ref or "", BorderFill())


def _color(value: Optional[str]) -> str:
    """`#RRGGBB` 만 색으로 본다 (`#FFFFFFFF` 같은 8자리는 한글의 '색 없음')."""
    v = (value or "").strip()
    return v.upper() if re.fullmatch(r"#[0-9A-Fa-f]{6}", v) else ""


def _border_css(el: Optional[ET.Element]) -> str:
    if el is None:
        return "none"
    kind = _LINE.get((el.get("type") or "NONE").upper())
    if not kind:
        return "none"
    match = re.match(r"([\d.]+)\s*mm", el.get("width") or "")
    px = float(match.group(1)) * 96 / 25.4 if match else 0.5
    px = max(3, round(px)) if kind == "double" else max(1, round(px))
    return f"{px}px {kind} {_color(el.get('color')) or '#000000'}"


def parse_styles(root: ET.Element) -> Styles:
    styles = Styles()
    fonts: dict[str, str] = {}
    for face in root.iter(f"{_HH}fontface"):
        if (face.get("lang") or "").upper() == "HANGUL":
            for font in face.findall(f"{_HH}font"):
                fonts[font.get("id") or ""] = font.get("face") or ""
    for cp in root.iter(f"{_HH}charPr"):
        ref = cp.find(f"{_HH}fontRef")
        styles.chars[cp.get("id") or ""] = CharStyle(
            size_pt=(int(cp.get("height") or 1000)) / 100.0,
            bold=cp.find(f"{_HH}bold") is not None,
            italic=cp.find(f"{_HH}italic") is not None,
            underline=(cp.find(f"{_HH}underline") is not None
                       and (cp.find(f"{_HH}underline").get("type") or "NONE") != "NONE"),
            color=_color(cp.get("textColor")) or "#000000",
            font=fonts.get(ref.get("hangul") if ref is not None else "", ""),
        )
    for pp in root.iter(f"{_HH}paraPr"):
        align = pp.find(f"{_HH}align")
        spacing = pp.find(f".//{_HH}lineSpacing")
        line_pct = 160
        if spacing is not None and (spacing.get("type") or "").upper() == "PERCENT":
            line_pct = int(spacing.get("value") or 160)
        styles.paras[pp.get("id") or ""] = ParaStyle(
            align=_ALIGN.get((align.get("horizontal") if align is not None else "") or "", "left"),
            line_pct=line_pct,
        )
    for bf in root.iter(f"{_HH}borderFill"):
        edges = {side: _border_css(bf.find(f"{_HH}{side}Border")) for side in ("left", "right", "top", "bottom")}
        brush = bf.find(f".//{_HC}winBrush")
        background = _color(brush.get("faceColor")) if brush is not None else ""
        styles.fills[bf.get("id") or ""] = BorderFill(edges=edges, background=background)
    return styles


# --- 본문 모델 ----------------------------------------------------------------------------------


@dataclass
class Run:
    text: str
    style: CharStyle


@dataclass
class Para:
    runs: list[Run] = field(default_factory=list)
    style: ParaStyle = field(default_factory=ParaStyle)
    #: 첫 줄의 세로 위치 (HWPUNIT — 본문은 쪽 기준, 칸 안 문단은 칸 기준)
    top: Optional[int] = None

    @property
    def text(self) -> str:
        return re.sub(r"[ \t]+", " ", "".join(r.text for r in self.runs)).strip()

    def split_at(self, offsets: list[int]) -> list["Para"]:
        """글자 위치(줄의 textpos)에서 문단을 나눈다 — 문단이 쪽을 넘어갈 때."""
        parts: list[Para] = [Para(style=self.style)]
        cuts = sorted(o for o in offsets if o > 0)
        pos = 0
        for run in self.runs:
            text = run.text
            while cuts and pos + len(text) > cuts[0]:
                k = cuts.pop(0) - pos
                if text[:k]:
                    parts[-1].runs.append(Run(text[:k], run.style))
                parts.append(Para(style=self.style))
                text, pos = text[k:], pos + k
            if text:
                parts[-1].runs.append(Run(text, run.style))
            pos += len(text)
        return [p for p in parts if p.runs] or [self]


@dataclass
class Cell:
    row: int
    col: int
    row_span: int = 1
    col_span: int = 1
    width: int = 0
    height: int = 0
    content: list["Item"] = field(default_factory=list)
    fill: BorderFill = field(default_factory=BorderFill)
    valign: str = "middle"
    #: 칸 안 여백 (HWPUNIT) — left, right, top, bottom
    margin: tuple[int, int, int, int] = (141, 141, 141, 141)
    #: 제목 칸 (쪽이 나뉘면 다음 쪽 머리에 되풀이된다)
    header: bool = False
    #: 앞 쪽에서 이어지는 병합 칸의 나머지 (채울 칸이 아니다)
    continued: bool = False

    @property
    def paras(self) -> list[Para]:
        return [c for c in self.content if isinstance(c, Para)]


@dataclass
class Table:
    rows: int
    cols: int
    width: int
    cells: list[Cell]
    #: 쪽 경계에서 — "CELL"/"TABLE" 나눈다(행 사이 · 넘치면 칸 안 문단 사이), "NONE" 나누지 않는다 (통째로 다음 쪽)
    page_break: str = "CELL"
    repeat_header: bool = False

    def grid(self) -> list[list[Optional[Cell]]]:
        """왼쪽 위 칸에만 Cell, 병합으로 덮인 자리는 None."""
        out: list[list[Optional[Cell]]] = [[None] * self.cols for _ in range(self.rows)]
        for cell in self.cells:
            if 0 <= cell.row < self.rows and 0 <= cell.col < self.cols:
                out[cell.row][cell.col] = cell
        return out

    def column_widths(self) -> list[float]:
        """열 너비(HWPUNIT). 병합 칸만 있는 열은 남는 폭을 나눈다."""
        widths: list[Optional[float]] = [None] * self.cols
        for cell in self.cells:
            if cell.col_span == 1 and cell.width and cell.col < self.cols:
                widths[cell.col] = max(widths[cell.col] or 0, cell.width)
        for _ in range(self.cols):
            changed = False
            for cell in self.cells:
                span = range(cell.col, min(self.cols, cell.col + cell.col_span))
                unknown = [c for c in span if widths[c] is None]
                if len(unknown) == 1 and cell.width:
                    widths[unknown[0]] = max(1.0, cell.width - sum(widths[c] or 0 for c in span if c != unknown[0]))
                    changed = True
            if not changed:
                break
        known = sum(w for w in widths if w)
        missing = [i for i, w in enumerate(widths) if not w]
        if missing:
            rest = max(self.width - known, 1.0 * len(missing))
            for i in missing:
                widths[i] = rest / len(missing)
        return [float(w or 1) for w in widths]

    def row_heights(self) -> list[float]:
        """행 높이(HWPUNIT). 병합 칸으로만 덮인 행은 그 칸의 남는 높이를 나눈다."""
        heights = [0.0] * self.rows
        for cell in self.cells:
            if cell.row_span == 1 and cell.row < self.rows:
                heights[cell.row] = max(heights[cell.row], float(cell.height))
        for cell in self.cells:
            span = range(cell.row, min(self.rows, cell.row + cell.row_span))
            unknown = [r for r in span if not heights[r]]
            if unknown and cell.height:
                rest = max(0.0, cell.height - sum(heights[r] for r in span))
                for r in unknown:
                    heights[r] = rest / len(unknown)
        return heights

    @property
    def height(self) -> float:
        return sum(self.row_heights())

    def header_rows(self) -> int:
        """앞쪽의 제목 행 수 (그 행에서 시작하는 칸이 모두 제목 칸)."""
        count = 0
        for r in range(self.rows):
            anchored = [c for c in self.cells if c.row == r]
            if anchored and all(c.header for c in anchored):
                count += 1
            else:
                break
        return count

    def split(self, first_avail: float, body: float) -> list["Table"]:
        """쪽 경계에서 나눈다 — 행 단위로, 한 행이 남은 높이를 넘으면(쪽 나눔 TABLE) 칸 안 문단 경계에서.
        한글처럼 제목 행은 다음 조각 머리에 되풀이한다."""
        if self.page_break.upper() == "NONE":
            return [self]
        head = self.header_rows() if self.repeat_header else 0
        chunks: list[Table] = []
        cur, avail = self, first_avail
        for _ in range(1000):
            heights = cur.row_heights()
            lead = head if chunks else 0  # 이어지는 조각 머리의 제목 행 뒤에서만 끊는다
            cum, stop = 0.0, None
            for r, h in enumerate(heights):
                if cum + h <= avail:
                    cum += h
                    continue
                if r > lead:  # 행 사이에서 끊을 수 있으면 그렇게 (한글 기본)
                    stop = r
                elif cum + h - avail <= CUT_TOLERANCE * body:
                    cum += h  # 한 줄 남짓 넘치는 것은 저장된 레이아웃 반올림 — 자르지 않는다
                    continue
                else:
                    # 이 쪽 첫 행부터 넘치면 칸 안 문단 사이에서 자른다 — 실측(한글 저장본): CELL · TABLE 모두,
                    # 표 크기(sz height)가 첫 쪽 남은 높이로 줄어 있다
                    cut = cur._cut_row(r, avail - cum)
                    if cut is not None:
                        cur, stop = cut, r + 1
                break
            if stop is None or stop >= cur.rows:
                chunks.append(cur)
                break
            chunks.append(cur._slice(0, stop, 0))
            cur = cur._slice(stop, cur.rows, head if stop >= head else 0)
            avail = body
        return chunks

    def _cut_row(self, r: int, room: float) -> Optional["Table"]:
        """행 r 을 칸 안 문단 경계에서 둘로 (위 조각 높이 ≤ room). 병합이 걸친 행 · 자를 곳이 없으면 None."""
        anchored = [c for c in self.cells if c.row == r]
        if not anchored or any(c.row_span != 1 for c in anchored):
            return None
        if any(c.row < r < c.row + c.row_span for c in self.cells):
            return None
        splits = {id(cell): _divide(cell, room - cell.margin[2] - cell.margin[3]) for cell in anchored}
        if all(not first for first, _ in splits.values()) or all(not rest for _, rest in splits.values()):
            return None
        cells: list[Cell] = []
        for cell in self.cells:
            if cell.row > r:
                cells.append(Cell(**{**cell.__dict__, "row": cell.row + 1}))
            elif cell.row < r:
                cells.append(cell)
            else:
                first, rest = splits[id(cell)]
                cells.append(Cell(**{**cell.__dict__, "content": first, "height": int(room)}))
                cells.append(Cell(**{**cell.__dict__, "row": r + 1, "content": rest,
                                     "height": max(1, int(cell.height - room)), "continued": not rest}))
        return Table(rows=self.rows + 1, cols=self.cols, width=self.width, cells=cells,
                     page_break=self.page_break, repeat_header=self.repeat_header)

    def _slice(self, a: int, b: int, head: int) -> "Table":
        """제목 행 head 개 + 행 [a, b). 조각 경계를 넘는 병합 칸은 글도 경계에서 나눈다 (앞 조각 높이에 들어가는 만큼)."""
        order = list(range(head)) + list(range(a, b))
        new_row = {r: i for i, r in enumerate(order)}
        heights = self.row_heights()

        def part(cell: Cell, boundary: int, upper: bool) -> list[Item]:
            room = sum(heights[cell.row:boundary]) - cell.margin[2] - cell.margin[3]
            first, rest = _divide(cell, room)
            return first if upper else rest

        cells: list[Cell] = []
        for cell in self.cells:
            end = cell.row + cell.row_span
            if cell.row < head:  # 되풀이하는 제목 행
                cells.append(Cell(**{**cell.__dict__, "row": new_row[cell.row], "row_span": min(end, head) - cell.row}))
            elif a <= cell.row < b:
                content = part(cell, b, upper=True) if end > b else cell.content
                cells.append(Cell(**{**cell.__dict__, "row": new_row[cell.row], "row_span": min(end, b) - cell.row,
                                     "content": content}))
            elif cell.row < a < end:  # 앞 조각에서 시작해 이어지는 병합 칸 — 앞에 못 들어간 글을 잇는다
                rest = part(cell, a, upper=False)
                cells.append(Cell(**{**cell.__dict__, "row": new_row[a], "row_span": min(end, b) - a, "content": rest,
                                     "height": max(0, int(cell.height - sum(heights[cell.row:a]))),
                                     "continued": not rest}))
        return Table(rows=len(order), cols=self.cols, width=self.width, cells=cells,
                     page_break=self.page_break, repeat_header=self.repeat_header)


def _divide(cell: Cell, budget: float) -> tuple[list[Item], list[Item]]:
    """칸 글을 쪽 경계에서 둘로 — 저장된 레이아웃에서 칸 안 줄 위치가 되돌아간 곳(한글이 실제로 나눈 곳)이 있으면
    거기서, 없으면 위 조각 높이(budget)에 들어가는 문단까지. 뒤 조각 문단의 줄 위치는 새 쪽 기준으로 옮긴다."""
    content = cell.content
    if not content:
        return [], []
    tops = [getattr(it, "top", None) for it in content]
    # 항목 높이 — 다음 줄 위치와의 차이, 모르면(마지막 · 되돌아감) 한 줄 높이로 어림한다
    heights: list[float] = []
    for i, it in enumerate(content):
        t, nt = tops[i], tops[i + 1] if i + 1 < len(content) else None
        if t is not None and nt is not None and nt > t:
            heights.append(float(nt - t))
        elif isinstance(it, Para):
            size = max((r.style.size_pt for r in it.runs), default=10.0)
            heights.append(size * it.style.line_pct)  # pt × % = HWPUNIT (10pt · 160% → 1600)
        elif isinstance(it, Table):
            heights.append(it.height)
        else:
            heights.append(0.0)
    known = [(i, t) for i, t in enumerate(tops) if t is not None]
    reset = next((i for (_, prev), (i, cur) in zip(known, known[1:]) if cur < prev), None)
    # 한글이 실제로 나눈 곳이 이 경계와 맞으면(앞부분이 들어가면) 그대로 따른다
    if reset is not None and sum(heights[:reset]) <= budget + 1:
        return content[:reset], content[reset:]
    k, used = len(content), 0.0
    for i, h in enumerate(heights):
        if used + h > budget:
            k = i
            break
        used += h
    if k >= len(content):
        return content, []
    shift = next((t for t in tops[k:] if t is not None), 0)
    rest = [Para(**{**it.__dict__, "top": max(0, it.top - shift)}) if isinstance(it, Para) and it.top is not None else it
            for it in content[k:]]
    return content[:k], rest


@dataclass
class Picture:
    ref: str


Item = Union[Para, Table, Picture]


@dataclass
class Page:
    number: int
    items: list[Item] = field(default_factory=list)


@dataclass
class PageSetup:
    width: int = 59528
    height: int = 84186
    #: left, right, top, bottom (HWPUNIT, 머리말 · 꼬리말 높이 포함)
    margin: tuple[int, int, int, int] = (8504, 8504, 5668, 4252)

    @property
    def body_width(self) -> int:
        return max(1, self.width - self.margin[0] - self.margin[1])


@dataclass
class HwpxDoc:
    pages: list[Page]
    styles: Styles
    setup: PageSetup


def _int(value: Optional[str], default: int = 0) -> int:
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


def _t_text(t: ET.Element) -> str:
    parts = [t.text or ""]
    for child in t:
        name = child.tag.rsplit("}", 1)[-1]
        if name == "tab":
            parts.append(" ")
        elif name == "lineBreak":
            parts.append("\n")
        parts.append(child.tail or "")
    return "".join(parts)


class _Reader:
    def __init__(self, styles: Styles) -> None:
        self.styles = styles

    def paragraph(self, p: ET.Element) -> list[Item]:
        """문단 하나 → 항목들. 문단 안의 표 · 그림은 앞뒤 글을 나눈다."""
        out: list[Item] = []
        seg = p.find(f"{_HP}linesegarray/{_HP}lineseg")
        top = _int(seg.get("vertpos")) if seg is not None else None
        cur = Para(style=self.styles.para(p.get("paraPrIDRef")), top=top)
        for run in p.findall(f"{_HP}run"):
            style = self.styles.char(run.get("charPrIDRef"))
            for child in run:
                tag = child.tag
                if tag == f"{_HP}t":
                    cur.runs.append(Run(_t_text(child), style))
                elif tag == f"{_HP}tbl":
                    if cur.runs:
                        out.append(cur)
                    out.append(self.table(child))
                    cur = Para(style=cur.style, top=None)
                elif tag.endswith("}pic"):
                    if cur.runs:
                        out.append(cur)
                    ref = next((el.get("binaryItemIDRef") or "" for el in child.iter()
                                if el.tag.endswith("}img") and el.get("binaryItemIDRef")), "")
                    out.append(Picture(ref))
                    cur = Para(style=cur.style, top=None)
        if cur.runs or not out:
            out.append(cur)
        return out

    def table(self, tbl: ET.Element) -> Table:
        cells: list[Cell] = []
        for r_idx, tr in enumerate(tbl.findall(f"{_HP}tr")):
            for c_idx, tc in enumerate(tr.findall(f"{_HP}tc")):
                addr = tc.find(f"{_HP}cellAddr")
                span = tc.find(f"{_HP}cellSpan")
                size = tc.find(f"{_HP}cellSz")
                margin = tc.find(f"{_HP}cellMargin")
                sub = tc.find(f"{_HP}subList")
                content: list[Item] = []
                for p in (sub.findall(f"{_HP}p") if sub is not None else []):
                    content.extend(self.paragraph(p))
                cells.append(Cell(
                    row=_int(addr.get("rowAddr") if addr is not None else None, r_idx),
                    col=_int(addr.get("colAddr") if addr is not None else None, c_idx),
                    row_span=max(1, _int(span.get("rowSpan") if span is not None else None, 1)),
                    col_span=max(1, _int(span.get("colSpan") if span is not None else None, 1)),
                    width=_int(size.get("width") if size is not None else None),
                    height=_int(size.get("height") if size is not None else None),
                    content=content,
                    fill=self.styles.fill(tc.get("borderFillIDRef")),
                    valign=_VALIGN.get(((sub.get("vertAlign") if sub is not None else "") or "CENTER").upper(), "middle"),
                    margin=tuple(_int(margin.get(k) if margin is not None else None, 141)
                                 for k in ("left", "right", "top", "bottom")),  # type: ignore[arg-type]
                    header=tc.get("header") == "1",
                ))
        rows = max(_int(tbl.get("rowCnt")), max((c.row + c.row_span for c in cells), default=0))
        cols = max(_int(tbl.get("colCnt")), max((c.col + c.col_span for c in cells), default=0))
        size = tbl.find(f"{_HP}sz")
        width = _int(size.get("width") if size is not None else None) or sum(c.width for c in cells if c.row == 0)
        return Table(rows=rows, cols=cols, width=width, cells=cells, page_break=(tbl.get("pageBreak") or "CELL").upper(),
                     repeat_header=tbl.get("repeatHeader") == "1")


def _page_setup(root: ET.Element) -> Optional[PageSetup]:
    page = next(root.iter(f"{_HP}pagePr"), None)
    if page is None:
        return None
    width, height = _int(page.get("width"), 59528), _int(page.get("height"), 84186)
    if (page.get("landscape") or "").upper() == "NARROWLY":  # 한글: NARROWLY = 가로
        width, height = max(width, height), min(width, height)
    m = page.find(f"{_HP}margin")
    get = (lambda k, d: _int(m.get(k), d)) if m is not None else (lambda k, d: d)
    return PageSetup(
        width=width, height=height,
        margin=(get("left", 8504), get("right", 8504), get("top", 5668) + get("header", 0),
                get("bottom", 4252) + get("footer", 0)),
    )


def _section_no(name: str) -> int:
    match = re.search(r"(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def parse(path: str) -> HwpxDoc:
    with zipfile.ZipFile(path) as zf:
        sections = sorted(
            (info for info in zf.infolist() if re.fullmatch(r"Contents/section\d+\.xml", info.filename)),
            key=lambda info: _section_no(info.filename),
        )
        if not sections:
            raise ValueError("hwpx: Contents/section*.xml not found")
        if sum(info.file_size for info in sections) > MAX_XML_BYTES:
            raise ValueError("hwpx: body XML too large")
        try:
            styles = parse_styles(ET.fromstring(zf.read("Contents/header.xml")))
        except KeyError:
            styles = Styles()
        reader = _Reader(styles)
        pages: list[Page] = []
        setup: Optional[PageSetup] = None
        for info in sections:
            root = ET.fromstring(zf.read(info.filename))
            setup = setup or _page_setup(root)
            body = float(max(1, (setup or PageSetup()).height - sum((setup or PageSetup()).margin[2:])))
            pages.append(Page(len(pages) + 1))  # 구역은 새 쪽에서 시작한다
            prev: Optional[int] = None
            for p in root.findall(f"{_HP}p"):
                segs = [(_int(s.get("textpos")), _int(s.get("vertpos"))) for s in p.findall(f"{_HP}linesegarray/{_HP}lineseg")]
                first = segs[0][1] if segs else None
                if prev is not None and (p.get("pageBreak") == "1" or (first is not None and first < prev)):
                    pages.append(Page(len(pages) + 1))
                prev = segs[-1][1] if segs else prev
                items = reader.paragraph(p)
                # 문단 안에서 줄 위치가 되돌아가면 그 줄부터 다음 쪽이다 (긴 문단이 쪽을 넘어감)
                cuts = [b[0] for a, b in zip(segs, segs[1:]) if b[1] < a[1]]
                if cuts and len(items) == 1 and isinstance(items[0], Para):
                    parts = items[0].split_at(cuts)
                    pages[-1].items.append(parts[0])
                    for part in parts[1:]:
                        pages.append(Page(len(pages) + 1))
                        pages[-1].items.append(part)
                    continue
                for item in items:
                    if not isinstance(item, Table):
                        pages[-1].items.append(item)
                        continue
                    top = float(first or 0)
                    if item.page_break == "NONE" and top > 0 and top + item.height > body:
                        pages.append(Page(len(pages) + 1))  # 나누지 않는 표는 통째로 다음 쪽
                        top = 0.0
                    chunks = item.split(body - top, body)
                    pages[-1].items.append(chunks[0])
                    for chunk in chunks[1:]:
                        pages.append(Page(len(pages) + 1))
                        pages[-1].items.append(chunk)
                    if len(chunks) > 1 or top == 0.0 and first:
                        prev = 0  # 다음 문단의 줄 위치는 새 쪽 기준이다
    return HwpxDoc(pages=pages, styles=styles, setup=setup or PageSetup())


def item_text(item: Item) -> str:
    """항목의 글 (표는 칸 글을 공백으로 잇는다) — 범위 찾기 · 목록 미리보기용."""
    if isinstance(item, Para):
        return item.text
    if isinstance(item, Table):
        return " ".join(t for t in (" ".join(item_text(c) for c in cell.content).strip() for cell in item.cells) if t)
    return ""
