"""사이트 비의존 브라우저 실측(`BrowserLayoutSnapshot`) → `WebArticleIR` 변환기."""
from __future__ import annotations

import html as html_lib

from ..models import (
    BrowserElementGeometry,
    BrowserLayoutSnapshot,
    MeasuredRect,
    WebArticleIR,
    WebImage,
    WebNode,
)
from .structural_heuristics import refine_article_nodes


def _y_bands_overlap(a: MeasuredRect, b: MeasuredRect) -> bool:
    """두 요소가 화면에서 같은 가로 행(row)에 나란히 놓였는지 수직 겹침 및 상단 정렬로 판정한다."""
    if a.height <= 0 or b.height <= 0:
        return False
    overlap_y = min(a.y + a.height, b.y + b.height) - max(a.y, b.y)
    min_h = min(a.height, b.height)
    top_diff = abs(a.y - b.y)
    return overlap_y >= min_h * 0.45 or top_diff <= 20.0


def _x_disjoint(row: list[BrowserElementGeometry], cand: BrowserElementGeometry) -> bool:
    """후보 요소가 기존 행 요소들과 가로로 겹치지 않고 나란히 배치되어 있는지 확인한다."""
    cx0, cx1 = cand.rect.x, cand.rect.x + cand.rect.width
    for item in row:
        ix0, ix1 = item.rect.x, item.rect.x + item.rect.width
        overlap_x = min(ix1, cx1) - max(ix0, cx0)
        min_w = min(item.rect.width, cand.rect.width)
        if min_w > 0 and overlap_x > min_w * 0.25:
            return False
    return True


def _merge_horizontal_image_rows(
    elements: list[BrowserElementGeometry],
    *,
    include_images: bool,
) -> list[tuple[str, list[BrowserElementGeometry]]]:
    """연속된 이미지 요소 중 실제 화면 좌표에서 같은 Y 행에 나란히 선 요소들을 다열 이미지 묶음으로 합친다."""
    grouped: list[tuple[str, list[BrowserElementGeometry]]] = []
    i = 0
    n = len(elements)
    while i < n:
        el = elements[i]
        if el.kind_hint == "image" and el.image is not None:
            if not include_images:
                i += 1
                continue
            row: list[BrowserElementGeometry] = [el]
            j = i + 1
            while j < n and len(row) < 4:
                nxt = elements[j]
                if nxt.kind_hint != "image" or nxt.image is None:
                    break
                if _y_bands_overlap(row[0].rect, nxt.rect) and _x_disjoint(row, nxt):
                    row.append(nxt)
                    j += 1
                else:
                    break
            if len(row) >= 2:
                # 왼→오 X 좌표 순서로 정렬해 열 배치 일관성 확보
                row.sort(key=lambda item: item.rect.x)
                grouped.append(("image_strip", row))
            else:
                grouped.append(("single", row))
            i = j
            continue

        grouped.append(("single", [el]))
        i += 1
    return grouped


def extract_ir_from_browser_snapshot(
    snapshot: BrowserLayoutSnapshot,
    *,
    include_images: bool = True,
) -> WebArticleIR:
    """브라우저 실측 좌표 및 계산 스타일로부터 사이트 클래스명 없는 범용 `WebArticleIR` 을 생성한다."""
    grouped = _merge_horizontal_image_rows(snapshot.elements, include_images=include_images)
    raw_nodes: list[WebNode] = []

    for mode, items in grouped:
        if mode == "image_strip":
            imgs: list[WebImage] = []
            col_widths: list[float] = []
            max_h = 0.0
            caption = ""
            for el in items:
                assert el.image is not None
                imgs.append(el.image)
                col_w = el.rect.width or el.image.render_width_px or float(el.image.width_px or 200)
                col_widths.append(round(max(24.0, col_w), 1))
                max_h = max(max_h, el.rect.height or el.image.render_height_px or 0.0)
                if not caption and el.image.caption:
                    caption = el.image.caption
            raw_nodes.append(
                WebNode(
                    kind="image_strip",
                    text=caption,
                    images=imgs,
                    source_tag="browser-row",
                    rect=items[0].rect,
                    measured_height_px=round(max_h, 1) if max_h > 0 else None,
                    column_widths_px=col_widths,
                )
            )
            if caption:
                raw_nodes.append(
                    WebNode(
                        kind="paragraph",
                        text=caption,
                        html=f"<em>{html_lib.escape(caption)}</em>",
                        source_tag="figcaption",
                    )
                )
            continue

        el = items[0]
        kind = el.kind_hint
        if kind == "heading":
            raw_nodes.append(
                WebNode(
                    kind="heading",
                    level=max(1, min(4, el.level or 2)),
                    text=el.text,
                    html=el.html or html_lib.escape(el.text),
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )
        elif kind == "divider":
            raw_nodes.append(
                WebNode(
                    kind="divider",
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=max(12.0, min(32.0, el.rect.height)) if el.rect.height > 0 else None,
                )
            )
        elif kind == "image" and el.image is not None:
            if include_images:
                raw_nodes.append(
                    WebNode(
                        kind="image",
                        text=el.image.caption or el.image.alt,
                        images=[el.image],
                        source_tag="img",
                        rect=el.rect,
                        measured_height_px=el.rect.height if el.rect.height > 0 else None,
                    )
                )
        elif kind == "code":
            raw_nodes.append(
                WebNode(
                    kind="code",
                    text=el.text,
                    html=el.html or f"<pre><code>{html_lib.escape(el.text)}</code></pre>",
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )
        elif kind == "quote":
            # blockquote 가 선/박스 스타일 없이 1줄 이상인 경우 후속 리듬/밑줄 정규화에서 재판정
            raw_nodes.append(
                WebNode(
                    kind="quote",
                    text=el.text,
                    html=el.html or html_lib.escape(el.text),
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )
        elif kind == "list" and el.items:
            raw_nodes.append(
                WebNode(
                    kind="list",
                    text=el.text,
                    ordered=el.ordered,
                    items=el.items,
                    item_htmls=el.item_htmls,
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )
        elif kind == "table" and el.rows:
            raw_nodes.append(
                WebNode(
                    kind="table",
                    text=el.text,
                    rows=el.rows,
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )
        elif kind == "link_card" and el.link_card is not None:
            if not include_images:
                el.link_card.thumbnail = None
            raw_nodes.append(
                WebNode(
                    kind="link_card",
                    text=el.text,
                    link_card=el.link_card,
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )
        elif el.text:
            raw_nodes.append(
                WebNode(
                    kind="paragraph",
                    text=el.text,
                    html=el.html or html_lib.escape(el.text),
                    style=el.style,
                    source_tag=el.tag,
                    rect=el.rect,
                    measured_height_px=el.rect.height if el.rect.height > 0 else None,
                )
            )

    nodes = refine_article_nodes(raw_nodes, body_font_px=snapshot.body_font_size_px)
    resolved_title = (snapshot.title or "").strip() or "웹 문서"
    if not any(n.kind == "heading" and n.level == 1 for n in nodes):
        nodes.insert(
            0,
            WebNode(
                kind="heading",
                level=1,
                text=resolved_title,
                html=html_lib.escape(resolved_title),
                source_tag="h1",
            ),
        )

    return WebArticleIR(
        url=snapshot.url,
        title=resolved_title,
        site_name=snapshot.site_name,
        author=snapshot.author,
        description=snapshot.description,
        profile_name="browser_layout",
        nodes=nodes,
        raw_text_chars=snapshot.raw_text_chars or sum(len(n.text) for n in nodes),
    )

