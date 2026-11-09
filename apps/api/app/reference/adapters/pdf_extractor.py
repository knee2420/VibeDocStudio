"""PDF → 레퍼런스 구조 추출 (PyMuPDF 직접 사용 — vdoc 변환을 거치지 않는다).

글자 크기 · 굵기 · 위치만으로 제목 / 문단 / 목록 / 표를 가른다. 판단이 틀려도 원본은 그대로 남아 있고,
이 결과는 층위 측정과 목차 · 검색에만 쓴다.
"""
from __future__ import annotations

import html
import re
from collections import Counter
from typing import Any

_BULLET = re.compile(r"^\s*([•·▪◦‣∙●○■□▶▷►\-–—*]|\(?\d{1,2}[.)]|[가-하][.)]|[①-⑳])\s*")
_HEADING_RATIO = 1.15


def _rect_ratio(inner: tuple[float, float, float, float], outer: tuple[float, float, float, float]) -> float:
    x0, y0 = max(inner[0], outer[0]), max(inner[1], outer[1])
    x1, y1 = min(inner[2], outer[2]), min(inner[3], outer[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    area = max(1e-6, (inner[2] - inner[0]) * (inner[3] - inner[1]))
    return (x1 - x0) * (y1 - y0) / area


def _bbox_1000(rect: tuple[float, float, float, float], width: float, height: float) -> list[int]:
    x0, y0, x1, y1 = rect
    w, h = max(width, 1.0), max(height, 1.0)
    clamp = lambda v: max(0, min(1000, int(round(v))))  # noqa: E731
    return [clamp(y0 / h * 1000), clamp(x0 / w * 1000), clamp(y1 / h * 1000), clamp(x1 / w * 1000)]


def _line_html(spans: list[tuple[str, float, bool]]) -> str:
    out = []
    for text, _, bold in spans:
        esc = html.escape(text)
        out.append(f"<b>{esc}</b>" if bold and text.strip() else esc)
    return "".join(out).strip()


def _line_text(spans: list[tuple[str, float, bool]]) -> str:
    return "".join(t for t, _, _ in spans).strip()


def _clean(text: str) -> str:
    """PDF 글자에 섞인 특수 공백(\\xa0 · 폭 없는 공백)을 보통 공백으로."""
    return text.replace("\xa0", " ").replace("​", "").replace("﻿", "")


def _dominant(lines: list[list[tuple[str, float, bool]]]) -> float:
    weights: Counter[float] = Counter()
    for spans in lines:
        for t, size, _ in spans:
            weights[size] += len(t.strip())
    return weights.most_common(1)[0][0] if weights else 0.0


def _merge_wrapped_lines(raw: list[dict[str, Any]], heading_sizes: list[float]) -> list[dict[str, Any]]:
    """PyMuPDF 가 줄마다 덩어리를 나눈 경우, 같은 글자 크기로 바로 이어지는 줄을 한 문단으로 붙인다.

    붙이지 않는 경우: 쪽이 다름 · 표 · 제목 크기 · 줄 간격이 넓음 · 들여쓰기가 다름 · 다음 줄이 목록 기호로 시작.
    """
    out: list[dict[str, Any]] = []
    for item in raw:
        prev = out[-1] if out else None
        if prev is not None and "lines" in prev and "lines" in item and prev["page"] == item["page"]:
            size = _dominant(item["lines"])
            gap = item["rect"][1] - prev["rect"][3]
            same_size = abs(_dominant(prev["lines"]) - size) < 0.6
            if (same_size and size not in heading_sizes and -size < gap <= size * 0.9
                    and abs(item["rect"][0] - prev["rect"][0]) <= size * 1.6
                    and not _BULLET.match(_line_text(item["lines"][0]))):
                x0, y0, x1, y1 = prev["rect"]
                prev["rect"] = (min(x0, item["rect"][0]), y0, max(x1, item["rect"][2]), max(y1, item["rect"][3]))
                prev["lines"] = prev["lines"] + item["lines"]
                continue
        out.append(dict(item))
    return out


class PyMuPdfExtractor:
    def __init__(self, max_pages: int = 300) -> None:
        self.max_pages = max_pages

    def extract(self, data: bytes) -> dict[str, Any]:
        import pymupdf  # 무거운 import 는 쓸 때만

        pages: list[dict[str, Any]] = []
        raw: list[dict[str, Any]] = []
        sizes: Counter[float] = Counter()
        toc: list[list[Any]] = []
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            try:
                toc = doc.get_toc() or []
            except Exception:  # noqa: BLE001 — 목차가 깨진 PDF 도 본문은 읽는다
                toc = []
            for pno, page in enumerate(doc, start=1):
                if pno > self.max_pages:
                    break
                width, height = float(page.rect.width), float(page.rect.height)
                pages.append({"page": pno, "width": round(width, 1), "height": round(height, 1)})
                tables = []
                try:
                    tables = list(page.find_tables().tables)
                except Exception:  # noqa: BLE001 — 표 찾기는 덤이다
                    tables = []
                table_rects = [tuple(t.bbox) for t in tables]
                for t in tables:
                    try:
                        rows = [[_clean(c or "").strip() for c in row] for row in t.extract()]
                    except Exception:  # noqa: BLE001
                        continue
                    if any(any(c for c in row) for row in rows):
                        raw.append({"page": pno, "rect": tuple(t.bbox), "w": width, "h": height, "table": rows})
                for block in page.get_text("dict").get("blocks", []):
                    if block.get("type") != 0:
                        continue
                    rect = tuple(block["bbox"])
                    if any(_rect_ratio(rect, tr) > 0.6 for tr in table_rects):
                        continue
                    lines: list[list[tuple[str, float, bool]]] = []
                    for line in block.get("lines", []):
                        spans = [
                            (_clean(s.get("text", "")), round(float(s.get("size", 0)), 1),
                             bool(int(s.get("flags", 0)) & 16) or "bold" in str(s.get("font", "")).lower())
                            for s in line.get("spans", [])
                        ]
                        if any(t.strip() for t, _, _ in spans):
                            lines.append(spans)
                    if not lines:
                        continue
                    for spans in lines:
                        for text, size, _ in spans:
                            sizes[size] += len(text.strip())
                    raw.append({"page": pno, "rect": rect, "w": width, "h": height, "lines": lines})

        body = sizes.most_common(1)[0][0] if sizes else 10.0
        heading_sizes = sorted({s for s in sizes if s >= body * _HEADING_RATIO}, reverse=True)
        raw.sort(key=lambda b: (b["page"], round(b["rect"][1], 1), round(b["rect"][0], 1)))
        raw = _merge_wrapped_lines(raw, heading_sizes)

        blocks: list[dict[str, Any]] = []
        for item in raw:
            bid = f"b{len(blocks) + 1}"
            bbox = _bbox_1000(item["rect"], item["w"], item["h"])
            if "table" in item:
                rows = item["table"]
                cells = "".join(
                    "<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in row) + "</tr>" for row in rows
                )
                blocks.append({
                    "id": bid, "page": item["page"], "kind": "table", "level": 0,
                    "text": "\n".join(" | ".join(row) for row in rows), "html": f"<table>{cells}</table>", "bbox": bbox,
                })
                continue
            lines = item["lines"]
            texts = [_line_text(spans) for spans in lines]
            text = " ".join(t for t in texts if t)
            weights: Counter[float] = Counter()
            for spans in lines:
                for t, size, _ in spans:
                    weights[size] += len(t.strip())
            dominant = weights.most_common(1)[0][0] if weights else body
            all_bold = all(bold for spans in lines for t, _, bold in spans if t.strip())
            if dominant in heading_sizes and len(text) <= 120:
                level = min(3, heading_sizes.index(dominant) + 1)
                kind = "heading"
            elif all_bold and len(text) <= 60 and len(lines) <= 2:
                level = min(3, len(heading_sizes) + 1)
                kind = "heading"
            elif _BULLET.match(texts[0] or ""):
                kind, level = "list", 0
            else:
                kind, level = "paragraph", 0

            if kind == "heading":
                body_html = " ".join(_line_html(spans) for spans in lines)
                block_html = f"<h{level}>{body_html}</h{level}>"
            elif kind == "list":
                items: list[str] = []
                for spans, line_text in zip(lines, texts):
                    piece = _line_html(spans)
                    if _BULLET.match(line_text) or not items:
                        items.append(piece)
                    else:
                        items[-1] += " " + piece
                block_html = "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
                text = "\n".join(texts)
            else:
                block_html = "<p>" + " ".join(_line_html(spans) for spans in lines) + "</p>"
            blocks.append({"id": bid, "page": item["page"], "kind": kind, "level": level,
                           "text": text, "html": block_html, "bbox": bbox})

        outline = [
            {"blockId": b["id"], "title": b["text"][:120], "level": b["level"], "page": b["page"]}
            for b in blocks if b["kind"] == "heading"
        ]
        if toc and len(outline) < 2:  # 글꼴로 제목을 못 찾으면 PDF 책갈피를 쓴다
            outline = [
                {"blockId": "", "title": str(entry[1])[:120], "level": min(3, int(entry[0])), "page": int(entry[2])}
                for entry in toc if len(entry) >= 3
            ]
        return {"version": 1, "kind": "pdf", "pages": pages, "blocks": blocks, "outline": outline}
