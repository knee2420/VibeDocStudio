"""CSS 스타일(인라인 style + 단순 클래스 규칙 + 네이버 에디터 클래스) 정규화기."""
from __future__ import annotations

import re
from typing import Optional

from ..models import TextInlineStyle
from .dom_tree import DomNode

_NAMED_COLORS = {
    "black": "#000000",
    "white": "#ffffff",
    "red": "#dc2626",
    "blue": "#2563eb",
    "green": "#16a34a",
    "gray": "#6b7280",
    "grey": "#6b7280",
    "navy": "#1e3a8a",
    "orange": "#ea580c",
    "purple": "#7c3aed",
}
_RULE_RE = re.compile(r"([^{}]+)\{([^{}]+)\}")
_CLASS_SEL_RE = re.compile(r"^\.([a-zA-Z0-9_-]+)$")
_RGB_RE = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)", re.I)
_HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_NAVER_FS_RE = re.compile(r"^se-fs-(?:fs)?(\d{2})$")


def normalize_css_color(raw: str) -> Optional[str]:
    """CSS 색상값을 `#rrggbb` 형태로 정규화한다. 투명/유효하지 않으면 None."""
    val = (raw or "").strip().lower()
    if not val or val in ("transparent", "inherit", "initial", "unset", "currentcolor"):
        return None
    if val in _NAMED_COLORS:
        return _NAMED_COLORS[val]
    m_hex = _HEX_RE.match(val)
    if m_hex:
        body = m_hex.group(1)
        if len(body) == 3:
            body = "".join(c * 2 for c in body)
        return f"#{body}"
    m_rgb = _RGB_RE.match(val)
    if m_rgb:
        alpha = m_rgb.group(4)
        if alpha is not None:
            try:
                if float(alpha) <= 0.05:
                    return None
            except ValueError:
                pass
        r, g, b = (max(0, min(255, int(m_rgb.group(i)))) for i in (1, 2, 3))
        return f"#{r:02x}{g:02x}{b:02x}"
    return None


def parse_css_length_px(raw: str) -> Optional[float]:
    val = (raw or "").strip().lower()
    if not val:
        return None
    if val.endswith("px"):
        try:
            return float(val[:-2])
        except ValueError:
            return None
    if val.endswith("pt"):
        try:
            return float(val[:-2]) * (96.0 / 72.0)
        except ValueError:
            return None
    if val.endswith("rem") or val.endswith("em"):
        unit_len = 3 if val.endswith("rem") else 2
        try:
            return float(val[:-unit_len]) * 16.0
        except ValueError:
            return None
    return None


def parse_inline_style(style_text: str) -> dict[str, str]:
    """`color: #333; font-size: 16px` 를 `{key: value}` 사전으로 파싱한다."""
    out: dict[str, str] = {}
    for decl in (style_text or "").split(";"):
        if ":" not in decl:
            continue
        k, v = decl.split(":", 1)
        key = k.strip().lower()
        val = v.strip()
        if key and val:
            out[key] = val
    return out


class CssRuleIndex:
    """문서 내 `<style>` 태그에서 단일 클래스 기반 스타일(.cls { ... })을 인덱싱한다."""

    def __init__(self, rules_by_class: Optional[dict[str, dict[str, str]]] = None) -> None:
        self._by_class = rules_by_class or {}

    @classmethod
    def from_dom(cls, root: DomNode) -> "CssRuleIndex":
        by_class: dict[str, dict[str, str]] = {}
        for style_node in root.find_all(frozenset({"style"})):
            css_text = "".join(ch.text for ch in style_node.children if ch.is_text)
            if not css_text:
                continue
            # 중첩 @media 등은 단순화를 위해 기본 규칙만 매칭
            for selector_group, body in _RULE_RE.findall(css_text):
                if "@" in selector_group:
                    continue
                props = parse_inline_style(body)
                if not props:
                    continue
                for sel in selector_group.split(","):
                    m = _CLASS_SEL_RE.match(sel.strip())
                    if m:
                        bucket = by_class.setdefault(m.group(1), {})
                        bucket.update(props)
        return cls(by_class)

    def resolve_props(self, node: DomNode) -> dict[str, str]:
        merged: dict[str, str] = {}
        for c in node.classes:
            if c in self._by_class:
                merged.update(self._by_class[c])
        inline = node.attrs.get("style")
        if inline:
            merged.update(parse_inline_style(inline))
        return merged


def extract_node_style(node: DomNode, css_index: Optional[CssRuleIndex] = None) -> TextInlineStyle:
    """DOM 노드에서 Tiptap/VDoc 호환 스타일을 뽑아낸다."""
    props = css_index.resolve_props(node) if css_index else parse_inline_style(node.attrs.get("style") or "")
    style = TextInlineStyle()

    # 1. 정렬
    align = (props.get("text-align") or node.attrs.get("align") or "").strip().lower()
    if align in ("left", "center", "right", "justify"):
        style.align = align  # type: ignore[assignment]
    else:
        for cls_name in node.classes:
            if cls_name.endswith("-align-center") or cls_name in ("text-center", "align-center", "float-center"):
                style.align = "center"
                break
            if cls_name.endswith("-align-right") or cls_name in ("text-right", "align-right", "float-right"):
                style.align = "right"
                break
            if cls_name.endswith("-align-justify"):
                style.align = "justify"
                break

    # 2. 글자 크기 (11px ~ 30px 클램프)
    fs = parse_css_length_px(props.get("font-size") or "")
    if fs is None:
        for cls_name in node.classes:
            m = _NAVER_FS_RE.match(cls_name)
            if m:
                fs = float(m.group(1))
                break
    if fs is not None and 10.0 <= fs <= 48.0:
        style.font_size_px = round(max(11.0, min(30.0, fs)), 1)

    # 3. 굵기
    fw = (props.get("font-weight") or "").strip().lower()
    if fw in ("bold", "bolder", "600", "700", "800", "900"):
        style.font_weight = "bold"

    # 4. 전경/배경 색상 (흰 글자/흰 배경 등 가독성 훼손 색상은 제외)
    fg = normalize_css_color(props.get("color") or "")
    if fg and fg not in ("#ffffff", "#fefefe", "#fafafa"):
        style.color = fg
    bg = normalize_css_color(props.get("background-color") or props.get("background") or "")
    if bg and bg not in ("#ffffff", "#fefefe", "#000000"):
        style.bg_color = bg

    # 5. 줄간격
    lh = (props.get("line-height") or "").strip().lower()
    if lh and (lh.endswith(("px", "pt")) or re.match(r"^\d+(\.\d+)?$", lh)):
        style.line_height = lh

    # 6. 범용 테두리/구분선 CSS 속성
    def _has_border_decl(decl_val: Optional[str]) -> bool:
        val = (decl_val or "").strip().lower()
        if not val or val in ("none", "0", "0px", "hidden"):
            return False
        return not val.startswith("0 ")

    b_all = _has_border_decl(props.get("border"))
    b_top = _has_border_decl(props.get("border-top") or props.get("border-top-width"))
    b_bot = _has_border_decl(props.get("border-bottom") or props.get("border-bottom-width"))
    b_left = _has_border_decl(props.get("border-left") or props.get("border-left-width"))
    b_right = _has_border_decl(props.get("border-right") or props.get("border-right-width"))

    if b_all or (b_top and b_bot and b_left and b_right):
        style.has_box_border = True
    elif b_left:
        style.has_left_border = True
    elif b_bot and not b_top and not b_right and not style.bg_color:
        style.has_bottom_rule = True

    for bcol_key in ("border-bottom-color", "border-left-color", "border-color"):
        c_val = normalize_css_color(props.get(bcol_key) or "")
        if c_val:
            style.border_color = c_val
            break

    return style

