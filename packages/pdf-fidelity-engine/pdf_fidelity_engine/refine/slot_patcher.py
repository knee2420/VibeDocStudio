"""바운더리를 건드리지 않고 선별 정제된 텍스트/HTML 로 기존 `slot.content` 만 안전하게 치환한다."""
from __future__ import annotations

import copy
import html
import re
from typing import Any

from ..models import RefinedSlotPatch

NBSP = "\u00a0"
_P_TAG_RE = re.compile(r"<p\s+style=\"([^\"]*)\"", re.I)
_ALLOWED_STYLE_KEYS = ("font-size", "line-height", "font-family", "margin", "margin-top", "margin-left", "text-align")


def _extract_p_styles(old_html: str) -> list[str]:
    """기존 문단 `<p style="...">` 의 레이아웃·글꼴 스타일 목록만 추출한다 (음수 margin span 은 버림)."""
    matches = _P_TAG_RE.findall(old_html or "")
    out: list[str] = []
    for style in matches:
        kept = []
        for part in style.split(";"):
            k = part.split(":", 1)[0].strip().lower()
            if k in _ALLOWED_STYLE_KEYS:
                kept.append(part.strip())
        kept.append("white-space: pre")
        out.append("; ".join(kept))
    return out


def _preserve_multi_spaces(text: str) -> str:
    escaped = html.escape(text)
    return re.sub(r" {2,}", lambda m: NBSP * len(m.group(0)), escaped)


def build_clean_paragraphs_html(old_html: str, paragraphs: list[str]) -> str:
    """기존 문단 `<p>` 의 들여쓰기·글꼴·줄간격은 유지하고, 깨진 span 트리만 깨끗한 단일 span 으로 교체한다."""
    if not paragraphs:
        return old_html
    p_styles = _extract_p_styles(old_html)
    fallback_style = p_styles[-1] if p_styles else "font-size: 11pt; line-height: 1.35; margin: 0"
    rendered: list[str] = []
    for idx, line in enumerate(paragraphs):
        st = p_styles[idx] if idx < len(p_styles) else fallback_style
        text_html = _preserve_multi_spaces(line)
        rendered.append(f'<p style="{st}"><span>{text_html}</span></p>')
    return "".join(rendered)


def apply_slot_patches(
    slots: dict[str, dict[str, Any]],
    patches: dict[str, RefinedSlotPatch],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """정제 패치(`{slotId: RefinedSlotPatch}`)를 슬롯 사본에 적용하고 교체된 슬롯 ID 목록을 반환한다."""
    next_slots = copy.deepcopy(slots)
    applied: list[str] = []
    for slot_id, patch in patches.items():
        slot = next_slots.get(slot_id)
        if not slot:
            continue
        old_html = str(slot.get("content") or "")
        if patch.html and patch.html.strip().startswith("<"):
            next_html = patch.html.strip()
        elif patch.paragraphs:
            next_html = build_clean_paragraphs_html(old_html, patch.paragraphs)
        else:
            continue
        if next_html != old_html:
            slot["content"] = next_html
            applied.append(slot_id)
    return next_slots, applied

