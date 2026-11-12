"""원문 수집 · 정규화 — 형식이 무엇이든 "줄 단위 마크다운 비슷한 텍스트"로 바꾼다.

정규화 규칙 (뒤 단계가 형식을 몰라도 되게):
- 제목은 `#` 줄로 (HTML `<h2>`, PDF 의 `1.2 절 제목` 같은 번호 줄 포함)
- 표는 마크다운 표로 (HTML `<table>`, PDF `find_tables()`)
- 그림은 `![캡션](대상)` 줄로 (HTML `<img>`, PDF 페이지 이미지 + "그림 N" 캡션)
- 마크다운 · 텍스트 · 코드는 원문 줄을 그대로 둔다 → 앵커 줄 번호 = 원문 줄 번호

PDF · HTML 의 줄 번호는 정규화된 텍스트 기준이다 (페이지 번호를 함께 남긴다).
"""
from __future__ import annotations

import fnmatch
import hashlib
import html
import logging
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Optional

from harness_kit import doc_text, packs

from .contracts import ScopeProfile, SourceDoc

logger = logging.getLogger(__name__)

MARKDOWN_EXT = {".md", ".markdown", ".mdx", ".rst"}
TEXT_EXT = {".txt", ".text", ".log", ".csv", ".tsv"}
DATA_EXT = {".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"}
HTML_EXT = {".html", ".htm"}
PDF_EXT = {".pdf"}
CODE_EXT = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".kt", ".cs",
    ".c", ".h", ".cpp", ".hpp", ".rb", ".php", ".swift", ".scala", ".sql", ".sh", ".ps1", ".css", ".scss",
}
WEB_KIND = "html"  # 웹 문서는 HTML 로 정규화된다
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}
#: 기본으로 건너뛰는 폴더 (사용자 프로필의 include 가 명시하면 예외)
DEFAULT_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next", ".turbo", ".cache"}


@dataclass
class IngestReport:
    docs: list[SourceDoc] = field(default_factory=list)
    #: 색인하지 못한 파일과 이유 — 품질 보고서의 커버리지 항목이 된다
    skipped: list[dict[str, str]] = field(default_factory=list)
    images: list[str] = field(default_factory=list)


def ingest_sources(source_paths: Iterable[str], profile: ScopeProfile) -> IngestReport:
    report = IngestReport()
    files: list[tuple[str, Path]] = []
    url_docs: list[tuple[str, str, str]] = []
    for raw in source_paths:
        if not raw:
            continue
        if re.match(r"^https?://", raw, re.I):
            try:
                url_docs.append(_fetch_url(raw, profile.max_file_bytes))
            except Exception as exc:
                report.skipped.append({"path": raw, "reason": f"가져오기 실패: {exc}"})
            continue
        root = Path(raw)
        if not root.exists():
            report.skipped.append({"path": raw, "reason": "경로가 없습니다"})
            continue
        if root.is_file():
            files.append((root.name, root))
            continue
        prefix = root.name
        for path in sorted(root.rglob("*"), key=lambda p: natural_key(str(p.relative_to(root)))):
            if not path.is_file():
                continue
            rel_inner = path.relative_to(root).as_posix()
            if any(part in DEFAULT_SKIP_DIRS for part in path.relative_to(root).parts[:-1]) and not profile.include:
                continue
            files.append((f"{prefix}/{rel_inner}", path))

    files.sort(key=lambda item: natural_key(item[0]))
    doc_no = 0
    for rel, path in files:
        if not _in_scope(rel, profile):
            continue
        ext = path.suffix.lower()
        if ext in IMAGE_EXT:
            report.images.append(rel)
            continue
        try:
            size = path.stat().st_size
        except OSError as exc:
            report.skipped.append({"path": rel, "reason": f"읽기 실패: {exc}"})
            continue
        if size > profile.max_file_bytes:
            report.skipped.append({"path": rel, "reason": f"용량 초과 ({size // 1024}KB)"})
            continue
        try:
            normalized = _normalize(path, ext)
        except Exception as exc:  # 형식별 파서 오류는 그 파일만 건너뛴다
            logger.warning("[knowledge] 정규화 실패 %s: %s", rel, exc)
            report.skipped.append({"path": rel, "reason": f"해석 실패: {exc}"})
            continue
        if normalized is None:
            report.skipped.append({"path": rel, "reason": "지원하지 않는 형식(바이너리)"})
            continue
        kind, text, page_starts, title = normalized
        if not text.strip():
            report.skipped.append({"path": rel, "reason": "본문 없음"})
            continue
        doc_no += 1
        report.docs.append(
            SourceDoc(
                doc_no=doc_no,
                rel_path=rel,
                kind=kind,
                text=text,
                sha=hashlib.sha1(text.encode("utf-8")).hexdigest(),
                page_starts=tuple(page_starts),
                title=title or Path(rel).stem,
            )
        )
    for rel, text, title in url_docs:
        doc_no += 1
        report.docs.append(SourceDoc(doc_no=doc_no, rel_path=rel, kind=WEB_KIND, text=text,
                                     sha=hashlib.sha1(text.encode("utf-8")).hexdigest(), title=title or rel))
    return report


def _fetch_url(url: str, max_bytes: int) -> tuple[str, str, str]:
    """웹 문서 한 장을 가져와 마크다운으로. http(s) 만, 크기 · 시간 제한.

    서비스로 열 때는 사내망 주소(SSRF)를 막는 허용 목록을 어댑터 쪽에 두어야 한다 — 여기서는 형식만 지킨다.
    """
    import urllib.parse
    import urllib.request

    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("http(s) 주소만 가져올 수 있습니다")
    req = urllib.request.Request(url, headers={"User-Agent": "VibeDocStudio-AutoIndex/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310 — 스킴은 위에서 확인
        body = resp.read(max_bytes + 1)
        charset = resp.headers.get_content_charset() or "utf-8"
    if len(body) > max_bytes:
        raise ValueError("용량 초과")
    text = body.decode(charset, errors="replace")
    md, title = html_to_markdown(text) if "<" in text[:2000] else (text, "")
    rel = f"web/{parsed.netloc}{parsed.path.rstrip('/') or '/index'}"
    return rel, md, title


def natural_key(text: str) -> list[object]:
    """`2-x` < `10-x` 가 되게 숫자를 수로 비교한다 (목차 순서가 곧 파일 순서인 문서 묶음이 많다)."""
    return [int(tok) if tok.isdigit() else tok.lower() for tok in re.split(r"(\d+)", text)]


def _in_scope(rel: str, profile: ScopeProfile) -> bool:
    if profile.include and not any(fnmatch.fnmatch(rel, pat) for pat in profile.include):
        return False
    return not any(fnmatch.fnmatch(rel, pat) for pat in profile.exclude)


def _normalize(path: Path, ext: str) -> Optional[tuple[str, str, list[int], str]]:
    if ext in PDF_EXT:
        return _normalize_pdf(path)
    if ext in doc_text.CONVERTERS:
        # 압축 서식(hwpx 등) — vibefs 가 agy 에게 보여 주는 것과 같은 렌더를 원문으로 쓴다
        rendered = doc_text.render(str(path))
        return rendered.kind, rendered.text, rendered.page_starts, rendered.title
    raw = path.read_bytes()
    if b"\x00" in raw[:4096]:
        return None
    text = raw.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    if ext in HTML_EXT or (ext in MARKDOWN_EXT | TEXT_EXT and _looks_like_html(text)):
        md, title = html_to_markdown(text)
        return "html", md, [], title
    if ext in MARKDOWN_EXT:
        return "markdown", text, [], _frontmatter_title(text)
    if ext in CODE_EXT:
        return "code", text, [], path.name
    if ext in DATA_EXT:
        return "data", text, [], path.name
    if ext in TEXT_EXT or not ext:
        return "text", text, [], ""
    # 알 수 없는 확장자: 텍스트로 읽히면 텍스트로 다룬다
    if _printable_ratio(text[:4000]) > 0.95:
        return "text", text, [], ""
    return None


def _printable_ratio(sample: str) -> float:
    if not sample:
        return 0.0
    ok = sum(1 for ch in sample if ch.isprintable() or ch in "\n\t")
    return ok / len(sample)


def _looks_like_html(text: str) -> bool:
    head = text[:5000].lower()
    return "<!doctype html" in head or ("<html" in head and "</head>" in text.lower())


def _frontmatter_title(text: str) -> str:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if match:
        t = re.search(r"^title:\s*['\"]?(.+?)['\"]?\s*$", match.group(1), re.M)
        if t:
            return t.group(1).strip()
    h1 = re.search(r"^#\s+(.+)$", text, re.M)
    return h1.group(1).strip() if h1 else ""


# --- PDF ---------------------------------------------------------------------------

#: PDF 제목 · 그림 · 표 캡션 패턴 — 하네스 resource 팩 (index 어휘)
_LEX = packs.data("resource:index/lexicon.ko.json")
_PDF_HEADING = packs.compile_rx(_LEX["pdfHeading"])
_FIG_CAPTION = packs.compile_rx(_LEX["figCaption"])
_TABLE_CAPTION = packs.compile_rx(_LEX["tableCaption"])


def _pdf_heading_level(line: str) -> int:
    match = _PDF_HEADING.match(line.strip())
    if not match:
        return 0
    if match.group(1):
        return 1 if any(k in match.group(1) for k in "편장") else 2
    if match.group(2):
        return min(1 + match.group(2).strip(".").count("."), 4)
    if match.group(3):
        return 1
    return 3


def _normalize_pdf(path: Path) -> tuple[str, str, list[int], str]:
    import fitz  # PyMuPDF — 무거운 import 는 쓸 때만

    lines: list[str] = []
    page_starts: list[int] = []
    title = ""
    with fitz.open(path) as pdf:
        meta_title = (pdf.metadata or {}).get("title") or ""
        for page_no, page in enumerate(pdf, start=1):
            page_starts.append(len(lines) + 1)
            lines.append(f"<!-- page {page_no} -->")
            raw_lines = [ln.rstrip() for ln in page.get_text("text").splitlines()]
            fig_captions = [ln.strip() for ln in raw_lines if _FIG_CAPTION.match(ln)]
            for ln in raw_lines:
                stripped = ln.strip()
                if not stripped:
                    lines.append("")
                    continue
                level = _pdf_heading_level(stripped) if len(stripped) <= 60 else 0
                if level and not _FIG_CAPTION.match(stripped) and not _TABLE_CAPTION.match(stripped):
                    lines.append(f"{'#' * level} {stripped}")
                    if not title and level == 1:
                        title = stripped
                else:
                    lines.append(stripped)
            # 표: 페이지 끝에 마크다운 표로 덧붙인다 (grep · 표 자산 검출이 같은 경로를 탄다)
            try:
                tables = page.find_tables()
                for t_idx, table in enumerate(getattr(tables, "tables", []) or [], start=1):
                    rows = [["" if c is None else str(c).replace("\n", " ").strip() for c in row] for row in table.extract()]
                    rows = [r for r in rows if any(r)]
                    if len(rows) < 2:
                        continue
                    lines.append("")
                    lines.append(f"[표 p{page_no}-{t_idx}]")
                    lines.append("| " + " | ".join(rows[0]) + " |")
                    lines.append("|" + "---|" * len(rows[0]))
                    for row in rows[1:]:
                        lines.append("| " + " | ".join(row) + " |")
                    lines.append("")
            except Exception:  # find_tables 는 버전 · 페이지에 따라 실패할 수 있다
                pass
            # 그림: 이미지 수만큼 그림 줄을 만들고 캡션("그림 N …")을 붙인다
            try:
                images = page.get_images(full=True)
            except Exception:
                images = []
            for i_idx, _img in enumerate(images, start=1):
                caption = fig_captions[i_idx - 1] if i_idx - 1 < len(fig_captions) else f"p{page_no} 이미지 {i_idx}"
                lines.append(f"![{caption}](pdf-image:p{page_no}-{i_idx})")
    return "pdf", "\n".join(lines), page_starts, title or meta_title or path.stem


# --- HTML ----------------------------------------------------------------------------


class _HtmlToMarkdown(HTMLParser):
    """의존성 없는 단순 변환기 — 제목 · 문단 · 목록 · 표 · 이미지 · 코드만 살린다."""

    SKIP = {"script", "style", "noscript", "svg", "head", "template", "iframe", "nav", "footer"}
    BLOCK = {"p", "div", "section", "article", "main", "header", "br", "li", "tr", "blockquote", "dd", "dt"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.buf: list[str] = []
        self.skip_depth = 0
        self.title = ""
        self._in_title = False
        self._heading: Optional[int] = None
        self._table: Optional[list[list[str]]] = None
        self._row: Optional[list[str]] = None
        self._cell: Optional[list[str]] = None
        self._pre = False

    def _flush(self) -> None:
        text = re.sub(r"[ \t]+", " ", "".join(self.buf)).strip()
        self.buf = []
        if not text:
            return
        if self._heading:
            self.out.append(f"{'#' * self._heading} {text}")
        else:
            self.out.append(text)

    def handle_starttag(self, tag, attrs):  # noqa: ANN001
        if tag == "title":
            self._in_title = True
        if tag in self.SKIP:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        attrs_d = dict(attrs)
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._flush()
            self._heading = int(tag[1])
        elif tag == "table":
            self._flush()
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
        elif tag == "img":
            alt = (attrs_d.get("alt") or attrs_d.get("title") or "").strip()
            src = (attrs_d.get("src") or "").strip()
            if src and not src.startswith("data:"):
                self._flush()
                self.out.append(f"![{alt or Path(src).name}]({src})")
        elif tag == "pre":
            self._flush()
            self._pre = True
            self.out.append("```")
        elif tag in self.BLOCK:
            self._flush()
            if tag == "li":
                self.buf.append("- ")

    def handle_endtag(self, tag):  # noqa: ANN001
        if tag == "title":
            self._in_title = False
        if tag in self.SKIP:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._flush()
            self._heading = None
        elif tag in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append(re.sub(r"\s+", " ", "".join(self._cell)).strip().replace("|", "\\|"))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            if any(self._row):
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            rows = self._table
            self._table = None
            if rows:
                width = max(len(r) for r in rows)
                rows = [r + [""] * (width - len(r)) for r in rows]
                self.out.append("")
                self.out.append("| " + " | ".join(rows[0]) + " |")
                self.out.append("|" + "---|" * width)
                for r in rows[1:]:
                    self.out.append("| " + " | ".join(r) + " |")
                self.out.append("")
        elif tag == "pre":
            self._flush_pre()
        elif tag in self.BLOCK:
            self._flush()

    def _flush_pre(self) -> None:
        body = "".join(self.buf)
        self.buf = []
        self.out.extend(body.rstrip("\n").split("\n"))
        self.out.append("```")
        self._pre = False

    def handle_data(self, data):  # noqa: ANN001
        if self._in_title:
            self.title += data
        if self.skip_depth:
            return
        if self._cell is not None:
            self._cell.append(data)
        elif self._pre:
            self.buf.append(data)
        else:
            self.buf.append(data.replace("\n", " "))

    def result(self) -> str:
        self._flush()
        text = "\n".join(self.out)
        return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def html_to_markdown(text: str) -> tuple[str, str]:
    # 스크래핑된 파일 머리의 "Title: …" 메타 줄은 건너뛴다
    start = text.lower().find("<")
    parser = _HtmlToMarkdown()
    parser.feed(text[start:] if start >= 0 else text)
    parser.close()
    return parser.result(), html.unescape(parser.title.strip())
