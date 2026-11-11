"""기술 블로그 · 뉴스 · 일반 웹 아티클 범용 추출 어댑터."""
from __future__ import annotations

import html as html_lib

from ...models import WebArticleIR, WebNode
from ..article_isolator import isolate_article_root
from ..css_normalizer import CssRuleIndex
from ..dom_tree import DomNode
from ..dom_walker import walk_dom_to_nodes
from ..structural_heuristics import refine_article_nodes


def extract_generic_article(
    root: DomNode,
    *,
    url: str,
    meta: dict[str, str],
    css_index: CssRuleIndex,
    include_images: bool = True,
) -> WebArticleIR:
    """본문 루트를 격리한 뒤 범용 DOM 워커로 `WebArticleIR` 을 조립한다."""
    article_root = isolate_article_root(root)
    nodes = refine_article_nodes(
        walk_dom_to_nodes(
            article_root,
            base_url=url,
            css_index=css_index,
            include_images=include_images,
        )
    )

    resolved_title = meta.get("headline") or meta.get("title") or "웹 문서"
    # 뉴스 기사처럼 본문 컨테이너 바깥에 <h1> 이 있는 경우 첫 블록으로 보강 (중복 방지)
    first_heading = next((n for n in nodes if n.kind == "heading" and n.level == 1), None)
    if resolved_title and first_heading is None:
        nodes.insert(
            0,
            WebNode(
                kind="heading",
                level=1,
                text=resolved_title,
                html=html_lib.escape(resolved_title),
                source_tag="h1",
            ),
        )
    elif first_heading and not meta.get("headline"):
        resolved_title = first_heading.text

    raw_chars = len(article_root.compact_text())
    return WebArticleIR(
        url=url,
        title=resolved_title,
        site_name=meta.get("site_name") or "",
        author=meta.get("author") or "",
        description=meta.get("description") or "",
        profile_name="generic_article",
        nodes=nodes,
        raw_text_chars=raw_chars,
    )

