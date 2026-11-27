"""웹 스크랩(`.vclip/`) 리소스 도메인 패키지 — `.ref`(형식 참고)와 완전히 분리된 사실·근거용 웹 수집 파이프라인."""
from .extractor import scrape_web_clip
from .models import (
    WebClipAssetPayload,
    WebClipMeta,
    WebClipScrapeRequest,
    WebClipScrapeResponse,
)

__all__ = [
    "WebClipAssetPayload",
    "WebClipMeta",
    "WebClipScrapeRequest",
    "WebClipScrapeResponse",
    "scrape_web_clip",
]
