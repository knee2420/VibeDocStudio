"""`.vdoc` 블록 짓기 — 에이전트 · 서버가 블록 종류 정의(`@vibe/vdoc-schema` block-kit)와 같은 모양의 블록을 만든다.

표준 라이브러리만 쓴다 (vibefs MCP 서버가 가볍게 import 한다). 블록 모양의 정본은 TypeScript 정의이고
여기는 그 모양을 그대로 따르는 생성기다 — 새 종류를 더하면 `KINDS` 에 생성기 하나를 더한다.

    make_block(kind, spec, uid) -> (block, slots)
    sanitize_html(html)          -> 슬롯에 넣어도 되는 HTML (문단 · 목록 · 굵게 · 기울임 · 밑줄 · 색 · 형광펜 · 링크)
    drain_dropped()              -> 직전 정리에서 지운 태그 · 속성 (도구 결과에 보고한다 — 조용히 지우지 않는다)
"""
from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser
from typing import Any, Callable

from .. import _packs as packs


def _label(key: str, **values: Any) -> str:
    return packs.message("editor:messages.json", f"compose.labels.{key}", **values)

# --- HTML 정리 ------------------------------------------------------------------------------------

_ALLOWED = {"p", "br", "strong", "b", "em", "i", "u", "s", "span", "mark", "a", "ul", "ol", "li", "sup", "code"}
_VOID = {"br"}
_STYLE_PROPS = {"color", "background-color", "background", "font-weight", "font-size", "text-decoration"}
_COLOR_VALUE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]{3,20})$")
_SIZE_VALUE = re.compile(r"^\d{1,2}(\.\d)?px$")

#: 정리하며 지운 태그 · 스타일 속성 (이름 → 횟수). 도구가 작업마다 `drain_dropped()` 로 꺼내 결과에 적는다.
_DROPPED: dict[str, int] = {}
#: 지워도 보고하지 않는 무해한 래퍼 (뜻이 없는 껍데기)
_QUIET_DROPS = {"font", "section", "article", "header", "footer", "main", "body", "html", "head", "meta"}


def _drop(name: str) -> None:
    if name not in _QUIET_DROPS:
        _DROPPED[name] = _DROPPED.get(name, 0) + 1


def drain_dropped() -> dict[str, int]:
    out = dict(_DROPPED)
    _DROPPED.clear()
    return out


def contains_table(raw: Any) -> bool:
    return bool(re.search(r"<\s*(table|tr|td|th)\b", str(raw or ""), re.I))


# --- 이름 있는 문단 스타일 (editor 팩 paragraph-styles.json) ----------------------------------------

_STYLE_CACHE: dict[str, Any] = {}


def _paragraph_styles() -> tuple[set[str], list[tuple[str, re.Pattern[str]]]]:
    """(쓸 수 있는 스타일 id, 첫머리 기호 → 스타일 자동 지정 규칙). 규칙은 레지스트리 순서대로 처음 맞는 것."""
    if "ids" not in _STYLE_CACHE:
        reg = packs.data("editor:paragraph-styles.json")
        ids: set[str] = set()
        rules: list[tuple[str, re.Pattern[str]]] = []
        default = reg.get("default")
        for set_name, s in (reg.get("sets") or {}).items():
            for sid, spec in (s.get("styles") or {}).items():
                ids.add(sid)
                if set_name == default:
                    rules += [(sid, re.compile(p)) for p in spec.get("match") or []]
        _STYLE_CACHE["ids"], _STYLE_CACHE["rules"] = ids, rules
    return _STYLE_CACHE["ids"], _STYLE_CACHE["rules"]


_PARA = re.compile(r"<p((?:\s[^>]*)?)>(.*?)</p>", re.S)


def _lead_text(inner: str) -> str:
    return html_lib.unescape(re.sub(r"<[^>]+>", "", inner)).lstrip("  \t")


def _style_for(inner: str) -> str | None:
    text = _lead_text(inner)
    for sid, rx in _paragraph_styles()[1]:
        if rx.search(text):
            return sid
    return None


def assign_paragraph_styles(body: str) -> str:
    """스타일 없는 문단이 글머리 기호(❏ ○ - ※ 가. (1) …)로 시작하면 그 기호의 스타일을 붙인다 —
    기호는 글자로 남고, 들여쓰기 · 내어쓰기 · 간격은 스타일(CSS)이 맡는다."""
    def fix(m: re.Match[str]) -> str:
        attrs, inner = m.group(1), m.group(2)
        if "data-style=" in attrs:
            return m.group(0)
        # 한 문단에 <br> 로 이어 쓴 개조식 줄들은 줄마다 문단으로 나눠 단계별 스타일을 붙인다
        parts = [p for p in re.split(r"<br\s*/?>", inner) if _lead_text(p).strip()]
        if len(parts) > 1 and sum(1 for p in parts if _style_for(p)) >= len(parts) - 1:
            out = []
            for p in parts:
                sid = _style_for(p)
                out.append(f'<p{attrs} data-style="{sid}">{p.strip()}</p>' if sid else f"<p{attrs}>{p.strip()}</p>")
            return "".join(out)
        sid = _style_for(inner)
        return f'<p{attrs} data-style="{sid}">{inner}</p>' if sid else m.group(0)
    return _PARA.sub(fix, body)


def unstyled_marker_paragraphs(html: str) -> int:
    """글머리 기호로 시작하는데 스타일이 없는 문단 수 (점검용)."""
    return sum(1 for m in _PARA.finditer(str(html or "")) if "data-style=" not in m.group(1) and _style_for(m.group(2)))


def _clean_style(style: str) -> str:
    out = []
    for part in (style or "").split(";"):
        if ":" not in part:
            continue
        prop, value = (x.strip() for x in part.split(":", 1))
        prop = prop.lower()
        if prop not in _STYLE_PROPS:
            if prop not in ("margin", "margin-top", "margin-bottom", "padding", "display", "width"):
                _drop(f"style:{prop}")
            continue
        if prop in ("color", "background-color", "background") and not _COLOR_VALUE.match(value):
            continue
        if prop == "background":
            prop = "background-color"
        if prop == "font-size" and not _SIZE_VALUE.match(value):
            continue
        if prop == "font-weight" and value not in ("bold", "600", "700", "800"):
            continue
        out.append(f"{prop}: {value}")
    return "; ".join(out)


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []
        self.skip = 0  # <script> · <style> 안의 글은 버린다

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in ("script", "style", "iframe", "object"):
            self.skip += 1
            return
        if tag == "b":
            tag = "strong"
        elif tag == "i":
            tag = "em"
        elif tag in ("h1", "h2", "h3", "h4", "div"):
            tag = "p"
        if tag not in _ALLOWED:
            _drop(tag)
            return
        kept = []
        for name, value in attrs:
            name = (name or "").lower()
            if name == "style" and tag in ("span", "mark", "p", "strong", "em"):
                style = _clean_style(value or "")
                if style:
                    kept.append(f' style="{html_lib.escape(style, quote=True)}"')
            elif name == "href" and tag == "a" and re.match(r"^(https?://|vdoc:|#)", value or ""):
                kept.append(f' href="{html_lib.escape(value or "", quote=True)}"')
            elif name.startswith("data-") and tag == "sup":
                kept.append(f' {name}="{html_lib.escape(value or "", quote=True)}"')
            elif name == "data-style" and tag == "p":
                if (value or "") in _paragraph_styles()[0]:
                    kept.append(f' data-style="{value}"')
                else:
                    _drop(f"data-style:{value}")
        if tag == "mark" and not any("style" in k for k in kept):
            kept.append(' style="background-color: #fff3a3"')
        self.out.append(f"<{tag}{''.join(kept)}>")
        if tag not in _VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ("script", "style", "iframe", "object"):
            self.skip = max(0, self.skip - 1)
            return
        tag = {"b": "strong", "i": "em", "h1": "p", "h2": "p", "h3": "p", "h4": "p", "div": "p"}.get(tag, tag)
        if tag not in _ALLOWED or tag in _VOID or tag not in self.stack:
            return
        while self.stack:
            top = self.stack.pop()
            self.out.append(f"</{top}>")
            if top == tag:
                break

    def handle_data(self, data: str) -> None:
        if self.skip:
            return
        self.out.append(html_lib.escape(data, quote=False))


def sanitize_html(raw: str) -> str:
    """슬롯 본문으로 넣어도 되는 HTML. 맨 글자는 문단으로 감싸고, 줄바꿈 두 번은 문단을 나눈다."""
    text = str(raw or "").strip()
    if not text:
        return "<p></p>"
    if "<" not in text:
        # 맨 글자: 빈 줄은 문단을 나누고, 글머리 기호로 시작하는 줄은 줄마다 문단이 된다 (❏ · ○ · - 개조식)
        paras: list[str] = []
        for block in (p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()):
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
            if len(lines) > 1 and sum(1 for ln in lines if _style_for(html_lib.escape(ln))) >= len(lines) - 1:
                paras += lines
            else:
                paras.append(block)
        body = "".join(f"<p>{html_lib.escape(p).replace(chr(10), '<br>')}</p>" for p in paras) or "<p></p>"
        return assign_paragraph_styles(body)
    parser = _Sanitizer()
    parser.feed(text)
    parser.close()
    while parser.stack:
        parser.out.append(f"</{parser.stack.pop()}>")
    body = "".join(parser.out).strip()
    if not re.match(r"^<(p|ul|ol)[\s>]", body):
        body = f"<p>{body}</p>"
    return assign_paragraph_styles(body)


def inline_text(raw: str) -> str:
    """제목처럼 한 줄 글 — 태그를 걷어 낸 글을 한 문단으로."""
    plain = re.sub(r"<[^>]+>", "", str(raw or ""))
    return " ".join(html_lib.unescape(plain).split())


# --- 쪽 ---------------------------------------------------------------------------------------------

#: 지면별 쪽 모양. scroll(블로그) 은 높이가 내용 따라 늘어나므로 pageRect.height 는 최소 높이다.
SURFACE_PAGE: dict[str, dict[str, Any]] = {
    "paged": {"width": 794, "height": 1123, "margin": None, "blockGap": None},
    "scroll": {"width": 720, "height": 360, "margin": {"top": 40, "right": 48, "bottom": 40, "left": 48}, "blockGap": 18},
}


def blank_page(page_id: str, page_number: int, *, surface: str = "paged", surface_width: int | None = None,
               label: str = "") -> tuple[dict[str, Any], dict[str, Any]]:
    """빈 쪽 하나와 그 머리말 · 꼬리말 슬롯. scroll 지면은 머리말 · 꼬리말 없이 한 단."""
    spec = SURFACE_PAGE.get(surface, SURFACE_PAGE["paged"])
    width = int(surface_width or spec["width"])
    header_id, footer_id = f"{page_id}_header", f"{page_id}_footer"
    page: dict[str, Any] = {
        "pageId": page_id,
        "pageNumber": page_number,
        "pageLabel": label or _label("page", n=page_number),
        "headerSlotId": header_id,
        "footerSlotId": footer_id,
        "blocks": [],
        "pageRect": {"width": width, "height": spec["height"], "unit": "px"},
    }
    if surface == "scroll":
        page["hideHeaderFooter"] = True
        page["layout"] = {"margin": dict(spec["margin"]), "blockGap": spec["blockGap"], "fontSize": "15px", "lineHeight": "1.8"}
    slots = {
        header_id: {"slotId": header_id, "label": _label("header"), "role": "editable-slot", "content": "", "backDataRefs": []},
        footer_id: {"slotId": footer_id, "label": _label("footer"), "role": "editable-slot", "content": "", "backDataRefs": []},
    }
    return page, slots


# --- 블록 생성기 ----------------------------------------------------------------------------------

def _slot(slots: dict[str, Any], slot_id: str, label: str, content: str, refs: list[str] | None = None) -> str:
    slots[slot_id] = {"slotId": slot_id, "label": label, "role": "editable-slot", "content": content,
                      "backDataRefs": list(refs or [])}
    return slot_id


def _align(value: Any, default: str) -> str:
    return value if value in ("left", "center", "right") else default


def _px(value: Any, default: str) -> str:
    if isinstance(value, (int, float)):
        return f"{int(value)}px"
    v = str(value or "").strip()
    return v if re.match(r"^\d+(\.\d+)?(px|%)$", v) else default


def _heading(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    slots: dict[str, Any] = {}
    text = inline_text(spec.get("text") or spec.get("html") or "")
    if not text:
        raise ValueError("heading 은 text 가 필요하다.")
    sid = _slot(slots, f"s_hd_{uid}", _label("heading"), f"<p>{html_lib.escape(text)}</p>")
    block: dict[str, Any] = {"blockId": f"b_hd_{uid}", "kind": "heading", "title": text[:32], "slotId": sid,
                             "level": int(spec.get("level") or 2), "align": _align(spec.get("align"), "left")}
    if spec.get("decoration") in ("quote", "bar"):
        block["decoration"] = spec["decoration"]
    if spec.get("accent"):
        block["accent"] = str(spec["accent"])[:24]
    return block, slots


def reject_table_html(raw: Any) -> None:
    """글 칸에 표 HTML 이 오면 저장하지 않고 표 블록을 쓰라고 돌려보낸다 (정리하면 표가 납작한 줄글이 된다)."""
    if contains_table(raw):
        raise ValueError(packs.message("editor:messages.json", "compose.tableInText"))


def _text(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    slots: dict[str, Any] = {}
    reject_table_html(spec.get("html") or spec.get("text"))
    content = sanitize_html(spec.get("html") or spec.get("text") or "")
    sid = _slot(slots, f"s_tx_{uid}", str(spec.get("label") or _label("body"))[:20], content, spec.get("backDataRefs"))
    return {"blockId": f"b_tx_{uid}", "kind": "text", "title": inline_text(content)[:32] or _label("body"), "slotId": sid,
            "align": _align(spec.get("align"), "left")}, slots


def _image(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    src = str(spec.get("src") or "").strip()
    if not src:
        raise ValueError("image 는 src 가 필요하다 (resource:<resourceId>).")
    block: dict[str, Any] = {"blockId": f"b_img_{uid}", "kind": "image", "title": str(spec.get("alt") or spec.get("caption") or _label("photo"))[:32],
                             "src": src, "alt": str(spec.get("alt") or spec.get("caption") or "")[:120],
                             "width": _px(spec.get("width"), "100%"), "align": _align(spec.get("align"), "center"),
                             "objectFit": "contain"}
    if spec.get("maxHeight"):
        block["maxHeight"] = _px(spec.get("maxHeight"), "560px")
    if spec.get("caption"):
        block["caption"] = inline_text(spec["caption"])[:120]
    return block, {}


def _gallery(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    images = spec.get("images") or []
    if isinstance(images, str):
        images = [x.strip() for x in images.split(",") if x.strip()]
    images = [i if isinstance(i, dict) else {"src": str(i)} for i in images]
    images = [i for i in images if str(i.get("src") or "").strip()]
    if not 2 <= len(images) <= 4:
        raise ValueError("gallery 는 사진 2~4장 (images: [resource:<id>, …]).")
    height = _px(spec.get("height") or spec.get("maxHeight"), "260px")
    widths = spec.get("widths") or ["1fr"] * len(images)
    widths = [str(w) for w in widths][: len(images)] + ["1fr"] * max(0, len(images) - len(widths))
    columns = [{"image": {"src": str(i["src"]).strip(), "alt": str(i.get("alt") or "")[:120], "width": "100%",
                          "height": height, "maxHeight": height, "align": "center", "objectFit": "cover"}}
               for i in images]
    return {"blockId": f"b_gal_{uid}", "kind": "columns-grid", "title": _label("gallery", count=len(images)), "widths": widths,
            "cardStyle": "plain", "gap": int(spec.get("gap") if spec.get("gap") is not None else 4), "columns": columns}, {}


def _link_card(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    slots: dict[str, Any] = {}
    title = inline_text(spec.get("title") or "")
    if not title:
        raise ValueError("link-card 는 title 이 필요하다.")
    desc = inline_text(spec.get("description") or "")
    content = f"<p><strong>{html_lib.escape(title)}</strong></p>" + (f"<p>{html_lib.escape(desc)}</p>" if desc else "")
    sid = _slot(slots, f"s_lnk_{uid}", _label("linkCard"), content)
    block: dict[str, Any] = {"blockId": f"b_lnk_{uid}", "kind": "link-card", "title": title[:32], "slotId": sid,
                             "url": str(spec.get("url") or ""), "layout": spec.get("layout") if spec.get("layout") in ("thumb-top", "thumb-left") else "thumb-top",
                             "width": _px(spec.get("width"), "72%")}
    if spec.get("thumbnail"):
        block["thumbnail"] = str(spec["thumbnail"])
    if spec.get("domain"):
        block["domain"] = str(spec["domain"])[:60]
    return block, slots


def _divider(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    variant = spec.get("variant") if spec.get("variant") in ("line", "short", "dots", "space") else "short"
    return {"blockId": f"b_hr_{uid}", "kind": "divider", "title": _label("divider"), "variant": variant,
            "spacing": int(spec.get("spacing") or 20)}, {}


def _hero(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    slots: dict[str, Any] = {}
    title = inline_text(spec.get("title") or "")
    if not title:
        raise ValueError("hero 는 title 이 필요하다.")
    t_id = _slot(slots, f"s_hero_t_{uid}", _label("heroTitle"), f"<p>{html_lib.escape(title)}</p>")
    block: dict[str, Any] = {"blockId": f"b_hero_{uid}", "kind": "hero", "title": title[:32], "titleSlotId": t_id,
                             "height": int(spec.get("height") or 300), "overlay": float(spec.get("overlay") if spec.get("overlay") is not None else 0.4),
                             "align": "center" if spec.get("align") == "center" else "left"}
    if spec.get("subtitle"):
        block["subtitleSlotId"] = _slot(slots, f"s_hero_s_{uid}", _label("heroSubtitle"), f"<p>{html_lib.escape(inline_text(spec['subtitle']))}</p>")
    if spec.get("image"):
        block["image"] = str(spec["image"])
    return block, slots


def _callout(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    slots: dict[str, Any] = {}
    reject_table_html(spec.get("html") or spec.get("text"))
    sid = _slot(slots, f"s_box_{uid}", _label("callout"), sanitize_html(spec.get("html") or spec.get("text") or ""))
    tone = spec.get("tone") if spec.get("tone") in ("neutral", "info", "warning") else "neutral"
    return {"blockId": f"b_box_{uid}", "kind": "callout-box", "title": _label("callout"), "slotId": sid, "tone": tone}, slots


# --- 표 -------------------------------------------------------------------------------------------

TABLE_MAX_ROWS = 80
TABLE_MAX_COLS = 12
#: 표 모양 기본값 — 공문 · 제안요청서 류의 얇은 실선 격자. 라벨 칸(머리 칸)은 옅은 음영.
_TABLE_LINE = "1px solid #555555"
_TABLE_OUTER = "1.5px solid #222222"
_HEADER_BG = "#e8edf5"


def _cell_spec(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    return {"text": "" if raw is None else str(raw)}


def _span(value: Any) -> int:
    try:
        return max(1, min(TABLE_MAX_COLS, int(value)))
    except (TypeError, ValueError):
        return 1


def _width_list(raw: Any, ncols: int) -> list[str]:
    """열 너비: ["20%", "80%"] · [1, 4](비율) · 생략(균등)."""
    if isinstance(raw, list) and len(raw) == ncols:
        if all(isinstance(x, (int, float)) for x in raw):
            total = sum(float(x) for x in raw) or 1.0
            return [f"{float(x) / total * 100:.2f}%" for x in raw]
        vals = [str(x).strip() for x in raw]
        if all(re.match(r"^\d+(\.\d+)?%$", v) for v in vals):
            return vals
    return [f"{100.0 / ncols:.2f}%"] * ncols


def _table(spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """표 한 개. rows: 행마다 칸 목록(칸 = 글 또는 {text|html, colSpan, rowSpan, header, align, bg}).
    fields: [[라벨, 값], …] 이면 2열 서식(라벨 칸 음영) — 요구사항 카드 · 표지 사업 정보 같은 키-값 표.
    header: row(첫 행) · col(첫 열) · both · none. 결과는 양식 가져오기와 같은 `structured-table` 모양이다."""
    rows_in = spec.get("rows")
    fields = spec.get("fields")
    header = str(spec.get("header") or "").strip()
    if not rows_in and isinstance(fields, list):
        rows_in = [[{"text": str(f[0]), "header": True}, *(f[1:] or [""])] if isinstance(f, (list, tuple)) and f else [str(f), ""]
                   for f in fields]
        header = header or "none"
    if not isinstance(rows_in, list) or not rows_in or len(rows_in) > TABLE_MAX_ROWS:
        raise ValueError(packs.message("editor:messages.json", "compose.tableShape", maxRows=TABLE_MAX_ROWS, maxCols=TABLE_MAX_COLS))
    header = header if header in ("row", "col", "both", "none") else "row"

    # 칸 배치: 위 행의 rowSpan 이 차지한 열을 건너뛰며 왼쪽부터 채운다.
    occupied: dict[tuple[int, int], bool] = {}
    placed: list[list[tuple[int, dict[str, Any]]]] = []
    ncols = 0
    for r, row in enumerate(rows_in):
        cells = row if isinstance(row, list) else [row]
        col = 0
        out_row: list[tuple[int, dict[str, Any]]] = []
        for raw in cells:
            cell = _cell_spec(raw)
            while occupied.get((r, col)):
                col += 1
            cs, rs = _span(cell.get("colSpan")), _span(cell.get("rowSpan"))
            for dr in range(rs):
                for dc in range(cs):
                    occupied[(r + dr, col + dc)] = True
            out_row.append((col, cell))
            col += cs
        ncols = max(ncols, col, max((c + 1 for (rr, c) in occupied if rr == r), default=0))
        placed.append(out_row)
    if ncols == 0 or ncols > TABLE_MAX_COLS:
        raise ValueError(packs.message("editor:messages.json", "compose.tableShape", maxRows=TABLE_MAX_ROWS, maxCols=TABLE_MAX_COLS))

    slots: dict[str, Any] = {}
    rows_out: list[dict[str, Any]] = []
    for r, out_row in enumerate(placed):
        cells_out: list[dict[str, Any]] = []
        filled = {c for (rr, c) in occupied if rr == r}
        for c, cell in out_row:
            is_header = bool(cell.get("header")) or (header in ("row", "both") and r == 0) or (header in ("col", "both") and c == 0)
            raw = cell.get("html") if cell.get("html") is not None else cell.get("text", "")
            reject_table_html(raw)
            content = sanitize_html(raw)
            label = inline_text(content)[:24] if is_header and inline_text(content) else _label("tableCell", r=r + 1, c=c + 1)
            sid = _slot(slots, f"s_tc_{uid}_{r}_{c}", label, content)
            cell_out: dict[str, Any] = {"cellId": f"c_{uid}_{r}_{c}", "slotId": sid, "vAlign": "middle",
                                        "hAlign": _align(cell.get("align"), "center" if is_header else "left"),
                                        "padding": "5px 8px"}
            if is_header:
                cell_out["isHeader"] = True
                cell_out["backgroundColor"] = _HEADER_BG
                cell_out["fontWeight"] = "600"
            if cell.get("bg") and _COLOR_VALUE.match(str(cell["bg"])):
                cell_out["backgroundColor"] = str(cell["bg"])
            if _span(cell.get("colSpan")) > 1:
                cell_out["colSpan"] = _span(cell.get("colSpan"))
            if _span(cell.get("rowSpan")) > 1:
                cell_out["rowSpan"] = _span(cell.get("rowSpan"))
            cells_out.append(cell_out)
        # 모자란 칸은 빈 칸으로 채워 격자를 맞춘다 (병합으로 이미 찬 열은 건너뛴다)
        for c in range(ncols):
            if c not in filled:
                sid = _slot(slots, f"s_tc_{uid}_{r}_{c}", _label("tableCell", r=r + 1, c=c + 1), "<p></p>")
                cells_out.append({"cellId": f"c_{uid}_{r}_{c}", "slotId": sid, "vAlign": "middle", "hAlign": "left", "padding": "5px 8px"})
        rows_out.append({"rowId": f"r_{uid}_{r}", "cells": cells_out})

    title = inline_text(spec.get("title") or "") or _label("table")
    block: dict[str, Any] = {
        "blockId": f"b_tbl_{uid}",
        "kind": "structured-table",
        "title": title[:32],
        "columnWidths": _width_list(spec.get("widths") or spec.get("columns"), ncols),
        "rows": rows_out,
        "borderRules": {"outer": _TABLE_OUTER, "rowBottom": _TABLE_LINE, "vertical": _TABLE_LINE,
                        "headerTop": _TABLE_OUTER, "headerBottom": _TABLE_LINE},
        "headerStyle": {"bg": _HEADER_BG, "fontWeight": "600"},
        "tableVariant": "bordered",
    }
    if spec.get("caption"):
        block["caption"] = inline_text(spec["caption"])[:120]
    return block, slots


KINDS: dict[str, Callable[[dict[str, Any], str], tuple[dict[str, Any], dict[str, Any]]]] = {
    "heading": _heading,
    "text": _text,
    "image": _image,
    "gallery": _gallery,
    "link-card": _link_card,
    "divider": _divider,
    "hero": _hero,
    "callout": _callout,
    "table": _table,
}


def make_block(kind: str, spec: dict[str, Any], uid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    fn = KINDS.get(str(kind or "").strip())
    if fn is None:
        raise ValueError(f"모르는 블록 종류: {kind} (쓸 수 있는 것: {', '.join(KINDS)})")
    return fn(spec, uid)


def media_sources(block: dict[str, Any]) -> list[str]:
    """블록이 가리키는 사진 주소들 (사진 · 묶음 · 링크 카드 썸네일 · 표지)."""
    out: list[str] = []
    for key in ("src", "thumbnail", "image"):
        if isinstance(block.get(key), str) and block.get(key):
            out.append(block[key])
    for col in block.get("columns") or []:
        if isinstance(col, dict) and isinstance(col.get("image"), dict) and col["image"].get("src"):
            out.append(str(col["image"]["src"]))
    return out


def block_slot_ids(block: dict[str, Any]) -> list[str]:
    ids = []
    for key in ("slotId", "titleSlotId", "subtitleSlotId", "headlineSlotId"):
        if isinstance(block.get(key), str) and block.get(key):
            ids.append(block[key])
    for col in block.get("columns") or []:
        if isinstance(col, dict) and col.get("slotId"):
            ids.append(col["slotId"])
    ids += [s for s in block.get("slotIds") or [] if isinstance(s, str)]
    # 표 (structured-table) — 칸마다 슬롯
    for row in block.get("rows") or []:
        for cell in (row or {}).get("cells") or []:
            if isinstance(cell, dict) and isinstance(cell.get("slotId"), str):
                ids.append(cell["slotId"])
    return ids
