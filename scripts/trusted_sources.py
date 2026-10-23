"""Bounded HTTPS source reads with the same host policy on every redirect."""
from __future__ import annotations

import urllib.request
from urllib.parse import urlsplit

TD_HOSTS = frozenset({'www.td.gov.hk'})
EVENT_HOSTS = TD_HOSTS | {'www.gov.hk', 'e-auction.td.gov.hk'}
MARKET_HOSTS = frozenset({'m.28car.com'})


def trusted_url(url: str, hosts=TD_HOSTS) -> str:
    parts = urlsplit(url)
    if (parts.scheme != 'https' or parts.hostname not in hosts or parts.port
            or parts.username or parts.password or parts.fragment):
        raise ValueError('Untrusted source URL')
    return url


class SourceRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, hosts):
        self.hosts = hosts

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        trusted_url(newurl, self.hosts)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def read_source(url: str, *, hosts=TD_HOSTS, headers=None, timeout=60, max_bytes=32 * 1024 * 1024) -> bytes:
    trusted_url(url, hosts)
    opener = urllib.request.build_opener(SourceRedirectHandler(hosts))
    request = urllib.request.Request(url, headers=headers or {})
    with opener.open(request, timeout=timeout) as response:
        trusted_url(response.url, hosts)
        body = response.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise ValueError('Source response too large')
        return body
