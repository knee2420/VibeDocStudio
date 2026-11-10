"""vibefs 도구 — 마운트된 자료를 돌아다니는 데 필요한 목록 · 검색 · 목차 · 링크 · 동일본 · 읽은 범위.

원문 읽기는 agy 내장 `read_file(Path, StartLine, EndLine)` 이 맡는다. 이 도구들은 "어디를 읽을지" 를 알려 준다.
결과는 agy 가 바로 돌려주는 10KB 안쪽으로 자른다 (넘으면 agy 가 파일로 저장해 한 단계가 더 든다).
"""
from __future__ import annotations

import difflib
import os
import re
from collections import Counter
from typing import Any, Callable, Optional

from harness_kit import packs

from .index import FileEntry, WorkspaceIndex
from .mapper import build_map, collect
from .store import coverage as compute_coverage

MAX_CHARS = 9000
MAX_BYTES = 9000

ARG_ALIASES: dict[str, dict[str, str]] = {
    "ws_grep": {"query": "pattern", "keyword": "pattern", "text": "pattern", "file": "path"},
    "ws_glob": {"query": "pattern", "file": "pattern", "name": "pattern", "glob": "pattern"},
    "ws_outline": {"file": "path", "target": "path"},
    "ws_links": {"file": "path", "target": "path"},
    "ws_tree": {"folder": "path", "dir": "path", "directory": "path"},
    "ws_coverage": {"path": "folder", "dir": "folder"},
    "ws_collect": {"target": "query", "name": "query", "cluster": "query", "pattern": "query"},
}

#: ws_* 도구 명세 — 하네스 resource 팩
TOOL_SPECS: list[dict[str, Any]] = packs.tool_specs("resource", "tools.json")


class WorkspaceTools:
    def __init__(self, index: WorkspaceIndex, reads: Callable[[], list[dict[str, Any]]] = lambda: []) -> None:
        self.index = index
        self._reads = reads

    def call(self, name: str, args: dict[str, Any]) -> str:
        fn = getattr(self, name, None)
        if not name.startswith("ws_") or fn is None:
            raise ValueError(f"알 수 없는 도구: {name}")
        # 흔한 인자 별칭 자동 정규화
        aliases = ARG_ALIASES.get(name, {})
        normalized_args = {aliases.get(k, k): v for k, v in args.items()}
        known = set(next((s["inputSchema"].get("properties", {}) for s in TOOL_SPECS if s["name"] == name), {}))
        unknown = sorted(set(normalized_args) - known)
        if unknown:
            raise ValueError(f"{name} 에 없는 인자: {', '.join(unknown)} (쓸 수 있는 인자: {', '.join(sorted(known)) or '없음'})")
        return _clip(fn(**normalized_args))

    # --- 도구 ---------------------------------------------------------------------

    def ws_overview(self) -> str:
        ix = self.index
        if not ix.files:
            return "마운트된 자료가 없다. 사용자에게 Resource Manager 에서 자료를 체크해 달라고 해라."
        return build_map(ix)

    def ws_collect(self, query: str = "", offset: int = 0) -> str:
        return collect(self.index, query, offset=offset)

    def ws_tree(self, path: str = "", depth: int = 2) -> str:
        ix = self.index
        base = _clean(path)
        depth = max(1, min(int(depth or 2), 6))
        rows = [f"루트: {_root_line(ix)}", f"[{base or '/'}] (depth {depth})"]
        folders: Counter = Counter()
        shown: list[FileEntry] = []
        for entry in ix.files:
            rel = entry.rel
            if base and not (rel == base or rel.startswith(base + "/")):
                continue
            rest = rel[len(base) + 1:] if base else rel
            parts = rest.split("/")
            if len(parts) <= depth:
                shown.append(entry)
            else:
                folders["/".join(parts[:depth])] += 1
        if not shown and not folders:
            return f"'{base}' 아래에 마운트된 파일이 없다. ws_tree() 로 루트부터 보라."
        for folder, n in sorted(folders.items()):
            rows.append(f"📁 {folder}/  (파일 {n}개 더 — ws_tree(path=\"{(base + '/' if base else '') + folder}\"))")
        for entry in shown:
            rows.append(_file_row(entry, base))
        return "\n".join(rows)

    def ws_glob(self, pattern: str) -> str:
        hits = self.index.glob(pattern)
        if not hits:
            return f"'{pattern}' 에 맞는 파일이 없다."
        return "\n".join([f"루트: {_root_line(self.index)}", f"{len(hits)}개"] + [_file_row(e) for e in hits[:120]]
                         + ([f"… 외 {len(hits) - 120}개"] if len(hits) > 120 else []))

    def ws_grep(self, pattern: str, regex: bool = False, path: str = "", glob: str = "", context: int = 0, offset: int = 0) -> str:
        try:
            rx = re.compile(pattern if regex else re.escape(pattern), re.I)
        except re.error as exc:
            return f"정규식 오류: {exc}"
        base = _clean(path)
        context = max(0, min(int(context or 0), 5))
        offset = max(0, int(offset or 0))
        globbed = {e.key for e in self.index.glob(glob)} if glob else None
        hits: list[tuple[FileEntry, int]] = []
        per_file: Counter = Counter()
        for entry in self.index.text_files():
            if base and not (entry.rel == base or entry.rel.startswith(base + "/")):
                continue
            if globbed is not None and entry.key not in globbed:
                continue
            for no, line in enumerate(entry.text_lines, 1):
                if rx.search(line):
                    hits.append((entry, no))
                    per_file[entry.key] += 1
        if not hits:
            return f"'{pattern}' 없음 (텍스트 파일 {len(self.index.text_files())}개 검색)."
        header = f"'{pattern}': {len(hits)}줄 · 파일 {len(per_file)}개"
        out = [header]
        reserved_for_more = 300
        budget = MAX_BYTES - len(header.encode("utf-8")) - reserved_for_more
        shown = 0
        last_file = None
        for entry, no in hits[offset:]:
            if last_file is not entry:
                block = [f"\n{entry.abs_path}  [{per_file[entry.key]}건{_rid(entry)}]"]
                last_file = entry
            else:
                block = []
            lo, hi = max(1, no - context), min(entry.lines, no + context)
            for ln in range(lo, hi + 1):
                mark = ":" if ln == no else "-"
                block.append(f"{ln}{mark} {entry.text_lines[ln - 1].strip()[:220]}")
            text = "\n".join(block)
            block_bytes = len(text.encode("utf-8")) + 1
            if budget - block_bytes < 0:
                break
            budget -= block_bytes
            out.append(text)
            shown += 1
        rest = len(hits) - offset - shown
        if rest > 0:
            out.append(f"\n… {rest}줄 더 있다 — ws_grep(pattern=\"{pattern}\", offset={offset + shown}) 또는 path/glob 로 좁혀라.")
        return "\n".join(out)

    def ws_outline(self, path: str) -> str:
        entry = self._file(path)
        rows = [f"{entry.abs_path}", f"{entry.lines}줄 · {entry.size:,}바이트{_rid(entry)} · 링크 {len(entry.links)}개 · 백링크 {len(self.index.backlinks.get(entry.key, []))}개"]
        if not entry.is_text:
            rows.append("텍스트가 아닌 파일이다 (PDF · 이미지 등). RM 에서 섹터를 만들면 resources.read(sectorId) 로 발췌를 읽을 수 있다.")
            return "\n".join(rows)
        if entry.frontmatter:
            rows.append(f"frontmatter (1~{entry.fm_end}줄):")
            for key, value in entry.frontmatter.items():
                if value in ("", [], None):
                    continue
                shown = ", ".join(map(str, value)) if isinstance(value, list) else str(value)
                rows.append(f"  {key}: {shown[:200]}")
        if entry.headings:
            rows.append("제목 (줄: 제목):")
            for i, h in enumerate(entry.headings):
                end = (entry.headings[i + 1].line - 1) if i + 1 < len(entry.headings) else entry.lines
                rows.append(f"  {h.line}-{end}: {'#' * h.level} {h.text[:120]}")
        else:
            rows.append("제목 없음 — read_file 로 앞에서부터 읽는다.")
        if entry.lines > 800:
            rows.append("긴 파일: read_file 은 한 번에 800줄까지 보여 준다. 필요한 구간을 StartLine/EndLine 으로 나눠 읽어라.")
        return "\n".join(rows)

    def ws_links(self, path: str) -> str:
        entry = self._file(path)
        ix = self.index
        rows = [f"{entry.abs_path}{_rid(entry)}", f"나가는 링크 {len(entry.links)}개:"]
        seen: set[tuple[str, str]] = set()
        for link in entry.links:
            key = (link.target, link.resolved or link.outside or "")
            if key in seen:
                continue
            seen.add(key)
            if link.resolved:
                target = ix.by_key[link.resolved]
                rows.append(f"- L{link.line} [[{link.target}]] → {target.abs_path} ({target.lines}줄{_rid(target)})")
            elif link.outside:
                rows.append(f"- L{link.line} [[{link.target}]] → 마운트 밖: {link.outside} (읽으려면 사용자가 RM 에서 체크해야 한다)")
            else:
                rows.append(f"- L{link.line} [[{link.target}]] → 찾을 수 없음")
        back = ix.backlinks.get(entry.key, [])
        rows.append(f"들어오는 백링크 {len(back)}개:")
        for src_key, line in back[:60]:
            src = ix.by_key[src_key]
            rows.append(f"- {src.abs_path} L{line}{_rid(src)}")
        if len(back) > 60:
            rows.append(f"- … 외 {len(back) - 60}개")
        return "\n".join(rows)

    def ws_find(self, field: str, value: str = "") -> str:
        field_l = field.strip().lower()
        counts: Counter = Counter()
        hits: list[FileEntry] = []
        for entry in self.index.files:
            for key, raw in entry.frontmatter.items():
                if key.lower() != field_l:
                    continue
                values = raw if isinstance(raw, list) else [raw]
                values = [str(v) for v in values if str(v).strip()]
                for v in values:
                    counts[v] += 1
                if value and any(value.lower() in v.lower() for v in values):
                    hits.append(entry)
        if not value:
            if not counts:
                return f"frontmatter 에 '{field}' 필드가 있는 파일이 없다."
            return "\n".join([f"'{field}' 값별 파일 수:"] + [f"- {v}: {n}" for v, n in counts.most_common(80)])
        if not hits:
            return f"{field}='{value}' 인 파일이 없다."
        return "\n".join([f"{field} ⊇ '{value}': {len(hits)}개"] + [_file_row(e) for e in hits[:120]])

    def ws_duplicates(self) -> str:
        groups = self.index.duplicates()
        if not groups:
            return "내용이 똑같은 파일이 없다."
        rows = [f"동일본 묶음 {len(groups)}개 (중복 파일 {sum(len(g) - 1 for g in groups)}개):"]
        for group in groups:
            first = group[0]
            rows.append(f"■ {os.path.basename(first.abs_path)} ×{len(group)} ({first.lines}줄) — 하나만 읽으면 된다: {first.abs_path}")
            rows += [f"   = {e.rel}" for e in group[1:8]]
            if len(group) > 8:
                rows.append(f"   = … 외 {len(group) - 8}개")
        return "\n".join(rows)

    def ws_diff(self, a: str, b: str) -> str:
        fa, fb = self._file(a), self._file(b)
        if fa.md5 == fb.md5:
            return f"두 파일은 내용이 똑같다.\n{fa.abs_path}\n{fb.abs_path}"
        diff = list(difflib.unified_diff(fa.text_lines, fb.text_lines, fromfile=fa.rel, tofile=fb.rel, lineterm="", n=1))
        return "\n".join(diff[:400]) + ("\n… (차이가 더 있다)" if len(diff) > 400 else "")

    def ws_coverage(self, folder: str = "") -> str:
        cov = compute_coverage(self.index, self._reads())
        if folder:
            base = _clean(folder)
            keep = lambda rel: rel == base or rel.startswith(base + "/")  # noqa: E731
            cov.full = [r for r in cov.full if keep(r)]
            cov.partial = [p for p in cov.partial if keep(p[0])]
            cov.unread = [r for r in cov.unread if keep(r)]
        return f"루트: {_root_line(self.index)}\n" + cov.render()

    # --- 내부 --------------------------------------------------------------------

    def _file(self, path: str) -> FileEntry:
        entry = self.index.get(path)
        if entry is None:
            near = [e.rel for e in self.index.files if os.path.basename(path).lower() in e.rel.lower()][:5]
            hint = f" 비슷한 파일: {', '.join(near)}" if near else " ws_glob 이나 ws_tree 로 경로를 확인하라."
            raise ValueError(f"마운트 안에 없는 파일: {path}.{hint}")
        return entry

    def _coverage_line(self) -> str:
        try:
            cov = compute_coverage(self.index, self._reads())
        except Exception:
            return ""
        s = cov.summary()
        return f"읽은 범위: 전부 {s['fullyRead']} · 일부 {s['partiallyRead']} · 안 읽음 {s['unread']} (텍스트 {s['files']}개)"


def overview_text(ix: WorkspaceIndex, coverage_line: str = "", *, folder_limit: int = 60) -> str:
    texts = ix.text_files()
    total_lines = sum(e.lines for e in texts)
    links = sum(len(e.links) for e in ix.files)
    resolved = sum(1 for e in ix.files for link in e.links if link.resolved)
    outside = sum(1 for e in ix.files for link in e.links if link.outside)
    dups = ix.duplicates()
    rows = [
        f"루트: {_root_line(ix)}",
        f"파일 {len(ix.files)}개 (텍스트 {len(texts)} · 그 밖 {len(ix.files) - len(texts)}) · {total_lines:,}줄"
        f" · 동일본 묶음 {len(dups)}개(중복 {sum(len(g) - 1 for g in dups)}개)"
        f" · 위키링크 {links:,}개(마운트 안 {resolved:,} · 마운트 밖 {outside:,})",
    ]
    if ix.missing:
        rows.append(f"디스크에 없는 자료 {len(ix.missing)}개: " + ", ".join(os.path.basename(m) for m in ix.missing[:5]))
    if coverage_line:
        rows.append(coverage_line)
    folders: Counter = Counter()
    for entry in ix.files:
        parts = entry.rel.split("/")
        folders["/".join(parts[:-1][:3]) or "."] += 1
    rows.append("폴더 (상대 경로 · 파일 수):")
    for folder, n in sorted(folders.items())[:folder_limit]:
        rows.append(f"- {folder}/ ({n})")
    if len(folders) > folder_limit:
        rows.append(f"- … 외 폴더 {len(folders) - folder_limit}개 (ws_tree 로)")
    hubs = sorted(ix.backlinks.items(), key=lambda kv: -len(kv[1]))[:8]
    if hubs:
        rows.append("링크가 많이 모이는 파일 (백링크 수):")
        rows += [f"- {ix.by_key[k].rel} ({len(v)})" for k, v in hubs]
    kinds: Counter = Counter()
    for entry in ix.files:
        kind = entry.frontmatter.get("유형") or entry.frontmatter.get("type")
        if isinstance(kind, str) and kind:
            kinds[kind] += 1
    if kinds:
        rows.append("frontmatter 유형: " + ", ".join(f"{k} {n}" for k, n in kinds.most_common(10)))
    return "\n".join(rows)


def _root_line(ix: WorkspaceIndex) -> str:
    if len(ix.roots) == 1:
        return ix.roots[0]
    return " · ".join(f"R{i + 1}={r}" for i, r in enumerate(ix.roots)) or "(없음)"


def _rid(entry: FileEntry) -> str:
    return f" · resourceId={entry.resource_id}" if entry.resource_id else ""


def _file_row(entry: FileEntry, base: str = "") -> str:
    rel = entry.rel[len(base) + 1:] if base and entry.rel.startswith(base + "/") else entry.rel
    size = f"{entry.lines}줄" if entry.is_text else f"{entry.size:,}B 텍스트 아님"
    summary = entry.summary.strip().replace("\n", " ")
    return f"- {rel} ({size}{_rid(entry)})" + (f" — {summary[:70]}" if summary else "")


def _clean(path: Optional[str]) -> str:
    return (path or "").replace("\\", "/").strip().strip("/").lstrip("./")


def _clip(text: str) -> str:
    raw = text.encode("utf-8")
    if len(raw) <= MAX_BYTES:
        return text
    cut = raw[: MAX_BYTES - 150].decode("utf-8", errors="ignore")
    return cut + "\n… (결과가 길어 잘랐다 — path · glob · offset 으로 좁혀 다시 불러라)"
