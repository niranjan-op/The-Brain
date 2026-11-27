"""SSRF-protected web page fetcher with private-IP blocking, 5 MB byte cap, timeout, and HTML sanitization (D020, T094, T102)."""
from __future__ import annotations

import asyncio
import html
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

_CGNAT_NET = ipaddress.ip_network("100.64.0.0/10")
_SCRIPT_STYLE_RE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


class SSRFBlockedError(ValueError):
    """Raised when a URL resolves to a blocked/private/loopback/link-local IP or uses a forbidden scheme."""


def is_ip_blocked(ip_str: str) -> bool:
    """Return True if `ip_str` is private, loopback, link-local, multicast, unspecified, reserved, or CGNAT."""
    try:
        ip = ipaddress.ip_address(ip_str.split("%", 1)[0])
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_unspecified
        or ip.is_reserved
    ):
        return True
    if isinstance(ip, ipaddress.IPv4Address) and ip in _CGNAT_NET:
        return True
    return False


async def resolve_and_validate_url(url: str) -> tuple[str, list[str]]:
    """Validate HTTP(S) scheme, disallow local hosts, resolve DNS IPs, and reject any non-public IP."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise SSRFBlockedError(f"Unsupported URL scheme: {parsed.scheme!r}")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise SSRFBlockedError("URL is missing a hostname")
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local") or host.endswith(".internal"):
        raise SSRFBlockedError(f"Blocked internal hostname: {host!r}")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    # Fast check if host is already a literal IP
    try:
        literal_ip = ipaddress.ip_address(host)
        if is_ip_blocked(str(literal_ip)):
            raise SSRFBlockedError(f"Blocked non-public IP literal: {literal_ip}")
        return url, [str(literal_ip)]
    except ValueError:
        pass

    try:
        addr_info = await asyncio.to_thread(
            socket.getaddrinfo,
            host,
            port,
            socket.AF_UNSPEC,
            socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise SSRFBlockedError(f"Could not resolve hostname {host!r}: {exc}") from exc

    resolved_ips: list[str] = []
    for _, _, _, _, sockaddr in addr_info:
        ip_str = str(sockaddr[0])
        if is_ip_blocked(ip_str):
            raise SSRFBlockedError(f"Blocked non-public resolved IP {ip_str} for host {host!r}")
        if ip_str not in resolved_ips:
            resolved_ips.append(ip_str)

    if not resolved_ips:
        raise SSRFBlockedError(f"No public IP addresses resolved for {host!r}")
    return url, resolved_ips


def sanitize_and_wrap_html(raw_html: str, source_url: str, max_chars: int = 12_000) -> str:
    """Strip scripts/styles/tags and wrap untrusted web text in boundary delimiters (T102)."""
    stripped = _SCRIPT_STYLE_RE.sub(" ", raw_html)
    stripped = _COMMENT_RE.sub(" ", stripped)
    stripped = _TAG_RE.sub(" ", stripped)
    unescaped = html.unescape(stripped)
    collapsed = _WHITESPACE_RE.sub(" ", unescaped).strip()
    if len(collapsed) > max_chars:
        collapsed = collapsed[:max_chars].rstrip() + "..."
    safe_url = source_url.replace('"', "%22").replace("<", "").replace(">", "")
    return f'<untrusted_web_content source_url="{safe_url}">\n{collapsed}\n</untrusted_web_content>'


async def fetch_safe_page(
    url: str,
    *,
    max_bytes: int = 5_000_000,
    timeout_s: float = 8.0,
    max_redirects: int = 3,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch a public HTTP(S) page safely:
    - Validates DNS/IP on initial URL and every redirect hop (`follow_redirects=False`).
    - Streams response body and aborts if total bytes exceed `max_bytes` (default 5 MB).
    - Sanitizes HTML and wraps output in `<untrusted_web_content>` tags.
    """
    current_url = url.strip()
    headers = {"User-Agent": "KnowledgeCartographerBot/1.0 (+safe-fetch)"}

    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=timeout_s,
        transport=transport,
    ) as client:
        for hop in range(max_redirects + 1):
            await resolve_and_validate_url(current_url)
            async with client.stream("GET", current_url, headers=headers) as resp:
                if 300 <= resp.status_code < 400:
                    location = resp.headers.get("location")
                    if not location:
                        raise SSRFBlockedError(f"Redirect ({resp.status_code}) missing Location header")
                    if hop >= max_redirects:
                        raise SSRFBlockedError(f"Exceeded max redirects ({max_redirects})")
                    current_url = urljoin(current_url, location)
                    continue

                content_length = resp.headers.get("content-length")
                if content_length and content_length.isdigit() and int(content_length) > max_bytes:
                    raise ValueError(f"Response Content-Length ({content_length}) exceeds max_bytes ({max_bytes})")

                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > max_bytes:
                        raise ValueError(f"Response body exceeded max_bytes ({max_bytes})")

                charset = resp.encoding or "utf-8"
                decoded = bytes(buf).decode(charset, errors="replace")
                return {
                    "url": current_url,
                    "status_code": resp.status_code,
                    "bytes_read": len(buf),
                    "content": sanitize_and_wrap_html(decoded, current_url),
                }

    raise SSRFBlockedError("Exceeded maximum redirects")
