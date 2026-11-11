"""중간 IR (`WebNode`) → `.vdoc` 블록 및 슬롯 변환 · 높이 추정."""
from __future__ import annotations

import html as html_lib
import math
from dataclasses import dataclass, field
from typing import Any, Optional

from ..extract.structural_heuristics import compute_image_aspect_weights
from ..models import TextInlineStyle, WebArticleIR, WebImage, WebNode
from .slot_sanitizer import make_slot, sanitize_slot_html

_PAGE_CONTENT_PAD_X = 96.0
_PAGE_CONTENT_PAD_Y = 88.0
_BLOCK_GAP_PX = 16.0


@dataclass
class MappedBlock:
    """페이지 분할기(`paginator`)로 넘길 단일 VDoc 블록 + 슬롯 묶음 + 추정 높이."""

    block: dict[str, Any]
    slots: dict[str, dict[str, Any]]
    estimated_height_px: float
    is_major_heading: bool = False
    keep_with_prev: bool = False
    heading_text: str = ""
    preview_text: str = ""
    preview_images: list[WebImage] = field(default_factory=list)


def _visual_char_len(text: str) -> float:
    # 한글/CJK 전각 문자는 영문/숫자보다 가로 폭이 약 1.75배 넓다.
    total = 0.0
    for ch in text:
        if ord(ch) > 127:
            total += 1.75
        elif ch.isupper():
            total += 1.15
        else:
            total += 0.9
    return total


def _estimate_lines(text: str, *, content_width_px: float, font_size_px: float) -> int:
    if not text:
        return 1
    avg_latin_w = max(5.0, font_size_px * 0.56)
    chars_per_line = max(16.0, content_width_px / avg_latin_w)
    lines = 0
    for para in text.splitlines() or [text]:
        vlen = _visual_char_len(para.strip())
        lines += max(1, math.ceil(vlen / chars_per_line))
    return max(1, lines)


def _coalesce_paragraphs(nodes: list[WebNode]) -> list[WebNode]:
    """연속된 짧은 문단 노드를 적당한 편집·분할 단위(최대 ~380자 / 3문단)로 병합한다."""
    out: list[WebNode] = []
    buf: list[WebNode] = []

    def flush() -> None:
        if not buf:
            return
        if len(buf) == 1:
            out.append(buf[0])
            buf.clear()
            return
        first = buf[0]
        merged_text = "\n".join(n.text for n in buf)
        merged_html = "".join(f"<p>{n.html}</p>" for n in buf)
        out.append(
            WebNode(
                kind="paragraph",
                text=merged_text,
                html=merged_html,
                style=first.style,
                source_tag="p",
            )
        )
        buf.clear()

    for node in nodes:
        if node.kind == "paragraph" and not node.style.bg_color:
            if buf:
                cur_len = sum(len(n.text) for n in buf)
                same_align = buf[0].style.align == node.style.align
                if same_align and len(buf) < 3 and cur_len + len(node.text) <= 380:
                    buf.append(node)
                    continue
                flush()
            buf.append(node)
        else:
            flush()
            out.append(node)
    flush()
    return out


def _constraints_from_style(style: TextInlineStyle, *, default_size: Optional[str] = None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if style.align in ("left", "center", "right"):
        out["align"] = style.align
    if style.font_size_px:
        out["fontSize"] = f"{round(style.font_size_px)}px"
    elif default_size:
        out["fontSize"] = default_size
    if style.color:
        out["color"] = style.color
    if style.line_height:
        out["lineHeight"] = style.line_height
    return out


def _scaled_image_dims(img: WebImage, *, max_w: float, max_h: float) -> tuple[float, float]:
    w = float(img.width_px or img.render_width_px or 640)
    h = float(img.height_px or img.render_height_px or 380)
    if w <= 0 or h <= 0:
        w, h = 640.0, 380.0
    scale = min(1.0, max_w / w, max_h / h)
    # 너무 작은 이미지는 content_width 에 억지로 키우지 않되 합리적 표시 크기를 유지한다.
    disp_w = round(w * scale, 1)
    disp_h = round(h * scale, 1)
    return max(48.0, disp_w), max(40.0, disp_h)


def _node_height_with_browser(node: WebNode, heuristic_h: float, *, content_width: float) -> float:
    """브라우저 실측 높이가 있으면 폭 비율을 보정해 보수적으로 반영한다."""
    mh = node.measured_height_px
    if mh is None or mh <= 0:
        return round(heuristic_h, 1)
    scale = 1.0
    if node.rect and node.rect.width > 80.0:
        scale = max(0.8, min(1.35, node.rect.width / content_width))
    scaled = mh * scale
    return round(max(heuristic_h * 0.85, min(scaled, max(heuristic_h * 1.5, mh + 24.0))), 1)


def _resolve_strip_weights(node: WebNode, valid: list[WebImage]) -> list[float]:
    if len(node.column_widths_px) == len(valid) and all(w > 0 for w in node.column_widths_px):
        raw = [float(w) for w in node.column_widths_px]
    else:
        widths = [float(im.width_px or im.render_width_px or 1.0) for im in valid]
        heights = [float(im.height_px or im.render_height_px or 1.0) for im in valid]
        raw = compute_image_aspect_weights(widths, heights)
    min_w = max(0.05, min(raw))
    return [round(max(0.25, w / min_w), 3) for w in raw]


def map_nodes_to_blocks(
    article: WebArticleIR,
    *,
    target_width_px: int = 794,
    target_height_px: int = 1123,
    inline_images: bool = True,
) -> list[MappedBlock]:
    """`WebArticleIR.nodes` 를 `LAYOUT_BLOCK_KINDS` 에 부합하는 `.vdoc` 블록 목록으로 변환한다."""
    content_width = max(320.0, float(target_width_px) - _PAGE_CONTENT_PAD_X)
    usable_height = max(420.0, float(target_height_px) - _PAGE_CONTENT_PAD_Y)
    max_single_img_h = min(840.0, max(520.0, usable_height * 0.72))

    coalesced = _coalesce_paragraphs(article.nodes)
    mapped: list[MappedBlock] = []
    seq = 0

    def next_id(prefix: str) -> str:
        nonlocal seq
        seq += 1
        return f"w_{prefix}_{seq}"

    for node in coalesced:
        if node.kind == "heading":
            bid = next_id("hd")
            sid = f"{bid}_s"
            lvl = max(1, min(4, node.level or 2))
            fs_px = 22.0 if lvl == 1 else 18.0 if lvl == 2 else 15.5
            inner = node.html or html_lib.escape(node.text)
            slot_html = f"<p>{inner}</p>"
            align = node.style.align if node.style.align in ("left", "center", "right") else "left"
            block: dict[str, Any] = {
                "blockId": bid,
                "kind": "heading",
                "title": node.text[:40] or "제목",
                "slotId": sid,
                "level": lvl,
                "align": align,
            }
            if lvl == 1 or node.style.underline_rule or node.style.has_bottom_rule:
                block["underline"] = {
                    "width": "100%",
                    "thickness": "1px",
                    "color": node.style.border_color or "#cbd5e1",
                    "marginTop": "6px" if lvl == 1 else "8px",
                }
            constraints = _constraints_from_style(node.style, default_size=f"{int(fs_px)}px")
            constraints["fontWeight"] = "700"
            slot = make_slot(sid, node.text[:32] or "제목", slot_html, constraints=constraints)
            lines = _estimate_lines(node.text, content_width_px=content_width, font_size_px=fs_px)
            est_h = _node_height_with_browser(
                node,
                lines * (fs_px * 1.4) + (28.0 if lvl == 1 else 22.0),
                content_width=content_width,
            )
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={sid: slot},
                    estimated_height_px=est_h,
                    is_major_heading=(lvl <= 2),
                    heading_text=node.text,
                    preview_text=node.text,
                )
            )
            continue

        if node.kind == "paragraph":
            bid = next_id("txt")
            sid = f"{bid}_s"
            fs_px = node.style.font_size_px or 14.0
            body_html = node.html if node.html.lstrip().startswith("<p") else f"<p>{node.html}</p>"
            align = node.style.align if node.style.align in ("left", "center", "right") else "left"
            block = {
                "blockId": bid,
                "kind": "text",
                "title": node.text[:32] or "본문",
                "slotId": sid,
                "align": align,
            }
            constraints = _constraints_from_style(node.style, default_size="14px")
            if not constraints.get("lineHeight"):
                constraints["lineHeight"] = "1.65"
            slot = make_slot(sid, "본문", sanitize_slot_html(body_html), constraints=constraints)
            lines = _estimate_lines(node.text, content_width_px=content_width, font_size_px=fs_px)
            est_h = _node_height_with_browser(node, lines * (fs_px * 1.65) + 12.0, content_width=content_width)
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={sid: slot},
                    estimated_height_px=est_h,
                    preview_text=node.text,
                )
            )
            continue

        if node.kind == "list":
            bid = next_id("lst")
            sid = f"{bid}_s"
            tag = "ol" if node.ordered else "ul"
            items_html = "".join(f"<li>{it}</li>" for it in (node.item_htmls or [html_lib.escape(x) for x in node.items]))
            block = {
                "blockId": bid,
                "kind": "text",
                "title": (node.items[0][:28] if node.items else "목록"),
                "slotId": sid,
                "align": "left",
            }
            slot = make_slot(
                sid,
                "목록",
                f"<{tag}>{items_html}</{tag}>",
                constraints={"fontSize": "14px", "lineHeight": "1.6"},
            )
            lines = sum(_estimate_lines(it, content_width_px=content_width - 28.0, font_size_px=14.0) for it in node.items)
            est_h = lines * 23.0 + 14.0
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={sid: slot},
                    estimated_height_px=est_h,
                    preview_text=node.text,
                )
            )
            continue

        if node.kind == "quote":
            bid = next_id("qt")
            sid = f"{bid}_s"
            inner = node.html or html_lib.escape(node.text)
            block = {
                "blockId": bid,
                "kind": "callout-box",
                "title": node.text[:28] or "인용구",
                "slotId": sid,
                "tone": "neutral",
            }
            slot = make_slot(
                sid,
                "인용/강조",
                f"<blockquote><p>{inner}</p></blockquote>",
                constraints=_constraints_from_style(node.style, default_size="14px"),
            )
            lines = _estimate_lines(node.text, content_width_px=content_width - 36.0, font_size_px=14.0)
            est_h = lines * 22.0 + 38.0
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={sid: slot},
                    estimated_height_px=est_h,
                    preview_text=node.text,
                )
            )
            continue

        if node.kind == "code":
            bid = next_id("cd")
            sid = f"{bid}_s"
            block = {
                "blockId": bid,
                "kind": "callout-box",
                "title": "코드 블록",
                "slotId": sid,
                "tone": "neutral",
            }
            slot = make_slot(
                sid,
                "코드",
                node.html or f"<pre><code>{html_lib.escape(node.text)}</code></pre>",
                constraints={"fontSize": "12.5px", "lineHeight": "1.5"},
            )
            lines = max(1, len(node.text.splitlines()))
            est_h = min(460.0, lines * 19.0 + 36.0)
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={sid: slot},
                    estimated_height_px=est_h,
                    preview_text=node.text[:80],
                )
            )
            continue

        if node.kind == "link_card" and node.link_card is not None:
            card = node.link_card
            bid = next_id("lnk")
            sid = f"{bid}_s"
            title_esc = html_lib.escape(card.title or card.url)
            url_esc = html_lib.escape(card.url, quote=True)
            parts = [f'<p><strong><a href="{url_esc}">{title_esc}</a></strong></p>']
            if card.description:
                parts.append(f"<p>{html_lib.escape(card.description[:140])}</p>")
            if card.domain:
                parts.append(f'<p><span style="color: #64748b">{html_lib.escape(card.domain)}</span></p>')
            block = {
                "blockId": bid,
                "kind": "callout-box",
                "title": (card.title or "링크 카드")[:32],
                "slotId": sid,
                "tone": "info",
            }
            slot = make_slot(sid, "링크 카드", "".join(parts), constraints={"fontSize": "13px", "lineHeight": "1.5"})
            est_h = 84.0 if card.description else 64.0
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={sid: slot},
                    estimated_height_px=est_h,
                    preview_text=card.title,
                )
            )
            continue

        if node.kind == "divider":
            bid = next_id("hr")
            sid = f"{bid}_s"
            block = {
                "blockId": bid,
                "kind": "text",
                "title": "구분선",
                "slotId": sid,
                "align": "center",
            }
            slot = make_slot(sid, "구분선", "<hr/>")
            mapped.append(MappedBlock(block=block, slots={sid: slot}, estimated_height_px=24.0))
            continue

        if node.kind == "image" and node.images:
            img = node.images[0]
            src = img.resolved_src or ("" if inline_images else img.src)
            if not src:
                if img.caption:
                    bid = next_id("cap")
                    sid = f"{bid}_s"
                    cap_block = {"blockId": bid, "kind": "text", "title": "이미지 캡션", "slotId": sid, "align": "center"}
                    cap_slot = make_slot(sid, "캡션", f"<p><em>{html_lib.escape(img.caption)}</em></p>")
                    mapped.append(MappedBlock(block=cap_block, slots={sid: cap_slot}, estimated_height_px=34.0))
                continue
            disp_w, disp_h = _scaled_image_dims(img, max_w=content_width, max_h=max_single_img_h)
            bid = next_id("img")
            block = {
                "blockId": bid,
                "kind": "image",
                "title": (img.caption or img.alt or "웹 이미지")[:32],
                "src": src,
                "alt": img.alt or img.caption or "",
                "width": f"{int(round(disp_w))}px",
                "maxHeight": f"{int(round(max_single_img_h))}px",
                "align": "center",
                "objectFit": "contain",
            }
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={},
                    estimated_height_px=disp_h + 18.0,
                    preview_text=img.caption or img.alt,
                    preview_images=[img],
                )
            )
            if img.caption:
                cap_bid = next_id("cap")
                cap_sid = f"{cap_bid}_s"
                cap_block = {
                    "blockId": cap_bid,
                    "kind": "text",
                    "title": "이미지 설명",
                    "slotId": cap_sid,
                    "align": "center",
                }
                cap_slot = make_slot(
                    cap_sid,
                    "이미지 설명",
                    f"<p><em>{html_lib.escape(img.caption)}</em></p>",
                    constraints={"fontSize": "12px", "color": "#64748b", "align": "center"},
                )
                mapped.append(
                    MappedBlock(
                        block=cap_block,
                        slots={cap_sid: cap_slot},
                        estimated_height_px=30.0,
                        keep_with_prev=True,
                        preview_text=img.caption,
                    )
                )
            continue

        if node.kind == "image_strip" and node.images:
            valid = [im for im in node.images if (im.resolved_src or ("" if inline_images else im.src))]
            if not valid:
                continue
            bid = next_id("strip")
            weights = _resolve_strip_weights(node, valid)
            sum_w = max(0.1, sum(weights))
            avail_w = max(200.0, content_width - 24.0 * max(0, len(valid) - 1))
            max_row_h = min(880.0, max(440.0, usable_height * 0.74))
            cols = []
            row_h = 140.0
            for im, weight in zip(valid, weights):
                src = im.resolved_src or im.src
                col_w = avail_w * (weight / sum_w)
                iw = float(im.width_px or im.render_width_px or col_w)
                ih = float(im.height_px or im.render_height_px or (col_w * 0.75))
                natural_h = col_w * (ih / iw) if iw > 0 and ih > 0 else col_w * 0.75
                row_h = max(row_h, min(max_row_h, natural_h))
                cols.append(
                    {
                        "image": {
                            "src": src,
                            "alt": im.alt or "Image",
                            "width": "100%",
                            "height": "auto",
                            "maxHeight": f"{int(round(max_row_h))}px",
                            "align": "center",
                            "objectFit": "contain",
                        }
                    }
                )
            block = {
                "blockId": bid,
                "kind": "columns-grid",
                "title": f"이미지 묶음 ({len(valid)}컷)",
                "widths": [f"{w}fr" for w in weights],
                "cardStyle": "plain",
                "columns": cols,
            }
            mapped.append(
                MappedBlock(
                    block=block,
                    slots={},
                    estimated_height_px=round(row_h + 16.0, 1),
                    preview_images=valid,
                )
            )
            continue

        if node.kind == "table" and node.rows:
            bid = next_id("tbl")
            n_cols = max((sum(c.col_span for c in r) for r in node.rows), default=1)
            pct = f"{round(100.0 / max(1, n_cols), 2)}%"
            table_slots: dict[str, dict[str, Any]] = {}
            rows_out: list[dict[str, Any]] = []
            for r_idx, row in enumerate(node.rows):
                cells_out: list[dict[str, Any]] = []
                for c_idx, cell in enumerate(row):
                    csid = f"{bid}_r{r_idx}_c{c_idx}"
                    table_slots[csid] = make_slot(
                        csid,
                        cell.text[:24] or f"셀 {r_idx + 1}-{c_idx + 1}",
                        cell.html,
                        constraints={"fontSize": "12.5px", "fontWeight": "600" if cell.is_header else "normal"},
                    )
                    cell_def: dict[str, Any] = {
                        "cellId": f"cell_{csid}",
                        "slotId": csid,
                        "isHeader": cell.is_header,
                        "vAlign": "middle" if cell.is_header else "top",
                        "hAlign": cell.align,
                        "padding": "6px 8px",
                        "fontSize": "12.5px",
                    }
                    if cell.col_span > 1:
                        cell_def["colSpan"] = cell.col_span
                    if cell.row_span > 1:
                        cell_def["rowSpan"] = cell.row_span
                    cells_out.append(cell_def)
                rows_out.append({"rowId": f"{bid}_row{r_idx}", "cells": cells_out})
            block = {
                "blockId": bid,
                "kind": "structured-table",
                "title": "표",
                "columnWidths": [pct] * max(1, n_cols),
                "borderRules": {
                    "outer": "1px solid #cbd5e1",
                    "headerBottom": "1px solid #94a3b8",
                    "rowBottom": "1px solid #e2e8f0",
                    "vertical": "1px solid #e2e8f0",
                },
                "headerStyle": {"bg": "#f8fafc", "fontWeight": "600", "padding": "6px 8px"},
                "rows": rows_out,
            }
            est_h = len(node.rows) * 34.0 + 24.0
            mapped.append(MappedBlock(block=block, slots=table_slots, estimated_height_px=est_h))

    return mapped
