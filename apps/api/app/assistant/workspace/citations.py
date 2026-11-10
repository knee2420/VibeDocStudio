"""답변 내 근거 인용(Citation) 검증 — 실제로 read_file 로 읽은 줄 범위인지 대조한다."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

# 인용 패턴:
# 1. [label](file:///path/to/file#L10-L20)
# 2. [label](vdoc:resource/id#L10-L20)
# 3. vdoc:resource/id (L 10-20) 또는 (L10-L20)
# 4. 상대 경로 / 파일명 직접 링크: [label](path/to/file.md#L10-L20)
_FILE_LINK_RE = re.compile(
    r"\[(?P<label>[^\]]+)\]\((?:file:///(?P<fpath>[^#\)]+)|vdoc:resource/(?P<rpath>[^#\)]+))#L(?P<start>\d+)(?:-L?(?P<end>\d+))?\)",
    re.IGNORECASE,
)
_VDOC_TEXT_RE = re.compile(
    r"vdoc:resource/(?P<id>[a-zA-Z0-9_-]+)\s*\(\s*L\s*(?P<start>\d+)\s*(?:[-~]\s*(?:L\s*)?(?P<end>\d+))?\s*\)",
    re.IGNORECASE,
)
_RAW_MD_LINK_RE = re.compile(
    r"\[(?P<label>[^\]]+)\]\((?!(?:file:///|vdoc:|https?://|#))(?P<path>[^#\)]+)(?:#L(?P<start>\d+)(?:-L?(?P<end>\d+))?)?\)",
    re.IGNORECASE,
)


@dataclass
class Citation:
    target: str
    start_line: int
    end_line: int
    label: str = ""
    is_verified: bool = False
    warning: Optional[str] = None
    suggested_link: Optional[str] = None
    is_broken_syntax: bool = False


def extract_citations(text: str) -> list[Citation]:
    """텍스트에서 파일/리소스 줄 번호 인용을 모두 추출한다 (문서 내 등장 순서대로 정렬)."""
    if not text:
        return []

    found: list[tuple[int, Citation]] = []
    seen_spans: set[tuple[int, int]] = set()

    for m in _FILE_LINK_RE.finditer(text):
        seen_spans.add((m.start(), m.end()))
        path = m.group("fpath") or m.group("rpath") or ""
        s = int(m.group("start"))
        e = int(m.group("end")) if m.group("end") else s
        found.append((m.start(), Citation(target=path.replace("\\", "/"), start_line=s, end_line=e, label=m.group("label") or "")))

    for m in _VDOC_TEXT_RE.finditer(text):
        seen_spans.add((m.start(), m.end()))
        rid = m.group("id")
        s = int(m.group("start"))
        e = int(m.group("end")) if m.group("end") else s
        found.append((m.start(), Citation(target=rid, start_line=s, end_line=e, label=f"resource/{rid}")))

    for m in _RAW_MD_LINK_RE.finditer(text):
        if any(s <= m.start() and m.end() <= e for s, e in seen_spans):
            continue
        p = m.group("path").strip()
        s = int(m.group("start")) if m.group("start") else 1
        e = int(m.group("end")) if m.group("end") else s
        found.append((m.start(), Citation(
            target=p.replace("\\", "/"),
            start_line=s,
            end_line=e,
            label=m.group("label") or "",
            is_broken_syntax=True,
        )))

    found.sort(key=lambda x: x[0])
    return [c for _, c in found]


def extract_citations_from_tool_calls(client_calls: list[tuple[str, dict[str, Any]]]) -> list[Citation]:
    """에이전트가 호출한 resource.cite 도구 인자에서 인용 목록을 추출한다."""
    out: list[Citation] = []
    for name, args in client_calls:
        if name != "resource.cite" or not isinstance(args, dict):
            continue
        raw_list = args.get("citations")
        if not isinstance(raw_list, list):
            continue
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            rid = str(item.get("resourceId") or item.get("path") or "").strip()
            lines = item.get("lines")
            if not rid or not isinstance(lines, (list, tuple)) or len(lines) < 2:
                continue
            try:
                s = int(lines[0])
                e = int(lines[1])
            except (ValueError, TypeError):
                continue
            lbl = str(item.get("label") or rid)
            out.append(Citation(target=rid, start_line=s, end_line=e, label=lbl))
    return out




def verify_citations(
    citations: list[Citation],
    reads: list[dict[str, Any]],
    index: Optional[Any] = None,
) -> tuple[list[Citation], list[str]]:
    """추출된 인용들이 실제 `reads.jsonl`에 기록된 줄 범위 안에 포함되는지 검증한다."""
    warnings: list[str] = []
    verified_citations: list[Citation] = []

    # 색인 맵 구축
    rid_to_entry: dict[str, Any] = {}
    path_to_entry: dict[str, Any] = {}
    if index and hasattr(index, "files"):
        for e in index.files:
            if getattr(e, "resource_id", None):
                rid_to_entry[str(e.resource_id).lower()] = e
            p = str(getattr(e, "abs_path", "")).replace("\\", "/").lower()
            if p:
                path_to_entry[p] = e
            rel = str(getattr(e, "rel", "")).replace("\\", "/").lower()
            if rel:
                path_to_entry[rel] = e
            base = p.split("/")[-1]
            if base:
                path_to_entry[base] = e

    # reads 파싱: target(path 또는 resource_id) -> list[(start, end)]
    read_map: dict[str, list[tuple[int, int]]] = {}
    for r in reads:
        p = str(r.get("path") or "").replace("\\", "/").lower()
        s = int(r.get("start") or 1)
        e = int(r.get("end") or s)
        if not p:
            continue
        read_map.setdefault(p, []).append((s, e))
        base = p.split("/")[-1]
        if base:
            read_map.setdefault(base, []).append((s, e))

        # index 기반 양방향 매핑 (path <-> resource_id)
        if p in path_to_entry:
            entry = path_to_entry[p]
            rid = getattr(entry, "resource_id", None)
            if rid:
                read_map.setdefault(str(rid).lower(), []).append((s, e))
        elif p in rid_to_entry:
            entry = rid_to_entry[p]
            abs_p = str(getattr(entry, "abs_path", "")).replace("\\", "/").lower()
            if abs_p:
                read_map.setdefault(abs_p, []).append((s, e))
                base = abs_p.split("/")[-1]
                if base:
                    read_map.setdefault(base, []).append((s, e))

    for c in citations:
        target_lower = c.target.lower()
        target_base = target_lower.split("/")[-1]

        # 깨진 링크 문법 확인 및 정상 규격 제안
        if c.is_broken_syntax:
            entry = path_to_entry.get(target_lower) or path_to_entry.get(target_base)
            if entry and getattr(entry, "resource_id", None):
                c.suggested_link = f"[{c.label or entry.rel}](vdoc:resource/{entry.resource_id}#L{c.start_line}-L{c.end_line})"
                syntax_msg = f"깨진 링크 문법 감지: '{c.target}' 대신 {c.suggested_link} 형식을 사용해야 합니다."
            else:
                syntax_msg = f"깨진 링크 문법 감지: '{c.target}' (vdoc:resource/ID 또는 file:/// 경로 필요)"
            c.warning = syntax_msg
            warnings.append(syntax_msg)

        # 줄 범위 대조
        ranges = read_map.get(target_lower) or read_map.get(target_base) or []
        if not ranges and target_lower in rid_to_entry:
            entry = rid_to_entry[target_lower]
            abs_p = str(getattr(entry, "abs_path", "")).replace("\\", "/").lower()
            ranges = read_map.get(abs_p) or read_map.get(abs_p.split("/")[-1]) or []

        matched = False
        for rs, re_line in ranges:
            # 인용 범위가 읽은 범위 안에 포섭되는지 (오차 1줄 허용)
            if rs - 1 <= c.start_line and c.end_line <= re_line + 1:
                matched = True
                break

        if matched:
            c.is_verified = True
        else:
            c.is_verified = False
            msg = f"인용된 {c.label or c.target} (L{c.start_line}-L{c.end_line}) 은 실제로 읽은 기록이 없습니다."
            if not c.warning:
                c.warning = msg
            warnings.append(msg)

        verified_citations.append(c)

    return verified_citations, warnings
