"""이미지 URL 우선순위 해석(data-lazy-src 등) · 병렬 다운로드 · Pillow 리사이즈 및 Data URI 변환."""
from __future__ import annotations

import base64
import io
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import httpx
from PIL import Image, ImageOps

from ..models import WebArticleIR, WebImage
from ..ports import AssetFetcherPort
from .http_fetcher import validate_public_http_url

_IMAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}
_SKIP_IMAGE_HINT = re.compile(r"(1x1|spacer|blank|pixel|loading|spinner|transparent)\.gif", re.I)


def _best_from_srcset(srcset: str) -> str:
    best_url = ""
    best_score = -1.0
    for item in (srcset or "").split(","):
        parts = item.strip().split()
        if not parts:
            continue
        cand = parts[0]
        score = 1.0
        if len(parts) > 1:
            desc = parts[1].lower()
            if desc.endswith("w") and desc[:-1].isdigit():
                score = float(desc[:-1])
            elif desc.endswith("x"):
                try:
                    score = float(desc[:-1]) * 1000.0
                except ValueError:
                    pass
        if score > best_score:
            best_score = score
            best_url = cand
    return best_url


def pick_image_url(attrs: dict[str, str], base_url: str) -> str:
    """lazy-load 속성(data-lazy-src 등)을 우선해 유효한 이미지 절대 URL 을 고른다."""
    raw = ""
    for key in ("data-lazy-src", "data-original", "data-src", "data-url", "data-image-src"):
        val = (attrs.get(key) or "").strip()
        if val and not val.startswith("data:image/svg+xml"):
            raw = val
            break
    if not raw and attrs.get("srcset"):
        raw = _best_from_srcset(attrs.get("srcset") or "")
    if not raw:
        cand = (attrs.get("src") or "").strip()
        if cand and not cand.startswith("data:image/svg+xml"):
            raw = cand
    if not raw or _SKIP_IMAGE_HINT.search(raw):
        return ""
    if raw.startswith("data:image/"):
        return raw

    resolved = urljoin(base_url, raw) if base_url else raw
    parsed = urlparse(resolved)
    # Next.js 이미지 프록시 경로는 원본 URL 도 fallback 후보로 쓰지만 우선 절대 경로를 유지한다.
    if parsed.path == "/_next/image":
        qs = parse_qs(parsed.query)
        inner = (qs.get("url") or [""])[0]
        if inner:
            decoded = unquote(inner)
            if decoded.startswith(("http://", "https://")):
                return decoded
            if base_url and decoded.startswith("/"):
                return urljoin(base_url, decoded)
    return resolved


class HttpxAssetFetcher:
    """`Referer` 를 유지한 채 외부 이미지를 내려받는 기본 `AssetFetcherPort` 구현체."""

    def __init__(self, *, allow_private_hosts: bool = False) -> None:
        self._allow_private = allow_private_hosts

    def fetch_asset(
        self,
        url: str,
        *,
        referer: str = "",
        timeout_s: float = 8.0,
        max_bytes: int = 3 * 1024 * 1024,
    ) -> Optional[tuple[bytes, str]]:
        try:
            target = validate_public_http_url(url, allow_private_hosts=self._allow_private)
        except ValueError:
            return None
        headers = dict(_IMAGE_HEADERS)
        if referer:
            headers["Referer"] = referer
        try:
            with httpx.Client(headers=headers, timeout=timeout_s, follow_redirects=True) as client:
                resp = client.get(target)
                if resp.status_code >= 400:
                    return None
                data = resp.content
                if not data or len(data) > max_bytes:
                    return None
                mime = str(resp.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
                return data, mime
        except Exception:
            return None


def _decode_data_uri(uri: str) -> Optional[tuple[bytes, str]]:
    if not uri.startswith("data:image/"):
        return None
    header, _, payload = uri.partition(",")
    if not payload or ";base64" not in header.lower():
        return None
    mime = header[5:].split(";", 1)[0].strip().lower()
    try:
        return base64.b64decode(payload), mime
    except Exception:
        return None


def _normalize_image_bytes(
    raw: bytes,
    mime: str,
    *,
    max_dim: int = 1200,
) -> Optional[tuple[bytes, str, int, int]]:
    if mime == "image/svg+xml" or raw.lstrip()[:4].lower() == b"<svg":
        # SVG 는 래스터 변환 대신 원본 Data URI 로 쓰거나 스킵할 수 있으나, 크기 측정이 어려워 그대로 둔다.
        return None
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im = ImageOps.exif_transpose(im)
            w, h = im.size
            if w < 12 or h < 12:
                return None
            # 추적 픽셀이나 너무 얇은 구분선 이미지는 제외
            if w <= 24 and h <= 24:
                return None
            out_format = "PNG" if (im.mode in ("RGBA", "LA", "P") and "transparency" in im.info) else "JPEG"
            if max(w, h) > max_dim:
                im.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                w, h = im.size
            if out_format == "JPEG" and im.mode != "RGB":
                im = im.convert("RGB")
            elif out_format == "PNG" and im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA")
            buf = io.BytesIO()
            save_kw = {"quality": 84, "optimize": True} if out_format == "JPEG" else {"optimize": True}
            im.save(buf, format=out_format, **save_kw)
            out_bytes = buf.getvalue()
            out_mime = "image/jpeg" if out_format == "JPEG" else "image/png"
            return out_bytes, out_mime, w, h
    except Exception:
        return None


class AssetResolver:
    """추출된 본문 IR 내 모든 이미지/링크카드 썸네일을 병렬로 해석하고 Data URI 화한다."""

    def __init__(self, fetcher: Optional[AssetFetcherPort] = None) -> None:
        self._fetcher = fetcher

    def resolve_article_images(
        self,
        article: WebArticleIR,
        *,
        inline_images: bool = True,
        max_images: int = 40,
        max_bytes: int = 3 * 1024 * 1024,
        max_dim: int = 1200,
    ) -> tuple[int, int, int]:
        """(전체 이미지 수, 성공 수, 실패 수) 반환 및 `WebImage` 제자리 갱신."""
        targets: list[WebImage] = []
        for node in article.nodes:
            for img in node.images:
                targets.append(img)
            if node.link_card and node.link_card.thumbnail:
                targets.append(node.link_card.thumbnail)

        if not targets:
            return 0, 0, 0

        limited = targets[:max_images]
        if len(targets) > max_images:
            article.warnings.append(f"이미지가 많아 상위 {max_images}개만 포함했습니다.")

        unique_urls: list[str] = []
        seen: set[str] = set()
        for img in limited:
            if not img.src or img.src in seen:
                continue
            seen.add(img.src)
            unique_urls.append(img.src)

        cache: dict[str, Optional[tuple[bytes, str, int, int]]] = {}

        def _resolve_one(src: str) -> tuple[str, Optional[tuple[bytes, str, int, int]]]:
            if src.startswith("data:image/"):
                decoded = _decode_data_uri(src)
                if not decoded:
                    return src, None
                return src, _normalize_image_bytes(decoded[0], decoded[1], max_dim=max_dim)
            if self._fetcher is None:
                return src, None
            fetched = self._fetcher.fetch_asset(src, referer=article.url, max_bytes=max_bytes)
            if not fetched:
                return src, None
            return src, _normalize_image_bytes(fetched[0], fetched[1], max_dim=max_dim)

        if inline_images and unique_urls:
            with ThreadPoolExecutor(max_workers=min(6, len(unique_urls))) as pool:
                for src, norm in pool.map(_resolve_one, unique_urls):
                    cache[src] = norm

        resolved_count = 0
        failed_count = 0
        for img in limited:
            norm = cache.get(img.src)
            if norm:
                out_bytes, out_mime, w, h = norm
                img.width_px = w
                img.height_px = h
                img.mime_type = out_mime
                img.image_bytes = out_bytes
                img.resolved_src = f"data:{out_mime};base64,{base64.b64encode(out_bytes).decode('ascii')}"
                resolved_count += 1
            else:
                # inline 실패 시에도 원본 https URL 은 fallback 으로 남겨 둔다.
                if img.src.startswith(("http://", "https://")) and not inline_images:
                    img.resolved_src = img.src
                    resolved_count += 1
                elif img.src.startswith("data:image/"):
                    img.resolved_src = img.src
                    resolved_count += 1
                else:
                    failed_count += 1
                    img.resolved_src = ""

        return len(limited), resolved_count, failed_count

