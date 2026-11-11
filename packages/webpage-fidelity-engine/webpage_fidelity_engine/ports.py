"""webpage-fidelity-engine 외부 의존 포트 (Protocol)."""
from __future__ import annotations

from typing import Any, Optional, Protocol

from .models import BrowserLayoutSnapshot, WebArticleIR


class WebFetcherPort(Protocol):
    """URL 에서 원본 HTML 바이트, Content-Type, 최종 리다이렉트 URL 을 가져온다."""

    def fetch(self, url: str, *, timeout_s: float = 12.0) -> tuple[bytes, str, str]: ...


class AssetFetcherPort(Protocol):
    """외부 이미지/리소스를 내려받아 (바이트, Content-Type) 을 반환한다."""

    def fetch_asset(
        self,
        url: str,
        *,
        referer: str = "",
        timeout_s: float = 8.0,
        max_bytes: int = 3 * 1024 * 1024,
    ) -> Optional[tuple[bytes, str]]: ...


class BrowserDomPort(Protocol):
    """JS 렌더링이 필요한 SPA 등을 위해 브라우저에서 평가된 HTML 문자열을 수집한다."""

    def render_dom(self, url: str, *, timeout_s: float = 15.0) -> Optional[tuple[str, str]]: ...


class BrowserLayoutPort(Protocol):
    """브라우저에서 실측된 `getBoundingClientRect` · `getComputedStyle` 레이아웃 스냅샷을 수집한다."""

    def render_layout_snapshot(
        self,
        url: str,
        *,
        viewport_width: int = 1280,
        timeout_s: float = 18.0,
    ) -> Optional[BrowserLayoutSnapshot]: ...


class WebpageRefinerPort(Protocol):
    """호스트(LLM 등)가 조립된 `.vdoc` 문서의 구획 제목/요약을 후처리 정제할 때 쓰는 선택적 포트."""

    def refine_document(self, document: dict[str, Any], article: WebArticleIR) -> dict[str, Any]: ...

