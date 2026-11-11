"""Tiptap (`SlotRichTextEditor`) 스키마 호환 HTML 정제기 및 슬롯 생성 헬퍼."""
from __future__ import annotations

import html as html_lib
import re
from typing import Any, Optional

_SCRIPT_OR_STYLE_RE = re.compile(r"<\s*(script|style|iframe|object|embed)\b[^>]*>.*?<\s*/\s*\1\s*>", re.I | re.S)
_EVENT_HANDLER_RE = re.compile(r"\son[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_JS_HREF_RE = re.compile(r"href\s*=\s*([\"'])\s*javascript:[^\"']*\1", re.I)


def sanitize_slot_html(raw_html: str, *, fallback_tag: str = "p") -> str:
    """안전하지 않은 태그/이벤트를 제거하고 비어 있지 않은 Tiptap 블록 HTML 로 정규화한다."""
    cleaned = _SCRIPT_OR_STYLE_RE.sub("", raw_html or "")
    cleaned = _EVENT_HANDLER_RE.sub("", cleaned)
    cleaned = _JS_HREF_RE.sub('href="#"', cleaned)
    cleaned = cleaned.strip()
    if not cleaned:
        return f"<{fallback_tag}></{fallback_tag}>"
    if not re.match(r"^\s*<(p|h[1-4]|ul|ol|blockquote|pre|hr)\b", cleaned, re.I):
        return f"<{fallback_tag}>{cleaned}</{fallback_tag}>"
    return cleaned


def make_slot(
    slot_id: str,
    label: str,
    content: str,
    *,
    role: str = "editable-slot",
    constraints: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """`@vibe/vdoc-schema` `VDocSlot` 규격 딕셔너리를 생성한다."""
    slot: dict[str, Any] = {
        "slotId": slot_id,
        "label": (label or "슬롯")[:48],
        "role": role,
        "content": sanitize_slot_html(content),
        "backDataRefs": [],
    }
    if constraints:
        clean_c = {k: v for k, v in constraints.items() if v is not None and v != ""}
        if clean_c:
            slot["constraints"] = clean_c
    return slot


def plain_to_paragraph_html(text: str) -> str:
    clean = " ".join((text or "").split())
    return f"<p>{html_lib.escape(clean)}</p>" if clean else "<p></p>"

