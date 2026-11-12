"""마운트된 리소스 폴더의 색인 — 파일 목록 · 줄 수 · frontmatter · 제목 · 위키링크 · 동일본.

표준 라이브러리와 harness_kit 만 쓴다. API 프로세스와 agy 가 띄우는 MCP 서버(`vibefs_server.py`) · 훅(`hook.py`)이
같은 코드를 쓰기 때문이다 (그 둘은 `app` 패키지를 import 하지 않는 독립 스크립트로 돈다).
"""
from __future__ import annotations

import fnmatch
import hashlib
import os
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from docstruct_engine.acquire import doc_text

#: agy `read_file` 이 줄 범위 없이 불렸을 때 보여 주는 줄 수 (agy 1.5.3 실측: "Showing lines 1-800 of N")
READ_WINDOW = 800
TEXT_EXTS = {".md", ".markdown", ".mdx", ".txt", ".csv", ".tsv", ".json", ".yaml", ".yml", ".toml", ".svg", ".html", ".xml", ".log"}
MAX_TEXT_BYTES = 8 * 1024 * 1024
MAX_FILES = 20000

IGNORED_DIRS = {".obsidian", ".trash", ".git", "node_modules"}

_WIKILINK = re.compile(r"\[\[([^\[\]\|#\n]+?)(#[^\[\]\|\n]*)?(\|[^\[\]\n]*)?\]\]")
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")


def norm(path: str) -> str:
    """경로 비교용 키 (대소문자 · 구분자 · `..` 정리)."""
    return os.path.normcase(os.path.normpath(os.path.abspath(path)))


@dataclass
class MountItem:
    """RM 에서 체크한 자료 한 건 (파일 또는 폴더)."""

    path: str
    resource_id: str = ""
    title: str = ""
    kind: str = "file"
    alias: str = ""

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> Optional["MountItem"]:
        path = str(raw.get("path") or raw.get("pathOrUrl") or "").strip()
        if not path or "://" in path:
            return None
        return MountItem(
            path=path,
            resource_id=str(raw.get("id") or raw.get("resourceId") or ""),
            title=str(raw.get("title") or ""),
            kind=str(raw.get("kind") or "file"),
            alias=str(raw.get("alias") or ""),
        )

    def to_dict(self) -> dict[str, str]:
        d = {"path": self.path, "id": self.resource_id, "title": self.title}
        if self.kind != "file":
            d["kind"] = self.kind
        if self.alias:
            d["alias"] = self.alias
        return d


@dataclass
class Heading:
    line: int
    level: int
    text: str


@dataclass
class Link:
    line: int
    raw: str
    target: str  # [[ ]] 안의 이름 (앨리어스 · 헤딩 제외)
    heading: str = ""
    resolved: Optional[str] = None  # 마운트 안 파일의 norm 키
    outside: Optional[str] = None  # 마운트 밖이지만 디스크에 있는 경로


@dataclass
class FileEntry:
    abs_path: str
    rel: str  # 루트 기준 상대 경로 (`/` 구분)
    key: str
    resource_id: str = ""
    title: str = ""
    size: int = 0
    mtime: float = 0.0
    is_text: bool = False
    lines: int = 0
    md5: str = ""
    frontmatter: dict[str, Any] = field(default_factory=dict)
    fm_end: int = 0
    headings: list[Heading] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)
    text_lines: list[str] = field(default_factory=list)

    @property
    def stem(self) -> str:
        return os.path.splitext(os.path.basename(self.abs_path))[0]

    @property
    def summary(self) -> str:
        value = self.frontmatter.get("요약") or self.frontmatter.get("summary") or self.frontmatter.get("description") or ""
        return value if isinstance(value, str) else ", ".join(map(str, value))


def parse_frontmatter(lines: list[str]) -> tuple[dict[str, Any], int]:
    """맨 앞 `---` 블록의 단순 YAML (스칼라 · `- 항목` 목록). (값, 끝 줄 번호 1-base) — 없으면 ({}, 0)."""
    if not lines or lines[0].strip() != "---":
        return {}, 0
    data: dict[str, Any] = {}
    key: Optional[str] = None
    for idx in range(1, min(len(lines), 400)):
        line = lines[idx].rstrip()
        if line.strip() == "---":
            return data, idx + 1
        item = re.match(r"^\s+-\s*(.*)$", line)
        if item and key is not None:
            value = _scalar(item.group(1))
            current = data.get(key)
            if not isinstance(current, list):
                current = [] if current in (None, "") else [current]
            if value != "":
                current.append(value)
            data[key] = current
            continue
        kv = re.match(r"^([^\s:#][^:]*):\s*(.*)$", line)
        if kv:
            key = kv.group(1).strip()
            data[key] = _scalar(kv.group(2))
    return {}, 0


def _scalar(raw: str) -> Any:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value


def _read_text(path: str) -> Optional[str]:
    try:
        raw = open(path, "rb").read(MAX_TEXT_BYTES + 1)
    except OSError:
        return None
    if len(raw) > MAX_TEXT_BYTES or b"\x00" in raw[:4096]:
        return None
    for enc in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def _walk_files(path: str) -> Iterable[str]:
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in IGNORED_DIRS)
        for name in sorted(filenames):
            if not name.startswith("."):
                yield os.path.join(dirpath, name)


class WorkspaceIndex:
    """마운트 한 벌의 색인. `build()` 로 만든다."""

    def __init__(self, items: list[MountItem], id_map: Optional[dict[str, str]] = None) -> None:
        self.items = items
        self.id_map = id_map or {}
        self.files: list[FileEntry] = []
        self.by_key: dict[str, FileEntry] = {}
        self.roots: list[str] = []
        self.root_aliases: dict[str, str] = {}
        self.alias_to_root: dict[str, str] = {}
        self.missing: list[str] = []
        self.mount_dirs: list[str] = []
        self.backlinks: dict[str, list[tuple[str, int]]] = {}
        self._outside_names: Optional[dict[str, list[str]]] = None

    # --- 만들기 --------------------------------------------------------------------

    @classmethod
    def build(
        cls,
        items: list[MountItem],
        *,
        id_map: Optional[dict[str, str]] = None,
        resolve_outside: bool = True,
    ) -> "WorkspaceIndex":
        index = cls(items, id_map=id_map)
        index._collect()
        index._resolve_links(resolve_outside)
        return index

    def _collect(self) -> None:
        seen: set[str] = set()
        bases: list[str] = []
        dir_roots: list[str] = []
        for item in self.items:
            path = os.path.abspath(item.path)
            if item.kind == "dir" or os.path.isdir(path):
                norm_p = norm(path)
                if norm_p not in self.mount_dirs:
                    self.mount_dirs.append(norm_p)
                bases.append(path)
                dir_roots.append(path)
                if os.path.isdir(path):
                    for file_path in _walk_files(path):
                        self._add(file_path, "", "", seen)
                else:
                    self.missing.append(item.path)
            elif os.path.isfile(path):
                bases.append(os.path.dirname(path))
                self._add(path, item.resource_id, item.title, seen)
            else:
                self.missing.append(item.path)
            if len(self.files) >= MAX_FILES:
                break

        # roots 계산
        explicit_dir_roots = [os.path.abspath(it.path) for it in self.items if it.kind == "dir" and os.path.isdir(it.path)]
        if explicit_dir_roots:
            loose_bases = [
                b for b in bases
                if not any(norm(b) == norm(d) or norm(b).startswith(norm(d) + os.sep) for d in explicit_dir_roots)
            ]
            self.roots = sorted(set(explicit_dir_roots + _roots(loose_bases)))
        elif dir_roots and all(any(norm(b) == norm(d) or norm(b).startswith(norm(d) + os.sep) for d in dir_roots) for b in bases):
            self.roots = sorted(set(dir_roots))
        else:
            self.roots = _roots(bases)

        # root_aliases 계산
        from collections import Counter
        bnames: Counter = Counter(os.path.basename(r) or r for r in self.roots)
        self.root_aliases = {}
        self.alias_to_root = {}
        for r in self.roots:
            explicit_alias = next((it.alias for it in self.items if it.alias and norm(it.path) == norm(r)), None)
            if explicit_alias:
                alias = explicit_alias
            else:
                base = os.path.basename(r) or r
                if bnames[base] > 1:
                    parent = os.path.basename(os.path.dirname(r))
                    alias = f"{parent}_{base}" if parent else base
                else:
                    alias = base
            self.root_aliases[r] = alias
            self.alias_to_root[alias.lower()] = r

        for entry in self.files:
            entry.rel = self._rel(entry.abs_path)
        self.files.sort(key=lambda e: e.rel.lower())

    def _add(self, path: str, resource_id: str, title: str, seen: set[str]) -> None:
        key = norm(path)
        if not resource_id and self.id_map:
            resource_id = self.id_map.get(os.path.abspath(path)) or self.id_map.get(key) or ""
        if key in seen:
            existing = self.by_key[key]
            existing.resource_id = existing.resource_id or resource_id
            existing.title = existing.title or title
            return
        seen.add(key)
        try:
            st = os.stat(path)
        except OSError:
            self.missing.append(path)
            return
        entry = FileEntry(abs_path=os.path.abspath(path), rel="", key=key, resource_id=resource_id, title=title,
                          size=st.st_size, mtime=st.st_mtime)
        ext = os.path.splitext(path)[1].lower()
        # 압축 서식(hwpx 등)은 렌더 캐시를 본문으로 본다 — 훅이 read_file 을 같은 캐시로 돌린다
        derived = doc_text.derived_path(path) if doc_text.convertible(path) else None
        if derived:
            text = _read_text(derived)
        else:
            text = _read_text(path) if ext in TEXT_EXTS else None
        if text is not None:
            entry.is_text = True
            entry.text_lines = text.splitlines()
            entry.lines = len(entry.text_lines)
            entry.md5 = hashlib.md5(text.encode("utf-8")).hexdigest()
            if derived or ext in (".md", ".markdown", ".mdx", ".txt"):
                entry.frontmatter, entry.fm_end = parse_frontmatter(entry.text_lines)
                in_code = False
                for no, line in enumerate(entry.text_lines, 1):
                    if line.lstrip().startswith("```"):
                        in_code = not in_code
                        continue
                    if not in_code and no > entry.fm_end:
                        match = _HEADING.match(line)
                        if match:
                            entry.headings.append(Heading(no, len(match.group(1)), match.group(2).strip()))
                    for link in _WIKILINK.finditer(line):
                        # 표 안 링크는 `[[이름\|별칭]]` 처럼 파이프를 이스케이프한다 — 끝의 `\` 는 이름이 아니다
                        target = link.group(1).strip().rstrip("\\").strip()
                        if target:
                            entry.links.append(Link(no, link.group(0), target, (link.group(2) or "").lstrip("#")))
        else:
            try:
                entry.md5 = hashlib.md5(open(path, "rb").read(MAX_TEXT_BYTES)).hexdigest()
            except OSError:
                pass
        self.files.append(entry)
        self.by_key[key] = entry

    def _rel(self, path: str) -> str:
        for root in self.roots:
            try:
                rel = os.path.relpath(path, root)
            except ValueError:
                continue
            if not rel.startswith(".."):
                rel = rel.replace("\\", "/")
                alias = self.root_aliases.get(root)
                if len(self.roots) > 1 and alias:
                    return f"{alias}/{rel}"
                return rel
        return os.path.basename(path).replace("\\", "/")

    def _resolve_links(self, resolve_outside: bool) -> None:
        by_stem: dict[str, list[FileEntry]] = {}
        for entry in self.files:
            by_stem.setdefault(entry.stem.lower(), []).append(entry)
            by_stem.setdefault(os.path.basename(entry.abs_path).lower(), []).append(entry)
        for entry in self.files:
            for link in entry.links:
                target = link.target.replace("\\", "/").strip()
                name = target.rsplit("/", 1)[-1].lower()
                candidates = by_stem.get(name, [])
                if "/" in target and candidates:
                    suffix = target.lower()
                    narrowed = [c for c in candidates if c.rel.lower().rsplit(".", 1)[0].endswith(suffix) or c.rel.lower().endswith(suffix)]
                    candidates = narrowed or candidates
                if candidates:
                    best = _nearest(entry, candidates)
                    link.resolved = best.key
                    self.backlinks.setdefault(best.key, []).append((entry.key, link.line))
                elif resolve_outside:
                    found = self._outside(name)
                    if found:
                        link.outside = found[0]

    def _outside(self, name: str) -> list[str]:
        """마운트 밖(같은 루트 아래 디스크)에서 링크 대상 이름을 찾는다 — 사용자가 RM 에서 더 체크할 수 있게."""
        if self._outside_names is None:
            names: dict[str, list[str]] = {}
            count = 0
            for root in self.roots:
                for dirpath, dirnames, filenames in os.walk(root):
                    dirnames[:] = [d for d in dirnames if not d.startswith(".")]
                    for fn in filenames:
                        full = os.path.join(dirpath, fn)
                        if norm(full) in self.by_key:
                            continue
                        stem = os.path.splitext(fn)[0].lower()
                        names.setdefault(stem, []).append(full)
                        names.setdefault(fn.lower(), []).append(full)
                        count += 1
                    if count > 50000:
                        break
            self._outside_names = names
        return self._outside_names.get(name, [])

    # --- 조회 --------------------------------------------------------------------

    def get(self, path: str) -> Optional[FileEntry]:
        """절대 경로 · 상대 경로 · 파일 이름 어느 것이든 마운트 안 파일로 찾는다."""
        if not path:
            return None
        raw = path.strip().strip('"')
        direct = self.by_key.get(norm(raw)) if os.path.isabs(raw) else None
        if direct:
            return direct
        cleaned = raw.replace("\\", "/").lstrip("./")
        # 1. rel 일치 (대소문자 무시)
        for entry in self.files:
            if entry.rel == cleaned or entry.rel.lower() == cleaned.lower():
                return entry
        # 2. alias 접두사 처리 (alias/subpath ↔ subpath 매칭)
        if "/" in cleaned:
            alias, _, sub = cleaned.partition("/")
            if alias.lower() in self.alias_to_root:
                root = self.alias_to_root[alias.lower()]
                cand = self.by_key.get(norm(os.path.join(root, sub.replace("/", os.sep))))
                if cand:
                    return cand
            for entry in self.files:
                if "/" in entry.rel:
                    _, _, entry_sub = entry.rel.partition("/")
                    if entry_sub.lower() == cleaned.lower():
                        return entry
        else:
            for entry in self.files:
                if "/" in entry.rel:
                    _, _, entry_sub = entry.rel.partition("/")
                    if entry_sub.lower() == cleaned.lower():
                        return entry
        # 3. 각 root 아래 상대 경로 확인
        for root in self.roots:
            candidate = self.by_key.get(norm(os.path.join(root, cleaned.replace("/", os.sep))))
            if candidate:
                return candidate
        # 4. 파일명 매칭
        lowered = cleaned.lower()
        matches = [e for e in self.files if e.rel.lower().endswith("/" + lowered) or e.rel.lower() == lowered
                   or e.stem.lower() == lowered or os.path.basename(e.abs_path).lower() == lowered]
        return matches[0] if len(matches) == 1 else None

    def contains(self, path: str) -> bool:
        key = norm(path)
        if key in self.by_key:
            return True
        return any(key == d or key.startswith(d + os.sep) for d in self.mount_dirs)

    def duplicates(self) -> list[list[FileEntry]]:
        groups: dict[str, list[FileEntry]] = {}
        for entry in self.files:
            if entry.md5 and entry.size > 0:
                groups.setdefault(entry.md5, []).append(entry)
        return sorted((g for g in groups.values() if len(g) > 1), key=lambda g: (-len(g), g[0].rel))

    def text_files(self) -> list[FileEntry]:
        return [e for e in self.files if e.is_text]

    def glob(self, pattern: str) -> list[FileEntry]:
        pat = pattern.replace("\\", "/").lower()
        if "/" not in pat and not pat.startswith("**"):
            pat = "**/" + pat
        out = []
        for entry in self.files:
            rel = entry.rel.lower()
            if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(rel, pat.replace("**/", "")) or fnmatch.fnmatch(os.path.basename(rel), pattern.lower()):
                out.append(entry)
        return out


def _nearest(source: FileEntry, candidates: list[FileEntry]) -> FileEntry:
    """같은 이름 후보가 여럿이면 원본 파일과 폴더가 가장 많이 겹치는 것 (Obsidian 의 가장 가까운 파일 규칙)."""
    src_parts = source.rel.split("/")[:-1]

    def score(entry: FileEntry) -> tuple[int, int]:
        parts = entry.rel.split("/")[:-1]
        common = 0
        for a, b in zip(src_parts, parts):
            if a != b:
                break
            common += 1
        return (-common, len(parts))

    return min(candidates, key=score)


def _roots(bases: list[str]) -> list[str]:
    """마운트 기준 경로들 → 공통 루트 (드라이브가 다르면 여러 개)."""
    if not bases:
        return []
    by_drive: dict[str, list[str]] = {}
    for base in bases:
        by_drive.setdefault(os.path.splitdrive(os.path.abspath(base))[0].lower(), []).append(os.path.abspath(base))
    roots = []
    for paths in by_drive.values():
        try:
            roots.append(os.path.commonpath(paths))
        except ValueError:
            roots.extend(sorted(set(paths)))
    return sorted(roots)


def read_range(start: Any, end: Any, total: int) -> tuple[int, int]:
    """agy `read_file(StartLine, EndLine)` 가 실제로 보여 준 줄 범위 (1-base, 끝 포함)."""
    def as_int(value: Any) -> Optional[int]:
        try:
            return int(value) if value not in (None, "") else None
        except (TypeError, ValueError):
            return None

    s, e = as_int(start), as_int(end)
    s = max(1, s or 1)
    e = e if e is not None else s + READ_WINDOW - 1
    e = min(e, s + READ_WINDOW - 1)  # 한 번에 800줄을 넘겨 보여 주지 않는다
    if total:
        e = min(e, total)
    return s, max(s, e)
