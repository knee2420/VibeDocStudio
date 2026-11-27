"""웹 스크랩(`.vclip/`) 3단계 폭포수(Waterfall) 본문 추출기.

Stage 1 (`fast-http`): httpx/urllib + URL 정규화(네이버 블로그 PostView 등) + trafilatura 정제 마크다운
Stage 2 (`browser-render`): JS SPA / 얇은 본문 / `archive` 모드 시 헤드리스 브라우저(`webpage_fidelity_engine`) 렌더링
Stage 3 (`blocked-fallback`): 403/Cloudflare/로그인/캡차 감지 시 우회하지 않고 정직하게 폴백 번들 생성
"""
from __future__ import annotations

import base64
import hashlib
import html as html_lib
import inspect
import io
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Callable, Optional

from .models import (
    VCLIP_PROTOCOL,
    CaptureMode,
    CaptureStatus,
    SourceMethod,
    WebClipAssetMeta,
    WebClipAssetPayload,
    WebClipCaptureTileMeta,
    WebClipCaptureTilePayload,
    WebClipMeta,
    WebClipScrapeResponse,
)

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
MAX_HTML_BYTES = 6 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_ARCHIVE_IMAGES = 20
THIN_BODY_CHARS = 280

_IMAGE_MAGIC: tuple[tuple[bytes, str, str], ...] = (
    (b"\xff\xd8\xff", ".jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", ".png", "image/png"),
    (b"RIFF", ".webp", "image/webp"),
    (b"GIF8", ".gif", "image/gif"),
)

_CHALLENGE_PATTERNS = (
    re.compile(r"just a moment\.\.\.", re.I),
    re.compile(r"cf-browser-verification|challenge-platform|cloudflare ray id", re.I),
    re.compile(r"g-recaptcha|h-captcha|cf-turnstile", re.I),
    re.compile(r"access denied|enable javascript and cookies to continue", re.I),
)

_MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\((https?://[^)\s]+)(?:\s+\"[^\"]*\")?\)")
_NAVER_BLOG_RE = re.compile(
    r"^https?://(?:m\.)?blog\.naver\.com/([A-Za-z0-9_.-]+)/(\d{6,})(?:[/?#].*)?$",
    re.I,
)
_NOISE_IMAGE_URL_RE = re.compile(
    r"(default[-_]?user|avatar|profile[-_]?img|favicon|sprite|spacer|blank\.gif|1x1|pixel|tracking|btn[_-]|icon[_-]|logo[_-])",
    re.I,
)
_NOISE_IMAGE_ALT_RE = re.compile(
    r"(프로필\s*이미지|기자\s*프로필|아이콘|로고|배너|광고|avatar|profile\s*icon|favicon)",
    re.I,
)
MIN_ARCHIVE_IMAGE_BYTES = 3500


def _is_noise_archive_image(img_url: str, alt: str) -> bool:
    return bool(_NOISE_IMAGE_URL_RE.search(img_url or "") or _NOISE_IMAGE_ALT_RE.search(alt or ""))


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _domain_of(url: str) -> str:
    try:
        host = urllib.parse.urlsplit(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except ValueError:
        return ""


def normalize_fetch_url(url: str) -> str:
    """네이버 블로그 PC/모바일 URL 을 iframe 본문 직통 주소(`PostView.naver`)로 정규화한다."""
    cleaned = url.strip()
    m = _NAVER_BLOG_RE.match(cleaned)
    if m:
        return f"https://blog.naver.com/PostView.naver?blogId={m.group(1)}&logNo={m.group(2)}"
    return cleaned


def _decode_bytes(body: bytes, content_type: str) -> str:
    m = re.search(r"charset=([\w-]+)", content_type or "", re.I) or re.search(
        rb'<meta[^>]+charset=["\']?([\w-]+)', body[:4096], re.I
    )
    enc = (m.group(1).decode("ascii", "ignore") if isinstance(m.group(1), bytes) else m.group(1)) if m else "utf-8"
    if enc.lower() in ("euc-kr", "ks_c_5601-1987", "korean"):
        enc = "cp949"
    try:
        return body.decode(enc, "replace")
    except LookupError:
        return body.decode("utf-8", "replace")


def default_http_fetch(
    url: str,
    *,
    limit: int = MAX_HTML_BYTES,
    timeout: float = 20.0,
    accept: str = "text/html,application/xhtml+xml,*/*;q=0.8",
    referer: str = "",
) -> tuple[int, str, bytes, str]:
    """(HTTP status, Content-Type, body bytes, final URL) 반환."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    if referer:
        headers["Referer"] = referer
    try:
        import httpx

        with httpx.Client(follow_redirects=True, timeout=timeout, headers=headers) as client:
            resp = client.get(url)
            return resp.status_code, resp.headers.get("content-type", ""), resp.content[: limit + 1], str(resp.url)
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("[webclip] httpx 요청 실패(%s) → urllib 폴백: %s", url, exc)

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            body = resp.read(limit + 1)
            return resp.status, resp.headers.get("Content-Type", ""), body, resp.geturl()
    except urllib.error.HTTPError as exc:
        err_body = b""
        try:
            err_body = exc.read(65536)
        except Exception:
            pass
        return exc.code, exc.headers.get("Content-Type", "") if exc.headers else "", err_body, url
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, "", str(exc).encode("utf-8", "replace"), url


def _is_blocked_response(status: int, html_text: str) -> Optional[str]:
    if status in (401, 403, 429):
        return f"접근 제한 또는 안티봇 차단 (HTTP {status})"
    if status == 503 and any(rx.search(html_text[:8000]) for rx in _CHALLENGE_PATTERNS):
        return "Cloudflare/안티봇 보안 확인 페이지 감지 (HTTP 503)"
    head_sample = html_text[:12000]
    if len(html_text) < 40000 and any(rx.search(head_sample) for rx in _CHALLENGE_PATTERNS):
        return "안티봇/캡차 보안 페이지 감지"
    return None


class _MetaAndFallbackParser(HTMLParser):
    """표준 라이브러리 기반 메타(제목·작성자·발행일·설명) + 폴백 마크다운 본문 추출기."""

    _SKIP = {"script", "style", "noscript", "svg", "nav", "header", "footer", "aside", "form", "button", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.og_title = ""
        self.author = ""
        self.published = ""
        self.description = ""
        self.blocks: list[str] = []
        self.images: list[tuple[str, str]] = []
        self._skip = 0
        self._in_title = False
        self._in_ld = False
        self._ld_buf: list[str] = []
        self._cur_tag: Optional[str] = None
        self._cur_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            val = a.get("content", "").strip()
            if val:
                if key == "og:title" and not self.og_title:
                    self.og_title = val
                elif key in ("author", "article:author", "dable:author", "twitter:creator") and not self.author:
                    self.author = val[:80]
                elif key in ("article:published_time", "pubdate", "date", "og:regdate", "dable:published_time") and not self.published:
                    self.published = val[:24]
                elif key in ("description", "og:description") and not self.description:
                    self.description = val[:400]
            return
        if tag == "time" and not self.published:
            dt = a.get("datetime", "").strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}", dt):
                self.published = dt[:24]
        if tag == "script":
            self._skip += 1
            if "ld+json" in a.get("type", "").lower():
                self._in_ld = True
                self._ld_buf = []
            return
        if tag in self._SKIP:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == "title":
            self._in_title = True
        elif tag == "img":
            src = a.get("data-lazy-src") or a.get("data-src") or a.get("src") or ""
            alt = a.get("alt", "").strip()
            if src.startswith("http"):
                self.images.append((src, alt))
        elif tag in ("h1", "h2", "h3", "h4", "p", "li", "blockquote", "figcaption"):
            self._flush()
            self._cur_tag = tag
            self._cur_buf = []
        elif tag == "br" and self._cur_tag:
            self._cur_buf.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            if self._in_ld:
                self._consume_ld("".join(self._ld_buf))
                self._in_ld = False
                self._ld_buf = []
            self._skip = max(0, self._skip - 1)
            return
        if tag in self._SKIP:
            self._skip = max(0, self._skip - 1)
            return
        if tag == "title":
            self._in_title = False
        if not self._skip and tag == self._cur_tag:
            self._flush()

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._ld_buf.append(data)
            return
        if self._in_title:
            self.title += data
            return
        if self._skip or not self._cur_tag:
            return
        self._cur_buf.append(data)

    def _consume_ld(self, raw: str) -> None:
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return
        nodes = data if isinstance(data, list) else [data]
        for obj in nodes:
            if not isinstance(obj, dict):
                continue
            if not self.author and obj.get("author"):
                auth = obj["author"]
                if isinstance(auth, list) and auth:
                    auth = auth[0]
                if isinstance(auth, dict):
                    self.author = str(auth.get("name") or "").strip()[:80]
                elif isinstance(auth, str):
                    self.author = auth.strip()[:80]
            if not self.published:
                pub = obj.get("datePublished") or obj.get("dateModified")
                if isinstance(pub, str) and pub.strip():
                    self.published = pub.strip()[:24]

    def _flush(self) -> None:
        tag, self._cur_tag = self._cur_tag, None
        if not tag:
            return
        text = " ".join("".join(self._cur_buf).split()).strip()
        self._cur_buf = []
        if not text:
            return
        if tag in ("h1", "h2", "h3", "h4"):
            lvl = int(tag[1])
            self.blocks.append(f"{'#' * lvl} {text}")
        elif tag == "li":
            self.blocks.append(f"- {text}")
        elif tag == "blockquote":
            self.blocks.append(f"> {text}")
        else:
            self.blocks.append(text)


def _extract_with_trafilatura(html_text: str, url: str) -> tuple[str, dict[str, str]]:
    """trafilatura 가 설치돼 있으면 본문 마크다운 + 메타를 고정밀 추출한다."""
    try:
        import trafilatura
    except ImportError:
        return "", {}

    try:
        md = trafilatura.extract(
            html_text,
            url=url,
            output_format="markdown",
            include_tables=True,
            include_images=True,
            include_links=True,
            include_formatting=True,
            favor_recall=True,
        ) or ""
        meta_obj = trafilatura.extract_metadata(html_text, default_url=url)
        meta: dict[str, str] = {}
        if meta_obj is not None:
            meta["title"] = str(getattr(meta_obj, "title", "") or "").strip()
            meta["author"] = str(getattr(meta_obj, "author", "") or "").strip()
            meta["publishedAt"] = str(getattr(meta_obj, "date", "") or "").strip()
            meta["description"] = str(getattr(meta_obj, "description", "") or "").strip()
        return md.strip(), meta
    except Exception as exc:
        logger.debug("[webclip] trafilatura 추출 실패(%s): %s", url, exc)
        return "", {}


def _extract_body_from_html(html_text: str, url: str) -> tuple[str, dict[str, str], list[tuple[str, str]]]:
    parser = _MetaAndFallbackParser()
    try:
        parser.feed(html_text)
        parser.close()
        parser._flush()
    except Exception:
        pass

    md, t_meta = _extract_with_trafilatura(html_text, url)
    if len(md) < 120 and parser.blocks:
        md = "\n\n".join(parser.blocks)

    title = (t_meta.get("title") or parser.og_title or parser.title or "").strip()
    title = " ".join(html_lib.unescape(title).split())
    author = (t_meta.get("author") or parser.author or "").strip()
    published = (t_meta.get("publishedAt") or parser.published or "").strip()
    description = (t_meta.get("description") or parser.description or "").strip()
    meta = {"title": title, "author": author, "publishedAt": published, "description": description}
    return md.strip(), meta, parser.images


@dataclass
class _BrowserRenderResult:
    md: str
    title: str = ""
    snapshot_html: Optional[str] = None
    capture_tiles: list[WebClipCaptureTilePayload] = field(default_factory=list)


def _encode_capture_tile(png_bytes: bytes) -> tuple[bytes, str, str]:
    """CDP PNG 타일을 고화질 JPEG 로 경량화(실패 시 PNG 원본 유지)."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(png_bytes)) as img:
            rgb = img.convert("RGB")
            buf = io.BytesIO()
            rgb.save(buf, format="JPEG", quality=88, subsampling=0, optimize=True)
            out = buf.getvalue()
            if out:
                return out, ".jpg", "image/jpeg"
    except Exception:
        pass
    return png_bytes, ".png", "image/png"


def _try_browser_render(url: str, *, capture_screenshots: bool = False) -> Optional[_BrowserRenderResult]:
    """Stage 2: `webpage_fidelity_engine` 헤드리스 브라우저로 실측 렌더링 + 원사이트 연속 화면 캡처."""
    try:
        from webpage_fidelity_engine import (
            WebpageExtractOptions,
            run_webpage_extraction,
        )
    except ImportError:
        return None

    try:
        opts = WebpageExtractOptions(
            target_height_px=4000,
            split_mode="single",
            include_images=True,
            inline_images=False,
            generate_thumbnails=False,
            use_browser_fallback=True,
            fetch_timeout_s=30.0,
            browser_viewport_width=1280,
            capture_screenshots=capture_screenshots,
            screenshot_viewport_height=900,
            screenshot_overlap_px=0,
            max_screenshots=16,
        )
        res = run_webpage_extraction(url, options=opts)
        doc = res.document or {}
        slots = doc.get("slots") or {}
        lines: list[str] = []
        for page in doc.get("pages") or []:
            for blk in page.get("blocks") or []:
                kind = str(blk.get("kind") or "")
                sid = blk.get("slotId")
                raw_html = str((slots.get(sid) or {}).get("content") or "") if sid else ""
                plain = " ".join(re.sub(r"<[^>]+>", " ", html_lib.unescape(raw_html)).split()).strip()
                if kind in ("heading", "form-title") and plain:
                    lines.append(f"## {plain}")
                elif kind == "image":
                    src = str(blk.get("src") or "").strip()
                    alt = str(blk.get("caption") or blk.get("alt") or "").strip()
                    if src.startswith("http"):
                        lines.append(f"![{alt}]({src})")
                elif kind == "columns-grid":
                    for col in blk.get("columns") or []:
                        img = col.get("image") if isinstance(col, dict) else None
                        if isinstance(img, dict) and str(img.get("src") or "").startswith("http"):
                            src = str(img["src"])
                            alt = str(img.get("alt") or "").strip()
                            lines.append(f"![{alt}]({src})")
                elif plain:
                    lines.append(plain)
        title = str(doc.get("title") or "").strip()
        md = "\n\n".join(lines).strip()

        tiles: list[WebClipCaptureTilePayload] = []
        if capture_screenshots:
            for idx, shot in enumerate(getattr(res, "screenshots", []) or [], start=1):
                raw_png = getattr(shot, "png_bytes", b"") or b""
                if not raw_png:
                    continue
                encoded, ext, mime = _encode_capture_tile(raw_png)
                tiles.append(
                    WebClipCaptureTilePayload(
                        index=idx,
                        file=f"captures/shot_{idx:02d}{ext}",
                        mime=mime,
                        width=int(getattr(shot, "width", 0) or 0),
                        height=int(getattr(shot, "height", 0) or 0),
                        scrollY=int(getattr(shot, "scroll_y", 0) or 0),
                        totalHeight=int(getattr(shot, "total_height", 0) or 0),
                        base64=base64.b64encode(encoded).decode("ascii"),
                    )
                )

        # 가짜 흰 바탕 리더 HTML 재포장은 만들지 않는다 — 원사이트 시각 증빙은 실제 브라우저 캡처 타일이 담당.
        return _BrowserRenderResult(md=md, title=title, snapshot_html=None, capture_tiles=tiles)
    except Exception as exc:
        logger.debug("[webclip] browser-render 실패(%s): %s", url, exc)
        return None


def _invoke_browser_render(
    browser_render: Callable[..., Any],
    url: str,
    *,
    capture_screenshots: bool,
) -> Optional[_BrowserRenderResult]:
    try:
        sig = inspect.signature(browser_render)
        accepts_kw = (
            "capture_screenshots" in sig.parameters
            or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
        )
    except (TypeError, ValueError):
        accepts_kw = False

    raw = browser_render(url, capture_screenshots=capture_screenshots) if accepts_kw else browser_render(url)
    if raw is None:
        return None
    if isinstance(raw, _BrowserRenderResult):
        return raw
    if isinstance(raw, tuple) and len(raw) >= 3:
        b_md, b_snap, b_title = raw[0], raw[1], raw[2]
        b_tiles = list(raw[3]) if len(raw) >= 4 and raw[3] else []
        return _BrowserRenderResult(
            md=str(b_md or ""),
            title=str(b_title or ""),
            snapshot_html=b_snap if isinstance(b_snap, str) and b_snap.strip() else None,
            capture_tiles=b_tiles,
        )
    return None


def _sniff_image(data: bytes) -> Optional[tuple[str, str]]:
    for magic, ext, mime in _IMAGE_MAGIC:
        if data.startswith(magic) and (ext != ".webp" or data[8:12] == b"WEBP"):
            return ext, mime
    return None


def _download_archive_images(
    md: str,
    extra_images: list[tuple[str, str]],
    referer: str,
    fetch: Callable[..., tuple[int, str, bytes, str]],
) -> tuple[str, list[WebClipAssetMeta], list[WebClipAssetPayload]]:
    """본문 내 이미지 URL 을 로컬 `assets/` 페이로드로 내려받고 `content.md` 링크를 `./assets/...` 로 치환한다."""
    seen: dict[str, str] = {}
    ordered: list[tuple[str, str]] = []
    for m in _MD_IMAGE_RE.finditer(md):
        alt, img_url = m.group(1).strip(), m.group(2).strip()
        if _is_noise_archive_image(img_url, alt):
            continue
        if img_url not in seen:
            seen[img_url] = alt
            ordered.append((img_url, alt))
    if not ordered:
        for img_url, alt in extra_images[:MAX_ARCHIVE_IMAGES]:
            if _is_noise_archive_image(img_url, alt):
                continue
            if img_url not in seen:
                seen[img_url] = alt
                ordered.append((img_url, alt))
    ordered = ordered[:MAX_ARCHIVE_IMAGES]
    if not ordered:
        return md, [], []

    def _one(item: tuple[int, tuple[str, str]]) -> Optional[tuple[str, WebClipAssetMeta, WebClipAssetPayload]]:
        idx, (img_url, caption) = item
        status, _, body, _ = fetch(img_url, limit=MAX_IMAGE_BYTES, timeout=20.0, accept="image/*", referer=referer)
        if status != 200 or not body or len(body) > MAX_IMAGE_BYTES:
            return None
        if len(body) < MIN_ARCHIVE_IMAGE_BYTES and len(ordered) > 1:
            return None
        sniffed = _sniff_image(body)
        if not sniffed:
            return None
        ext, mime = sniffed
        aid = f"img_{idx:02d}"
        rel_file = f"assets/{aid}{ext}"
        meta = WebClipAssetMeta(id=aid, file=rel_file, originUrl=img_url, mime=mime, caption=caption[:120])
        payload = WebClipAssetPayload(
            id=aid,
            file=rel_file,
            mime=mime,
            base64=base64.b64encode(body).decode("ascii"),
            originUrl=img_url,
            caption=caption[:120],
        )
        return img_url, meta, payload

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(_one, enumerate(ordered, start=1)))

    url_to_local: dict[str, str] = {}
    metas: list[WebClipAssetMeta] = []
    payloads: list[WebClipAssetPayload] = []
    for res in results:
        if res is None:
            continue
        origin, meta, payload = res
        url_to_local[origin] = f"./{meta.file}"
        metas.append(meta)
        payloads.append(payload)

    def _replace(match: re.Match[str]) -> str:
        alt, img_url = match.group(1), match.group(2)
        local = url_to_local.get(img_url)
        return f"![{alt}]({local})" if local else match.group(0)

    rewritten_md = _MD_IMAGE_RE.sub(_replace, md)
    return rewritten_md, metas, payloads


def _clean_snapshot_html(raw_html: str) -> str:
    """스크립트만 제거한 안전한 정적 스냅샷 HTML."""
    cleaned = re.sub(r"<script\b[^>]*>.*?</script>", "", raw_html, flags=re.I | re.S)
    cleaned = re.sub(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*')", "", cleaned, flags=re.I)
    return cleaned


def _compose_content_md(title: str, body: str) -> str:
    body_clean = body.strip()
    if title and not body_clean.startswith("# "):
        return f"# {title}\n\n{body_clean}\n" if body_clean else f"# {title}\n"
    return (body_clean + "\n") if body_clean else ""


def scrape_web_clip(
    *,
    url: str,
    mode: CaptureMode = "content",
    title: str = "",
    source_method: SourceMethod = "user-url",
    snippet: str = "",
    clip_id: str = "",
    fetch: Callable[..., tuple[int, str, bytes, str]] = default_http_fetch,
    browser_render: Callable[..., Any] = _try_browser_render,
) -> WebClipScrapeResponse:
    """URL 을 3단계 폭포수 파이프라인으로 수집해 `.vclip/` 번들 페이로드를 생성한다."""
    raw_url = (url or "").strip()
    if not re.match(r"^https?://", raw_url, re.I):
        raise ValueError("http(s) URL 만 스크랩할 수 있습니다.")

    cid = clip_id.strip() or f"clip_{uuid.uuid4().hex[:12]}"
    captured_at = _now_iso()
    fetch_url = normalize_fetch_url(raw_url)

    status, ctype, raw_bytes, final_url = fetch(fetch_url, limit=MAX_HTML_BYTES)
    canonical = final_url if (final_url and "PostView.naver" not in final_url) else raw_url
    domain = _domain_of(canonical) or _domain_of(raw_url)
    raw_html = _decode_bytes(raw_bytes, ctype) if raw_bytes else ""

    blocked_reason = _is_blocked_response(status, raw_html)
    if status == 0:
        blocked_reason = f"네트워크 연결 실패: {raw_html[:140]}"
    elif status >= 400 and not blocked_reason:
        blocked_reason = f"HTTP 오류 ({status})"

    if blocked_reason:
        fallback_title = (title or domain or raw_url).strip()
        fallback_lines = [
            f"> 원문 자동 수집이 제한되었습니다 ({blocked_reason}).",
            f"> 원본 주소: {canonical}",
        ]
        if snippet.strip():
            fallback_lines.append("")
            fallback_lines.append("## 검색 요약 (원문 미확보)")
            fallback_lines.append("")
            fallback_lines.append(snippet.strip())
        fallback_lines.extend([
            "",
            "---",
            "",
            "브라우저에서 본문을 복사해 이 탭에 붙여넣고 저장하면 즉시 리소스 정본(`manual`)으로 전환됩니다.",
        ])
        content_md = _compose_content_md(fallback_title, "\n".join(fallback_lines))
        meta = WebClipMeta(
            protocol=VCLIP_PROTOCOL,
            clipId=cid,
            url=raw_url,
            canonicalUrl=canonical,
            domain=domain,
            title=fallback_title,
            capturedAt=captured_at,
            captureMode=mode,
            sourceMethod=source_method,
            captureStatus="blocked-fallback",
            captureNote=blocked_reason,
            contentSha256=_sha256(content_md),
        )
        return WebClipScrapeResponse(
            meta=meta,
            contentMd=content_md,
            wordCount=len(content_md.split()),
            stageUsed="blocked-fallback",
        )

    body_md, parsed_meta, found_images = _extract_body_from_html(raw_html, canonical)
    effective_title = (title or parsed_meta.get("title") or domain or raw_url).strip()
    stage_used = "fast-http"
    snapshot_html: Optional[str] = None
    asset_metas: list[WebClipAssetMeta] = []
    asset_payloads: list[WebClipAssetPayload] = []
    capture_tile_metas: list[WebClipCaptureTileMeta] = []
    capture_tile_payloads: list[WebClipCaptureTilePayload] = []

    if mode == "bookmark":
        summary = snippet.strip() or parsed_meta.get("description") or (body_md[:360].strip() if body_md else "")
        bookmark_body = summary or f"원본 링크: {canonical}"
        content_md = _compose_content_md(effective_title, bookmark_body)
        meta = WebClipMeta(
            protocol=VCLIP_PROTOCOL,
            clipId=cid,
            url=raw_url,
            canonicalUrl=canonical,
            domain=domain,
            title=effective_title,
            author=parsed_meta.get("author", ""),
            publishedAt=parsed_meta.get("publishedAt", ""),
            capturedAt=captured_at,
            captureMode="bookmark",
            sourceMethod=source_method,
            captureStatus="partial",
            captureNote="목록화(bookmark) 모드 — 필요 시 본문 스크랩 또는 딥 아카이브로 승격 가능",
            contentSha256=_sha256(content_md),
        )
        return WebClipScrapeResponse(
            meta=meta,
            contentMd=content_md,
            wordCount=len(content_md.split()),
            stageUsed="fast-http",
        )

    # Stage 2 에스컬레이션: 본문이 너무 얇거나 archive 모드일 때 브라우저 렌더링(+ archive 시 연속 화면 캡처) 시도
    need_browser = len(body_md) < THIN_BODY_CHARS or mode == "archive"
    if need_browser:
        rendered = _invoke_browser_render(
            browser_render,
            raw_url,
            capture_screenshots=(mode == "archive"),
        )
        if rendered is not None:
            if len(rendered.md) > len(body_md):
                body_md = rendered.md
                stage_used = "browser-render"
            if rendered.title and not title and (not effective_title or effective_title == domain):
                effective_title = rendered.title
            if mode == "archive":
                if rendered.capture_tiles:
                    capture_tile_payloads = list(rendered.capture_tiles)
                    capture_tile_metas = [
                        WebClipCaptureTileMeta(
                            index=t.index,
                            file=t.file,
                            mime=t.mime,
                            width=t.width,
                            height=t.height,
                            scrollY=t.scrollY,
                            totalHeight=t.totalHeight,
                        )
                        for t in capture_tile_payloads
                    ]
                    stage_used = "browser-render"
                elif rendered.snapshot_html:
                    snapshot_html = rendered.snapshot_html

    if mode == "archive":
        # 실제 브라우저 화면 캡처가 없을 때만(헤드리스 미설치·HTTP 전용 폴백) 원시 HTML 스냅샷을 보조 보관
        if not capture_tile_payloads and snapshot_html is None and raw_html:
            snapshot_html = _clean_snapshot_html(raw_html)
        body_md, asset_metas, asset_payloads = _download_archive_images(
            body_md, found_images, canonical, fetch
        )

    capture_status: CaptureStatus = "full" if len(body_md) >= 80 else "partial"
    capture_note = ""
    if capture_status == "partial":
        capture_note = "추출된 본문이 짧습니다(동적 페이지 또는 요약형 페이지). 필요 시 원문을 붙여넣어 보강하세요."
        if not body_md and snippet.strip():
            body_md = snippet.strip()

    content_md = _compose_content_md(effective_title, body_md)
    meta = WebClipMeta(
        protocol=VCLIP_PROTOCOL,
        clipId=cid,
        url=raw_url,
        canonicalUrl=canonical,
        domain=domain,
        title=effective_title,
        author=parsed_meta.get("author", ""),
        publishedAt=parsed_meta.get("publishedAt", ""),
        capturedAt=captured_at,
        captureMode=mode,
        sourceMethod=source_method,
        captureStatus=capture_status,
        captureNote=capture_note,
        contentSha256=_sha256(content_md),
        hasSnapshotHtml=bool(snapshot_html),
        hasCaptureImage=bool(capture_tile_metas),
        assets=asset_metas,
        captureTiles=capture_tile_metas,
    )
    return WebClipScrapeResponse(
        meta=meta,
        contentMd=content_md,
        snapshotHtml=snapshot_html,
        assets=asset_payloads,
        captureTiles=capture_tile_payloads,
        wordCount=len(content_md.split()),
        stageUsed=stage_used,
    )
