"""사이트 프로파일 레지스트리 및 개별 어댑터."""
from .generic_article import extract_generic_article
from .naver_blog import extract_naver_blog, is_naver_smart_editor
from .registry import extract_article_ir

__all__ = [
    "extract_article_ir",
    "extract_generic_article",
    "extract_naver_blog",
    "is_naver_smart_editor",
]

