"""리서치 도구 (rs_*) — 밖의 자료를 볼트로 들여온다 (playground v2 볼트 모드).

  rs_folder        볼트 폴더 만들기
  rs_page          웹 페이지 가볍게 보기 (제목 · 소제목 · 글자 수 · 사진 수) — 레퍼런스 후보 고르기
  rs_clip          URL → 사실 근거 웹 스크랩 번들(`<제목>.vclip/` — `clip.json` + `content.md` + 선택 `snapshot.html`/`assets/`) + 리소스 자동 마운트
  rs_ref_import    URL → 레퍼런스 라이브러리 등록(`/api/reference/items/url`) → 볼트 .ref 파일 + 작업대에 켜기 (형식·레이아웃 참고 전용)
  rs_image_search  자유 라이선스 사진 검색 (Wikimedia Commons)
  rs_image_save    고른 사진을 볼트 폴더에 저장 + 출처 노트 + 그 폴더를 세션 리소스로 마운트

지키는 것: 볼트 모드 · 쓰기 가능(화면 RW)일 때만 쓰고, 경로는 볼트 상대 경로만, 기존 파일은 덮어쓰지 않으며(새 이름),
사진은 이미지 형식 · 크기를 확인한 것만 저장하고 라이선스 · 작가 · 원본 주소를 남긴다. 결과 글은 research 팩 메시지.
`app` 패키지를 import 하지 않는다 (vibefs 는 agy 마다 하나씩 뜬다) — 볼트 · 레퍼런스는 로컬 API 로 쓴다.
"""
from __future__ import annotations

import base64
import html as html_lib
import json
import mimetypes
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from typing import Any, Callable, Optional

from harness_kit import packs

from .doc_tools import _Api
from .image_ops import compose_images, inspect_image, transform_image
from .index import MountItem

MSG = "research:messages.json"
RS_TOOL_SPECS: list[dict[str, Any]] = packs.tool_specs("research", "tools.json")

#: 사이트들이 자동 클라이언트를 구분할 수 있게 하되, 사용자 정보는 싣지 않는다
USER_AGENT = "VibeDocStudio-Research/1.0 (local desktop app)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
#: 상업적 이용 · 변경이 되는 자유 라이선스만 (비상업 NC · 변경 금지 ND 는 뺀다)
FREE_LICENSE = re.compile(r"^(cc0( 1\.0)?|cc[- ]by(-sa)?( \d+(\.\d+)?)?( [a-z]{2,3})?|public domain.*|pd(-[\w.-]+)?|no restrictions)$", re.I)
NON_FREE = re.compile(r"\b(nc|nd)\b", re.I)
MAX_PAGE_BYTES = 3 * 1024 * 1024
MAX_IMAGE_BYTES = 15 * 1024 * 1024
SAVE_WIDTH = 1920
THIN_REF_BLOCKS = 20
IMAGE_MAGIC = ((b"\xff\xd8\xff", ".jpg"), (b"\x89PNG\r\n\x1a\n", ".png"), (b"RIFF", ".webp"), (b"GIF8", ".gif"))
NOTE_NAME = "_사진 출처.md"
_HANGUL_RE = re.compile(r"[가-힣]")
_LETTER_RE = re.compile(r"[A-Za-z가-힣\u3040-\u30ff\u4e00-\u9fff]")
_HOMEPAGE_PATH_RE = re.compile(r"^/(?:index|main|home|default|ko|en|kr|jp)?(?:\.[a-z0-9]{1,5})?/?$", re.I)
_DEEP_QUERY_RE = re.compile(r"(?:^|&)(?:idxno|id|seq|nttId|bbsId|article|docId|p|v|logNo|no|newsId|boardSeq)=", re.I)
_MODE_RANK: dict[str, int] = {"bookmark": 1, "content": 2, "archive": 3}
THIN_CLIP_WORDS = 80
_IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _is_homepage_url(url: str) -> bool:
    """실제 기사·문서 상세 페이지가 아닌 루트/메인 홈페이지 URL 인지 판별한다."""
    try:
        parts = urllib.parse.urlsplit(str(url or "").strip())
    except ValueError:
        return False
    path = parts.path or ""
    query = parts.query or ""
    if _DEEP_QUERY_RE.search(query):
        return False
    if path in ("", "/"):
        return True
    return bool(_HOMEPAGE_PATH_RE.match(path))


def _normalize_clip_url(url: str) -> str:
    try:
        parts = urllib.parse.urlsplit(str(url or "").strip())
    except ValueError:
        return str(url or "").strip()
    path = parts.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def _first_preview_line(content_md: str, limit: int = 140) -> str:
    for raw_line in (content_md or "").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("![") or line == "---":
            continue
        plain = re.sub(r"\s+", " ", line).strip()
        if plain:
            return plain if len(plain) <= limit else plain[: limit - 1] + "…"
    return "(본문 없음)"


def _msg(key: str, **values: Any) -> str:
    return packs.message(MSG, key, **values)


def _rel(raw: Any) -> Optional[str]:
    rel = str(raw or "").replace("\\", "/").strip().strip("/")
    if not rel or ":" in rel or any(part in ("", ".", "..") for part in rel.split("/")):
        return None
    return rel


def _plain(html_text: str, limit: int = 160) -> str:
    text = re.sub(r"<[^>]+>", " ", html_text or "")
    text = " ".join(html_lib.unescape(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _slug(text: str, limit: int = 40) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|#%{}\[\]\x00-\x1f]', " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip().rstrip(".")
    return cleaned[:limit].strip() or "사진"


def http_get(
    url: str,
    *,
    limit: int,
    timeout: float = 30.0,
    accept: str = "*/*",
    referer: str = "",
) -> tuple[int, str, bytes, str]:
    """(상태, content-type, 본문, 최종 주소). 본문은 limit 바이트까지만 읽는다."""
    headers = {"User-Agent": USER_AGENT, "Accept": accept, "Accept-Language": "ko,en;q=0.8"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — 사용자가 시킨 리서치의 공개 웹 주소
            body = resp.read(limit + 1)
            return resp.status, resp.headers.get("Content-Type", ""), body, resp.geturl()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", "") if exc.headers else "", b"", url
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, "", str(exc).encode("utf-8", "replace"), url


def _ko_ratio(text: str) -> float:
    letters = len(_LETTER_RE.findall(text or ""))
    if letters == 0:
        return 0.0
    return round(len(_HANGUL_RE.findall(text or "")) / letters, 3)


def _extract_ld_meta(raw_json: str) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        data = json.loads(raw_json)
    except (ValueError, TypeError):
        return out
    nodes: list[Any] = data if isinstance(data, list) else [data]
    expanded: list[dict[str, Any]] = []
    for n in nodes:
        if isinstance(n, dict):
            if isinstance(n.get("@graph"), list):
                expanded.extend(g for g in n["@graph"] if isinstance(g, dict))
            expanded.append(n)
    for obj in expanded:
        t = obj.get("@type")
        if isinstance(t, list):
            t = next((str(x) for x in t if x), "")
        t_str = str(t or "")
        if t_str and not out.get("ld_type"):
            out["ld_type"] = t_str
        elif t_str in ("BlogPosting", "Article", "NewsArticle"):
            out["ld_type"] = t_str
        if not out.get("author") and obj.get("author"):
            auth = obj["author"]
            if isinstance(auth, list) and auth:
                auth = auth[0]
            if isinstance(auth, dict):
                out["author"] = str(auth.get("name") or "").strip()
            elif isinstance(auth, str):
                out["author"] = auth.strip()
        if not out.get("published"):
            pub = obj.get("datePublished") or obj.get("dateModified")
            if isinstance(pub, str) and pub.strip():
                out["published"] = pub.strip()[:10]
    return out


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.headings: list[str] = []
        self.paragraphs: list[str] = []
        self.images = 0
        self.iframes: list[str] = []
        self.html_lang = ""
        self.og_type = ""
        self.author = ""
        self.published = ""
        self.ld_type = ""
        self.has_article_tag = False
        self._skip = 0
        self._in_ld = False
        self._ld_buf: list[str] = []
        self._in_a = 0
        self._cur: Optional[str] = None
        self._buf: list[str] = []
        self._text_chars = 0
        self._link_chars = 0
        self._all_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and a.get("lang"):
            self.html_lang = a["lang"].strip()
        elif tag == "article":
            self.has_article_tag = True
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            val = a.get("content", "").strip()
            if val:
                if key == "og:type" and not self.og_type:
                    self.og_type = val
                elif key in ("author", "article:author", "dable:author", "twitter:creator") and not self.author:
                    self.author = val[:60]
                elif key in ("article:published_time", "pubdate", "date", "og:regdate", "dable:published_time") and not self.published:
                    self.published = val[:10]
        elif tag == "time" and not self.published:
            dt = a.get("datetime", "").strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}", dt):
                self.published = dt[:10]
        elif tag == "script":
            self._skip += 1
            if "ld+json" in a.get("type", "").lower():
                self._in_ld = True
                self._ld_buf = []
        elif tag in ("style", "noscript"):
            self._skip += 1
        elif tag == "a":
            self._in_a += 1
        elif tag == "img" and (a.get("src") or a.get("data-src") or a.get("data-lazy-src")):
            self.images += 1
        elif tag == "iframe" and a.get("src"):
            self.iframes.append(str(a["src"]))
        elif tag in ("title", "h1", "h2", "h3", "p") and self._skip == 0:
            self._cur, self._buf = tag, []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            if self._in_ld:
                meta = _extract_ld_meta("".join(self._ld_buf))
                self.ld_type = self.ld_type or meta.get("ld_type", "")
                self.author = self.author or meta.get("author", "")[:60]
                self.published = self.published or meta.get("published", "")
                self._in_ld = False
                self._ld_buf = []
            self._skip = max(0, self._skip - 1)
        elif tag in ("style", "noscript"):
            self._skip = max(0, self._skip - 1)
        elif tag == "a":
            self._in_a = max(0, self._in_a - 1)
        elif tag == self._cur:
            text = " ".join("".join(self._buf).split())
            if text:
                if tag == "title":
                    self.title = self.title or text
                elif tag == "p":
                    self.paragraphs.append(text)
                else:
                    self.headings.append(text)
            self._cur, self._buf = None, []

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._ld_buf.append(data)
            return
        if self._skip:
            return
        stripped = data.strip()
        if stripped:
            self._text_chars += len(stripped)
            if self._in_a:
                self._link_chars += len(stripped)
            if len(self._all_text) < 400:
                self._all_text.append(stripped)
        if self._cur:
            self._buf.append(data)


def _decode(body: bytes, ctype: str) -> str:
    m = re.search(r"charset=([\w-]+)", ctype or "", re.I) or re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', body[:4096], re.I)
    enc = (m.group(1).decode() if isinstance(m.group(1), bytes) else m.group(1)) if m else "utf-8"
    try:
        return body.decode(enc, "replace")
    except LookupError:
        return body.decode("utf-8", "replace")


def read_page(url: str, fetch: Callable[..., tuple[int, str, bytes, str]] = http_get) -> dict[str, Any]:
    """페이지 하나 → 제목 · 언어 · 작성자/날짜 · 형식 신호 · 소제목 · 문단 · 사진 수.
    본문이 얇고 같은 사이트 iframe 이 있으면(블로그 틀) 그 안을 본다."""
    status, ctype, body, final = fetch(url, limit=MAX_PAGE_BYTES, accept="text/html,*/*")
    if status != 200 or "html" not in ctype.lower():
        return {"ok": False, "status": status or "연결 실패", "url": url}
    page = _PageParser()
    page.feed(_decode(body, ctype))
    if page._text_chars < 800 and page.iframes:
        host = urllib.parse.urlsplit(final).netloc
        for src in page.iframes[:3]:
            inner = urllib.parse.urljoin(final, html_lib.unescape(src))
            if urllib.parse.urlsplit(inner).netloc.endswith(host.split(".", 1)[-1]):
                sub = read_page(inner, fetch)
                if sub.get("ok") and sub.get("chars", 0) > page._text_chars:
                    sub["url"] = final
                    sub["title"] = sub.get("title") or page.title
                    return sub
    sample_text = " ".join([page.title, *page.headings[:20], *page.paragraphs[:30]]) or " ".join(page._all_text)
    ko_ratio = _ko_ratio(sample_text)
    substantive_p = [p for p in page.paragraphs if len(p) >= 20]
    avg_p = round(sum(len(p) for p in substantive_p) / len(substantive_p)) if substantive_p else 0
    link_ratio = round((page._link_chars / page._text_chars) * 100) if page._text_chars else 0
    return {
        "ok": True, "status": status, "url": final, "title": page.title, "headings": page.headings[:30],
        "chars": page._text_chars, "images": page.images,
        "paragraphs": len(substantive_p), "avg_p": avg_p, "link_ratio": link_ratio,
        "ko_ratio": ko_ratio, "html_lang": page.html_lang,
        "author": page.author, "published": page.published,
        "og_type": page.og_type, "ld_type": page.ld_type, "has_article_tag": page.has_article_tag,
        "lead": next((p for p in page.paragraphs if len(p) > 40), ""),
    }


def commons_search(query: str, count: int = 12, min_width: int = 1000,
                   fetch: Callable[..., tuple[int, str, bytes, str]] = http_get) -> list[dict[str, Any]]:
    """Wikimedia Commons 파일 검색 → 자유 라이선스 사진만."""
    params = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
              "gsrsearch": f"{query} filetype:bitmap", "gsrlimit": str(min(50, max(count * 2, 10))),
              "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": str(SAVE_WIDTH),
              "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription|ObjectName"}
    return _commons_pages(f"{COMMONS_API}?{urllib.parse.urlencode(params)}", min_width, fetch)[:count]


def commons_by_ids(ids: list[str], fetch: Callable[..., tuple[int, str, bytes, str]] = http_get) -> dict[str, dict[str, Any]]:
    pageids = [i.split(":", 1)[-1] for i in ids if i.split(":", 1)[-1].isdigit()]
    if not pageids:
        return {}
    params = {"action": "query", "format": "json", "pageids": "|".join(pageids[:50]), "prop": "imageinfo",
              "iiprop": "url|size|mime|extmetadata", "iiurlwidth": str(SAVE_WIDTH),
              "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription|ObjectName"}
    return {c["id"]: c for c in _commons_pages(f"{COMMONS_API}?{urllib.parse.urlencode(params)}", 0, fetch)}


def _commons_pages(url: str, min_width: int, fetch: Callable[..., tuple[int, str, bytes, str]]) -> list[dict[str, Any]]:
    status, _, body, _ = fetch(url, limit=8 * 1024 * 1024, accept="application/json")
    if status != 200:
        raise ValueError(f"사진 저장소에 닿지 못했다 ({status or '연결 실패'})")
    pages = (json.loads(body.decode("utf-8")).get("query") or {}).get("pages") or {}
    out = []
    for page in sorted(pages.values(), key=lambda p: p.get("index", 0)):
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        license_ = _plain((meta.get("LicenseShortName") or {}).get("value", ""), 40)
        if not FREE_LICENSE.match(license_) or NON_FREE.search(license_) or not str(info.get("mime", "")).startswith("image/"):
            continue
        if str(info.get("mime")) in ("image/svg+xml", "image/tiff") or int(info.get("width") or 0) < min_width:
            continue
        out.append({
            "id": f"commons:{page.get('pageid')}",
            "title": str(page.get("title") or ""),
            "width": int(info.get("width") or 0), "height": int(info.get("height") or 0),
            "license": license_,
            "artist": _plain((meta.get("Artist") or {}).get("value", ""), 60) or "작가 미상",
            "desc": _plain((meta.get("ImageDescription") or {}).get("value", "") or (meta.get("ObjectName") or {}).get("value", ""), 90),
            "download": str(info.get("thumburl") or info.get("url") or ""),
            "source": str(info.get("descriptionurl") or ""),
        })
    return out


def sniff_image(data: bytes) -> Optional[str]:
    for magic, ext in IMAGE_MAGIC:
        if data.startswith(magic) and (ext != ".webp" or data[8:12] == b"WEBP"):
            return ext
    return None


class ResearchTools:
    def __init__(self, store: Any, session_id: str, conversation_id: str = "", api: Optional[_Api] = None,
                 fetch: Callable[..., tuple[int, str, bytes, str]] = http_get) -> None:
        self.store = store
        self.session_id = session_id
        self.conversation_id = conversation_id
        self.api = api or _Api(timeout=240.0)
        self.fetch = fetch

    @staticmethod
    def handles(name: str) -> bool:
        return name.startswith("rs_")

    def call(self, name: str, args: dict[str, Any]) -> str:
        args.pop("toolSummary", None)
        fn = getattr(self, "_" + name, None)
        if fn is None:
            raise ValueError(f"알 수 없는 리서치 도구: {name}")
        return fn(**args)

    # --- 볼트 ---------------------------------------------------------------------------------

    def _state(self) -> dict[str, Any]:
        return dict(self.store.workbench_for(self.session_id) or {})

    def _vault(self, *, write: bool) -> tuple[str, str, dict[str, Any]]:
        state = self._state()
        vault_id = str(state.get("vaultId") or "")
        if not vault_id:
            raise ValueError(_msg("notVault"))
        if write and state.get("readOnly"):
            raise ValueError(_msg("readOnly"))
        return vault_id, str(state.get("vaultRoot") or ""), state

    def _url(self, vault_id: str, tail: str) -> str:
        return f"/api/vaults/{urllib.parse.quote(vault_id, safe='')}/{tail}"

    def _folder(self, vault_id: str, raw: Any) -> str:
        rel = _rel(raw)
        if rel is None:
            raise ValueError(_msg("badPath", path=raw))
        self.api.call("POST", self._url(vault_id, "folder"), {"path": rel})
        return rel

    def _create_unique(self, vault_id: str, folder: str, stem: str, ext: str, content: str) -> str:
        for n in range(1, 60):
            name = f"{stem}{ext}" if n == 1 else f"{stem} ({n}){ext}"
            rel = f"{folder}/{name}" if folder else name
            try:
                self.api.call("POST", self._url(vault_id, "file"), {"path": rel, "content": content})
                return rel
            except ValueError as exc:
                if "오류 409" not in str(exc):
                    raise
        raise ValueError(f"파일 이름을 정하지 못했다: {stem}{ext}")

    def _upload(self, vault_id: str, folder: str, filename: str, data: bytes, mime: str) -> str:
        boundary = uuid.uuid4().hex
        parts = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"folder\"\r\n\r\n{folder}\r\n".encode("utf-8"),
            (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename.replace(chr(34), '')}\"\r\n"
             f"Content-Type: {mime}\r\n\r\n").encode("utf-8"),
            data, f"\r\n--{boundary}--\r\n".encode("utf-8"),
        ]
        req = urllib.request.Request(self.api.base + self._url(vault_id, "upload"), data=b"".join(parts), method="POST",
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 — 로컬 API
                return str(json.loads(resp.read().decode("utf-8")).get("path") or "")
        except urllib.error.HTTPError as exc:
            raise ValueError(f"볼트 저장 실패 {exc.code}: {exc.read().decode('utf-8', 'replace')[:200]}") from exc

    def _mount_folder(self, vault_root: str, rel: str) -> None:
        """저장한 폴더를 이 세션 리소스로 마운트한다 (ws_images 가 곧바로 본다). 이미 마운트 안이면 그대로."""
        if not vault_root:
            return
        abs_path = os.path.join(vault_root, *rel.split("/"))
        mount = next((m for m in self.store.mounts() if m.session_id == self.session_id), None)
        items = list(mount.items) if mount else []
        key = os.path.normcase(os.path.abspath(abs_path))
        for item in items:
            base = os.path.normcase(os.path.abspath(item.path))
            if key == base or key.startswith(base + os.sep):
                return
        items.append(MountItem(abs_path, f"vault:{rel}", rel.rsplit("/", 1)[-1], kind="dir"))
        roots = list(mount.roots) if mount and mount.roots else []
        if roots:
            roots.append(abs_path)
        self.store.set_mount(self.session_id, items, self.conversation_id or None,
                             roots=roots or None, id_map=mount.id_map if mount else None)

    # --- 도구 ---------------------------------------------------------------------------------

    def _rs_folder(self, path: str = "", **_: Any) -> str:
        vault_id, _, _ = self._vault(write=True)
        return _msg("folderMade", path=self._folder(vault_id, path))

    def _rs_page(self, url: str = "", **_: Any) -> str:
        self._vault(write=False)
        if not re.match(r"^https?://", str(url or ""), re.I):
            raise ValueError(_msg("badUrl", url=url))
        page = read_page(url, self.fetch)
        if not page.get("ok"):
            return _msg("pageFailed", status=page.get("status"), url=url)
        heads = page.get("headings") or []
        ko_pct = round(float(page.get("ko_ratio") or 0.0) * 100)
        html_lang = str(page.get("html_lang") or "")
        lang_tag = "한국어" if ko_pct >= 50 else ("혼합" if ko_pct >= 15 else (html_lang or "비한국어"))
        lang_summary = f"{lang_tag} (한글 {ko_pct}%)" + (f" · html lang={html_lang}" if html_lang and lang_tag != html_lang else "")
        signals: list[str] = []
        if page.get("ld_type"):
            signals.append(f"schema:{page['ld_type']}")
        if page.get("og_type"):
            signals.append(f"og:{page['og_type']}")
        if page.get("has_article_tag"):
            signals.append("<article>")
        link_ratio = int(page.get("link_ratio") or 0)
        if link_ratio >= 35:
            signals.append("링크 밀도 높음(목록·안내 가능)")
        elif int(page.get("paragraphs") or 0) >= 4 and int(page.get("avg_p") or 0) >= 45:
            signals.append("서술 문단 중심(단일 글 신호)")
        byline_parts = [p for p in (page.get("author"), page.get("published")) if p]
        byline = " · ".join(byline_parts) if byline_parts else "작성자/날짜 메타 없음"
        return _msg(
            "page",
            title=page.get("title") or "(제목 없음)", url=page.get("url") or url,
            lang_summary=lang_summary,
            format_signals=", ".join(signals) if signals else "특이 신호 없음",
            byline=byline,
            chars=page.get("chars", 0), paragraphs=page.get("paragraphs", 0),
            avg_p=page.get("avg_p", 0), link_ratio=link_ratio,
            images=page.get("images", 0), headings=len(heads),
            heading_list=" · ".join(h[:40] for h in heads[:14]) or "(없음)",
            lead=(page.get("lead") or "")[:200],
        )

    def _resolve_canonical_url(self, url: str) -> str:
        """검색 리다이렉트(예: vertexaisearch grounding-api-redirect)를 실제 최종 URL로 풀어준다."""
        host = urllib.parse.urlsplit(url).netloc.lower()
        if "vertexaisearch.cloud.google.com" not in host and "google.com" not in host:
            return url
        status, _, _, final = self.fetch(url, limit=4096, timeout=20.0, accept="text/html,*/*")
        if status and final and re.match(r"^https?://", final, re.I):
            return final
        return url

    def _active_doc_dir(self, state: dict[str, Any]) -> str:
        """현재 편집 중인 문서가 속한 볼트 상대 디렉터리(예: `03_프로젝트.vproj`)를 돌려준다."""
        for key in ("docVaultPath", "activeDocPath", "activePath"):
            raw = str(state.get(key) or "").replace("\\", "/").strip("/")
            if raw and ":" not in raw:
                if "/" in raw:
                    return raw.rsplit("/", 1)[0]
                return ""
        draft_folder = _rel(state.get("draftFolder"))
        if draft_folder:
            return draft_folder
        doc_path = str(state.get("docPath") or "").strip()
        vault_root = str(state.get("vaultRoot") or "").strip()
        if doc_path:
            if vault_root and os.path.isabs(doc_path):
                try:
                    norm_root = os.path.realpath(vault_root)
                    norm_doc = os.path.realpath(doc_path)
                    if os.path.normcase(norm_doc).startswith(os.path.normcase(norm_root) + os.sep):
                        rel = os.path.relpath(norm_doc, norm_root).replace("\\", "/").strip("/")
                        if "/" in rel:
                            return rel.rsplit("/", 1)[0]
                        return ""
                except (ValueError, OSError):
                    pass
            elif ":" not in doc_path:
                cleaned = doc_path.replace("\\", "/").strip("/")
                if "/" in cleaned:
                    return cleaned.rsplit("/", 1)[0]
        return ""

    def _default_sources_folder(self, state: dict[str, Any]) -> str:
        """옵시디언 첨부파일 방식: 현재 편집 중인 문서와 동일 레이어에 `sources` 폴더 경로를 결정한다."""
        parent = self._active_doc_dir(state)
        return f"{parent}/sources" if parent else "sources"

    def _default_photos_folder(self, state: dict[str, Any]) -> str:
        parent = self._active_doc_dir(state)
        return f"{parent}/사진" if parent else "사진"

    def _find_existing_clip_bundle(
        self, vault_root: str, rel_folder: str, target_url: str
    ) -> Optional[tuple[str, dict[str, Any]]]:
        """대상 폴더에 동일 URL 로 이미 수집된 `.vclip` 번들이 있으면 `(bundle_rel, meta)` 를 돌려준다."""
        if not vault_root:
            return None
        folder_abs = os.path.join(vault_root, *rel_folder.split("/")) if rel_folder else vault_root
        if not os.path.isdir(folder_abs):
            return None
        needle = _normalize_clip_url(target_url)
        try:
            entries = sorted(os.listdir(folder_abs))
        except OSError:
            return None
        for entry in entries:
            if not entry.endswith(".vclip"):
                continue
            meta_file = os.path.join(folder_abs, entry, "clip.json")
            if not os.path.isfile(meta_file):
                continue
            try:
                with open(meta_file, encoding="utf-8") as fh:
                    meta = json.load(fh)
            except (OSError, ValueError):
                continue
            existing_urls = {
                _normalize_clip_url(str(meta.get("url") or "")),
                _normalize_clip_url(str(meta.get("canonicalUrl") or "")),
            }
            if needle in existing_urls:
                bundle_rel = f"{rel_folder}/{entry}" if rel_folder else entry
                return bundle_rel, meta
        return None

    def _write_or_update_file(self, vault_id: str, rel: str, content: str, *, overwrite: bool) -> None:
        if overwrite:
            try:
                self.api.call("PUT", self._url(vault_id, "file"), {"path": rel, "content": content})
                return
            except ValueError:
                pass
        self.api.call("POST", self._url(vault_id, "file"), {"path": rel, "content": content})

    def _create_unique_clip_bundle(self, vault_id: str, folder: str, stem: str) -> str:
        for n in range(1, 60):
            name = f"{stem}.vclip" if n == 1 else f"{stem} ({n}).vclip"
            bundle_rel = f"{folder}/{name}" if folder else name
            marker = f"{bundle_rel}/clip.json"
            try:
                self.api.call("GET", self._url(vault_id, "file") + "?path=" + urllib.parse.quote(marker, safe=""))
                continue  # 이미 존재하면 다음 번호
            except ValueError:
                self.api.call("POST", self._url(vault_id, "folder"), {"path": bundle_rel})
                return bundle_rel
        raise ValueError(f"웹 스크랩 번들 이름을 정하지 못했다: {stem}.vclip")

    def _rs_clip(
        self,
        url: str = "",
        folder: str = "",
        mode: str = "content",
        title: str = "",
        snippet: str = "",
        **_: Any,
    ) -> str:
        vault_id, vault_root, state = self._vault(write=True)
        if not re.match(r"^https?://", str(url or ""), re.I):
            raise ValueError(_msg("badUrl", url=url))
        resolved_url = self._resolve_canonical_url(url)
        clean_mode = mode if mode in ("bookmark", "content", "archive") else "content"
        target_folder = folder.strip() or self._default_sources_folder(state)
        rel_folder = self._folder(vault_id, target_folder)

        existing = self._find_existing_clip_bundle(vault_root, rel_folder, resolved_url)
        upgrade_bundle: Optional[str] = None
        preserve_clip_id = ""
        if existing is not None:
            ex_rel, ex_meta = existing
            ex_mode = str(ex_meta.get("captureMode") or "content")
            ex_status = str(ex_meta.get("captureStatus") or "full")
            if _MODE_RANK.get(clean_mode, 2) <= _MODE_RANK.get(ex_mode, 2) and ex_status in ("full", "manual"):
                self._mount_folder(vault_root, rel_folder)
                return _msg(
                    "clipDuplicate",
                    clipId=ex_meta.get("clipId") or "",
                    title=ex_meta.get("title") or ex_rel,
                    path=ex_rel,
                    mode=ex_mode,
                    status=ex_status,
                )
            upgrade_bundle = ex_rel
            preserve_clip_id = str(ex_meta.get("clipId") or "")

        try:
            scraped = self.api.call(
                "POST",
                "/api/webclips/scrape",
                {
                    "url": resolved_url,
                    "mode": clean_mode,
                    "title": title or "",
                    "sourceMethod": "research-auto",
                    "snippet": snippet or "",
                    "clipId": preserve_clip_id,
                },
            )
        except ValueError as exc:
            return _msg("clipFailed", url=resolved_url, reason=str(exc)[:240])

        meta = dict(scraped.get("meta") or {})
        content_md = str(scraped.get("contentMd") or "")
        snapshot_html = scraped.get("snapshotHtml")
        assets = scraped.get("assets") or []
        capture_tiles = scraped.get("captureTiles") or []

        stem = _slug(title or str(meta.get("title") or "") or str(meta.get("domain") or "웹스크랩"), 72)
        overwrite = upgrade_bundle is not None
        bundle_rel = upgrade_bundle or self._create_unique_clip_bundle(vault_id, rel_folder, stem)
        self._write_or_update_file(
            vault_id,
            f"{bundle_rel}/clip.json",
            json.dumps(meta, ensure_ascii=False, indent=2),
            overwrite=overwrite,
        )
        self._write_or_update_file(vault_id, f"{bundle_rel}/content.md", content_md, overwrite=overwrite)
        if isinstance(snapshot_html, str) and snapshot_html.strip():
            self._write_or_update_file(vault_id, f"{bundle_rel}/snapshot.html", snapshot_html, overwrite=overwrite)
        saved_captures = 0
        if isinstance(capture_tiles, list) and capture_tiles:
            captures_folder = f"{bundle_rel}/captures"
            self.api.call("POST", self._url(vault_id, "folder"), {"path": captures_folder})
            for tile in capture_tiles:
                if not isinstance(tile, dict) or not tile.get("base64"):
                    continue
                fname = str(tile.get("file") or "shot.jpg").rsplit("/", 1)[-1]
                mime = str(tile.get("mime") or "image/jpeg")
                try:
                    raw = base64.b64decode(str(tile["base64"]))
                    self._upload(vault_id, captures_folder, fname, raw, mime)
                    saved_captures += 1
                except Exception:
                    continue
        saved_assets = 0
        if isinstance(assets, list) and assets:
            assets_folder = f"{bundle_rel}/assets"
            self.api.call("POST", self._url(vault_id, "folder"), {"path": assets_folder})
            for asset in assets:
                if not isinstance(asset, dict) or not asset.get("base64"):
                    continue
                fname = str(asset.get("file") or "img.jpg").rsplit("/", 1)[-1]
                mime = str(asset.get("mime") or "image/jpeg")
                try:
                    raw = base64.b64decode(str(asset["base64"]))
                    self._upload(vault_id, assets_folder, fname, raw, mime)
                    saved_assets += 1
                except Exception:
                    continue

        self._mount_folder(vault_root, rel_folder)
        status = str(meta.get("captureStatus") or "full")
        if status == "blocked-fallback":
            return _msg(
                "clipBlocked",
                title=meta.get("title") or stem,
                path=bundle_rel,
                url=resolved_url,
                domain=meta.get("domain") or "",
                reason=meta.get("captureNote") or "접근 제한",
            )
        words = int(scraped.get("wordCount") or 0)
        diag_parts: list[str] = []
        canonical_url = str(meta.get("canonicalUrl") or resolved_url)
        if _is_homepage_url(canonical_url):
            diag_parts.append(_msg("clipWarnHomepage"))
        if clean_mode in ("content", "archive") and words < THIN_CLIP_WORDS:
            diag_parts.append(_msg("clipWarnThin", words=words))
        return _msg(
            "clipDone",
            action="업그레이드" if overwrite else "완료",
            clipId=meta.get("clipId") or "",
            title=meta.get("title") or stem,
            path=bundle_rel,
            mode=clean_mode,
            status=status,
            words=words,
            stage=str(scraped.get("stageUsed") or "fast-http"),
            snapshot=f"캡처 {saved_captures}장" if saved_captures else ("있음" if snapshot_html else "없음"),
            assets=saved_assets,
            diag="".join(diag_parts),
            preview=_first_preview_line(content_md),
        )

    def _rs_audit(self, folder: str = "", **_: Any) -> str:
        """현재 프로젝트(또는 지정 폴더)의 리서치 수집물(.vclip · 사진 · .ref) 완결성과 품질을 점검한다."""
        _, vault_root, state = self._vault(write=False)
        if not vault_root:
            raise ValueError(_msg("notVault"))
        scope_rel = _rel(folder) if str(folder or "").strip() else self._active_doc_dir(state)
        scope_abs = os.path.join(vault_root, *scope_rel.split("/")) if scope_rel else vault_root
        scope_label = scope_rel or "(볼트 전체)"
        if not os.path.isdir(scope_abs):
            return _msg("auditEmpty", scope=scope_label)

        clips: list[dict[str, Any]] = []
        photos = 0
        licensed = 0
        refs = 0
        for dirpath, dirnames, filenames in os.walk(scope_abs):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            rel_dir = os.path.relpath(dirpath, vault_root).replace("\\", "/")
            if rel_dir == ".":
                rel_dir = ""
            if dirpath.endswith(".vclip"):
                dirnames[:] = []  # .vclip 내부 재귀 중단
                meta: dict[str, Any] = {}
                meta_path = os.path.join(dirpath, "clip.json")
                if os.path.isfile(meta_path):
                    try:
                        with open(meta_path, encoding="utf-8") as fh:
                            meta = json.load(fh)
                    except (OSError, ValueError):
                        meta = {}
                content_path = os.path.join(dirpath, "content.md")
                words = 0
                if os.path.isfile(content_path):
                    try:
                        with open(content_path, encoding="utf-8", errors="replace") as fh:
                            words = len(fh.read().split())
                    except OSError:
                        pass
                snap_path = os.path.join(dirpath, "snapshot.html")
                capture_img_path = os.path.join(dirpath, "capture.png")
                captures_dir = os.path.join(dirpath, "captures")
                has_captures = os.path.isdir(captures_dir) and bool(os.listdir(captures_dir))
                has_snap = (
                    has_captures
                    or os.path.isfile(capture_img_path)
                    or (os.path.isfile(snap_path) and os.path.getsize(snap_path) > 100)
                )
                assets_dir = os.path.join(dirpath, "assets")
                asset_cnt = len(os.listdir(assets_dir)) if os.path.isdir(assets_dir) else 0
                clips.append({
                    "rel": rel_dir,
                    "mode": str(meta.get("captureMode") or "content"),
                    "status": str(meta.get("captureStatus") or "full"),
                    "domain": str(meta.get("domain") or ""),
                    "url": str(meta.get("canonicalUrl") or meta.get("url") or ""),
                    "words": words,
                    "snap": has_snap,
                    "assets": asset_cnt,
                })
                continue
            for fname in filenames:
                low = fname.lower()
                if low.endswith(".ref"):
                    refs += 1
                elif fname == NOTE_NAME:
                    try:
                        with open(os.path.join(dirpath, fname), encoding="utf-8", errors="replace") as fh:
                            licensed += len(re.findall(r"- 라이선스:\s*(CC|Public|PD)", fh.read(), re.I))
                    except OSError:
                        pass
                elif os.path.splitext(low)[1] in _IMG_EXTS:
                    photos += 1

        if not clips and photos == 0 and refs == 0:
            return _msg("auditEmpty", scope=scope_label)

        statuses = {"full": 0, "partial": 0, "manual": 0, "blocked-fallback": 0}
        modes = {"bookmark": 0, "content": 0, "archive": 0}
        domains: set[str] = set()
        hp_items: list[str] = []
        thin_items: list[str] = []
        blocked_items: list[str] = []
        nosnap_items: list[str] = []
        rows: list[str] = []

        for c in sorted(clips, key=lambda x: x["rel"]):
            st = c["status"]
            md = c["mode"]
            if st in statuses:
                statuses[st] += 1
            if md in modes:
                modes[md] += 1
            if c["domain"]:
                domains.add(c["domain"].lower())
            flags: list[str] = []
            short_name = c["rel"].rsplit("/", 1)[-1]
            if _is_homepage_url(c["url"]):
                hp_items.append(short_name)
                flags.append(_msg("auditFlagHomepage"))
            if md in ("content", "archive") and st != "blocked-fallback" and c["words"] < THIN_CLIP_WORDS:
                thin_items.append(short_name)
                flags.append(_msg("auditFlagThin"))
            if st == "blocked-fallback":
                blocked_items.append(short_name)
            if md == "archive" and st != "blocked-fallback" and not c["snap"]:
                nosnap_items.append(short_name)
                flags.append(_msg("auditFlagNoSnap"))
            rows.append(_msg(
                "auditClipRow",
                rel=c["rel"],
                mode=md,
                status=st,
                domain=c["domain"] or "-",
                words=c["words"],
                snap="O" if c["snap"] else "X",
                assets=c["assets"],
                flags="".join(flags),
            ))

        issues: list[str] = []
        if hp_items:
            issues.append(_msg("auditIssueHomepage", count=len(hp_items), items=", ".join(hp_items[:4])))
        if thin_items:
            issues.append(_msg("auditIssueThin", count=len(thin_items), items=", ".join(thin_items[:4])))
        if blocked_items:
            issues.append(_msg("auditIssueBlocked", count=len(blocked_items), items=", ".join(blocked_items[:4])))
        if nosnap_items:
            issues.append(_msg("auditIssueNoSnap", count=len(nosnap_items), items=", ".join(nosnap_items[:4])))
        if photos > 0 and licensed < photos:
            issues.append(_msg("auditIssueUnlicensed", photos=photos, licensed=licensed))

        out = [
            _msg(
                "auditHead",
                scope=scope_label,
                total=len(clips),
                full=statuses["full"],
                partial=statuses["partial"],
                manual=statuses["manual"],
                blocked=statuses["blocked-fallback"],
                domains=len(domains),
                domain_list=", ".join(sorted(domains)[:8]) or "-",
                m_bookmark=modes["bookmark"],
                m_content=modes["content"],
                m_archive=modes["archive"],
                photos=photos,
                licensed=licensed,
                refs=refs,
            ),
            *rows,
        ]
        if issues:
            out.append(_msg("auditIssueHead", count=len(issues)))
            out.extend(_msg("auditIssueRow", issue=iss) for iss in issues)
        else:
            out.append(_msg("auditOk"))
        return "\n".join(out)

    def _rs_ref_import(self, url: str = "", folder: str = "", title: str = "", **_: Any) -> str:
        vault_id, _, state = self._vault(write=True)
        if not re.match(r"^https?://", str(url or ""), re.I):
            raise ValueError(_msg("badUrl", url=url))
        resolved_url = self._resolve_canonical_url(url)
        rel_folder = self._folder(vault_id, folder)
        try:
            item = self.api.call("POST", "/api/reference/items/url", {"url": resolved_url, "title": title or "", "layerSet": ""})
            ref_id = str(item.get("refId") or "")
            doc = self.api.call("GET", f"/api/reference/items/{urllib.parse.quote(ref_id, safe='')}/normalized")
        except ValueError as exc:
            return _msg("refFailed", url=resolved_url, reason=str(exc)[:240])
        block_list = doc.get("blocks") or []
        blocks = len(block_list)
        status = str(doc.get("status") or "")
        if blocks == 0:
            return _msg("refEmpty", url=resolved_url, status=status or "?")
        source = dict(doc.get("source") or {})
        source.setdefault("serverRefId", ref_id)
        doc = {**doc, "source": source, "nameSource": "user" if title else "auto"}
        name = _slug(title or str(doc.get("title") or "") or "레퍼런스", 80)
        rel = self._create_unique(vault_id, rel_folder, name, ".ref", json.dumps(doc, ensure_ascii=False, indent=2))
        # 작업대에 바로 켠다 — 같은 대화에서 rf_* · wb_read(ref:…) 가 이 레퍼런스를 본다
        refs_root = str(state.get("referencesRoot") or "")
        refs = [r for r in state.get("references") or [] if isinstance(r, dict) and r.get("refId") != ref_id]
        refs.append({"refId": ref_id, "title": doc.get("title") or name, "pinIds": None, "layers": {}, "consensus": [],
                     "dir": os.path.join(refs_root, re.sub(r"[^\w.-]", "_", ref_id)) if refs_root else None})
        latest = self._state()
        latest["references"] = refs
        latest.pop("updatedAt", None)
        self.store.set_workbench(self.session_id, latest)
        ref_ko_pct = round(_ko_ratio(" ".join(str(b.get("text") or "") for b in block_list[:80])) * 100)
        block_note = (
            _msg("refThinWarn", blocks=blocks, minBlocks=THIN_REF_BLOCKS)
            if blocks < THIN_REF_BLOCKS
            else _msg("refBlocksOk", blocks=blocks)
        )
        return _msg("refDone", refId=ref_id, title=doc.get("title") or name, path=rel, status=status or "ready",
                    frames=len(doc.get("frames") or []), blocks=blocks, outline=len(doc.get("outline") or []),
                    pins=len(doc.get("pins") or []), layerSet=doc.get("layerSet") or "-",
                    ko_pct=ref_ko_pct, block_note=block_note)

    def _rs_image_search(self, query: str = "", count: int = 12, minWidth: int = 1000, **_: Any) -> str:
        self._vault(write=False)
        q = " ".join(str(query or "").split())
        if not q:
            raise ValueError("query 가 비었다")
        found = commons_search(q, max(1, min(int(count or 12), 40)), int(minWidth or 1000), self.fetch)
        if not found:
            return _msg("searchEmpty", query=q)
        rows = [_msg("searchRow", id=c["id"], width=c["width"], height=c["height"], license=c["license"],
                     artist=c["artist"], desc=c["desc"] or c["title"].replace("File:", "")[:80]) for c in found]
        return _msg("searchHead", count=len(found), query=q) + "\n" + "\n".join(rows)

    def _rs_image_save(self, folder: str = "", items: Any = None, **_: Any) -> str:
        vault_id, vault_root, state = self._vault(write=True)
        target_folder = str(folder or "").strip() or self._default_photos_folder(state)
        rel_folder = self._folder(vault_id, target_folder)
        wanted = [i for i in (items or []) if isinstance(i, dict) and i.get("id")][:25]
        if not wanted:
            raise ValueError("items 가 비었다 — rs_image_search 의 id 와 캡션을 넣는다")
        meta = commons_by_ids([str(i["id"]) for i in wanted], self.fetch)

        def download(entry: dict[str, Any]) -> tuple[dict[str, Any], Optional[bytes], str]:
            info = meta.get(str(entry["id"]))
            if not info:
                return entry, None, "라이선스를 확인할 수 없거나 자유 라이선스가 아니다"
            status, ctype, body, _ = self.fetch(info["download"], limit=MAX_IMAGE_BYTES, timeout=60, accept="image/*")
            if status != 200 or not body or len(body) > MAX_IMAGE_BYTES:
                return entry, None, f"내려받지 못했다 ({status or '연결 실패'})"
            if not sniff_image(body):
                return entry, None, f"이미지 형식이 아니다 ({ctype or '?'})"
            return entry, body, ""

        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(download, wanted))
        saved_rows: list[str] = []
        skipped_rows: list[str] = []
        note_rows: list[str] = []
        stamp = time.strftime("%Y-%m-%d %H:%M")
        for entry, body, why in results:
            if body is None:
                skipped_rows.append(_msg("saveSkip", id=entry["id"], why=why))
                continue
            info = meta[str(entry["id"])]
            ext = sniff_image(body) or ".jpg"
            caption = " ".join(str(entry.get("caption") or info["desc"] or "사진").split())[:120]
            mime = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}[ext]
            try:
                path = self._upload(vault_id, rel_folder, f"{_slug(caption)}{ext}", body, mime)
            except ValueError as exc:
                skipped_rows.append(_msg("saveSkip", id=entry["id"], why=str(exc)[:120]))
                continue
            file_name = path.rsplit("/", 1)[-1]
            saved_rows.append(_msg("saveRow", file=file_name, caption=caption, license=info["license"], artist=info["artist"]))
            note_rows.append(_msg("noteRow", caption=caption, file=file_name, license=info["license"],
                                  artist=info["artist"], source=info["source"], at=stamp))
        note = f"{rel_folder}/{NOTE_NAME}"
        if note_rows:
            self._append_note(vault_id, note, "".join(note_rows))
            self._mount_folder(vault_root, rel_folder)
        out = [_msg("saveHead", folder=rel_folder, saved=len(saved_rows), skipped=len(skipped_rows), note=note),
               *saved_rows, *skipped_rows]
        if saved_rows:
            out.append(_msg("saveTail", rel=rel_folder.rsplit("/", 1)[-1]))
        return "\n".join(out)

    def _is_in_session_mounts(self, abs_file: str) -> bool:
        """사용자가 이 세션의 리소스로 명시적으로 마운트한 경로 하위인지 검증한다."""
        key = os.path.normcase(os.path.realpath(abs_file))
        mount = next((m for m in self.store.mounts() if m.session_id == self.session_id), None)
        if mount is None:
            return False
        candidates: list[str] = [item.path for item in mount.items if item.path]
        candidates.extend(r for r in (mount.roots or []) if r)
        for root in candidates:
            base = os.path.normcase(os.path.realpath(root))
            if key == base or key.startswith(base + os.sep):
                return True
        return False

    def _rs_resource_import(
        self,
        sourcePath: str = "",
        folder: str = "",
        filename: str = "",
        **_: Any,
    ) -> str:
        """세션에 마운트된 외부 폴더의 리소스 파일을 볼트 `sources` 폴더로 안전하게 복제해 들여온다."""
        vault_id, vault_root, state = self._vault(write=True)
        raw_src = str(sourcePath or "").strip()
        if not raw_src:
            raise ValueError("sourcePath 가 비었다 — ws_overview · ws_grep 으로 확인한 파일 경로를 넣는다")
        abs_src = os.path.realpath(raw_src)
        if not os.path.isfile(abs_src):
            raise ValueError(f"파일을 찾을 수 없다: {raw_src}")

        # 이미 볼트 내부 파일이면 복제하지 않고 볼트 상대 경로만 돌려준다
        if vault_root:
            norm_vault = os.path.normcase(os.path.realpath(vault_root))
            norm_src = os.path.normcase(abs_src)
            if norm_src.startswith(norm_vault + os.sep):
                rel_existing = os.path.relpath(abs_src, os.path.realpath(vault_root)).replace("\\", "/")
                return _msg("resourceAlreadyInVault", path=rel_existing)

        if not self._is_in_session_mounts(abs_src):
            raise ValueError(_msg("resourceOutsideMount", path=raw_src))

        max_bytes = 50 * 1024 * 1024
        size = os.path.getsize(abs_src)
        if size > max_bytes:
            raise ValueError(f"파일이 너무 크다 (최대 50MB): {os.path.basename(abs_src)}")

        target_folder = folder.strip() or self._default_sources_folder(state)
        rel_folder = self._folder(vault_id, target_folder)

        orig_name = os.path.basename(abs_src)
        _, orig_ext = os.path.splitext(orig_name)
        ext = orig_ext.lower()
        desired = str(filename or "").strip()
        if desired:
            d_stem, d_ext = os.path.splitext(os.path.basename(desired))
            stem = _slug(d_stem, 80)
            ext = (d_ext or orig_ext).lower()
        else:
            stem = _slug(os.path.splitext(orig_name)[0], 80)

        with open(abs_src, "rb") as fh:
            raw_bytes = fh.read()

        text_exts = {
            ".md", ".markdown", ".txt", ".csv", ".tsv", ".json",
            ".yaml", ".yml", ".html", ".htm", ".xml", ".svg",
            ".py", ".ts", ".tsx", ".js", ".jsx", ".css",
        }
        # 같은 이름의 동일 파일이 이미 대상 폴더에 있으면 재사용 (중복 (2) 생성 방지)
        direct_rel = f"{rel_folder}/{stem}{ext}" if rel_folder else f"{stem}{ext}"
        if vault_root:
            existing_abs = os.path.join(vault_root, *direct_rel.split("/"))
            if os.path.isfile(existing_abs):
                try:
                    with open(existing_abs, "rb") as ef:
                        if ef.read() == raw_bytes:
                            self._mount_folder(vault_root, rel_folder)
                            return _msg("resourceImported", path=direct_rel, source=orig_name, status="재사용")
                except OSError:
                    pass

        if ext in text_exts and b"\x00" not in raw_bytes[:4096]:
            text = raw_bytes.decode("utf-8", errors="replace")
            rel = self._create_unique(vault_id, rel_folder, stem, ext, text)
        else:
            mime = mimetypes.guess_type(f"{stem}{ext}")[0] or "application/octet-stream"
            rel = self._upload(vault_id, rel_folder, f"{stem}{ext}", raw_bytes, mime)

        self._mount_folder(vault_root, rel_folder)
        return _msg("resourceImported", path=rel, source=orig_name, status="들여옴")

    # --- 스크랩·리소스 이미지 조회 · 추출 · 비파괴 편집 · 합성 ----------------------------------

    _MD_IMG_RE = re.compile(r"!\[([^\]]*)\]\((https?://[^\s)]+)\)")

    def _fetch_image_bytes(self, url: str, referer: str = "") -> bytes:
        try:
            status, ctype, body, _ = self.fetch(url, limit=MAX_IMAGE_BYTES, timeout=45, accept="image/*", referer=referer)
        except TypeError:
            status, ctype, body, _ = self.fetch(url, limit=MAX_IMAGE_BYTES, timeout=45, accept="image/*")
        if status != 200 or not body or len(body) > MAX_IMAGE_BYTES:
            raise ValueError(f"이미지를 내려받지 못했다 ({status or '연결 실패'}): {url}")
        if not sniff_image(body):
            raise ValueError(f"이미지 형식이 아니다 ({ctype or '?'}): {url}")
        return body

    def _normalize_vault_rel(self, raw: str, vault_root: str = "") -> str:
        s = str(raw or "").strip()
        for prefix in ("resource:vault:", "vault://", "vault:"):
            if s.lower().startswith(prefix):
                s = s[len(prefix):]
                break
        s = s.replace("\\", "/").strip()
        if vault_root and os.path.isabs(s):
            norm_v = os.path.normcase(os.path.realpath(vault_root))
            norm_s = os.path.normcase(os.path.realpath(s))
            if norm_s.startswith(norm_v + os.sep):
                return os.path.relpath(os.path.realpath(s), os.path.realpath(vault_root)).replace("\\", "/")
        return s.strip("/")

    def _collect_clip_images(self, vault_root: str, bundle_rel: str, *, include_captures: bool = True) -> dict[str, Any]:
        bundle_abs = os.path.join(vault_root, *bundle_rel.split("/"))
        if not os.path.isdir(bundle_abs):
            raise ValueError(f".vclip 번들을 찾을 수 없다: {bundle_rel}")
        meta: dict[str, Any] = {}
        clip_json = os.path.join(bundle_abs, "clip.json")
        if os.path.isfile(clip_json):
            try:
                meta = json.loads(open(clip_json, "r", encoding="utf-8").read())
            except Exception:
                meta = {}
        clip_url = str(meta.get("canonicalUrl") or meta.get("url") or "")
        title = str(meta.get("title") or os.path.basename(bundle_rel).removesuffix(".vclip"))
        items: list[dict[str, Any]] = []
        idx = 0

        for sub, kind in (("assets", "asset"), ("captures", "capture")):
            if kind == "capture" and not include_captures:
                continue
            sub_abs = os.path.join(bundle_abs, sub)
            if not os.path.isdir(sub_abs):
                continue
            for name in sorted(os.listdir(sub_abs)):
                if os.path.splitext(name)[1].lower() not in _IMG_EXTS:
                    continue
                fp = os.path.join(sub_abs, name)
                if not os.path.isfile(fp):
                    continue
                idx += 1
                rel = f"{bundle_rel}/{sub}/{name}"
                dims = ""
                try:
                    info = inspect_image(open(fp, "rb").read())
                    dims = f"{info['width']}×{info['height']}"
                except Exception:
                    dims = ""
                items.append({
                    "index": idx,
                    "kind": kind,
                    "relPath": rel,
                    "absPath": fp,
                    "url": "",
                    "alt": name,
                    "dims": dims,
                    "sizeKb": max(1, os.path.getsize(fp) // 1024),
                    "line": 0,
                    "context": "",
                    "referer": clip_url,
                })

        content_path = os.path.join(bundle_abs, "content.md")
        if os.path.isfile(content_path):
            seen_urls: set[str] = set()
            lines = open(content_path, "r", encoding="utf-8", errors="replace").read().splitlines()
            for lineno, line in enumerate(lines, 1):
                for m in self._MD_IMG_RE.finditer(line):
                    alt, img_url = m.group(1).strip(), m.group(2).strip()
                    if img_url in seen_urls:
                        continue
                    seen_urls.add(img_url)
                    idx += 1
                    ctx_lines = [
                        re.sub(r"\s+", " ", lines[k]).strip()[:90]
                        for k in range(max(0, lineno - 2), min(len(lines), lineno + 2))
                        if k != lineno - 1 and lines[k].strip() and not lines[k].strip().startswith("![")
                    ]
                    items.append({
                        "index": idx,
                        "kind": "remote",
                        "relPath": "",
                        "absPath": "",
                        "url": img_url,
                        "alt": alt,
                        "dims": "",
                        "sizeKb": 0,
                        "line": lineno,
                        "context": " / ".join(ctx_lines[:2]),
                        "referer": clip_url,
                    })

        return {"bundleRel": bundle_rel, "title": title, "url": clip_url, "items": items}

    def _find_scraped_url_referer(self, vault_root: str, target_url: str) -> Optional[tuple[str, str]]:
        """target_url 이 볼트 안 `.vclip` 번들 원문에 실제로 존재하는지 검증하고 `(bundle_rel, referer)` 를 돌려준다."""
        if not vault_root or not os.path.isdir(vault_root):
            return None
        needle = target_url.strip()
        for dirpath, dirnames, filenames in os.walk(vault_root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            if dirpath.lower().endswith(".vclip"):
                dirnames[:] = []
                cp = os.path.join(dirpath, "content.md")
                if os.path.isfile(cp):
                    try:
                        text = open(cp, "r", encoding="utf-8", errors="replace").read()
                    except OSError:
                        text = ""
                    if needle in text:
                        rel = os.path.relpath(dirpath, vault_root).replace("\\", "/")
                        referer = ""
                        cj = os.path.join(dirpath, "clip.json")
                        if os.path.isfile(cj):
                            try:
                                meta = json.loads(open(cj, "r", encoding="utf-8").read())
                                referer = str(meta.get("canonicalUrl") or meta.get("url") or "")
                            except Exception:
                                pass
                        return (rel, referer)
        return None

    def _resolve_image_source(
        self,
        vault_root: str,
        *,
        source: str = "",
        clip_path: str = "",
        image_index: int = 0,
    ) -> tuple[bytes, str, str, str]:
        """이미지 원천을 검증·로드해 `(raw_bytes, origin_label, origin_ref, default_stem)` 을 돌려준다."""
        raw_clip = str(clip_path or "").strip()
        raw_src = str(source or "").strip()

        if not raw_clip and raw_src.lower().endswith(".vclip"):
            raw_clip = raw_src
            raw_src = ""

        # 1) .vclip 번들 + 1-based imageIndex 지정
        if raw_clip:
            rel_clip = self._normalize_vault_rel(raw_clip, vault_root)
            if rel_clip.lower().endswith("/content.md"):
                rel_clip = rel_clip[: -len("/content.md")]
            info = self._collect_clip_images(vault_root, rel_clip, include_captures=True)
            items = info["items"]
            if not items:
                raise ValueError(f"스크랩 번들에 이미지가 없다: {rel_clip}")
            idx = int(image_index or 1)
            if idx < 1 or idx > len(items):
                raise ValueError(f"imageIndex={idx} 범위 초과 (이 번들에는 1~{len(items)}번 이미지가 있다)")
            picked = items[idx - 1]
            stem = _slug(f"{info['title']}_{idx}", 64)
            if picked["kind"] in ("asset", "capture") and picked["absPath"]:
                with open(picked["absPath"], "rb") as fh:
                    return fh.read(), f"{info['title']} #{idx} ({picked['kind']})", f"vault://{picked['relPath']}", stem
            body = self._fetch_image_bytes(picked["url"], referer=picked["referer"])
            return body, f"{info['title']} #{idx}", picked["url"], stem

        if not raw_src:
            raise ValueError("source 또는 clipPath 중 하나는 반드시 지정해야 한다")

        # 2) 원격 URL — 볼트에 스크랩된 .vclip 안에 존재하는 이미지 URL 만 허용
        if re.match(r"^https?://", raw_src, re.I):
            found = self._find_scraped_url_referer(vault_root, raw_src)
            if found is None:
                raise ValueError(
                    "직접 URL 추출은 볼트에 스크랩된 .vclip 번들 안의 이미지 URL 만 허용한다 — "
                    "먼저 rs_clip 으로 웹페이지를 스크랩하거나 rs_clip_images 로 확인한 clipPath + imageIndex 를 넣어라"
                )
            bundle_rel, referer = found
            body = self._fetch_image_bytes(raw_src, referer=referer)
            base_name = os.path.splitext(urllib.parse.urlsplit(raw_src).path.rsplit("/", 1)[-1])[0]
            return body, f"{os.path.basename(bundle_rel)}", raw_src, _slug(base_name or "스크랩_이미지", 64)

        # 3) 볼트 경로 · resource:vault: · 마운트된 외부 리소스 파일
        clean_rel = self._normalize_vault_rel(raw_src, vault_root)
        abs_candidate: Optional[str] = None
        if os.path.isabs(raw_src) and os.path.isfile(raw_src):
            abs_candidate = os.path.realpath(raw_src)
        elif vault_root:
            cand = os.path.realpath(os.path.join(vault_root, *clean_rel.split("/")))
            if os.path.isfile(cand):
                abs_candidate = cand

        if not abs_candidate or not os.path.isfile(abs_candidate):
            raise ValueError(f"이미지 파일을 찾을 수 없다: {raw_src}")

        in_vault = False
        if vault_root:
            norm_v = os.path.normcase(os.path.realpath(vault_root))
            norm_c = os.path.normcase(abs_candidate)
            in_vault = norm_c.startswith(norm_v + os.sep)

        if not in_vault and not self._is_in_session_mounts(abs_candidate):
            raise ValueError(_msg("resourceOutsideMount", path=raw_src))

        with open(abs_candidate, "rb") as fh:
            raw_bytes = fh.read()
        if len(raw_bytes) > MAX_IMAGE_BYTES:
            raise ValueError(f"이미지 파일이 너무 크다 (최대 15MB): {os.path.basename(abs_candidate)}")

        origin_ref = f"vault://{os.path.relpath(abs_candidate, os.path.realpath(vault_root)).replace(os.sep, '/')}" if in_vault else abs_candidate
        base_stem = _slug(os.path.splitext(os.path.basename(abs_candidate))[0], 64)
        return raw_bytes, os.path.basename(abs_candidate), origin_ref, base_stem

    def _upload_unique_image(self, vault_id: str, vault_root: str, rel_folder: str, stem: str, ext: str, data: bytes, mime: str) -> str:
        """기존 원본/파생 파일을 덮어쓰지 않고 고유 파일명으로 이미지를 업로드한다."""
        clean_stem = _slug(stem, 72)
        for n in range(1, 100):
            fname = f"{clean_stem}{ext}" if n == 1 else f"{clean_stem}_{n}{ext}"
            rel = f"{rel_folder}/{fname}" if rel_folder else fname
            if vault_root and os.path.exists(os.path.join(vault_root, *rel.split("/"))):
                continue
            return self._upload(vault_id, rel_folder, fname, data, mime)
        raise ValueError(f"이미지 파일 이름을 정하지 못했다: {clean_stem}{ext}")

    def _rs_clip_images(
        self,
        path: str = "",
        folder: str = "",
        includeCaptures: bool = True,
        **_: Any,
    ) -> str:
        """볼트 내 `.vclip` 웹 스크랩 번들들에서 로컬(assets/captures) 및 기사 본문 원격 이미지 목록을 조회한다."""
        _, vault_root, state = self._vault(write=False)
        if not vault_root or not os.path.isdir(vault_root):
            raise ValueError("볼트 루트 경로를 확인할 수 없다")

        bundles: list[str] = []
        raw_path = str(path or "").strip()
        if raw_path:
            rel_p = self._normalize_vault_rel(raw_path, vault_root)
            if rel_p.lower().endswith("/content.md"):
                rel_p = rel_p[: -len("/content.md")]
            if rel_p.lower().endswith(".vclip"):
                bundles = [rel_p]
            else:
                folder = rel_p

        if not bundles:
            scope = self._normalize_vault_rel(folder, vault_root) if str(folder or "").strip() else self._default_sources_folder(state)
            search_abs = os.path.join(vault_root, *scope.split("/")) if scope else vault_root
            if not os.path.isdir(search_abs):
                # 프로젝트 루트로 폴백 탐색
                proj = self._active_project_root(state)
                search_abs = os.path.join(vault_root, *proj.split("/")) if proj else vault_root
            for dirpath, dirnames, _ in os.walk(search_abs):
                dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
                if dirpath.lower().endswith(".vclip"):
                    dirnames[:] = []
                    bundles.append(os.path.relpath(dirpath, vault_root).replace("\\", "/"))
            bundles.sort()

        if not bundles:
            return _msg("clipImagesEmpty", scope=folder or self._default_sources_folder(state))

        rows: list[str] = []
        total_imgs = 0
        for b_rel in bundles:
            try:
                info = self._collect_clip_images(vault_root, b_rel, include_captures=bool(includeCaptures))
            except ValueError:
                continue
            items = info["items"]
            if not items:
                continue
            rows.append(f"\n📦 `{b_rel}` — 「{info['title']}」 (이미지 {len(items)}장)")
            for it in items:
                total_imgs += 1
                if it["kind"] in ("asset", "capture"):
                    tag = "로컬 asset" if it["kind"] == "asset" else "원형 capture"
                    dim_s = f" · {it['dims']}" if it["dims"] else ""
                    rows.append(f"  - #{it['index']} [{tag}] resource:vault:{it['relPath']} ({it['sizeKb']}KB{dim_s})")
                else:
                    alt_s = f" alt=\"{it['alt'][:50]}\"" if it["alt"] else ""
                    ctx_s = f" — {it['context'][:90]}" if it["context"] else ""
                    rows.append(f"  - #{it['index']} [원격 기사 사진 L{it['line']}]{alt_s} {it['url']}{ctx_s}")

        if total_imgs == 0:
            return _msg("clipImagesNone", count=len(bundles))

        head = _msg("clipImagesHead", bundles=len(bundles), total=total_imgs)
        tail = "\n" + _msg("clipImagesTail")
        return head + "\n".join(rows) + tail

    def _rs_image_edit(
        self,
        source: str = "",
        clipPath: str = "",
        imageIndex: int = 0,
        ops: Any = None,
        folder: str = "",
        filename: str = "",
        caption: str = "",
        **_: Any,
    ) -> str:
        """스크랩(.vclip) · 볼트 · 마운트된 리소스 이미지를 비파괴로 추출·조작(크롭/비율/리사이즈/회전/보정/하이라이트/블러)해 프로젝트 사진 폴더에 저장하고 리소스로 마운트한다."""
        vault_id, vault_root, state = self._vault(write=True)
        raw_bytes, origin_label, origin_ref, default_stem = self._resolve_image_source(
            vault_root,
            source=source,
            clip_path=clipPath,
            image_index=imageIndex,
        )
        ops_dict = dict(ops) if isinstance(ops, dict) else {}
        result = transform_image(raw_bytes, ops_dict)

        target_folder = str(folder or "").strip() or self._default_photos_folder(state)
        rel_folder = self._folder(vault_id, target_folder)

        desired_stem = os.path.splitext(os.path.basename(str(filename or "").strip()))[0]
        if not desired_stem:
            suffix = "_edited" if result["applied"] else ""
            desired_stem = f"{default_stem}{suffix}"

        saved_rel = self._upload_unique_image(
            vault_id,
            vault_root,
            rel_folder,
            desired_stem,
            result["ext"],
            result["bytes"],
            result["mime"],
        )
        self._mount_folder(vault_root, rel_folder)

        file_name = saved_rel.rsplit("/", 1)[-1]
        cap = " ".join(str(caption or origin_label).split())[:120]
        ops_summary = ", ".join(result["applied"]) if result["applied"] else "원본 추출(무가공)"
        stamp = time.strftime("%Y-%m-%d %H:%M")
        note_path = f"{rel_folder}/{NOTE_NAME}"
        note_entry = (
            f"\n## {cap}\n\n![[{file_name}]]\n\n"
            f"- 원천: {origin_ref}\n"
            f"- 조작 내역: {ops_summary}\n"
            f"- 해상도: {result['origSize'][0]}×{result['origSize'][1]} → {result['newSize'][0]}×{result['newSize'][1]}\n"
            f"- 저장 시각: {stamp}\n"
        )
        self._append_note(vault_id, note_path, note_entry)

        return _msg(
            "imageEdited",
            path=saved_rel,
            origin=origin_label,
            origW=result["origSize"][0],
            origH=result["origSize"][1],
            newW=result["newSize"][0],
            newH=result["newSize"][1],
            sizeKb=max(1, len(result["bytes"]) // 1024),
            ops=ops_summary,
            note=note_path,
        )

    def _rs_image_compose(
        self,
        sources: Any = None,
        layout: str = "horizontal",
        gap: int = 12,
        padding: int = 12,
        background: str = "#ffffff",
        maxWidth: int = 1920,
        labels: Any = None,
        folder: str = "",
        filename: str = "",
        caption: str = "",
        format: str = "jpg",
        quality: int = 90,
        **_: Any,
    ) -> str:
        """2~6장의 스크랩·리소스 이미지를 가로 비교 · 세로 연결 · 그리드로 비파괴 합성해 볼트에 저장하고 리소스로 마운트한다."""
        vault_id, vault_root, state = self._vault(write=True)
        src_list = list(sources or []) if isinstance(sources, list) else []
        if len(src_list) < 2:
            raise ValueError("sources 에는 최소 2장의 이미지를 넣어야 한다 (최대 6장)")
        if len(src_list) > 6:
            raise ValueError("한 번에 최대 6장까지 합성할 수 있다")

        raw_list: list[bytes] = []
        origin_refs: list[str] = []
        derived_labels: list[str] = []
        explicit_labels = list(labels) if isinstance(labels, list) else []

        for idx, item in enumerate(src_list):
            if isinstance(item, str):
                raw_b, orig_lbl, orig_ref, _ = self._resolve_image_source(vault_root, source=item)
                lbl = str(explicit_labels[idx]) if idx < len(explicit_labels) else ""
            elif isinstance(item, dict):
                raw_b, orig_lbl, orig_ref, _ = self._resolve_image_source(
                    vault_root,
                    source=str(item.get("source") or ""),
                    clip_path=str(item.get("clipPath") or ""),
                    image_index=int(item.get("imageIndex") or 0),
                )
                lbl = str(item.get("label") or (explicit_labels[idx] if idx < len(explicit_labels) else ""))
            else:
                raise ValueError(f"sources[{idx}] 형식이 올바르지 않다")
            raw_list.append(raw_b)
            origin_refs.append(f"{orig_lbl} ({orig_ref})")
            derived_labels.append(lbl)

        result = compose_images(
            raw_list,
            layout=layout,
            gap=gap,
            padding=padding,
            background=background,
            max_width=maxWidth,
            labels=derived_labels if any(derived_labels) else None,
            fmt=format,
            quality=quality,
        )

        target_folder = str(folder or "").strip() or self._default_photos_folder(state)
        rel_folder = self._folder(vault_id, target_folder)
        desired_stem = os.path.splitext(os.path.basename(str(filename or "").strip()))[0] or f"합성_{result['layout']}_{result['count']}장"
        saved_rel = self._upload_unique_image(
            vault_id,
            vault_root,
            rel_folder,
            desired_stem,
            result["ext"],
            result["bytes"],
            result["mime"],
        )
        self._mount_folder(vault_root, rel_folder)

        file_name = saved_rel.rsplit("/", 1)[-1]
        cap = " ".join(str(caption or desired_stem).split())[:120]
        stamp = time.strftime("%Y-%m-%d %H:%M")
        note_path = f"{rel_folder}/{NOTE_NAME}"
        note_entry = (
            f"\n## {cap}\n\n![[{file_name}]]\n\n"
            f"- 합성 방식: {result['layout']} ({result['count']}장 · {result['size'][0]}×{result['size'][1]})\n"
            f"- 원천 목록: {'; '.join(origin_refs)}\n"
            f"- 저장 시각: {stamp}\n"
        )
        self._append_note(vault_id, note_path, note_entry)

        return _msg(
            "imageComposed",
            path=saved_rel,
            count=result["count"],
            layout=result["layout"],
            width=result["size"][0],
            height=result["size"][1],
            sizeKb=max(1, len(result["bytes"]) // 1024),
            note=note_path,
        )

    def _append_note(self, vault_id: str, rel: str, rows: str) -> None:
        try:
            existing = str(self.api.call("GET", self._url(vault_id, "file") + "?path=" + urllib.parse.quote(rel, safe="")).get("content") or "")
        except ValueError:
            existing = ""
        if existing:
            self.api.call("PUT", self._url(vault_id, "file"), {"path": rel, "content": existing.rstrip() + "\n" + rows})
        else:
            self.api.call("POST", self._url(vault_id, "file"), {"path": rel, "content": _msg("noteHead") + rows})
