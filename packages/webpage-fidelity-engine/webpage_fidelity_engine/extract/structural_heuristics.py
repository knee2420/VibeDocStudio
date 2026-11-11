"""사이트 비의존 구조·시각 속성·문서 리듬 기반 후처리 휴리스틱 (브라우저 실측 & 정적 폴백 공용)."""
from __future__ import annotations

import html as html_lib
from typing import Optional

from ..models import TextInlineStyle, WebNode


def _is_short_anchor_candidate(node: WebNode, *, body_font_px: float = 16.0) -> bool:
    """짧은 한두 줄 문구이면서 섹션 소제목 역할을 할 수 있는지 판단한다 (박스형·좌측바 콜아웃 제외)."""
    txt = (node.text or "").strip()
    if not txt or len(txt) > 72:
        return False
    # 명시적 박스(사방 테두리 · 배경 채움 · 왼쪽 인용 세로바)는 콜아웃 상자로 유지
    if node.style.has_box_border or node.style.has_left_border or node.style.bg_color:
        return False
    # 문장이 여러 개(마침표로 끝나는 2문장 이상)면 본문/인용으로 취급
    sentence_ends = sum(1 for ch in txt if ch in (".", "!", "?"))
    if sentence_ends >= 2 and len(txt) > 36:
        return False
    if node.kind == "quote":
        return True
    if node.kind == "paragraph":
        fs = node.style.font_size_px or 0.0
        is_large = fs >= max(17.5, body_font_px * 1.15)
        is_bold_large = node.style.font_weight == "bold" and (fs == 0.0 or fs >= body_font_px)
        return is_large or (is_bold_large and len(txt) <= 48)
    return False


def _follows_media_and_prose(nodes: list[WebNode], idx: int) -> bool:
    """`idx` 노드 바로 뒤에 미디어(이미지/이미지묶음) 또는 본문 문단 패턴이 따라오는지 확인한다."""
    saw_media = False
    for j in range(idx + 1, min(len(nodes), idx + 5)):
        nxt = nodes[j]
        if nxt.kind == "divider":
            continue
        if nxt.kind in ("image", "image_strip"):
            saw_media = True
            continue
        if nxt.kind in ("paragraph", "list", "table"):
            return saw_media or j == idx + 1
        if nxt.kind == "heading":
            return saw_media
    return saw_media


def refine_article_nodes(nodes: list[WebNode], *, body_font_px: float = 16.0) -> list[WebNode]:
    """추출된 `WebNode` 리스트에 사이트 비의존 시각·리듬 정규화를 적용한다.

    1) 밑줄/구분선만 있는 짧은 `quote` · 강조 블록은 `heading(level=2, underline_rule=True)` 로 승격
    2) `[짧은 quote/강조 -> 미디어 -> 본문]` 섹션 리듬이 문서 내 2회 이상 반복되면 소제목으로 승격
    3) 소제목 직후 중복 `<hr>` 구분선 및 이미지 직후 짧은 중앙 캡션 정돈
    """
    if not nodes:
        return []

    promote_indices: set[int] = set()
    rhythm_candidates: list[int] = []

    for i, node in enumerate(nodes):
        if node.kind not in ("quote", "paragraph"):
            continue
        if not _is_short_anchor_candidate(node, body_font_px=body_font_px):
            continue

        # 시각적 밑줄 규칙(CSS border-bottom 또는 직후 <hr> 구분선)이 있으면 단독으로도 밑줄형 소제목 승격
        next_is_divider = i + 1 < len(nodes) and nodes[i + 1].kind == "divider"
        if node.style.has_bottom_rule or (node.kind == "quote" and next_is_divider):
            promote_indices.add(i)
            continue

        # 큰 강조 텍스트 + 볼드는 단독 승격
        if node.kind == "paragraph":
            fs = node.style.font_size_px or 0.0
            if fs >= max(18.5, body_font_px * 1.18) and node.style.font_weight == "bold":
                promote_indices.add(i)
                continue

        # 문서 내 반복 리듬 후보 수집
        if node.kind == "quote" and _follows_media_and_prose(nodes, i):
            rhythm_candidates.append(i)

    # 문서 전체에서 '짧은 인용 + 미디어 + 본문' 리듬이 2회 이상 나타나면 일관된 섹션 헤더 패턴으로 판정
    if len(rhythm_candidates) >= 2:
        promote_indices.update(rhythm_candidates)

    out: list[WebNode] = []
    skip_next_divider = False

    for i, node in enumerate(nodes):
        if skip_next_divider:
            skip_next_divider = False
            if node.kind == "divider":
                continue

        if i in promote_indices:
            has_rule = node.style.has_bottom_rule or (i + 1 < len(nodes) and nodes[i + 1].kind == "divider")
            new_style = TextInlineStyle(
                align=node.style.align,
                font_size_px=node.style.font_size_px or 19.0,
                font_weight="bold",
                color=node.style.color,
                bg_color=None,
                line_height=node.style.line_height,
                has_bottom_rule=has_rule,
                border_color=node.style.border_color,
                underline_rule=has_rule,
            )
            out.append(
                WebNode(
                    kind="heading",
                    level=2,
                    text=node.text,
                    html=node.html or html_lib.escape(node.text),
                    style=new_style,
                    source_tag=node.source_tag or "promoted-heading",
                    rect=node.rect,
                    measured_height_px=node.measured_height_px,
                )
            )
            if has_rule and i + 1 < len(nodes) and nodes[i + 1].kind == "divider":
                skip_next_divider = True
            continue

        # 이미지 바로 뒤 짧은 중앙 정렬/이탤릭 캡션 문단을 이미지 caption 으로 흡수 (단일 이미지 한정)
        if (
            node.kind == "paragraph"
            and out
            and out[-1].kind == "image"
            and out[-1].images
            and not out[-1].images[0].caption
            and len(node.text) <= 80
            and not node.style.bg_color
            and (
                node.style.align == "center"
                or (node.style.font_size_px is not None and node.style.font_size_px <= max(13.0, body_font_px * 0.88))
                or node.html.strip().startswith("<em>")
            )
        ):
            prev_img = out[-1].images[0]
            prev_img.caption = node.text
            out[-1].text = node.text
            continue

        out.append(node)

    # 헤딩 자체에 밑줄이 있는 경우 바로 뒤의 단독 구분선은 중복이므로 정리
    cleaned: list[WebNode] = []
    for node in out:
        if node.kind == "divider" and cleaned and cleaned[-1].kind == "heading" and cleaned[-1].style.underline_rule:
            continue
        cleaned.append(node)
    return cleaned


def compute_image_aspect_weights(widths: list[float], heights: list[float]) -> list[float]:
    """이미지 `(width, height)` 목록으로부터 비율 기반 양수 가중치를 계산한다."""
    ratios: list[float] = []
    for w, h in zip(widths, heights):
        if w > 0 and h > 0:
            ratios.append(w / h)
        else:
            ratios.append(1.0)
    if not ratios:
        return []
    min_r = max(0.15, min(ratios))
    return [round(max(0.25, r / min_r), 3) for r in ratios]


def find_aspect_hint(node_style_width_pct: Optional[float]) -> Optional[float]:
    if node_style_width_pct and node_style_width_pct > 0:
        return node_style_width_pct
    return None

