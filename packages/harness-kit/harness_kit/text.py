"""HTML → 구조 보존 텍스트 · 비교용 순수 글자 (모든 측정 · 검증이 같은 변환을 쓴다)."""
from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser
from typing import Optional


class _TextHtml(HTMLParser):
    """제목(#) · 목록(-) · 굵게(**) · 표 칸(|) · 인용(>) 을 남기는 간단한 변환기."""

    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote", "section", "article"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.line: list[str] = []
        self.prefix = ""

    def _flush(self) -> None:
        text = "".join(self.line).strip()
        if text:
            self.out.append(self.prefix + text)
        self.line = []
        self.prefix = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in self.BLOCK:
            self._flush()
            if tag.startswith("h") and len(tag) == 2:
                self.prefix = "#" * int(tag[1]) + " "
            elif tag == "li":
                self.prefix = "- "
            elif tag == "blockquote":
                self.prefix = "> "
        elif tag == "br":
            self._flush()
        elif tag in ("strong", "b"):
            self.line.append("**")
        elif tag in ("td", "th"):
            if self.line:
                self.line.append(" | ")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("strong", "b"):
            self.line.append("**")
        elif tag in self.BLOCK:
            self._flush()

    def handle_data(self, data: str) -> None:
        self.line.append(data)

    def text(self) -> str:
        self._flush()
        return "\n".join(self.out)


def html_to_text(content: str) -> str:
    if not content:
        return ""
    if "<" not in content:
        return html_lib.unescape(content).strip()
    parser = _TextHtml()
    try:
        parser.feed(content)
        parser.close()
    except Exception:  # 깨진 HTML 이라도 글자는 돌려준다
        return re.sub(r"<[^>]+>", " ", content)
    return re.sub(r"\*\*\s*\*\*", "", parser.text())


def plain(content: str) -> str:
    """굵게 표시까지 뺀 순수 글자 (비교 · 검증용)."""
    return re.sub(r"\s+", " ", html_to_text(content).replace("**", "")).strip()
