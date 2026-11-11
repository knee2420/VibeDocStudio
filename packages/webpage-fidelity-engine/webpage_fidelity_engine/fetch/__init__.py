"""웹페이지 및 정적 자산(이미지) 수집 어댑터 모음."""
from .asset_resolver import AssetResolver, HttpxAssetFetcher, pick_image_url
from .browser_fetcher import CdpBrowserDomFetcher
from .http_fetcher import HttpWebFetcher, decode_html_bytes, validate_public_http_url

__all__ = [
    "AssetResolver",
    "CdpBrowserDomFetcher",
    "HttpWebFetcher",
    "HttpxAssetFetcher",
    "decode_html_bytes",
    "pick_image_url",
    "validate_public_http_url",
]

