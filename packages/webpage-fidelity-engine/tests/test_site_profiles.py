"""사이트 프로파일(네이버 스마트에디터 ONE + 범용 아티클/뉴스) 추출 테스트."""
from __future__ import annotations

from webpage_fidelity_engine.extract import extract_article_ir


def test_naver_smart_editor_profile_extracts_components_and_lazy_images() -> None:
    html = """
    <html>
      <head>
        <meta property="og:title" content="여행 기록 1일차" />
        <meta property="og:site_name" content="네이버 블로그" />
      </head>
      <body>
        <div class="se-main-container">
          <div class="se-component se-documentTitle">
            <div class="se-title-text"><p>여행 기록 1일차</p></div>
          </div>
          <div class="se-component se-text">
            <p class="se-text-paragraph se-text-paragraph-align-center">
              <span class="se-fs-fs24" style="font-weight: bold; color: #1e293b">첫 번째 방문지</span>
            </p>
            <p class="se-text-paragraph">
              <span>도착하자마자 바로 이동한 거리 풍경입니다.</span>
            </p>
          </div>
          <div class="se-component se-quotation">
            <blockquote class="se-quotation-container">
              <p>오전 9시 이전 방문이 가장 한산합니다.</p>
            </blockquote>
          </div>
          <div class="se-component se-image">
            <img src="https://example.com/placeholder.gif" data-lazy-src="https://postfiles.pstatic.net/photo1.jpg" alt="광장" />
            <div class="se-caption">중앙 광장 전경</div>
          </div>
          <div class="se-component se-imageStrip">
            <img data-lazy-src="https://postfiles.pstatic.net/strip1.jpg" alt="컷1" />
            <img data-lazy-src="https://postfiles.pstatic.net/strip2.jpg" alt="컷2" />
          </div>
          <div class="se-component se-oglink">
            <a href="https://example.org/guide">
              <span class="se-oglink-title">공식 안내 페이지</span>
              <span class="se-oglink-summary">운영 시간 및 예약 정보</span>
              <span class="se-oglink-url">example.org</span>
            </a>
          </div>
          <div class="se-component se-horizontalLine"><hr class="se-hr" /></div>
          <div class="se-component se-sticker"><img src="https://store.pstatic.net/sticker.png" /></div>
        </div>
      </body>
    </html>
    """
    ir = extract_article_ir(html, url="https://m.blog.naver.com/tester/123")
    assert ir.profile_name == "naver_smart_editor"
    kinds = [n.kind for n in ir.nodes]
    assert kinds == ["heading", "heading", "paragraph", "quote", "image", "image_strip", "link_card", "divider"]

    assert ir.nodes[1].style.align == "center"
    assert ir.nodes[4].images[0].src == "https://postfiles.pstatic.net/photo1.jpg"
    assert ir.nodes[4].images[0].caption == "중앙 광장 전경"
    assert len(ir.nodes[5].images) == 2
    assert ir.nodes[6].link_card is not None
    assert ir.nodes[6].link_card.title == "공식 안내 페이지"


def test_generic_article_profile_extracts_headings_code_table_and_figure() -> None:
    html = """
    <html>
      <head><meta property="og:title" content="아키텍처 노트" /></head>
      <body>
        <article>
          <h1>아키텍처 노트</h1>
          <h2><style>.x{color:red}</style>개요</h2>
          <p>이 문단은 <strong>핵심 설계</strong>와 <a href="/details">세부 링크</a>를 담고 있습니다.</p>
          <blockquote>핵심 원칙: 실행은 격리하고 상태는 보존한다.</blockquote>
          <pre><code>def run():\n    return 42</code></pre>
          <table>
            <thead><tr><th>항목</th><th>설명</th></tr></thead>
            <tbody><tr><td>레이어</td><td>격리 경계</td></tr></tbody>
          </table>
          <figure>
            <img src="/assets/diagram.png" alt="구조도" width="800" height="450" />
            <figcaption>그림 1. 전체 구성도</figcaption>
          </figure>
        </article>
      </body>
    </html>
    """
    ir = extract_article_ir(html, url="https://tech.example.com/posts/1")
    assert ir.profile_name == "generic_article"
    kinds = [n.kind for n in ir.nodes]
    assert kinds == ["heading", "heading", "paragraph", "quote", "code", "table", "image"]
    assert ir.nodes[1].text == "개요"
    assert 'href="https://tech.example.com/details"' in ir.nodes[2].html
    assert ir.nodes[6].images[0].src == "https://tech.example.com/assets/diagram.png"
    assert ir.nodes[6].images[0].caption == "그림 1. 전체 구성도"

