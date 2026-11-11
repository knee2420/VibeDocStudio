"""URL/DOM 시그니처에 따라 적합한 사이트 프로파일 어댑터를 선택해 `WebArticleIR` 을 추출한다."""
from __future__ import annotations

from ...models import WebArticleIR
from ..article_isolator import extract_metadata
from ..css_normalizer import CssRuleIndex
from ..dom_tree import parse_html_dom
from .generic_article import extract_generic_article
from .naver_blog import extract_naver_blog, is_naver_smart_editor


def extract_article_ir(
    html_text: str,
    *,
    url: str = "",
    include_images: bool = True,
) -> WebArticleIR:
    """원본 HTML 문자열로부터 메타데이터, CSS 규칙, 사이트 프로파일 기반 `WebArticleIR` 을 생성한다."""
    root = parse_html_dom(html_text)
    meta = extract_metadata(root)
    css_index = CssRuleIndex.from_dom(root)

    if is_naver_smart_editor(root, url):
        return extract_naver_blog(
            root,
            url=url,
            meta=meta,
            css_index=css_index,
            include_images=include_images,
        )
    return extract_generic_article(
        root,
        url=url,
        meta=meta,
        css_index=css_index,
        include_images=include_images,
    )

