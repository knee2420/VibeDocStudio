"""Visual line construction and lexicon-driven block classification (headings, lists, captions, notes)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from statistics import median
from typing import Any, Literal, Optional

from ..config import compile_patterns, load_registry, load_thresholds
from ..ir.model import BBox, Span, Word, bbox_center
from .text_join import join_words_smart


@dataclass
class VisualLine:
    words: list[Word]
    bbox: BBox
    text: str
    baseline: float
    font_size: float
    bold: bool
    spans: list[Span] = field(default_factory=list)


def spans_from_words(words: list[Word], *, default_size: float = 10.0) -> list[Span]:
    """Merge contiguous words sharing visual style attributes into IR spans."""
    if not words:
        return []
    spans: list[Span] = []
    cur_group: list[Word] = [words[0]]

    def _style_key(w: Word) -> tuple[Any, ...]:
        sz = round(float(w.size or default_size), 1)
        return (bool(w.bold), bool(w.italic), bool(w.underline), w.color or "#000000", sz, w.font or "")

    cur_key = _style_key(words[0])
    for w in words[1:]:
        k = _style_key(w)
        if k == cur_key:
            cur_group.append(w)
        else:
            sz = cur_key[4]
            spans.append(
                Span(
                    wordIds=[x.id for x in cur_group],
                    text=join_words_smart(cur_group),
                    bold=cur_key[0],
                    italic=cur_key[1],
                    underline=cur_key[2],
                    color=cur_key[3],
                    size=sz,
                    font=cur_key[5] or None,
                )
            )
            cur_group = [w]
            cur_key = k

    if cur_group:
        spans.append(
            Span(
                wordIds=[x.id for x in cur_group],
                text=join_words_smart(cur_group),
                bold=cur_key[0],
                italic=cur_key[1],
                underline=cur_key[2],
                color=cur_key[3],
                size=cur_key[4],
                font=cur_key[5] or None,
            )
        )
    return spans


def group_words_into_lines(words: list[Word], *, y_tol_pt: float = 2.0) -> list[VisualLine]:
    """Group non-table words into visual lines sorted top-to-bottom, left-to-right."""
    boxed = [w for w in words if w.bbox is not None]
    if not boxed:
        return []
    ordered = sorted(boxed, key=lambda w: (bbox_center(w.bbox)[1], w.bbox[0]))  # type: ignore[arg-type, index]

    groups: list[list[Word]] = []
    anchors: list[tuple[float, float]] = []  # (mean_cy, min_h)
    for w in ordered:
        assert w.bbox is not None
        cy = (w.bbox[1] + w.bbox[3]) * 0.5
        wh = max(2.0, w.bbox[3] - w.bbox[1])
        placed = False
        for idx, (ay, ah) in enumerate(anchors):
            tol = max(y_tol_pt, min(ah, wh) * 0.55)
            if abs(cy - ay) <= tol:
                groups[idx].append(w)
                new_cy = sum((it.bbox[1] + it.bbox[3]) * 0.5 for it in groups[idx] if it.bbox) / len(groups[idx])
                anchors[idx] = (new_cy, min(ah, wh))
                placed = True
                break
        if not placed:
            groups.append([w])
            anchors.append((cy, wh))

    out: list[VisualLine] = []
    for band in groups:
        band.sort(key=lambda w: (w.bbox[0] if w.bbox else 0.0, w.id))
        # Split multi-column horizontal gaps so left and right columns never fuse on the same Y band
        segments: list[list[Word]] = [[band[0]]]
        for w in band[1:]:
            prev = segments[-1][-1]
            if prev.bbox is not None and w.bbox is not None:
                prev_h = max(6.0, prev.bbox[3] - prev.bbox[1])
                curr_h = max(6.0, w.bbox[3] - w.bbox[1])
                x_gap = w.bbox[0] - prev.bbox[2]
                if x_gap > max(24.0, min(prev_h, curr_h) * 2.4):
                    segments.append([w])
                    continue
            segments[-1].append(w)

        for grp in segments:
            x0 = min(w.bbox[0] for w in grp if w.bbox)
            y0 = min(w.bbox[1] for w in grp if w.bbox)
            x1 = max(w.bbox[2] for w in grp if w.bbox)
            y1 = max(w.bbox[3] for w in grp if w.bbox)
            sizes = [float(w.size) for w in grp if w.size]
            font_size = round(median(sizes), 1) if sizes else round(max(6.0, (y1 - y0) * 0.8), 1)
            bold_chars = sum(len(w.text) for w in grp if w.bold)
            total_chars = max(1, sum(len(w.text) for w in grp))
            baselines = [float(w.baseline) for w in grp if w.baseline is not None]
            baseline = round(median(baselines), 2) if baselines else round(y1, 2)
            out.append(
                VisualLine(
                    words=grp,
                    bbox=(round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)),
                    text=join_words_smart(grp),
                    baseline=baseline,
                    font_size=font_size,
                    bold=(bold_chars / total_chars) >= 0.6,
                    spans=spans_from_words(grp, default_size=font_size),
                )
            )
    out.sort(key=lambda ln: (ln.bbox[1], ln.bbox[0]))
    return out


class PatternMatcher:
    """Compiled regex bank backed exclusively by docstruct/registry.ko.json."""

    def __init__(self, registry: Optional[dict[str, Any]] = None, thresholds: Optional[dict[str, Any]] = None) -> None:
        self.registry = registry or load_registry()
        self.thresholds = thresholds or load_thresholds()
        self.heading_res = compile_patterns([str(p) for p in (self.registry.get("headingPatterns") or [])])
        self.list_specs: list[tuple[str, re.Pattern[str]]] = [
            (str(item.get("kind", "bullet")), re.compile(str(item["pattern"])))
            for item in (self.registry.get("listMarkerPatterns") or [])
            if item.get("pattern")
        ]
        self.caption_res = compile_patterns([str(p) for p in (self.registry.get("captionPatterns") or [])])
        self.note_res = compile_patterns([str(p) for p in (self.registry.get("notePatterns") or [])])
        counter_pats = self.registry.get("pageCounterPatterns") or [
            r"^\(\s*\d+\s*쪽\s*중\s*\d+\s*쪽\s*\)$",
            r"^[-–—]\s*\d+\s*[-–—]$",
            r"^\d+\s*/\s*\d+\s*(?:쪽|p|page)?$",
            r"^Page\s+\d+(?:\s+of\s+\d+)?$",
        ]
        self.page_counter_res = compile_patterns([str(p) for p in counter_pats])
        boundary_pats = self.registry.get("articleBoundaryPatterns") or [
            r"^제\s*\d+\s*[조편장절관]\s*(?:\([^)]*\)|$)",
        ]
        self.article_boundary_res = compile_patterns([str(p) for p in boundary_pats])

    def is_article_boundary(self, text: str) -> bool:
        s = (text or "").lstrip()
        return bool(s and any(rx.match(s) for rx in self.article_boundary_res))

    def match_list_marker(self, text: str) -> Optional[tuple[str, str]]:
        s = (text or "").lstrip()
        for kind, rx in self.list_specs:
            m = rx.match(s)
            if m:
                marker = m.group(1) if m.lastindex else m.group(0).strip()
                valid_kind = (
                    kind
                    if kind in ("bullet", "number", "korean", "paren", "circled", "alpha", "custom")
                    else "custom"
                )
                return marker.strip(), valid_kind
        return None

    def match_caption(self, text: str) -> bool:
        s = (text or "").strip()
        if not s or len(s) > 65:
            return False
        if not any(rx.match(s) for rx in self.caption_res):
            return False
        if len(s) > 28 and not re.match(r"^\s*(?:\[|<).+(?:\]|>)\s*$", s):
            if re.search(r"(?:한다|된다|있다|없다|이다)\.\s*$|[은는이가을를]\s*$", s):
                return False
        return True

    def match_note(
        self,
        line: VisualLine,
        *,
        page_height: float,
        body_size: float,
    ) -> Optional[Literal["footnote", "annotation", "header", "footer"]]:
        s = line.text.strip()
        if not s:
            return None
        if len(s) <= 40 and any(rx.match(s) for rx in self.page_counter_res):
            if line.bbox[3] <= page_height * 0.15:
                return "header"
            if line.bbox[1] >= page_height * 0.85:
                return "footer"
        if line.bbox[3] <= page_height * 0.055 and line.font_size <= body_size * 0.95 and len(s) <= 80:
            return "header"
        if line.bbox[1] >= page_height * 0.935 and line.font_size <= body_size * 0.95 and len(s) <= 80:
            return "footer"
        if any(rx.match(s) for rx in self.note_res):
            if line.bbox[1] >= page_height * 0.72 and line.font_size <= body_size * 0.92:
                return "footnote"
            return "annotation"
        return None

    def _has_leading_bold_stem(self, line: VisualLine, s: str) -> bool:
        if not line.words:
            return bool(line.bold)
        if not line.words[0].bold:
            return False
        if s.endswith(")") and re.match(r"^\d+(?:\.\d+)*\.\s+", s) and "(" in s:
            stem = s.split("(", 1)[0].strip().replace(" ", "")
            if len(stem) >= 3:
                acc = 0
                bold_acc = 0
                for w in line.words:
                    wt = w.text.replace(" ", "")
                    if not wt:
                        continue
                    take = min(len(wt), max(0, len(stem) - acc))
                    if take <= 0:
                        break
                    acc += take
                    if w.bold:
                        bold_acc += take
                if acc > 0 and (bold_acc / acc) >= 0.80:
                    return True
        if len(line.words) >= 2 and not line.words[1].bold:
            return False
        return bool(line.bold)

    def match_heading_level(
        self,
        line: VisualLine,
        *,
        body_size: float,
        page_width: float,
        page_margins_x: tuple[float, float],
    ) -> Optional[int]:
        s = line.text.strip()
        max_len = int(self.thresholds.get("headingMaxLen", 60))
        min_scale = float(self.thresholds.get("headingMinScale", 1.15))
        if not s or len(s) > max_len:
            return None

        col_w = max(40.0, page_margins_x[1] - page_margins_x[0]) if page_margins_x[1] > page_margins_x[0] else page_width
        col_mid = (page_margins_x[0] + page_margins_x[1]) * 0.5 if page_margins_x[1] > page_margins_x[0] else page_width * 0.5
        line_mid = (line.bbox[0] + line.bbox[2]) * 0.5
        line_w = max(1.0, line.bbox[2] - line.bbox[0])
        left_m = line.bbox[0] - page_margins_x[0]
        right_m = page_margins_x[1] - line.bbox[2]
        is_centered = (
            left_m > 18.0
            and right_m > 18.0
            and line_w <= col_w * 0.72
            and abs(line_mid - col_mid) <= max(12.0, page_width * 0.05)
        )
        scale = line.font_size / max(6.0, body_size)

        if scale >= 1.45:
            return 1
        if scale >= min_scale:
            return 1 if (is_centered and line.bold) else 2

        matches_pattern = any(rx.match(s) for rx in self.heading_res)
        looks_like_sentence = (s.endswith(".") and len(s) > 24) or bool(re.search(r"(?:한다|된다|이다)\.\s*$", s))
        if looks_like_sentence:
            return None

        if matches_pattern and self._has_leading_bold_stem(line, s):
            if re.match(r"^\d+\.\s+", s):
                return 2
            return 2 if scale >= 1.05 else 3
        if matches_pattern and is_centered and not re.match(r"^(?:\d+\)|\(\d+\)|[가-하][.)]|[①-⑳])\s+", s):
            return 2
        if line.bold and is_centered and len(s) <= 36:
            return 2
        return None
