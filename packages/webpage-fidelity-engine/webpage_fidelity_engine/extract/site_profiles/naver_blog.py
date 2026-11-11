"""네이버 스마트에디터 ONE (`.se-main-container`) 전용 구조 추출 어댑터."""
from __future__ import annotations

import html as html_lib
from typing import Optional
from urllib.parse import urlparse

from ...fetch.asset_resolver import pick_image_url
from ...models import WebArticleIR, WebImage, WebLinkCard, WebNode
from ..css_normalizer import CssRuleIndex, extract_node_style
from ..dom_tree import DomNode
from ..dom_walker import (
    _extract_table_node,
    make_image_node,
    render_inline_html,
    walk_dom_to_nodes,
)
from ..structural_heuristics import refine_article_nodes


def is_naver_smart_editor(root: DomNode, url: str = "") -> bool:
    if root.select_first(class_name="se-main-container") is not None:
        return True
    host = urlparse(url).netloc.lower()
    return "blog.naver.com" in host and root.select_first(class_name="se-component") is not None


def _extract_se_text_nodes(comp: DomNode, *, base_url: str, css_index: CssRuleIndex) -> list[WebNode]:
    out: list[WebNode] = []
    paragraphs = comp.find_all(class_name="se-text-paragraph") or comp.find_all(frozenset({"p"}))
    for p in paragraphs:
        plain, inline_html = render_inline_html(p, base_url=base_url, css_index=css_index)
        if not plain:
            continue
        p_style = extract_node_style(p, css_index)
        # 내부 주요 span 의 스타일(크기/굵기/색)도 참고해 소제목 후보 판정
        first_span = p.select_first(frozenset({"span", "b", "strong"}))
        span_style = extract_node_style(first_span, css_index) if first_span else p_style
        eff_size = span_style.font_size_px or p_style.font_size_px
        eff_bold = span_style.font_weight == "bold" or bool(p.select_first(frozenset({"b", "strong"})))

        if eff_size and eff_size >= 19.0 and eff_bold and len(plain) <= 65:
            out.append(
                WebNode(
                    kind="heading",
                    level=2,
                    text=plain,
                    html=inline_html or html_lib.escape(plain),
                    style=p_style,
                    source_tag="se-text",
                )
            )
        else:
            out.append(
                WebNode(
                    kind="paragraph",
                    text=plain,
                    html=inline_html or html_lib.escape(plain),
                    style=p_style,
                    source_tag="se-text",
                )
            )
    return out


def _extract_se_oglink(comp: DomNode, *, base_url: str, include_images: bool) -> Optional[WebNode]:
    anchor = comp.select_first(frozenset({"a"}))
    href = (anchor.attrs.get("href") or "").strip() if anchor else ""
    title_el = comp.select_first(class_name="se-oglink-title")
    sum_el = comp.select_first(class_name="se-oglink-summary")
    url_el = comp.select_first(class_name="se-oglink-url")
    title = title_el.compact_text() if title_el else ""
    desc = sum_el.compact_text() if sum_el else ""
    domain = url_el.compact_text() if url_el else (urlparse(href).netloc if href else "")
    if not title and not href:
        return None
    thumb: Optional[WebImage] = None
    if include_images:
        img_el = comp.select_first(frozenset({"img"}))
        if img_el:
            src = pick_image_url(img_el.attrs, base_url)
            if src:
                thumb = WebImage(src=src, alt=title)
    card = WebLinkCard(url=href, title=title or href, description=desc, domain=domain, thumbnail=thumb)
    return WebNode(
        kind="link_card",
        text=f"{card.title} — {card.domain}".strip(" —"),
        link_card=card,
        source_tag="se-oglink",
    )


def extract_naver_blog(
    root: DomNode,
    *,
    url: str,
    meta: dict[str, str],
    css_index: CssRuleIndex,
    include_images: bool = True,
) -> WebArticleIR:
    """네이버 스마트에디터 ONE 컴포넌트를 순회해 `WebArticleIR` 을 생성한다."""
    container = root.select_first(class_name="se-main-container") or root
    nodes: list[WebNode] = []

    # 문서 제목 (se-documentTitle 이 컨테이너 밖에 있을 수도 있음)
    title_comp = root.select_first(class_name="se-documentTitle")
    doc_title = ""
    if title_comp:
        t_el = title_comp.select_first(class_name="se-title-text") or title_comp
        doc_title = t_el.compact_text()
    resolved_title = doc_title or meta.get("title") or meta.get("headline") or "네이버 블로그 문서"

    if resolved_title:
        nodes.append(
            WebNode(
                kind="heading",
                level=1,
                text=resolved_title,
                html=html_lib.escape(resolved_title),
                source_tag="se-documentTitle",
            )
        )

    components = [el for el in container.iter_elements() if el.has_class("se-component")]
    if not components:
        nodes.extend(walk_dom_to_nodes(container, base_url=url, css_index=css_index, include_images=include_images))
    else:
        for comp in components:
            classes = comp.classes
            if "se-documentTitle" in classes or "se-sticker" in classes:
                continue
            if "se-text" in classes:
                nodes.extend(_extract_se_text_nodes(comp, base_url=url, css_index=css_index))
                continue
            if "se-quotation" in classes:
                quote_el = comp.select_first(frozenset({"blockquote"})) or comp
                plain, inline_html = render_inline_html(quote_el, base_url=url, css_index=css_index)
                if plain:
                    nodes.append(
                        WebNode(
                            kind="quote",
                            text=plain,
                            html=inline_html or html_lib.escape(plain),
                            style=extract_node_style(quote_el, css_index),
                            source_tag="se-quotation",
                        )
                    )
                continue
            if "se-imageStrip" in classes:
                if not include_images:
                    continue
                cap_el = comp.select_first(class_name="se-caption")
                caption = cap_el.compact_text() if cap_el else ""
                imgs: list[WebImage] = []
                for img_el in comp.find_all(frozenset({"img"})):
                    im_node = make_image_node(img_el, base_url=url)
                    if im_node and im_node.images:
                        imgs.append(im_node.images[0])
                if len(imgs) == 1:
                    imgs[0].caption = caption
                    nodes.append(WebNode(kind="image", text=caption, images=imgs, source_tag="se-imageStrip"))
                elif len(imgs) > 1:
                    # 3장씩 끊어 columns-grid 가 A4 폭에 깔끔히 들어가도록 분할
                    for i in range(0, len(imgs), 3):
                        chunk = imgs[i : i + 3]
                        nodes.append(
                            WebNode(
                                kind="image_strip",
                                text=caption if i == 0 else "",
                                images=chunk,
                                source_tag="se-imageStrip",
                            )
                        )
                    if caption:
                        nodes.append(
                            WebNode(
                                kind="paragraph",
                                text=caption,
                                html=f"<em>{html_lib.escape(caption)}</em>",
                                source_tag="se-caption",
                            )
                        )
                continue
            if "se-image" in classes:
                if not include_images:
                    continue
                cap_el = comp.select_first(class_name="se-caption")
                caption = cap_el.compact_text() if cap_el else ""
                for img_el in comp.find_all(frozenset({"img"})):
                    im_node = make_image_node(img_el, base_url=url, caption=caption)
                    if im_node:
                        nodes.append(im_node)
                continue
            if "se-oglink" in classes:
                card_node = _extract_se_oglink(comp, base_url=url, include_images=include_images)
                if card_node:
                    nodes.append(card_node)
                continue
            if "se-table" in classes:
                tbl_el = comp.select_first(frozenset({"table"}))
                if tbl_el:
                    tn = _extract_table_node(tbl_el, base_url=url, css_index=css_index)
                    if tn:
                        nodes.append(tn)
                continue
            if "se-horizontalLine" in classes:
                nodes.append(WebNode(kind="divider", source_tag="se-horizontalLine"))
                continue
            # 기타 컴포넌트는 범용 워커로 안전 폴백
            nodes.extend(walk_dom_to_nodes(comp, base_url=url, css_index=css_index, include_images=include_images))

    nodes = refine_article_nodes(nodes)
    raw_chars = len(container.compact_text())
    return WebArticleIR(
        url=url,
        title=resolved_title,
        site_name=meta.get("site_name") or "Naver Blog",
        author=meta.get("author") or "",
        description=meta.get("description") or "",
        profile_name="naver_smart_editor",
        nodes=nodes,
        raw_text_chars=raw_chars,
    )
