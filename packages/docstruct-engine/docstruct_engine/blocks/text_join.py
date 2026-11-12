"""Domain-agnostic Korean & typographic word/line continuation joining helpers."""
from __future__ import annotations

import re
from typing import Any, Optional, Sequence

from ..ir.model import Word

# Strictly bound Korean postpositions (josa) and endings that attach without leading space
# when separated solely by a PDF soft line-wrap or mid-word font/style span transition.
KOREAN_JOSA: frozenset[str] = frozenset(
    {
        "가",
        "를",
        "을",
        "는",
        "은",
        "의",
        "로",
        "으로",
        "로는",
        "으로는",
        "에",
        "에는",
        "에도",
        "에서",
        "에서는",
        "에서도",
        "에게",
        "에게서",
        "과",
        "와",
    }
)

# Bound `-하다` / `-되다` inflections attached immediately after a verbal-noun stem
# (never merged after adverbs/particles/connective endings like `-야`, `-게`, `-히`, `-을`, `안`).
KOREAN_HADA_SUFFIXES: frozenset[str] = frozenset(
    {
        "한다",
        "하고",
        "하며",
        "하여",
        "해야",
        "하는",
        "했다",
        "하였다",
        "합니다",
        "됩니다",
        "되는",
        "된다",
        "되고",
        "되며",
        "되어",
    }
)

KOREAN_HA_YE_SUFFIXES: frozenset[str] = frozenset({"여", "여야", "여도", "였다", "였으며"})

_NON_HADA_PREV_SUFFIXES: tuple[str, ...] = (
    "을",
    "를",
    "이",
    "가",
    "은",
    "는",
    "에",
    "로",
    "와",
    "과",
    "도",
    "만",
    "게",
    "히",
    "지",
    "어",
    "아",
    "고",
    "며",
    "서",
    "록",
    "야",
    "수",
    "바",
    "줄",
    "듯",
)

_NON_HADA_PREV_WORDS: frozenset[str] = frozenset({"못", "잘", "안", "더", "덜", "다", "꼭", "따로", "함께"})
_TRAILING_PUNCT_RE = re.compile(r"""[.,;:!?)\]」"'”’]+$""")
_EDGE_SPACE_PUNCT_RE = re.compile(r"""^\s+|\s+$""")


def _is_hangul_syllable(ch: str) -> bool:
    if not ch:
        return False
    code = ord(ch)
    return 0xAC00 <= code <= 0xD7A3


def _tail_token(text: str) -> str:
    s = (text or "").rstrip()
    if not s:
        return ""
    return s.split()[-1]


def _head_token_core(text: str) -> str:
    s = (text or "").lstrip()
    if not s:
        return ""
    tok = s.split()[0]
    return _TRAILING_PUNCT_RE.sub("", tok)


def _words_wrap_across_lines(prev_w: Word, curr_w: Word) -> bool:
    if prev_w.bbox is None or curr_w.bbox is None:
        return False
    prev_cy = (prev_w.bbox[1] + prev_w.bbox[3]) * 0.5
    curr_cy = (curr_w.bbox[1] + curr_w.bbox[3]) * 0.5
    line_h = max(6.0, prev_w.bbox[3] - prev_w.bbox[1], curr_w.bbox[3] - curr_w.bbox[1])
    if curr_cy - prev_cy > max(3.5, line_h * 0.45):
        return True
    return curr_w.bbox[0] < prev_w.bbox[0] - line_h and abs(curr_cy - prev_cy) > 2.5


def should_join_text_without_space(
    left_text: str,
    right_text: str,
    *,
    is_line_wrap: bool = False,
    no_explicit_space: bool = False,
) -> bool:
    """Return True if right_text is a bound Korean continuation split from left_text."""
    left_s = (left_text or "").rstrip()
    right_s = (right_text or "").lstrip()
    if not left_s or not right_s:
        return False
    if not (is_line_wrap or no_explicit_space):
        return False

    left_tok = _tail_token(left_s)
    r_core = _head_token_core(right_s)
    if not left_tok or not r_core:
        return False

    last_ch = left_tok[-1]
    if last_ch == "하" and r_core in KOREAN_HA_YE_SUFFIXES:
        return True

    if r_core in KOREAN_JOSA:
        return _is_hangul_syllable(last_ch) or last_ch == ")"

    if _is_hangul_syllable(last_ch) and len(left_tok) >= 2 and r_core in KOREAN_HADA_SUFFIXES:
        if not left_tok.endswith(_NON_HADA_PREV_SUFFIXES) and left_tok not in _NON_HADA_PREV_WORDS:
            return True

    return False


def should_join_words_without_space(
    prev_w: Optional[Word],
    curr_w: Optional[Word],
    *,
    is_line_wrap: Optional[bool] = None,
) -> bool:
    """Determine whether two consecutive IR words should concatenate without a space."""
    if prev_w is None or curr_w is None:
        return False
    wrap = _words_wrap_across_lines(prev_w, curr_w) if is_line_wrap is None else bool(is_line_wrap)
    if wrap:
        # Respect explicit trailing space encoded at end of line 1 if present
        if getattr(prev_w, "trailingSpace", None) is True:
            return False
        return should_join_text_without_space(prev_w.text, curr_w.text, is_line_wrap=True)

    # Same visual line: only join when acquisition recorded absence of explicit PDF space glyph
    space_before = getattr(curr_w, "spaceBefore", None)
    if space_before is True:
        return False
    style_changed = (bool(prev_w.bold) != bool(curr_w.bold)) or ((prev_w.font or "") != (curr_w.font or ""))
    if space_before is False and style_changed:
        return should_join_text_without_space(prev_w.text, curr_w.text, no_explicit_space=True)
    return False


def join_words_smart(
    words: Sequence[Word],
    *,
    preserve_line_breaks: bool = False,
) -> str:
    """Join ordered words, healing bound Korean splits while optionally preserving line breaks."""
    non_empty = [w for w in words if (w.text or "") != ""]
    if not non_empty:
        return ""
    if not preserve_line_breaks:
        parts = [non_empty[0].text]
        for idx in range(1, len(non_empty)):
            prev_w = non_empty[idx - 1]
            curr_w = non_empty[idx]
            sep = "" if should_join_words_without_space(prev_w, curr_w) else " "
            parts.append(sep + curr_w.text)
        return "".join(parts).strip()

    # Preserve visual line breaks ("\n") between lines unless a mid-word continuation occurs
    lines: list[list[Word]] = [[non_empty[0]]]
    for w in non_empty[1:]:
        prev = lines[-1][-1]
        if prev.bbox is not None and w.bbox is not None:
            h = max(prev.bbox[3] - prev.bbox[1], w.bbox[3] - w.bbox[1], 6.0)
            p_cy = (prev.bbox[1] + prev.bbox[3]) * 0.5
            c_cy = (w.bbox[1] + w.bbox[3]) * 0.5
            if abs(c_cy - p_cy) > max(2.5, h * 0.45) and w.bbox[0] < prev.bbox[2] - 2.0:
                lines.append([w])
                continue
        lines[-1].append(w)

    line_texts = [join_words_smart(ln, preserve_line_breaks=False) for ln in lines]
    if len(lines) == 1:
        return line_texts[0]

    out_parts = [line_texts[0]]
    for idx in range(1, len(lines)):
        prev_w = lines[idx - 1][-1]
        curr_w = lines[idx][0]
        sep = "" if should_join_words_without_space(prev_w, curr_w, is_line_wrap=True) else "\n"
        out_parts.append(sep + line_texts[idx])
    return _EDGE_SPACE_PUNCT_RE.sub("", "".join(out_parts))


def join_lines_smart(lines: Sequence[Any], *, newline: bool = False) -> str:
    """Join VisualLine objects into paragraph/list text, healing Korean soft-wrap splits."""
    valid = [ln for ln in lines if getattr(ln, "text", "")]
    if not valid:
        return ""
    parts = [valid[0].text]
    default_sep = "\n" if newline else " "
    for idx in range(1, len(valid)):
        prev_ln = valid[idx - 1]
        curr_ln = valid[idx]
        prev_w = prev_ln.words[-1] if getattr(prev_ln, "words", None) else None
        curr_w = curr_ln.words[0] if getattr(curr_ln, "words", None) else None
        if prev_w is not None and curr_w is not None:
            join = should_join_words_without_space(prev_w, curr_w, is_line_wrap=True)
        else:
            join = should_join_text_without_space(prev_ln.text, curr_ln.text, is_line_wrap=True)
        parts.append(("" if join else default_sep) + curr_ln.text)
    return "".join(parts)

