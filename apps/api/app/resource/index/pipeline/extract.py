"""조각 → 카드 재료 (결정적 추출).

LLM 없이도 카드가 쓸모 있어야 한다 — 표 · 그림 · 코드 · 정의 목록 · 명령어/옵션 같은
"놓치기 쉬운 원자 요소"는 규칙으로 정확하게 뽑는 편이 LLM 보다 낫다. LLM 보강은
요약 · 별칭 · 예상 질문처럼 규칙으로 못 만드는 것만 더한다.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

from harness_kit import packs

from .contracts import Anchor, Asset, Element, Segment

#: 색인 어휘 (불용어 · 조사 · 캡션) — 하네스 resource 팩 (index)
_LEX = packs.data("resource:index/lexicon.ko.json")

_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")
_IMAGE_MD = re.compile(r"!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+\"([^\"]*)\")?\s*\)")
#: `<img …>` 와 문서 사이트의 이미지 컴포넌트(`<StaticImage path=… alt=…/>`, `<Image src=…>`)
_IMAGE_HTML = re.compile(r"<(?:img|[A-Z]\w*Image\w*|Image)\b[^>]*>", re.S)
_IMAGE_TAG_OPEN = re.compile(r"<(?:img|[A-Z]\w*Image\w*|Image)\b")


def _images_in(block: str) -> list[tuple[str, str]]:
    """덩어리 안의 모든 이미지 → (대체 텍스트, 대상)."""
    out: list[tuple[str, str]] = []
    for m in _IMAGE_MD.finditer(block):
        out.append((m.group(3) or m.group(1) or "", m.group(2)))
    for m in _IMAGE_HTML.finditer(block):
        attrs = dict(_ATTR.findall(m.group(0)))
        target = attrs.get("src") or attrs.get("path") or attrs.get("href") or ""
        if target and not target.startswith("data:"):
            out.append(((attrs.get("alt") or attrs.get("title") or "").strip(), target))
    return out
_ATTR = re.compile(r"(\w+)\s*=\s*[\"']([^\"']*)[\"']")
_FENCE_OPEN = re.compile(r"^\s*(```|~~~)\s*([\w+\-.#]*)")
_DEF_LINE = re.compile(r"^\s*(?:[-*+]|\d+[.)])?\s*\*\*([^*]{1,80})\*\*\s*[:：—–-]?\s*(.*)$")
_COLON_DEF = re.compile(r"^\s*[-*+]\s+`?([^:`]{2,60})`?\s*[:：]\s+(.{4,})$")
_LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.{3,})$")
_INLINE_CODE = re.compile(r"`([^`\n]{2,60})`")
_CLI_TOKEN = re.compile(r"(?<![\w/])(--[a-z][\w-]{1,40}|/[a-z][\w-]{1,30}(?=\s|$|[`,.)]))")
_CAPTION_LINE = packs.compile_rx(_LEX["captionLine"])
#: 마크다운 장식만 걷어 낸다 — 식별자 안의 밑줄(`structured_output`)은 살린다
_MD_NOISE = re.compile(r"\*\*|__(?=\w)|(?<=\w)__|[`|]|^\s*[#>]+\s*|(?<!\w)[*_](?=\w)|(?<=\w)[*_](?!\w)|\[([^\]]*)\]\([^)]*\)|<[^>]+>", re.M)

STOPWORDS = set(_LEX["stopwords"])
_KO_PARTICLES = tuple(_LEX["koParticles"])
_TOKEN = re.compile(r"[A-Za-z][A-Za-z0-9_\-.]*[A-Za-z0-9]|[가-힣]{2,}|--[a-z][\w-]+|/[a-z][\w-]+")


def strip_md(text: str) -> str:
    cleaned = _MD_NOISE.sub(lambda m: m.group(1) if m.group(1) is not None else (" " if m.group(0) in ("|",) else ""), text)
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_token(tok: str) -> str:
    tok = tok.lower().strip(".-_")
    if re.fullmatch(r"[가-힣]+", tok):
        for p in _KO_PARTICLES:
            if len(tok) > len(p) + 1 and tok.endswith(p):
                return tok[: -len(p)]
    return tok


_TERM_OK = re.compile(r"[A-Za-z0-9가-힣_\-./@:]{2,40}")


def clean_term(term: str) -> str:
    """강조 용어를 키 하나로: 따옴표 · 괄호 · 쉼표를 걷고, 남은 것이 한 덩어리 용어일 때만 쓴다."""
    t = term.strip().strip("\"'()[]{},;").strip()
    t = normalize_token(t) if " " not in t else t.lower()
    return t if _TERM_OK.fullmatch(t) else ""


def tokenize(text: str) -> list[str]:
    out: list[str] = []
    for raw in _TOKEN.findall(text):
        tok = normalize_token(raw)
        if len(tok) < 2 or tok in STOPWORDS or tok.isdigit():
            continue
        out.append(tok)
    return out


@dataclass
class Extraction:
    elements: list[Element] = field(default_factory=list)
    assets: list[Asset] = field(default_factory=list)
    summary: str = ""
    #: 원문에서 강조된 용어 (인라인 코드 · 굵은 글씨 · 명령어 · 옵션) — 키워드 가중치에 쓴다
    terms: list[str] = field(default_factory=list)


def _line_no(segment: Segment, offset: int) -> int:
    return segment.anchor.line_start + offset


def _caption_near(lines: list[str], idx: int, heading: str) -> str:
    for k in (idx - 1, idx - 2, idx + 1):
        if 0 <= k < len(lines):
            cand = lines[k].strip()
            if cand and _CAPTION_LINE.match(cand):
                return strip_md(cand)[:160]
    prev = lines[idx - 1].strip() if idx > 0 else ""
    if prev and len(prev) <= 140 and not prev.startswith("|") and not prev.startswith("#"):
        return strip_md(prev)[:160]
    return heading


def _split_row(line: str) -> list[str]:
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|"):
        body = body[:-1]
    return [strip_md(c) for c in re.split(r"(?<!\\)\|", body)]


def extract(segment: Segment, *, asset_prefix: str) -> Extraction:
    """`asset_prefix` = 카드 id 의 섹션 · 순번 부분 (`01-03`) — 자산 id 를 카드에 묶는다."""
    lines = segment.text.split("\n")
    ex = Extraction()
    heading = segment.title
    counters = Counter()
    i = 0
    in_fence = False
    fence_lang = ""
    fence_start = 0
    paragraphs: list[str] = []
    para: list[str] = []
    # 프론트매터(`---` … `---`)는 요약 · 요소 후보가 아니다 (원문 메타는 매니페스트가 따로 갖는다)
    if lines and lines[0].strip() == "---":
        for k in range(1, min(len(lines), 80)):
            if lines[k].strip() == "---":
                i = k + 1
                break

    def add_asset(kind: str, caption: str, summary: str, start: int, end: int, **extra) -> None:
        counters[kind] += 1
        letter = {"table": "T", "figure": "F", "code": "X"}[kind]
        asset_id = f"{letter}-{asset_prefix}-{counters[kind]}"
        anchor = Anchor(segment.anchor.source, _line_no(segment, start), _line_no(segment, end), page=segment.anchor.page)
        ex.assets.append(Asset(asset_id=asset_id, kind=kind, card_id="", caption=caption, summary=summary, anchor=anchor, **extra))

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        fence = _FENCE_OPEN.match(line)
        if fence:
            if not in_fence:
                in_fence, fence_lang, fence_start = True, fence.group(2) or "", i
            else:
                body = [ln for ln in lines[fence_start + 1:i] if ln.strip()]
                if body:
                    first = body[0].strip()[:120]
                    caption = _caption_near(lines, fence_start, f"{heading} 코드")
                    add_asset("code", caption, first, fence_start, i, columns=[fence_lang] if fence_lang else [], rows=len(body))
                    for tok in _CLI_TOKEN.findall("\n".join(body))[:6]:
                        ex.terms.append(tok)
                in_fence = False
            i += 1
            continue
        if in_fence:
            i += 1
            continue
        # 표
        if stripped.startswith("|") and i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1]):
            header = _split_row(line)
            j = i + 2
            rows: list[list[str]] = []
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append(_split_row(lines[j]))
                j += 1
            caption = _caption_near(lines, i, f"{heading} 표")
            row_keys = [r[0] for r in rows if r and r[0]][:40]
            add_asset(
                "table", caption, " | ".join(header)[:200], i, j - 1,
                columns=[h for h in header if h][:12], rows=len(rows), row_keys=row_keys,
            )
            for r_idx, row in enumerate(rows[:24]):
                if not row or not row[0]:
                    continue
                detail = "; ".join(f"{header[c] if c < len(header) and header[c] else c}: {row[c]}" for c in range(1, len(row)) if row[c])
                ex.elements.append(Element(name=row[0][:80], detail=detail[:240], line=_line_no(segment, i + 2 + r_idx), origin="table"))
            i = j
            continue
        # 그림 묶음: <figure> … 이미지 … <figcaption> … </figure> — 캡션은 figcaption 이 정본이다
        if re.match(r"^\s*<figure\b", line, re.I):
            j = i
            while j < len(lines) and not re.search(r"</figure>", lines[j], re.I):
                j += 1
            block = "\n".join(lines[i:j + 1])
            found = _images_in(block)
            figcap = re.search(r"<figcaption[^>]*>(.*?)</figcaption>", block, re.S | re.I)
            cap_text = strip_md(re.sub(r"<[^>]+>", " ", figcap.group(1))) if figcap else ""
            for alt, target in found or [("", "")]:
                caption = (cap_text.split(". ")[0] if cap_text else "") or alt or f"{heading} 그림"
                summary = " ".join(x for x in (alt, cap_text) if x)[:400] or caption
                add_asset("figure", caption[:160], summary, i, min(j, len(lines) - 1), target=target)
            i = j + 1
            continue
        # 그림: 마크다운 이미지 · HTML/JSX 이미지 태그 (여러 줄에 걸친 태그는 이어 붙여 읽는다)
        images = list(_IMAGE_MD.finditer(line))
        for m in images:
            alt, target, title = m.group(1).strip(), m.group(2).strip(), (m.group(3) or "").strip()
            caption = title or alt or _caption_near(lines, i, f"{heading} 그림")
            around = strip_md(" ".join(lines[k] for k in (i - 1, i + 1) if 0 <= k < len(lines)))[:200]
            add_asset("figure", caption[:160], around or caption, i, i, target=target, columns=[])
        tag_open = _IMAGE_TAG_OPEN.search(line)
        if tag_open and not images:
            j = i
            while j < len(lines) - 1 and ">" not in "".join(lines[i:j + 1])[tag_open.start():] and j - i < 12:
                j += 1
            for alt, target in _images_in("\n".join(lines[i:j + 1])):
                caption = alt or _caption_near(lines, i, f"{heading} 그림")
                add_asset("figure", caption[:160], caption, i, j, target=target)
                images.append(tag_open)
            if j > i:
                i = j + 1
                continue
        # 정의 · 목록
        d = _DEF_LINE.match(line) or _COLON_DEF.match(line)
        if d and not images:
            name, detail = strip_md(d.group(1)), strip_md(d.group(2))
            if name:
                ex.elements.append(Element(name=name[:80], detail=detail[:240], line=_line_no(segment, i), origin="definition"))
        elif not images:
            li = _LIST_ITEM.match(line)
            if li and len(ex.elements) < 30:
                ex.elements.append(Element(name=strip_md(li.group(1))[:120], line=_line_no(segment, i), origin="list"))
        for tok in _INLINE_CODE.findall(line):
            ex.terms.append(tok.strip())
        for tok in re.findall(r"\*\*([^*]{2,60})\*\*", line):
            ex.terms.append(tok.strip())
        for tok in _CLI_TOKEN.findall(line):
            ex.terms.append(tok)
        # 문단 (요약 후보)
        if (stripped and not stripped.startswith(("#", "|", "-", "*", "+", ">", "<", "{", ":::")) and not images
                and not re.match(r"^(\d+[.)]\s|import\s|export\s)", stripped)):
            para.append(stripped)
        elif para:
            paragraphs.append(" ".join(para))
            para = []
        i += 1
    if para:
        paragraphs.append(" ".join(para))

    ex.summary = _summary(paragraphs, ex.elements, heading)
    # 명령어 · 옵션은 그 자체로 요소다 (질문이 `--sandbox 가 뭐야?` 처럼 들어온다)
    seen = {e.name.lower() for e in ex.elements}
    for term in ex.terms:
        if _CLI_TOKEN.fullmatch(term) and term.lower() not in seen and len(ex.elements) < 40:
            seen.add(term.lower())
            ex.elements.append(Element(name=term, origin="code"))
    ex.elements = _dedupe(ex.elements)[:40]
    return ex


def _summary(paragraphs: list[str], elements: list[Element], heading: str) -> str:
    for p in paragraphs:
        text = strip_md(p)
        if len(text) >= 30:
            sentences = re.split(r"(?<=[.!?。다])\s+", text)
            out = ""
            for s in sentences:
                if len(out) + len(s) > 280:
                    break
                out = f"{out} {s}".strip()
            return out or text[:280]
    if elements:
        names = ", ".join(e.name for e in elements[:6])
        return f"{heading}: {names}"[:280]
    return heading


def _dedupe(elements: list[Element]) -> list[Element]:
    out: list[Element] = []
    seen: set[str] = set()
    for el in elements:
        key = el.name.lower()
        if key in seen or not key:
            continue
        seen.add(key)
        out.append(el)
    return out


def grounded(name: str, text: str) -> bool:
    """LLM 이 낸 요소 이름이 원문에 실제로 있는가 (공백 · 기호 · 대소문자 무시, 토큰 기준 부분 일치 허용)."""
    norm_text = re.sub(r"[\s`*_]+", " ", text.lower())
    norm_name = re.sub(r"[\s`*_]+", " ", name.lower()).strip()
    if not norm_name:
        return False
    if norm_name in norm_text:
        return True
    toks = [t for t in tokenize(name) if len(t) >= 3]
    if not toks:
        return False
    hits = sum(1 for t in toks if t in norm_text)
    return hits / len(toks) >= 0.6


def first_line_containing(segment: Segment, needle: str) -> Optional[int]:
    low = needle.lower()
    for off, line in enumerate(segment.text.split("\n")):
        if low and low in line.lower():
            return segment.anchor.line_start + off
    return None
