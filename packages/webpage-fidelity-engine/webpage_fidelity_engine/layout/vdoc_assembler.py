"""분할된 페이지 목록과 슬롯을 완전한 `.vdoc` (`VDocDocument`) JSON 으로 조립한다."""
from __future__ import annotations

import html as html_lib
from datetime import datetime, timezone
from typing import Any

from ..models import WebArticleIR, WebpageExtractOptions
from .paginator import PaginatedPage
from .slot_sanitizer import make_slot
from .thumbnail_renderer import render_page_thumbnail_data_url


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def assemble_webpage_vdoc(
    *,
    doc_id: str,
    article: WebArticleIR,
    paginated_pages: list[PaginatedPage],
    options: WebpageExtractOptions,
    title_override: str = "",
) -> dict[str, Any]:
    """`PaginatedPage[]` 로부터 `.vdoc` (`VDocDocument` v1.0.0) 딕셔너리를 조립한다."""
    doc_title = (title_override or article.title or "웹 문서").strip()
    slots: dict[str, dict[str, Any]] = {}
    pages_out: list[dict[str, Any]] = []
    thumbnails: list[str] = []
    block_rects: dict[str, dict[str, float]] = {}

    source_label = article.site_name or article.url
    for pg in paginated_pages:
        pno = pg.page_number
        page_id = f"wpage_{pno}"
        hdr_id = f"{page_id}_header"
        ftr_id = f"{page_id}_footer"

        hdr_text = f"{doc_title[:48]}" if not source_label else f"{source_label[:28]} · {doc_title[:32]}"
        slots[hdr_id] = make_slot(
            hdr_id,
            f"{pno}페이지 머리글",
            f"<p>{html_lib.escape(hdr_text)}</p>",
            role="editable-slot",
            constraints={"fontSize": "11px", "color": "#64748b"},
        )
        slots[ftr_id] = make_slot(
            ftr_id,
            f"{pno}페이지 바닥글",
            f"<p>- {pno} -</p>",
            role="editable-slot",
            constraints={"fontSize": "11px", "color": "#94a3b8", "align": "center"},
        )

        blocks_out: list[dict[str, Any]] = []
        for item in pg.items:
            blocks_out.append(item.block)
            slots.update(item.slots)
            if item.source_rect is not None and item.block.get("blockId"):
                block_rects[str(item.block["blockId"])] = {
                    "x": round(item.source_rect.x, 1),
                    "y": round(item.source_rect.y, 1),
                    "width": round(item.source_rect.width, 1),
                    "height": round(item.source_rect.height, 1),
                }

        page_obj: dict[str, Any] = {
            "pageId": page_id,
            "pageNumber": pno,
            "pageLabel": pg.page_label,
            "hideHeaderFooter": False,
            "headerSlotId": hdr_id,
            "footerSlotId": ftr_id,
            "blocks": blocks_out,
            "layout": {
                "margin": {"top": 24, "right": 44, "bottom": 24, "left": 44},
                "blockGap": 16,
            },
        }
        content_need_h = int(round(pg.used_height_px + 128))
        if options.split_mode in ("single", "heading") or (pg.used_height_px + 96.0 > float(options.target_height_px)):
            page_h = max(int(options.target_height_px), content_need_h)
        else:
            page_h = int(options.target_height_px)
        page_h = max(480, min(4800, page_h))

        if options.target_width_px != 794 or page_h != 1123:
            page_obj["pageRect"] = {
                "width": float(options.target_width_px),
                "height": float(page_h),
                "unit": "px",
            }
        pages_out.append(page_obj)

        if options.generate_thumbnails:
            thumbnails.append(
                render_page_thumbnail_data_url(
                    pg,
                    target_width_px=options.target_width_px,
                    target_height_px=page_h,
                )
            )

    preview: dict[str, Any] = {}
    if article.url:
        preview["sourceWebUrl"] = article.url
    if thumbnails:
        preview["pageThumbnails"] = thumbnails
    if block_rects:
        preview["blockRects"] = block_rects

    doc: dict[str, Any] = {
        "version": "1.0.0",
        "docId": doc_id,
        "title": doc_title,
        "status": "Draft",
        "totalValueText": f"Webpage Import ({len(pages_out)}p)",
        "updatedAt": _utc_now_iso(),
        "variables": {},
        "pages": pages_out,
        "slots": slots,
        "backdata": {},
    }
    if preview:
        doc["preview"] = preview
    return doc

