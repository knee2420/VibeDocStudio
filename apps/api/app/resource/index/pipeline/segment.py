"""0층 분할 — 원문 하나를 "제목 경계 + 크기 경계"로 조각낸다.

규칙:
1. 제목(`#`) 줄이 블록을 연다. 코드 펜스 · 프론트매터 안의 `#` 는 제목이 아니다.
2. 작은 블록(< min)은 다음 블록이 같은 깊이거나 더 깊으면 합친다 (상위 제목 아래 짧은 절들).
3. 큰 블록(> max)은 빈 줄(문단) 경계에서 자른다 — 코드 블록 · 표 한가운데서는 자르지 않는다.
4. 제목이 없는 원문(텍스트 · 코드)은 크기 경계만 쓴다.

결과의 조각 id(`S-<문서>-<순번>`)는 같은 원문 · 같은 프로필이면 항상 같다.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from .contracts import Anchor, ScopeProfile, Segment, SourceDoc

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE = re.compile(r"^\s*(```|~~~)")


@dataclass
class _Block:
    level: int  # 0 = 제목 없는 머리
    path: list[str]
    start: int  # 0-based 줄 index (포함)
    end: int  # 0-based (제외)


def _clean_heading(text: str) -> str:
    text = re.sub(r"\{#[^}]*\}\s*$", "", text)  # {#custom-id}
    text = re.sub(r"[*_`]", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    return text.strip()


def _blocks(lines: list[str], doc_title: str) -> list[_Block]:
    blocks: list[_Block] = []
    stack: list[tuple[int, str]] = []
    in_fence = False
    start = 0
    # 프론트매터는 머리 블록에 포함된다 (제목으로 보지 않는다)
    i = 0
    if lines and lines[0].strip() == "---":
        for j in range(1, min(len(lines), 80)):
            if lines[j].strip() == "---":
                i = j + 1
                break
    current_level = 0
    current_path: list[str] = [doc_title] if doc_title else []
    for idx in range(i, len(lines)):
        line = lines[idx]
        if _FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = _HEADING.match(line)
        if not match:
            continue
        if idx > start:
            blocks.append(_Block(current_level, list(current_path), start, idx))
        level = len(match.group(1))
        title = _clean_heading(match.group(2))
        while stack and stack[-1][0] >= level:
            stack.pop()
        stack.append((level, title))
        current_level = level
        current_path = [t for _, t in stack]
        start = idx
    if start < len(lines):
        blocks.append(_Block(current_level, list(current_path), start, len(lines)))
    return [b for b in blocks if any(lines[k].strip() for k in range(b.start, b.end))]


def _block_chars(lines: list[str], block: _Block) -> int:
    return sum(len(lines[k]) + 1 for k in range(block.start, block.end))


def _merge_small(lines: list[str], blocks: list[_Block], min_chars: int, max_chars: int) -> list[_Block]:
    merged: list[_Block] = []
    for block in blocks:
        if merged:
            prev = merged[-1]
            prev_chars = _block_chars(lines, prev)
            size = prev_chars + _block_chars(lines, block)
            # 이전 조각이 작고, 이번 블록이 그 아래(같거나 더 깊은 제목)라면 합친다
            if prev_chars < min_chars and size <= max_chars and (block.level >= prev.level or prev.level == 0):
                # 제목 없는 머리(프론트매터 · 서문)는 뒤 블록의 제목을 이름으로 쓴다
                level, path = (block.level, block.path) if prev.level == 0 else (prev.level, prev.path)
                merged[-1] = _Block(level, path, prev.start, block.end)
                continue
        merged.append(block)
    return merged


def _split_large(lines: list[str], block: _Block, max_chars: int) -> list[_Block]:
    if _block_chars(lines, block) <= max_chars:
        return [block]
    parts: list[_Block] = []
    in_fence = False
    in_table = False
    part_start = block.start
    size = 0
    last_break = None  # 마지막 안전한 자를 위치 (빈 줄 다음)
    for k in range(block.start, block.end):
        line = lines[k]
        if _FENCE.match(line):
            in_fence = not in_fence
        stripped = line.strip()
        in_table = stripped.startswith("|") and not in_fence
        size += len(line) + 1
        if not in_fence and not in_table and not stripped and k > part_start:
            last_break = k + 1
        if size > max_chars and last_break and last_break > part_start:
            parts.append(_Block(block.level, block.path, part_start, last_break))
            size = sum(len(lines[m]) + 1 for m in range(last_break, k + 1))
            part_start = last_break
            last_break = None
        elif size > max_chars * 2 and not in_fence:
            # 빈 줄이 전혀 없는 거대한 덩어리(스크래핑된 한 줄짜리 문서 등): 줄 경계에서 강제로 자른다
            parts.append(_Block(block.level, block.path, part_start, k + 1))
            part_start = k + 1
            size = 0
            last_break = None
    if part_start < block.end:
        parts.append(_Block(block.level, block.path, part_start, block.end))
    if len(parts) > 1:
        total = len(parts)
        for n, part in enumerate(parts, start=1):
            base = part.path[-1] if part.path else "본문"
            part.path = [*part.path[:-1], f"{base} ({n}/{total})"] if part.path else [f"본문 ({n}/{total})"]
    return parts


def _split_long_lines(text: str, max_chars: int) -> list[str]:
    """한 줄이 max 를 넘는 원문(줄바꿈 없는 스크래핑 결과)은 문장 경계에서 줄을 나눈다.

    줄 번호가 원문과 어긋나므로, 이런 줄이 있는 원문만 이 처리를 받는다 (앵커는 정규화 텍스트 기준).
    """
    out: list[str] = []
    for line in text.split("\n"):
        if len(line) <= max_chars:
            out.append(line)
            continue
        pieces = re.split(r"(?<=[.!?。])\s+", line)
        buf = ""
        for piece in pieces:
            while len(piece) > max_chars:
                out.append(piece[:max_chars])
                piece = piece[max_chars:]
            if len(buf) + len(piece) + 1 > max_chars and buf:
                out.append(buf)
                buf = piece
            else:
                buf = f"{buf} {piece}".strip()
        if buf:
            out.append(buf)
    return out


def segment_document(doc: SourceDoc, profile: ScopeProfile) -> tuple[list[Segment], list[str]]:
    """원문 → 조각 목록. 두 번째 값은 앵커가 가리키는 (정규화된) 줄 목록이다."""
    lines = doc.text.split("\n")
    if any(len(line) > profile.max_segment_chars for line in lines):
        lines = _split_long_lines(doc.text, profile.max_segment_chars // 2)
    doc_title = doc.title if doc.kind in ("code", "data", "text") else ""
    blocks = _blocks(lines, doc_title)
    if not blocks:
        return [], lines
    blocks = _merge_small(lines, blocks, profile.min_segment_chars, profile.max_segment_chars)
    final: list[_Block] = []
    for block in blocks:
        final.extend(_split_large(lines, block, profile.max_segment_chars))
    # 크기 분할 뒤에도 너무 작은 꼬리는 앞 조각에 붙인다
    final = _merge_small(lines, final, profile.min_segment_chars // 3, profile.max_segment_chars + profile.min_segment_chars)

    segments: list[Segment] = []
    for seq, block in enumerate(final, start=1):
        # 앞뒤 빈 줄은 앵커에서 뺀다
        s, e = block.start, block.end
        while s < e and not lines[s].strip():
            s += 1
        while e > s and not lines[e - 1].strip():
            e -= 1
        text = "\n".join(lines[s:e])
        path = block.path or [doc.title or doc.rel_path]
        segments.append(
            Segment(
                segment_id=f"S-{doc.doc_no:03d}-{seq:03d}",
                doc_no=doc.doc_no,
                seq=seq,
                heading_path=path,
                anchor=Anchor(doc.rel_path, s + 1, e, page=doc.page_of(s + 1)),
                text=text,
                sha=hashlib.sha1(text.encode("utf-8")).hexdigest(),
            )
        )
    return segments, lines
