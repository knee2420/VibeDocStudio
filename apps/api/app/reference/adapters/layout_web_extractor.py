"""웹 레퍼런스 → 레이아웃 보존 구조 추출 (`webpage-fidelity-engine` · 헤드리스 브라우저 실측).

표준 라이브러리 HTML 파서(`HtmlStructureExtractor`)는 글만 남기고 사진 · 사진 묶음 · 링크 카드 · 구분선을 버린다.
블로그 같은 시각 글은 그 배치 자체가 '결정'이라, 엔진이 만든 `.vdoc` 레이아웃을 그대로 보관하고(`layout` 산출물)
레퍼런스 덩어리 목록으로 옮겨 적는다. 덩어리 종류:

    heading · paragraph · list · table · caption · callout        (글)
    image(사진 1장 · 스티커) · gallery(사진 n장 묶음) · link-card · divider   (배치)

사진 · 링크 카드 덩어리는 `media` 에 장 수 · 폭 · 역할을 적는다 (레퍼런스 사진은 내 문서의 재료가 아니다 —
측정 · 배치 패턴 해석에만 쓴다).
"""
from __future__ import annotations

import html as html_lib
import re
from typing import Any, Optional

#: 이보다 좁은 사진은 스티커 · 아이콘 (본문 사진이 아니다)
_STICKER_MAX_PX = 160


def _plain(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html or "", flags=re.I)
    text = re.sub(r"</(p|li|h[1-6])>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"[ \t]+", " ", html_lib.unescape(text)).strip()


def _px(value: Any) -> Optional[float]:
    m = re.match(r"\s*([\d.]+)\s*px", str(value or ""))
    return float(m.group(1)) if m else None


def _slot_html(slots: dict[str, Any], slot_id: Optional[str]) -> str:
    slot = slots.get(slot_id or "") if slot_id else None
    return str(slot.get("content") or "") if isinstance(slot, dict) else ""


def _slot_label(slots: dict[str, Any], slot_id: Optional[str]) -> str:
    slot = slots.get(slot_id or "") if slot_id else None
    return str(slot.get("label") or "") if isinstance(slot, dict) else ""


def layout_to_extraction(layout: dict[str, Any], url: str = "") -> dict[str, Any]:
    """엔진 `.vdoc` → 레퍼런스 `extraction.json` (version 2: 배치 덩어리 포함)."""
    slots = layout.get("slots") or {}
    block_rects = (layout.get("preview") or {}).get("blockRects") or {}
    blocks: list[dict[str, Any]] = []
    cur_rect: dict[str, Any] | None = None

    def add(kind: str, *, text: str = "", html: str = "", level: int = 0, **extra: Any) -> None:
        geom: dict[str, Any] = {}
        if isinstance(cur_rect, dict) and cur_rect.get("y") is not None:
            geom["sourceY"] = cur_rect["y"]
            if cur_rect.get("height") is not None:
                geom["sourceHeight"] = cur_rect["height"]
        blocks.append({"id": f"b{len(blocks) + 1}", "page": 1, "kind": kind, "level": level,
                       "text": text, "html": html, "bbox": None, **geom, **extra})

    for page in layout.get("pages") or []:
        for b in page.get("blocks") or []:
            cur_rect = block_rects.get(str(b.get("blockId") or ""))
            kind = b.get("kind")
            sid = b.get("slotId")
            html = _slot_html(slots, sid)
            text = _plain(html)
            align = b.get("align")
            style = {"align": align} if align else {}
            if kind in ("heading", "form-title"):
                # 측정은 제목을 <h2> 로 알아본다 (원문 서식 html 은 style 로 보존)
                add("heading", text=text, html=f"<h2>{html_lib.escape(text)}</h2>", level=2, style=style,
                    source_html=html)
            elif kind == "divider":
                add("divider", text="", html="<hr/>", media={"variant": b.get("variant") or "line"})
            elif kind == "text":
                label = _slot_label(slots, sid)
                if label == "구분선" or (not text and "<hr" in html):
                    add("divider", html="<hr/>", media={"variant": "line"})
                elif not text:
                    continue
                elif label in ("이미지 설명", "캡션") or "_cap_" in str(sid or ""):
                    add("caption", text=text, html=html, style=style)
                elif re.search(r"<(ul|ol)[\s>]", html, re.I):
                    add("list", text=text, html=html, style=style)
                else:
                    add("paragraph", text=text, html=html, style=style)
            elif kind == "image":
                width = _px(b.get("width"))
                role = "sticker" if width is not None and width <= _STICKER_MAX_PX else "photo"
                caption = str(b.get("caption") or "")
                add("image", text=caption or str(b.get("alt") or ""), html="",
                    media={"count": 1, "role": role, "widthPx": width, "src": [str(b.get("src") or "")][:1]})
            elif kind == "columns-grid":
                cols = b.get("columns") or []
                images = [c.get("image") for c in cols if isinstance(c, dict) and isinstance(c.get("image"), dict)]
                if images and len(images) == len(cols):
                    add("gallery", text="", html="",
                        media={"count": len(images), "role": "photo", "widths": list(b.get("widths") or []),
                               "src": [str(i.get("src") or "") for i in images]})
                else:
                    ids = [c.get("slotId") for c in cols if isinstance(c, dict)] or list(b.get("slotIds") or [])
                    parts = [_slot_html(slots, i) for i in ids]
                    add("paragraph", text=" / ".join(_plain(p) for p in parts if p), html="".join(parts),
                        media={"columns": len(ids)})
            elif kind == "link-card":
                add("link-card", text=text, html=html,
                    media={"url": b.get("url") or "", "thumbnail": bool(b.get("thumbnail")), "domain": b.get("domain") or ""})
            elif kind == "callout-box":
                add("callout", text=text, html=html)
            elif kind in ("structured-table", "table"):
                ids: list[str] = []
                for row in b.get("rows") or []:
                    for cell in (row or {}).get("cells") or []:
                        if isinstance(cell, dict) and cell.get("slotId"):
                            ids.append(cell["slotId"])
                add("table", text=" | ".join(_plain(_slot_html(slots, i)) for i in ids), html="")
            elif html:
                add("paragraph", text=text, html=html)

    outline = [{"blockId": b["id"], "title": b["text"][:120], "level": b["level"], "page": 1}
               for b in blocks if b["kind"] == "heading"]
    title = str(layout.get("title") or "")
    photos = sum(int((b.get("media") or {}).get("count") or 0) for b in blocks
                 if b["kind"] in ("image", "gallery") and (b.get("media") or {}).get("role") != "sticker")
    return {
        "version": 2,
        "kind": "web",
        "layout": True,
        "pages": [{"page": 1, "width": 0, "height": 0}],
        "blocks": blocks,
        "outline": outline,
        "article": {"title": title, "siteName": "", "byline": "", "url": url,
                    "html": "\n".join(b["html"] for b in blocks if b["html"]),
                    "text": "\n\n".join(b["text"] for b in blocks if b["text"])},
        "stats": {"photos": photos, "blocks": len(blocks)},
    }


class FidelityWebLayoutExtractor:
    """헤드리스 브라우저로 실측한 레이아웃 `.vdoc` · 레퍼런스 덩어리 · 시각 타일을 함께 만든다."""

    def __init__(self, use_browser: bool = True, capture_screenshots: bool = True) -> None:
        self.use_browser = use_browser
        self.capture_screenshots = capture_screenshots

    def extract_with_shots(self, url: str) -> tuple[dict[str, Any], dict[str, Any], list[Any]]:
        from webpage_fidelity_engine import (
            WebpageExtractOptions,
            run_webpage_extraction,
        )

        opts = WebpageExtractOptions(
            target_height_px=4000,
            split_mode="single",
            include_images=True,
            inline_images=False,
            generate_thumbnails=False,
            use_browser_fallback=self.use_browser,
            fetch_timeout_s=22.0,
            capture_screenshots=self.capture_screenshots,
            max_screenshots=16,
        )
        res = run_webpage_extraction(url, options=opts)
        layout = res.document
        return layout_to_extraction(layout, url), layout, list(getattr(res, "screenshots", []) or [])

    def extract(self, url: str) -> tuple[dict[str, Any], dict[str, Any]]:
        extraction, layout, _ = self.extract_with_shots(url)
        return extraction, layout

    def from_layout(self, layout: dict[str, Any], url: str = "") -> dict[str, Any]:
        return layout_to_extraction(layout, url)
