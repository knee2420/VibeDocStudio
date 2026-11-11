"""사이트 비의존 브라우저 실측(`BrowserLayoutSnapshot`) 추출 · 다열 스트립 · 소제목 승격 · 폴백 E2E 테스트."""
from __future__ import annotations

import base64
import io
import json
from typing import Optional

from PIL import Image

from webpage_fidelity_engine import (
    BrowserLayoutSnapshot,
    WebpageExtractOptions,
    run_webpage_extraction,
)
from webpage_fidelity_engine.extract import extract_ir_from_browser_snapshot
from webpage_fidelity_engine.fetch.browser_fetcher import parse_browser_snapshot_json
from webpage_fidelity_engine.verify import validate_vdoc_document


def _jpeg_bytes(width: int, height: int, color: tuple[int, int, int] = (20, 90, 140)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="JPEG")
    return buf.getvalue()


class _FakeBrowserLayout:
    def __init__(self, snapshot: Optional[BrowserLayoutSnapshot]) -> None:
        self._snapshot = snapshot

    def render_dom(self, url: str, *, timeout_s: float = 15.0) -> Optional[tuple[str, str]]:
        return None

    def render_layout_snapshot(
        self,
        url: str,
        *,
        viewport_width: int = 1280,
        timeout_s: float = 18.0,
    ) -> Optional[BrowserLayoutSnapshot]:
        return self._snapshot


class _FakeWebFetcher:
    def __init__(self, html: str, final_url: str) -> None:
        self._html = html.encode("utf-8")
        self._url = final_url

    def fetch(self, url: str, *, timeout_s: float = 12.0) -> tuple[bytes, str, str]:
        return self._html, "text/html; charset=utf-8", self._url


class _FakeAssetFetcher:
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


def _sample_browser_snapshot_json() -> str:
    payload = {
        "url": "https://travel.example.com/post/42",
        "title": "도시 탐방 노트",
        "siteName": "Travel Log",
        "bodyFontSizePx": 15.0,
        "rawTextChars": 160,
        "elements": [
            {
                "kindHint": "quote",
                "tag": "blockquote",
                "rect": {"x": 40, "y": 100, "width": 680, "height": 42},
                "text": "가장 영감을 준 도시는?",
                "html": "가장 영감을 준 도시는?",
                "style": {
                    "align": "left",
                    "fontSizePx": 18,
                    "fontWeight": "normal",
                    "hasBottomRule": True,
                    "hasLeftBorder": False,
                    "hasBoxBorder": False,
                    "borderColor": "#94a3b8",
                },
                "lineCount": 1,
            },
            {
                "kindHint": "image",
                "tag": "img",
                "rect": {"x": 40, "y": 160, "width": 342, "height": 512},
                "image": {
                    "src": "https://cdn.example.com/ny_left.jpg",
                    "alt": "좌측 세로 사진",
                    "widthPx": 1365,
                    "heightPx": 2048,
                    "renderWidthPx": 342,
                    "renderHeightPx": 512,
                },
                "style": {},
            },
            {
                "kindHint": "image",
                "tag": "img",
                "rect": {"x": 392, "y": 160, "width": 328, "height": 512},
                "image": {
                    "src": "https://cdn.example.com/ny_right.jpg",
                    "alt": "우측 세로 사진",
                    "widthPx": 1308,
                    "heightPx": 2048,
                    "renderWidthPx": 328,
                    "renderHeightPx": 512,
                },
                "style": {},
            },
            {
                "kindHint": "quote",
                "tag": "blockquote",
                "rect": {"x": 40, "y": 700, "width": 680, "height": 88},
                "text": "참고사항: 주말 오전 방문 시 대기 줄이 짧고 전시 관람 동선이 쾌적합니다.",
                "html": "참고사항: 주말 오전 방문 시 대기 줄이 짧고 전시 관람 동선이 쾌적합니다.",
                "style": {
                    "bgColor": "#f1f5f9",
                    "hasBottomRule": False,
                    "hasLeftBorder": True,
                    "hasBoxBorder": False,
                },
                "lineCount": 2,
            },
            {
                "kindHint": "paragraph",
                "tag": "p",
                "rect": {"x": 40, "y": 810, "width": 680, "height": 76},
                "text": "거리마다 서점과 갤러리가 많아 매일 산책하듯 레퍼런스를 수집했습니다.",
                "html": "거리마다 서점과 갤러리가 많아 매일 산책하듯 레퍼런스를 수집했습니다.",
                "style": {"fontSizePx": 15},
                "lineCount": 2,
            },
        ],
    }
    return json.dumps(payload, ensure_ascii=False)


def test_browser_snapshot_clusters_horizontal_images_and_distinguishes_underline_quote_from_callout() -> None:
    snapshot = parse_browser_snapshot_json(_sample_browser_snapshot_json())
    assert snapshot is not None
    ir = extract_ir_from_browser_snapshot(snapshot, include_images=True)

    assert ir.profile_name == "browser_layout"
    # 합성 h1 + 밑줄형 quote 승격 heading + 나란한 2열 image_strip + 좌선/배경 quote + 본문
    assert [n.kind for n in ir.nodes] == ["heading", "heading", "image_strip", "quote", "paragraph"]

    promoted = ir.nodes[1]
    assert promoted.text == "가장 영감을 준 도시는?"
    assert promoted.style.underline_rule is True

    strip = ir.nodes[2]
    assert len(strip.images) == 2
    assert strip.column_widths_px == [342.0, 328.0]

    callout = ir.nodes[3]
    assert callout.style.has_left_border is True


def test_pipeline_uses_browser_snapshot_primary_and_emits_tall_page_rect_and_uncapped_grid() -> None:
    snapshot = parse_browser_snapshot_json(_sample_browser_snapshot_json())
    left_jpg = _jpeg_bytes(1365, 2048, (30, 60, 120))
    right_jpg = _jpeg_bytes(1308, 2048, (180, 90, 40))

    res = run_webpage_extraction(
        "https://travel.example.com/post/42",
        options=WebpageExtractOptions(target_height_px=1500, split_mode="height"),
        browser_dom=_FakeBrowserLayout(snapshot),
        asset_fetcher=_FakeAssetFetcher(
            {
                "https://cdn.example.com/ny_left.jpg": (left_jpg, "image/jpeg"),
                "https://cdn.example.com/ny_right.jpg": (right_jpg, "image/jpeg"),
            }
        ),
    )

    doc = res.document
    assert validate_vdoc_document(doc) == []
    assert res.metrics.profile_used == "browser_layout"
    assert doc["pages"][0]["pageRect"]["unit"] == "px"
    assert doc["pages"][0]["pageRect"]["height"] >= 1500

    blocks = [b for p in doc["pages"] for b in p["blocks"]]
    h2 = next(b for b in blocks if b["kind"] == "heading" and b.get("level") == 2)
    assert "underline" in h2

    grid = next(b for b in blocks if b["kind"] == "columns-grid")
    assert grid["widths"] != ["1fr", "1fr"]
    assert float(grid["widths"][0].removesuffix("fr")) > float(grid["widths"][1].removesuffix("fr"))
    assert grid["columns"][0]["image"]["maxHeight"] != "260px"
    assert grid["columns"][0]["image"]["objectFit"] == "contain"

    # 세로로 긴 1500px 페이지 썸네일은 A4 240px 보다 세로 비율이 길어야 한다
    thumb_uri = doc["preview"]["pageThumbnails"][0]
    raw_jpg = base64.b64decode(thumb_uri.split(",", 1)[1])
    with Image.open(io.BytesIO(raw_jpg)) as thumb_im:
        assert thumb_im.width == 170
        assert thumb_im.height > 300


def test_pipeline_falls_back_to_static_heuristics_when_browser_unavailable() -> None:
    html = """
    <html>
      <head><meta property="og:title" content="폴백 문서" /></head>
      <body>
        <article>
          <h1>폴백 문서</h1>
          <blockquote>첫 번째 질문?</blockquote>
          <img src="https://cdn.example.com/a.jpg" width="600" height="400" />
          <p>첫 번째 설명 문단입니다. 브라우저 없이도 리듬이 감지됩니다.</p>
          <blockquote>두 번째 질문?</blockquote>
          <img src="https://cdn.example.com/b.jpg" width="600" height="400" />
          <p>두 번째 설명 문단입니다. 반복 리듬으로 소제목 승격을 검증합니다.</p>
        </article>
      </body>
    </html>
    """
    jpg = _jpeg_bytes(600, 400)
    res = run_webpage_extraction(
        "https://fallback.example.com/post/1",
        options=WebpageExtractOptions(use_browser_fallback=True, target_height_px=1500),
        fetcher=_FakeWebFetcher(html, "https://fallback.example.com/post/1"),
        browser_dom=_FakeBrowserLayout(None),
        asset_fetcher=_FakeAssetFetcher(
            {
                "https://cdn.example.com/a.jpg": (jpg, "image/jpeg"),
                "https://cdn.example.com/b.jpg": (jpg, "image/jpeg"),
            }
        ),
    )

    assert any("정적 구조 휴리스틱" in w for w in res.warnings)
    blocks = [b for p in res.document["pages"] for b in p["blocks"]]
    h2_titles = [b["title"] for b in blocks if b["kind"] == "heading" and b.get("level") == 2]
    assert "첫 번째 질문?" in h2_titles
    assert "두 번째 질문?" in h2_titles
