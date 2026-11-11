"""웹페이지 메타데이터 추출, 노이즈 요소 제거 및 본문 루트 컨테이너 격리."""
from __future__ import annotations

import re
from typing import Optional

from .dom_tree import DomNode

_NOISE_TAGS = frozenset({
    "script", "style", "noscript", "svg", "nav", "header", "footer",
    "aside", "form", "iframe", "button", "dialog", "select", "textarea",
})
_NOISE_ROLES = frozenset({"navigation", "banner", "contentinfo", "complementary", "search", "menu", "menubar"})
_NOISE_TOKEN_RE = re.compile(
    r"(?:^|[-_])(nav|navbar|gnb|lnb|snb|menu|sidebar|side-bar|aside|footer|header|"
    r"ad|ads|adsense|advert|banner|sponsor|promo|popup|modal|cookie|consent|"
    r"comment|comments|reply|replies|share|sns|social|like|bookmark|"
    r"related|recommend|popular|ranking|trending|more-news|paging|pagination|"
    r"breadcrumb|copyright|tts|audio-tts|font-size|fontsize|scroll-bar|floating)(?:$|[-_])",
    re.I,
)
_BODY_PRIORITY_IDS = (
    "article-view-content-div",
    "dic_area",
    "newsct_article",
    "articeBody",
    "articleBody",
    "postViewArea",
)
_BODY_PRIORITY_CLASSES = (
    "se-main-container",
    "article-body",
    "article_body",
    "article-content",
    "post-content",
    "entry-content",
    "markdown-body",
)
_BOILERPLATE_TEXT_RE = re.compile(
    r"^(기사를 읽어드립니다\.?|스크롤 이동 상태바|본문 글자 크기.*|가 기사의 본문 내용은.*|"
    r"공유하기|이전\s*기사|다음\s*기사|무단\s*전재.*금지.*|저작권자\s*[©ⓒ].*)$"
)


def is_noise_element(node: DomNode) -> bool:
    """본문 파싱에서 제외해야 할 내비게이션·광고·댓글·TTS 위젯 등인지 판정한다."""
    if node.is_text:
        return False
    if node.tag in _NOISE_TAGS:
        return True
    if (node.attrs.get("aria-hidden") or "").strip().lower() == "true":
        return True
    role = (node.attrs.get("role") or "").strip().lower()
    if role in _NOISE_ROLES:
        return True
    style = (node.attrs.get("style") or "").replace(" ", "").lower()
    if "display:none" in style or "visibility:hidden" in style:
        return True

    # 본문 컨테이너 자체로 지정된 클래스/ID는 노이즈 토큰 매칭에서 보호한다.
    if node.elem_id in _BODY_PRIORITY_IDS or any(c in _BODY_PRIORITY_CLASSES for c in node.classes):
        return False

    for token in (node.elem_id, *node.classes):
        if token and _NOISE_TOKEN_RE.search(token):
            return True
    return False


def is_boilerplate_text(text: str) -> bool:
    clean = " ".join((text or "").split())
    return not clean or bool(_BOILERPLATE_TEXT_RE.match(clean))


def extract_metadata(root: DomNode) -> dict[str, str]:
    """`<title>`, OpenGraph, author, description 및 대표 헤드라인(h1) 추출."""
    meta: dict[str, str] = {}
    title_node = root.select_first(frozenset({"title"}))
    if title_node:
        meta["title"] = title_node.compact_text()

    for m in root.find_all(frozenset({"meta"})):
        key = (m.attrs.get("property") or m.attrs.get("name") or "").strip().lower()
        val = " ".join((m.attrs.get("content") or "").split())
        if not key or not val:
            continue
        if key in ("og:title", "og:site_name", "author", "article:author", "description", "og:description", "naverblog:nickname"):
            meta.setdefault(key, val)

    # 뉴스 뷰어 등 본문 컨테이너 바깥에 <h1> 이 있는 경우를 위한 대표 헤드라인
    for h1 in root.find_all(frozenset({"h1"})):
        if is_noise_element(h1):
            continue
        txt = h1.compact_text()
        if len(txt) >= 4:
            meta["headline"] = txt
            break

    resolved_title = meta.get("og:title") or meta.get("headline") or meta.get("title") or ""
    author = meta.get("author") or meta.get("article:author") or meta.get("naverblog:nickname") or ""
    return {
        "title": resolved_title.strip(),
        "site_name": (meta.get("og:site_name") or "").strip(),
        "author": author.strip(),
        "description": (meta.get("og:description") or meta.get("description") or "").strip(),
        "headline": (meta.get("headline") or "").strip(),
    }


def _score_container(node: DomNode) -> float:
    """텍스트 밀도, 문단/소제목 수, 링크 텍스트 비중으로 본문 컨테이너 적합도를 계산한다."""
    text_chars = 0
    link_chars = 0
    p_count = 0
    h_count = 0
    img_count = 0

    def walk(cur: DomNode, in_link: bool) -> None:
        nonlocal text_chars, link_chars, p_count, h_count, img_count
        if cur.is_text:
            t = len(" ".join(cur.text.split()))
            text_chars += t
            if in_link:
                link_chars += t
            return
        if is_noise_element(cur):
            return
        if cur.tag == "p":
            p_count += 1
        elif cur.tag in ("h1", "h2", "h3", "h4"):
            h_count += 1
        elif cur.tag == "img":
            img_count += 1
        next_link = in_link or (cur.tag == "a")
        for ch in cur.children:
            walk(ch, next_link)

    walk(node, False)
    if text_chars < 60 and img_count < 2:
        return -1.0
    non_link = max(0, text_chars - link_chars)
    link_ratio = link_chars / max(1, text_chars)
    penalty = 0.25 if link_ratio > 0.65 else 1.0
    return (non_link + p_count * 45 + h_count * 65 + img_count * 35) * penalty


def isolate_article_root(root: DomNode) -> DomNode:
    """웹 문서 전체 DOM 에서 실제 아티클/본문 루트 노드를 격리해 반환한다."""
    # 1. 고유 ID · itemprop="articleBody" 등 명시적 본문 루트 우선
    by_prop = root.select_first(predicate=lambda n: (n.attrs.get("itemprop") or "").lower() == "articlebody")
    if by_prop is not None and _score_container(by_prop) > 0:
        return by_prop

    for target_id in _BODY_PRIORITY_IDS:
        hit = root.select_first(id_name=target_id)
        if hit is not None:
            return hit

    for cls_name in _BODY_PRIORITY_CLASSES:
        hit = root.select_first(class_name=cls_name)
        if hit is not None:
            return hit

    # 2. 모든 <article>, <main>, [role=main] 후보 중 최고 점수 선택 (헤더 로고 <article> 오탐 방지)
    candidates = root.find_all(frozenset({"article", "main"})) + root.find_all(
        predicate=lambda n: (n.attrs.get("role") or "").lower() == "main"
    )
    best_node: Optional[DomNode] = None
    best_score = 0.0
    for cand in candidates:
        if is_noise_element(cand):
            continue
        score = _score_container(cand)
        if score > best_score:
            best_score = score
            best_node = cand
    if best_node is not None and best_score >= 120.0:
        return best_node

    # 3. 일반 <div> / <section> 밀도 기반 폴백
    for cand in root.find_all(frozenset({"section", "div"})):
        if is_noise_element(cand):
            continue
        score = _score_container(cand)
        if score > best_score:
            best_score = score
            best_node = cand
    if best_node is not None:
        return best_node

    body = root.select_first(frozenset({"body"}))
    return body or root

