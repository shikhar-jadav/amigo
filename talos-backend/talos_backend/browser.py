"""Browser control safety helpers."""
import ipaddress
import socket
from urllib.parse import urlparse
import json
import urllib.request
from typing import Any


def validate_browser_url(url: str, allow_private: bool = False, allowed_hosts: set[str] | None = None) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Browser URLs must use http or https")
    host = parsed.hostname.lower()
    if allowed_hosts is not None and host not in allowed_hosts:
        raise PermissionError("Browser host is not in the allowlist")
    try:
        addresses = {ipaddress.ip_address(host)}
    except ValueError:
        addresses = {ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)}
    if not allow_private and any(not address.is_global for address in addresses):
        raise PermissionError("Browser navigation to private or reserved networks is blocked")
    return url


def cdp_endpoint(cdp_url: str) -> str:
    parsed = urlparse(cdp_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("CDP endpoint must be HTTP(S)")
    validate_browser_url(cdp_url, allow_private=True)
    return cdp_url.rstrip("/")


async def cdp_json(cdp_url: str, path: str) -> Any:
    import asyncio
    def fetch() -> Any:
        request = urllib.request.Request(cdp_endpoint(cdp_url) + path)
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())
    return await asyncio.to_thread(fetch)
