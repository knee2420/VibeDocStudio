"""정제된 본문 DOM 을 순회하여 중간 표현(`WebNode`) 목록으로 변환하는 범용 워커."""
from __future__ import annotations

import html as html_lib
import re
from typing import Optional
from urllib.parse import urljoin

from ..fetch.asset_resolver import pick_image_url
from ..models import TextInlineStyle, WebImage, WebNode, WebTableCell
from .article_isolator import is_boilerplate_text, is_noise_element
from .css_normalizer import CssRuleIndex, extract_node_style
from .dom_tree import DomNode

_HEADING_LEVELS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 4, "h6": 4}
_CALLOUT_CLASS_RE = re.compile(r"(^|[-_])(callout|notice|alert|tip|info-box|warn|quote-box)($|[-_])", re.I)
_CODE_CLASS_RE = re.compile(r"(^|[-_])(code-block|codeblock|highlight|prism|hljs|syntax)($|[-_])", re.I)
_TINY_ICON_RE = re.compile(r"(icon|avatar|profile|emoji|badge|favicon|logo)", re.I)
_BLOCK_TAGS = frozenset({
    "address", "article", "blockquote", "div", "dl", "dt", "dd", "figcaption",
    "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol", "p",
    "pre", "section", "table", "ul",
})


def _clean_text(text: str) -> str:
    return " ".join((text or "").replace("\u200b", "").replace("\ufeff", "").replace("\xa0", " ").split())


def _safe_href(href: str, base_url: str) -> str:
    clean = (href or "").strip()
    if not clean or clean.startswith("#") or clean.lower().startswith(("javascript:", "data:", "vbscript:")):
        return ""
    return urljoin(base_url, clean) if base_url else clean


def _inline_style_attr(style: TextInlineStyle) -> str:
    parts: list[str] = []
    if style.color:
        parts.append(f"color: {style.color}")
    if style.bg_color:
        parts.append(f"background-color: {style.bg_color}")
    if style.font_weight == "bold":
        parts.append("font-weight: bold")
    return "; ".join(parts)


def render_inline_html(
    node: DomNode,
    *,
    base_url: str = "",
    css_index: Optional[CssRuleIndex] = None,
) -> tuple[str, str]:
    """노드 하위 인라인 콘텐츠를 (plain_text, Tiptap-safe inline HTML) 로 직렬화한다."""
    html_parts: list[str] = []
    text_parts: list[str] = []

    def walk(cur: DomNode) -> None:
        if cur.is_text:
            cleaned = cur.text.replace("\u200b", "").replace("\ufeff", "").replace("\xa0", " ")
            if not cleaned:
                return
            html_parts.append(html_lib.escape(cleaned))
            text_parts.append(cleaned)
            return
        if is_noise_element(cur) or cur.tag == "img":
            return
        tag = cur.tag
        if tag == "br":
            html_parts.append("<br/>")
            text_parts.append(" ")
            return
        if tag in ("strong", "b"):
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if len(html_parts) > inner_start:
                html_parts.insert(inner_start, "<strong>")
                html_parts.append("</strong>")
            return
        if tag in ("em", "i"):
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if len(html_parts) > inner_start:
                html_parts.insert(inner_start, "<em>")
                html_parts.append("</em>")
            return
        if tag == "u":
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if len(html_parts) > inner_start:
                html_parts.insert(inner_start, "<u>")
                html_parts.append("</u>")
            return
        if tag in ("s", "del", "strike"):
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if len(html_parts) > inner_start:
                html_parts.insert(inner_start, "<s>")
                html_parts.append("</s>")
            return
        if tag == "code":
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if len(html_parts) > inner_start:
                html_parts.insert(inner_start, "<code>")
                html_parts.append("</code>")
            return
        if tag == "mark":
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if len(html_parts) > inner_start:
                html_parts.insert(inner_start, "<mark>")
                html_parts.append("</mark>")
            return
        if tag == "a":
            href = _safe_href(cur.attrs.get("href") or "", base_url)
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if href and len(html_parts) > inner_start:
                html_parts.insert(inner_start, f'<a href="{html_lib.escape(href, quote=True)}">')
                html_parts.append("</a>")
            return
        if tag == "span":
            st = extract_node_style(cur, css_index)
            css = _inline_style_attr(st)
            inner_start = len(html_parts)
            for ch in cur.children:
                walk(ch)
            if css and len(html_parts) > inner_start:
                html_parts.insert(inner_start, f'<span style="{css}">')
                html_parts.append("</span>")
            return

        for ch in cur.children:
            walk(ch)

    for ch in node.children:
        walk(ch)

    plain = _clean_text("".join(text_parts))
    raw_html = re.sub(r"[ \t\r\n]+", " ", "".join(html_parts)).strip()
    return plain, raw_html


def _looks_like_tiny_icon(img_node: DomNode, src: str) -> bool:
    for dim_key in ("width", "height"):
        raw = (img_node.attrs.get(dim_key) or "").strip().rstrip("px")
        if raw.isdigit() and int(raw) <= 32:
            return True
    cls_str = " ".join(img_node.classes)
    if cls_str and _TINY_ICON_RE.search(cls_str):
        return True
    if _TINY_ICON_RE.search(src.rsplit("/", 1)[-1].split("?", 1)[0]):
        # 파일명 자체가 icon/avatar/logo 이면 본문 사진에서 제외
        return "logo" not in (img_node.attrs.get("alt") or "").lower()
    return False


def make_image_node(img_node: DomNode, *, base_url: str, caption: str = "") -> Optional[WebNode]:
    src = pick_image_url(img_node.attrs, base_url)
    if not src or _looks_like_tiny_icon(img_node, src):
        return None
    alt = _clean_text(img_node.attrs.get("alt") or "")
    cap = _clean_text(caption)
    w_attr = (img_node.attrs.get("width") or "").strip().rstrip("px")
    h_attr = (img_node.attrs.get("height") or "").strip().rstrip("px")
    w = int(w_attr) if w_attr.isdigit() else 0
    h = int(h_attr) if h_attr.isdigit() else 0
    return WebNode(
        kind="image",
        text=cap or alt,
        images=[WebImage(src=src, alt=alt, caption=cap, width_px=w, height_px=h)],
        source_tag=img_node.tag,
    )


def _is_aria_role(node: DomNode, *roles: str) -> bool:
    return (node.attrs.get("role") or "").strip().lower() in roles


def _extract_table_node(table_node: DomNode, *, base_url: str, css_index: Optional[CssRuleIndex]) -> Optional[WebNode]:
    rows_out: list[list[WebTableCell]] = []
    tr_nodes = table_node.find_all(predicate=lambda n: n.tag == "tr" or _is_aria_role(n, "row"))
    for row_idx, tr in enumerate(tr_nodes):
        # 중첩 표 행 방지
        parent = tr.parent
        closest_table = None
        while parent is not None:
            if parent.tag == "table" or _is_aria_role(parent, "table", "grid"):
                closest_table = parent
                break
            parent = parent.parent
        if closest_table is not table_node:
            continue

        row_cells: list[WebTableCell] = []
        in_thead = (
            (tr.parent is not None and tr.parent.tag == "thead")
            or (tr.parent is not None and _is_aria_role(tr.parent, "rowgroup") and row_idx == 0)
        )
        for cell in tr.children:
            if cell.is_text:
                continue
            is_cell_tag = cell.tag in ("td", "th")
            is_aria_cell = _is_aria_role(cell, "cell", "gridcell", "columnheader", "rowheader")
            if not is_cell_tag and not is_aria_cell:
                continue
            plain, inline_html = render_inline_html(cell, base_url=base_url, css_index=css_index)
            st = extract_node_style(cell, css_index)
            try:
                cs = max(1, int(cell.attrs.get("colspan") or cell.attrs.get("aria-colspan") or 1))
            except ValueError:
                cs = 1
            try:
                rs = max(1, int(cell.attrs.get("rowspan") or cell.attrs.get("aria-rowspan") or 1))
            except ValueError:
                rs = 1
            align = st.align if st.align in ("left", "center", "right") else "left"
            is_hdr = cell.tag == "th" or _is_aria_role(cell, "columnheader", "rowheader") or (row_idx == 0 and (in_thead or _is_aria_role(table_node, "table")))
            row_cells.append(
                WebTableCell(
                    text=plain,
                    html=f"<p>{inline_html}</p>" if inline_html else "<p></p>",
                    is_header=is_hdr,
                    col_span=cs,
                    row_span=rs,
                    align=align,  # type: ignore[arg-type]
                )
            )
        if row_cells:
            rows_out.append(row_cells)

    if not rows_out:
        return None
    non_empty_cells = sum(1 for r in rows_out for c in r if c.text)
    if non_empty_cells == 0:
        return None
    # 단일 1x1 레이아웃 래퍼 테이블 제외
    if len(rows_out) == 1 and len(rows_out[0]) == 1:
        return None
    summary = "\n".join(" | ".join(c.text for c in r) for r in rows_out)
    return WebNode(kind="table", text=summary, rows=rows_out, source_tag="table")


def _extract_list_node(list_node: DomNode, *, base_url: str, css_index: Optional[CssRuleIndex]) -> Optional[WebNode]:
    items_plain: list[str] = []
    items_html: list[str] = []
    for ch in list_node.children:
        if ch.is_text or ch.tag != "li":
            continue
        plain, inline_html = render_inline_html(ch, base_url=base_url, css_index=css_index)
        if plain and not is_boilerplate_text(plain):
            items_plain.append(plain)
            items_html.append(inline_html or html_lib.escape(plain))
    if not items_plain:
        return None
    return WebNode(
        kind="list",
        text="\n".join(items_plain),
        ordered=(list_node.tag == "ol"),
        items=items_plain,
        item_htmls=items_html,
        source_tag=list_node.tag,
    )


def _has_block_descendant(node: DomNode) -> bool:
    for ch in node.children:
        if ch.is_text:
            continue
        if ch.tag in _BLOCK_TAGS or ch.tag == "img":
            return True
        if _has_block_descendant(ch):
            return True
    return False


_ROW_HINT_RE = re.compile(r"(flex|grid|row|gallery|strip|collage|columns?|side|tiles?|multi)", re.I)
_WIDTH_PCT_RE = re.compile(r"width\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*%", re.I)


def _node_shows_horizontal_hint(parent: DomNode, slots: list[DomNode], css_index: Optional[CssRuleIndex]) -> bool:
    """정적 HTML에서 나란한 다열 이미지 행(flex/grid/inline-block/%폭/직접 img 나열) 신호가 있는지 판정한다."""
    if all(s.tag == "img" for s in slots):
        return True
    p_props = css_index.resolve_props(parent) if css_index else {}
    p_disp = (p_props.get("display") or "").lower()
    if p_disp in ("flex", "inline-flex", "grid", "inline-grid", "table", "table-row"):
        return True
    p_cls = " ".join(parent.classes)
    if p_cls and _ROW_HINT_RE.search(p_cls):
        return True
    for s in slots:
        s_style = s.attrs.get("style") or ""
        m = _WIDTH_PCT_RE.search(s_style)
        if m and float(m.group(1)) < 90.0:
            return True
        s_props = css_index.resolve_props(s) if css_index else {}
        if (s_props.get("display") or "").lower() in ("inline-block", "inline-flex", "table-cell"):
            return True
        if (s_props.get("float") or "").lower() in ("left", "right"):
            return True
    return False


def _try_extract_image_strip(
    cur: DomNode,
    *,
    root: DomNode,
    base_url: str,
    css_index: Optional[CssRuleIndex],
) -> Optional[list[WebNode]]:
    """컨테이너 내부에 본문 없이 2~4개의 나란한 이미지가 묶여 있을 때 `image_strip` 으로 추출한다."""
    if cur is root or cur.tag not in ("div", "section", "figure", "p", "ul"):
        return None
    meaningful: list[DomNode] = []
    caption_nodes: list[str] = []
    for ch in cur.children:
        if ch.is_text:
            if _clean_text(ch.text):
                return None
            continue
        if is_noise_element(ch):
            continue
        if ch.tag == "figcaption":
            t = ch.compact_text()
            if t:
                caption_nodes.append(t)
            continue
        meaningful.append(ch)

    if not (2 <= len(meaningful) <= 4):
        return None

    imgs: list[WebImage] = []
    col_hints: list[float] = []
    for slot_el in meaningful:
        slot_imgs = [slot_el] if slot_el.tag == "img" else slot_el.find_all(frozenset({"img"}))
        if len(slot_imgs) != 1:
            return None
        non_cap_txt = _clean_text(slot_el.compact_text())
        if len(non_cap_txt) > 35:
            return None
        im_node = make_image_node(slot_imgs[0], base_url=base_url)
        if im_node is None or not im_node.images:
            return None
        imgs.append(im_node.images[0])
        m = _WIDTH_PCT_RE.search(slot_el.attrs.get("style") or "")
        if m and float(m.group(1)) > 0:
            col_hints.append(float(m.group(1)))

    if len(imgs) < 2 or not _node_shows_horizontal_hint(cur, meaningful, css_index):
        return None

    cap_text = caption_nodes[0] if caption_nodes else ""
    widths = col_hints if len(col_hints) == len(imgs) else []
    out: list[WebNode] = [
        WebNode(
            kind="image_strip",
            text=cap_text,
            images=imgs,
            source_tag=cur.tag,
            column_widths_px=widths,
        )
    ]
    if cap_text:
        out.append(
            WebNode(
                kind="paragraph",
                text=cap_text,
                html=f"<em>{html_lib.escape(cap_text)}</em>",
                source_tag="figcaption",
            )
        )
    return out


def walk_dom_to_nodes(
    root: DomNode,
    *,
    base_url: str = "",
    css_index: Optional[CssRuleIndex] = None,
    include_images: bool = True,
) -> list[WebNode]:
    """정제된 DOM 서브트리를 순서대로 순회하며 `WebNode` 목록을 추출한다."""
    nodes: list[WebNode] = []

    def walk(cur: DomNode) -> None:
        if cur.is_text:
            return
        if is_noise_element(cur):
            return

        tag = cur.tag
        if tag in _HEADING_LEVELS:
            plain, inline_html = render_inline_html(cur, base_url=base_url, css_index=css_index)
            if plain and not is_boilerplate_text(plain):
                st = extract_node_style(cur, css_index)
                nodes.append(
                    WebNode(
                        kind="heading",
                        level=_HEADING_LEVELS[tag],
                        text=plain,
                        html=inline_html or html_lib.escape(plain),
                        style=st,
                        source_tag=tag,
                    )
                )
            return

        if tag == "hr":
            nodes.append(WebNode(kind="divider", source_tag="hr"))
            return

        if tag == "img":
            if include_images:
                im_node = make_image_node(cur, base_url=base_url)
                if im_node:
                    nodes.append(im_node)
            return

        if tag == "figure":
            if include_images:
                strip_nodes = _try_extract_image_strip(cur, root=root, base_url=base_url, css_index=css_index)
                if strip_nodes:
                    nodes.extend(strip_nodes)
                    return
            cap_node = cur.select_first(frozenset({"figcaption"}))
            caption = cap_node.compact_text() if cap_node else ""
            imgs = cur.find_all(frozenset({"img"}))
            if include_images and imgs:
                for idx, img in enumerate(imgs):
                    im_node = make_image_node(img, base_url=base_url, caption=caption if idx == len(imgs) - 1 else "")
                    if im_node:
                        nodes.append(im_node)
            elif caption:
                nodes.append(WebNode(kind="paragraph", text=caption, html=html_lib.escape(caption), source_tag="figcaption"))
            return

        if tag == "pre" or any(_CODE_CLASS_RE.search(c) for c in cur.classes):
            code_text = cur.inner_text().strip("\n")
            if code_text.strip():
                nodes.append(
                    WebNode(
                        kind="code",
                        text=code_text,
                        html=f"<pre><code>{html_lib.escape(code_text)}</code></pre>",
                        source_tag=tag,
                    )
                )
            return

        if tag == "blockquote" or any(_CALLOUT_CLASS_RE.search(c) for c in cur.classes):
            plain, inline_html = render_inline_html(cur, base_url=base_url, css_index=css_index)
            if plain and not is_boilerplate_text(plain):
                st = extract_node_style(cur, css_index)
                nodes.append(
                    WebNode(
                        kind="quote",
                        text=plain,
                        html=inline_html or html_lib.escape(plain),
                        style=st,
                        source_tag=tag,
                    )
                )
            return

        if tag in ("ul", "ol"):
            if include_images:
                strip_nodes = _try_extract_image_strip(cur, root=root, base_url=base_url, css_index=css_index)
                if strip_nodes:
                    nodes.extend(strip_nodes)
                    return
            ln = _extract_list_node(cur, base_url=base_url, css_index=css_index)
            if ln:
                nodes.append(ln)
            return

        if tag == "table" or _is_aria_role(cur, "table", "grid"):
            tn = _extract_table_node(cur, base_url=base_url, css_index=css_index)
            if tn:
                nodes.append(tn)
            return

        if tag in ("p", "figcaption", "dd", "dt"):
            # 문단 안에 <img> 가 2개 이상 묶여 있거나 단일 이미지가 섞여 있으면 분리 추출
            if include_images and tag == "p":
                strip_nodes = _try_extract_image_strip(cur, root=root, base_url=base_url, css_index=css_index)
                if strip_nodes:
                    nodes.extend(strip_nodes)
                    return
            imgs = cur.find_all(frozenset({"img"})) if include_images else []
            plain, inline_html = render_inline_html(cur, base_url=base_url, css_index=css_index)
            if plain and not is_boilerplate_text(plain):
                st = extract_node_style(cur, css_index)
                nodes.append(
                    WebNode(
                        kind="paragraph",
                        text=plain,
                        html=inline_html or html_lib.escape(plain),
                        style=st,
                        source_tag=tag,
                    )
                )
            for img in imgs:
                im_node = make_image_node(img, base_url=base_url)
                if im_node:
                    nodes.append(im_node)
            return

        if include_images:
            strip_nodes = _try_extract_image_strip(cur, root=root, base_url=base_url, css_index=css_index)
            if strip_nodes:
                nodes.extend(strip_nodes)
                return

        # div/section 등 컨테이너: 내부에 블록 요소가 없으면 흩어진 인라인 텍스트를 문단으로 승격
        if tag in ("div", "section", "article", "main") and not _has_block_descendant(cur):
            plain, inline_html = render_inline_html(cur, base_url=base_url, css_index=css_index)
            if plain and not is_boilerplate_text(plain):
                st = extract_node_style(cur, css_index)
                nodes.append(
                    WebNode(
                        kind="paragraph",
                        text=plain,
                        html=inline_html or html_lib.escape(plain),
                        style=st,
                        source_tag=tag,
                    )
                )
            return

        for ch in cur.children:
            walk(ch)

    walk(root)
    return nodes
