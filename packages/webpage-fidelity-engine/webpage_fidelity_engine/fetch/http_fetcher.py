"""안전한 HTTP(S) HTML 수집기 — SSRF 방어, 리다이렉트 검증, 다국어 charset 디코딩."""
from __future__ import annotations

import ipaddress
import re
import socket
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

_MAX_HTML_BYTES = 10 * 1024 * 1024
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}
_LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_public_http_url(url: str, *, allow_private_hosts: bool = False) -> str:
    """http(s) 스킴 및 공개 호스트 여부를 검증하고 정규화된 URL 문자열을 돌려준다."""
    clean = (url or "").strip()
    parsed = urlparse(clean)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or not parsed.hostname:
        raise ValueError("http:// 또는 https:// 로 시작하는 올바른 웹 주소를 입력하세요.")

    host = parsed.hostname.lower().strip(".")
    if not allow_private_hosts:
        if host in _LOCAL_HOSTNAMES or host.endswith(".local"):
            raise ValueError("로컬 또는 내부망 주소는 가져올 수 없습니다.")
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            ip = None
        if ip is not None and _is_blocked_ip(ip):
            raise ValueError("사설/루프백 IP 주소는 가져올 수 없습니다.")
        try:
            infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
            for info in infos:
                addr = info[4][0].split("%", 1)[0]
                resolved_ip = ipaddress.ip_address(addr)
                if _is_blocked_ip(resolved_ip):
                    raise ValueError("내부망으로 연결되는 주소는 가져올 수 없습니다.")
        except socket.gaierror:
            # DNS 일시 실패는 실제 HTTP 요청 단계에서 명확한 연결 오류로 처리한다.
            pass
    return clean


def decode_html_bytes(data: bytes, content_type: str = "") -> str:
    """HTTP Content-Type 및 HTML meta charset 을 참조하여 안전하게 문자열로 복원한다."""
    match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", content_type or "", re.I) or re.search(
        rb"<meta[^>]+charset\s*=\s*[\"']?([\w-]+)",
        data[:8192],
        re.I,
    )
    declared = match.group(1) if match else ""
    if isinstance(declared, bytes):
        declared = declared.decode("ascii", "ignore")

    candidates = [c for c in (declared, "utf-8", "cp949", "euc-kr") if c]
    for enc in candidates:
        try:
            return data.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return data.decode(declared or "utf-8", errors="replace")


class HttpWebFetcher:
    """`httpx` 기반 웹페이지 수집기 (리다이렉트 hop 마다 공개 주소 재검증)."""

    def __init__(self, *, allow_private_hosts: bool = False, max_bytes: int = _MAX_HTML_BYTES) -> None:
        self._allow_private = allow_private_hosts
        self._max_bytes = max_bytes

    def fetch(self, url: str, *, timeout_s: float = 12.0) -> tuple[bytes, str, str]:
        current_url = validate_public_http_url(url, allow_private_hosts=self._allow_private)
        max_redirects = 5
        with httpx.Client(headers=_DEFAULT_HEADERS, timeout=timeout_s, follow_redirects=False) as client:
            for _ in range(max_redirects + 1):
                resp = client.get(current_url)
                if resp.status_code in (301, 302, 303, 307, 308):
                    loc = resp.headers.get("location")
                    if not loc:
                        break
                    current_url = validate_public_http_url(
                        urljoin(current_url, loc),
                        allow_private_hosts=self._allow_private,
                    )
                    continue
                if resp.status_code >= 400:
                    raise ValueError(f"웹페이지를 불러오지 못했습니다 (HTTP {resp.status_code}).")
                content_type = str(resp.headers.get("content-type") or "")
                raw = resp.content
                if len(raw) > self._max_bytes:
                    raise ValueError("웹페이지 크기가 너무 큽니다 (10MB 초과).")
                if "pdf" in content_type.lower() or raw[:5] == b"%PDF-":
                    raise ValueError("PDF 파일 주소입니다. PDF 가져오기 메뉴를 이용해 주세요.")
                return raw, content_type, str(resp.url or current_url)
        raise ValueError("리다이렉트가 너무 많아 페이지를 열 수 없습니다.")


def fetch_html_text(
    url: str,
    fetcher: Optional[HttpWebFetcher] = None,
    *,
    timeout_s: float = 12.0,
) -> tuple[str, str]:
    """편의 함수: (디코딩된 HTML, 최종 URL) 반환."""
    active_fetcher = fetcher or HttpWebFetcher()
    raw, content_type, final_url = active_fetcher.fetch(url, timeout_s=timeout_s)
    return decode_html_bytes(raw, content_type), final_url

