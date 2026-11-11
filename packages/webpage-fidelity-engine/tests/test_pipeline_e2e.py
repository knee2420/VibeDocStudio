"""webpage-fidelity-engine E2E 파이프라인 테스트 (목업 fetcher · 실제 이미지 바이트 포함)."""
from __future__ import annotations

import io
from typing import Optional

from PIL import Image

from webpage_fidelity_engine import WebpageExtractOptions, run_webpage_extraction
from webpage_fidelity_engine.verify import validate_vdoc_document


def _png_bytes(width: int = 320, height: int = 180, color: tuple[int, int, int] = (36, 133, 103)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


class _FakeWebFetcher:
    def __init__(self, html: str, final_url: str) -> None:
        self._html = html.encode("utf-8")
        self._final_url = final_url

    def fetch(self, url: str, *, timeout_s: float = 12.0) -> tuple[bytes, str, str]:
        return self._html, "text/html; charset=utf-8", self._final_url


class _FakeAssetFetcher:
    def __init__(self, mapping: dict[str, tuple[bytes, str]]) -> None:
        self._mapping = mapping

    def fetch_asset(
        self,
        url: str,
        *,
        referer: str = "",
        timeout_s: float = 8.0,
        max_bytes: int = 3 * 1024 * 1024,
    ) -> Optional[tuple[bytes, str]]:
        return self._mapping.get(url)


def test_pipeline_end_to_end_with_images_thumbnails_and_pagination() -> None:
    html = """
    <html>
      <head>
        <meta property="og:title" content="엔지니어링 아티클 샘플" />
        <meta property="og:site_name" content="Tech Blog" />
      </head>
      <body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>엔지니어링 아티클 샘플</h1>
          <p>첫 번째 단락입니다. 충분한 본문 텍스트가 포함되어 있어 페이지가 정상 조립됩니다.</p>
          <figure>
            <img data-lazy-src="https://cdn.example.com/fig1.png" alt="다이어그램" />
            <figcaption>그림 1. 아키텍처 다이어그램</figcaption>
          </figure>
          <blockquote>핵심 규칙: 모든 블록은 검증 가능한 슬롯으로 분리됩니다.</blockquote>
          <h2>세부 구조</h2>
          <ul><li>항목 하나</li><li>항목 둘</li></ul>
        </article>
      </body>
    </html>
    """
    png = _png_bytes()
    res = run_webpage_extraction(
        "https://blog.example.com/posts/1",
        options=WebpageExtractOptions(target_height_px=650, split_mode="height"),
        fetcher=_FakeWebFetcher(html, "https://blog.example.com/posts/1"),
        asset_fetcher=_FakeAssetFetcher({"https://cdn.example.com/fig1.png": (png, "image/png")}),
    )

    doc = res.document
    assert doc["version"] == "1.0.0"
    assert doc["title"] == "엔지니어링 아티클 샘플"
    assert doc["preview"]["sourceWebUrl"] == "https://blog.example.com/posts/1"
    assert len(doc["preview"]["pageThumbnails"]) == len(doc["pages"])
    assert all(t.startswith("data:image/jpeg;base64,") for t in doc["preview"]["pageThumbnails"])
    assert validate_vdoc_document(doc) == []

    assert res.metrics.image_total == 1
    assert res.metrics.image_resolved == 1
    assert res.metrics.image_failed == 0

    all_blocks = [b for p in doc["pages"] for b in p["blocks"]]
    img_block = next(b for b in all_blocks if b["kind"] == "image")
    assert img_block["src"].startswith("data:image/")
    assert any(b["kind"] == "callout-box" for b in all_blocks)
    assert any(b["kind"] == "heading" for b in all_blocks)
