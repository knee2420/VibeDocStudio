"""리서치 도구 (rs_*) — 밖의 자료를 볼트로 들여온다 (playground v2 볼트 모드).

  rs_folder        볼트 폴더 만들기
  rs_page          웹 페이지 가볍게 보기 (제목 · 소제목 · 글자 수 · 사진 수) — 레퍼런스 후보 고르기
  rs_ref_import    URL → 레퍼런스 라이브러리 등록(`/api/reference/items/url`) → 볼트 .ref 파일 + 작업대에 켜기
  rs_image_search  자유 라이선스 사진 검색 (Wikimedia Commons)
  rs_image_save    고른 사진을 볼트 폴더에 저장 + 출처 노트 + 그 폴더를 세션 리소스로 마운트

지키는 것: 볼트 모드 · 쓰기 가능(화면 RW)일 때만 쓰고, 경로는 볼트 상대 경로만, 기존 파일은 덮어쓰지 않으며(새 이름),
사진은 이미지 형식 · 크기를 확인한 것만 저장하고 라이선스 · 작가 · 원본 주소를 남긴다. 결과 글은 research 팩 메시지.
`app` 패키지를 import 하지 않는다 (vibefs 는 agy 마다 하나씩 뜬다) — 볼트 · 레퍼런스는 로컬 API 로 쓴다.
"""
from __future__ import annotations

import html as html_lib
import json
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


def http_get(url: str, *, limit: int, timeout: float = 30.0, accept: str = "*/*") -> tuple[int, str, bytes, str]:
    """(상태, content-type, 본문, 최종 주소). 본문은 limit 바이트까지만 읽는다."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept,
                                               "Accept-Language": "ko,en;q=0.8"})
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
        vault_id, vault_root, _ = self._vault(write=True)
        rel_folder = self._folder(vault_id, folder)
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

    def _append_note(self, vault_id: str, rel: str, rows: str) -> None:
        try:
            existing = str(self.api.call("GET", self._url(vault_id, "file") + "?path=" + urllib.parse.quote(rel, safe="")).get("content") or "")
        except ValueError:
            existing = ""
        if existing:
            self.api.call("PUT", self._url(vault_id, "file"), {"path": rel, "content": existing.rstrip() + "\n" + rows})
        else:
            self.api.call("POST", self._url(vault_id, "file"), {"path": rel, "content": _msg("noteHead") + rows})
