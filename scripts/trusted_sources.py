"""Bounded HTTPS source reads with the same host policy on every redirect."""
from __future__ import annotations

import urllib.request
from urllib.parse import urlsplit, parse_qs
import re
from datetime import date

TD_HOSTS = frozenset({'www.td.gov.hk'})
EVENT_HOSTS = TD_HOSTS | {'www.gov.hk', 'e-auction.td.gov.hk'}
MARKET_HOSTS = frozenset({'m.28car.com'})


def eauction_reference(url: str) -> dict | None:
    parts=urlsplit(url)
    query=parse_qs(parts.query,keep_blank_values=True)
    if (parts.scheme!='https' or parts.netloc!='e-auction.td.gov.hk' or parts.path!='/en/auctions/history' or parts.fragment
        or set(query)!={'result','date'} or any(len(value)!=1 for value in query.values())
        or not re.fullmatch(r'[1-9]\d{0,8}',query.get('result',[''])[0])):
        return None
    day=query['date'][0]
    try:
        if date.fromisoformat(day).isoformat()!=day: return None
    except ValueError: return None
    if url!=f"https://e-auction.td.gov.hk/en/auctions/history?result={query['result'][0]}&date={day}": return None
    return {'id':int(query['result'][0]),'date':day}


def eauction_pdf_url(url: str) -> str | None:
    reference=eauction_reference(url)
    return f"https://plate.hk/auction-sources/eauction/{reference['id']}.pdf" if reference else None


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
