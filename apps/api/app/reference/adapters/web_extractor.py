"""웹 페이지 → 레퍼런스 구조 추출 (표준 라이브러리 HTML 파서) · URL 가져오기."""
from __future__ import annotations

import html
import re
import urllib.request
from html.parser import HTMLParser
from typing import Any, Optional

_SKIP = {"script", "style", "noscript", "svg", "nav", "header", "footer", "aside", "form", "iframe", "button", "template"}
_HEADINGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 3, "h5": 3, "h6": 3}
_VOID = {"br", "img", "hr", "meta", "link", "input", "source", "wbr", "area", "col", "embed", "param", "track"}
_MAX_BYTES = 6 * 1024 * 1024


class _Collector(HTMLParser):
    """본문 덩어리(제목 · 문단 · 목록 항목 · 표)를 순서대로 모은다. 굵게는 <b> 로 남긴다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta: dict[str, str] = {}
        self.blocks: list[dict[str, Any]] = []
        self._skip = 0
        self._in_title = False
        self._root_depth: Optional[int] = None  # <article>/<main> 이 있으면 그 안만
        self._depth = 0
        self._cur: Optional[dict[str, Any]] = None
        self._bold = 0
        self._table: Optional[list[list[str]]] = None
        self._cell: Optional[list[str]] = None

    # 본문 루트 판단은 두 번 읽어서 한다 (feed 전에 has_root 를 정해 둔다)
    has_root = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in _VOID:
            if tag == "meta":
                a = {k: v or "" for k, v in attrs}
                key = a.get("property") or a.get("name")
                if key in ("og:title", "og:site_name", "author", "description"):
                    self.meta[key] = a.get("content", "")
            elif tag == "br" and self._cur is not None:
                self._cur["parts"].append(" ")
            return
        self._depth += 1
        if tag == "title":
            self._in_title = True
        if self._skip or tag in _SKIP:
            self._skip += 1
            return
        if self.has_root and self._root_depth is None and tag in ("article", "main"):
            self._root_depth = self._depth
        if not self._active():
            return
        if tag == "table":
            self._flush()
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._table.append([])
        elif tag in ("td", "th") and self._table is not None:
            self._cell = []
        elif tag in _HEADINGS:
            self._start("heading", _HEADINGS[tag])
        elif tag == "li":
            self._start("list", 0)
        elif tag in ("p", "blockquote", "figcaption", "dd", "dt"):
            self._start("paragraph", 0)
        elif tag in ("b", "strong"):
            self._bold += 1
            if self._cur is not None:
                self._cur["parts"].append("<b>")

    def handle_endtag(self, tag: str) -> None:
        if tag in _VOID:
            return
        if tag == "title":
            self._in_title = False
        if self._skip:
            self._skip -= 1
            self._depth -= 1
            return
        if self._active():
            if tag in ("td", "th") and self._table is not None and self._cell is not None:
                if self._table:
                    self._table[-1].append(" ".join("".join(self._cell).split()))
                self._cell = None
            elif tag == "table" and self._table is not None:
                rows = [r for r in self._table if any(c for c in r)]
                if rows:
                    cells = "".join("<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in r) + "</tr>" for r in rows)
                    self.blocks.append({"kind": "table", "level": 0, "text": "\n".join(" | ".join(r) for r in rows),
                                        "html": f"<table>{cells}</table>"})
                self._table = None
            elif tag in ("b", "strong") and self._bold:
                self._bold -= 1
                if self._cur is not None:
                    self._cur["parts"].append("</b>")
            elif tag in _HEADINGS or tag in ("li", "p", "blockquote", "figcaption", "dd", "dt"):
                self._flush()
        if self._root_depth is not None and self._depth == self._root_depth and tag in ("article", "main"):
            self._flush()
            self._root_depth = -1  # 첫 본문 루트만 쓴다
        self._depth -= 1

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
            return
        if self._skip or not self._active():
            return
        if self._cell is not None:
            self._cell.append(data)
            return
        if self._cur is None:
            if not data.strip():
                return
            self._start("paragraph", 0)  # 태그 없이 흩어진 글자
        self._cur["parts"].append(html.escape(data))
        self._cur["text"].append(data)

    def _active(self) -> bool:
        if not self.has_root:
            return True
        return self._root_depth is not None and self._root_depth > 0

    def _start(self, kind: str, level: int) -> None:
        self._flush()
        self._cur = {"kind": kind, "level": level, "parts": ["<b>"] if self._bold else [], "text": []}

    def _flush(self) -> None:
        cur, self._cur = self._cur, None
        if cur is None:
            return
        text = " ".join("".join(cur["text"]).replace("​", "").split())
        if not text:
            return
        inner = re.sub(r"\s+", " ", "".join(cur["parts"])).strip()
        inner = inner.replace("<b></b>", "")
        if inner.count("<b>") > inner.count("</b>"):
            inner += "</b>" * (inner.count("<b>") - inner.count("</b>"))
        if cur["kind"] == "heading":
            block_html = f"<h{cur['level']}>{inner}</h{cur['level']}>"
        elif cur["kind"] == "list":
            block_html = f"<ul><li>{inner}</li></ul>"
        else:
            block_html = f"<p>{inner}</p>"
        self.blocks.append({"kind": cur["kind"], "level": cur["level"], "text": text, "html": block_html})


class HtmlStructureExtractor:
    def extract(self, page: str | bytes, url: str = "", content_type: str = "") -> dict[str, Any]:
        page_html = decode_html(page, content_type) if isinstance(page, bytes) else page
        has_root = bool(re.search(r"<(article|main)[\s>]", page_html, re.I))
        collector = _Collector()
        collector.has_root = has_root
        collector.feed(page_html)
        collector.close()
        collector._flush()
        if has_root and not collector.blocks:  # 본문 루트가 비었으면 문서 전체에서 다시
            collector = _Collector()
            collector.feed(page_html)
            collector.close()
            collector._flush()

        blocks = []
        for idx, b in enumerate(collector.blocks, start=1):
            blocks.append({"id": f"b{idx}", "page": 1, "kind": b["kind"], "level": b["level"],
                           "text": b["text"], "html": b["html"], "bbox": None})
        outline = [{"blockId": b["id"], "title": b["text"][:120], "level": b["level"], "page": 1}
                   for b in blocks if b["kind"] == "heading"]
        title = " ".join((collector.meta.get("og:title") or collector.title or "").split())
        article = {
            "title": title,
            "siteName": collector.meta.get("og:site_name", ""),
            "byline": collector.meta.get("author", ""),
            "url": url,
            "html": "\n".join(b["html"] for b in blocks),
            "text": "\n\n".join(b["text"] for b in blocks),
        }
        return {"version": 1, "kind": "web", "pages": [{"page": 1, "width": 0, "height": 0}],
                "blocks": blocks, "outline": outline, "article": article}


class UrllibWebFetcher:
    def __init__(self, timeout_seconds: float = 12.0) -> None:
        self.timeout = timeout_seconds

    def fetch(self, url: str) -> tuple[bytes, str]:
        if not re.match(r"^https?://", url or "", re.I):
            raise ValueError("http(s) 주소만 받을 수 있습니다.")
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VibeDocStudio-Reference/1.0",
            "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        })
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 — 사용자가 고른 주소
            data = resp.read(_MAX_BYTES + 1)
            if len(data) > _MAX_BYTES:
                raise ValueError("페이지가 너무 큽니다 (6MB 초과).")
            return data, str(resp.headers.get("Content-Type") or "")


def decode_html(data: bytes, content_type: str = "") -> str:
    match = re.search(r"charset=([\w-]+)", content_type or "", re.I) or re.search(
        rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:4096], re.I
    )
    charset = match.group(1) if match else "utf-8"
    if isinstance(charset, bytes):
        charset = charset.decode("ascii", "ignore")
    try:
        return data.decode(charset, errors="replace")
    except LookupError:
        return data.decode("utf-8", errors="replace")
