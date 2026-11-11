"""웹 URL 스캐폴딩 엔드포인트(/api/catalog/url-scaffold) 통합 테스트."""
from __future__ import annotations

import io
from typing import Optional

from fastapi.testclient import TestClient
from PIL import Image
from webpage_fidelity_engine import BrowserLayoutSnapshot
from webpage_fidelity_engine.models import (
    BrowserElementGeometry,
    MeasuredRect,
    TextInlineStyle,
)

from app.form_scaffold.use_cases import ScaffoldUrlToDocumentUseCase
from main import app

client = TestClient(app)


def _sample_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (240, 140), (30, 64, 175)).save(buf, format="PNG")
    return buf.getvalue()


class _StubWebFetcher:
    def __init__(self, html: str, final_url: str) -> None:
        self._html = html.encode("utf-8")
        self._url = final_url

    def fetch(self, url: str, *, timeout_s: float = 12.0) -> tuple[bytes, str, str]:
        return self._html, "text/html; charset=utf-8", self._url


class _StubAssetFetcher:
    def __init__(self, assets: dict[str, tuple[bytes, str]]) -> None:
        self._assets = assets

    def fetch_asset(
        self,
        url: str,
        *,
        referer: str = "",
        timeout_s: float = 8.0,
        max_bytes: int = 3 * 1024 * 1024,
    ) -> Optional[tuple[bytes, str]]:
        return self._assets.get(url)


def test_scaffold_url_endpoint_returns_multipage_vdoc_with_thumbnails() -> None:
    html = """
    <html>
      <head><meta property="og:title" content="칼럼 샘플 문서" /></head>
      <body>
        <article>
          <h1>칼럼 샘플 문서</h1>
          <p>첫 번째 섹션 본문입니다. 충분한 내용이 들어 있습니다.</p>
          <img data-lazy-src="https://cdn.example.com/pic.png" alt="삽화" />
          <h2>두 번째 소제목</h2>
          <p>두 번째 섹션 본문입니다. 인용구와 함께 이어집니다.</p>
          <blockquote>핵심 요약 문장입니다.</blockquote>
        </article>
      </body>
    </html>
    """
    use_case = ScaffoldUrlToDocumentUseCase(
        fetcher=_StubWebFetcher(html, "https://blog.example.com/article/10"),
        asset_fetcher=_StubAssetFetcher({"https://cdn.example.com/pic.png": (_sample_png(), "image/png")}),
    )
    provider = app.state.container.scaffold_url_to_document
    provider.override(use_case)
    try:
        res = client.post(
            "/api/catalog/url-scaffold",
            json={
                "url": "https://blog.example.com/article/10",
                "splitMode": "heading",
                "targetHeightPx": 1123,
                "includeImages": True,
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["docId"].startswith("vdoc-")
        assert data["title"] == "칼럼 샘플 문서"
        assert data["totalPages"] == 2
        assert data["checkedBlocks"] >= 4
        assert data["checkedSlots"] >= 4
        vdoc = data["document"]
        assert vdoc["preview"]["sourceWebUrl"] == "https://blog.example.com/article/10"
        assert len(vdoc["preview"]["pageThumbnails"]) == 2
    finally:
        provider.reset_override()


def test_scaffold_url_endpoint_rejects_invalid_and_private_urls() -> None:
    for bad_url in ("", "ftp://example.com/a", "http://127.0.0.1:8090/api/health", "http://localhost/secret"):
        res = client.post("/api/catalog/url-scaffold", json={"url": bad_url})
        assert res.status_code == 400, (bad_url, res.text)


class _StubBrowserDom:
    def __init__(self, snapshot: BrowserLayoutSnapshot) -> None:
        self._snapshot = snapshot

    def render_dom(self, url: str, *, timeout_s: float = 15.0):
        return None

    def render_layout_snapshot(self, url: str, *, viewport_width: int = 1280, timeout_s: float = 18.0):
        return self._snapshot


def test_scaffold_url_uses_browser_snapshot_and_sets_vertical_page_rect() -> None:
    snapshot = BrowserLayoutSnapshot(
        url="https://blog.example.com/long-article",
        title="세로형 웹 리포트",
        body_font_size_px=15.0,
        elements=[
            BrowserElementGeometry(
                kind_hint="quote",
                tag="blockquote",
                rect=MeasuredRect(40, 80, 680, 40),
                text="핵심 질문은 무엇인가?",
                html="핵심 질문은 무엇인가?",
                style=TextInlineStyle(has_bottom_rule=True, border_color="#94a3b8"),
            ),
            BrowserElementGeometry(
                kind_hint="paragraph",
                tag="p",
                rect=MeasuredRect(40, 140, 680, 90),
                text="브라우저 실측 좌표 기반 변환 결과입니다.",
                html="브라우저 실측 좌표 기반 변환 결과입니다.",
            ),
        ],
    )
    use_case = ScaffoldUrlToDocumentUseCase(browser_dom=_StubBrowserDom(snapshot))
    provider = app.state.container.scaffold_url_to_document
    provider.override(use_case)
    try:
        res = client.post(
            "/api/catalog/url-scaffold",
            json={
                "url": "https://blog.example.com/long-article",
                "splitMode": "height",
                "targetHeightPx": 1500,
                "includeImages": False,
                "useBrowserFallback": True,
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["metrics"]["profileUsed"] == "browser_layout"
        page1 = data["document"]["pages"][0]
        assert page1["pageRect"] == {"width": 794.0, "height": 1500.0, "unit": "px"}
        assert any(b["kind"] == "heading" and "underline" in b for b in page1["blocks"])
    finally:
        provider.reset_override()

