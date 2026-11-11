"""본문 격리 · 노이즈 제거 · SSRF 검증 단위 테스트."""
from __future__ import annotations

import pytest

from webpage_fidelity_engine.extract import (
    extract_metadata,
    isolate_article_root,
    parse_html_dom,
)
from webpage_fidelity_engine.fetch import validate_public_http_url


def test_ssrf_blocks_localhost_and_private_ips() -> None:
    for bad in (
        "file:///etc/passwd",
        "ftp://example.com",
        "http://localhost:8090/admin",
        "http://127.0.0.1:9222/json",
        "http://10.0.0.1/internal",
        "http://192.168.1.10/",
        "http://169.254.169.254/latest/meta-data/",
    ):
        with pytest.raises(ValueError):
            validate_public_http_url(bad)

    assert validate_public_http_url("https://example.com/post/1", allow_private_hosts=True) == "https://example.com/post/1"


def test_isolate_article_root_ignores_header_logo_article_tag() -> None:
    html = """
    <html>
      <head>
        <title>사이트명</title>
        <meta property="og:title" content="실제 뉴스 기사 제목" />
      </head>
      <body>
        <header>
          <article class="gl-logo-container"><a href="/">LOGO</a></article>
          <nav><ul><li>메뉴1</li><li>메뉴2</li></ul></nav>
        </header>
        <main>
          <h1 class="heading">실제 뉴스 기사 제목</h1>
          <div id="article-view-content-div" itemprop="articleBody">
            <div id="audio-tts-container"><button id="tts-load-btn">기사를 읽어드립니다.</button></div>
            <p>첫 번째 본문 문단입니다. 충분한 길이를 가진 기사 텍스트입니다.</p>
            <p>두 번째 본문 문단입니다. 핵심 통계와 사실이 담겨 있습니다.</p>
          </div>
          <aside class="sidebar">관련 기사 모음</aside>
        </main>
      </body>
    </html>
    """
    dom = parse_html_dom(html)
    meta = extract_metadata(dom)
    assert meta["title"] == "실제 뉴스 기사 제목"
    assert meta["headline"] == "실제 뉴스 기사 제목"

    root = isolate_article_root(dom)
    assert root.elem_id == "article-view-content-div"
    assert "첫 번째 본문 문단" in root.compact_text()
    assert "메뉴1" not in root.compact_text()


def test_heading_style_tag_does_not_leak_into_text() -> None:
    html = """
    <html><body><article>
      <h2><style>.css-p4abj2{display:contents;line-height:1.55;}</style>모델 실행 환경 설계</h2>
      <p>본문 문단이 이어집니다.</p>
    </article></body></html>
    """
    dom = parse_html_dom(html)
    root = isolate_article_root(dom)
    h2 = root.select_first(frozenset({"h2"}))
    assert h2 is not None
    assert h2.compact_text() == "모델 실행 환경 설계"
