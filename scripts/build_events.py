#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "events.json"
BASE_URL = "https://www.td.gov.hk"
MAIN_EN_URL = f"{BASE_URL}/en/public_services/vehicle_registration_mark/index.html"
MAIN_ZH_URL = f"{BASE_URL}/tc/public_services/vehicle_registration_mark/index.html"
EAUCTION_URL_EN = "https://e-auction.td.gov.hk/en"
EAUCTION_URL_ZH = "https://e-auction.td.gov.hk/tc"
HK_TZ = timezone(timedelta(hours=8))

MONTH_EN = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(unquote(parts.path), safe="/%")
    query = quote(unquote(parts.query), safe="=&%")
    return urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def request_html(url: str) -> str:
    payload = subprocess.check_output(["curl", "-L", "-s", "--fail", normalize_url(url)], timeout=60)
    return payload.decode("utf-8", errors="replace")


def hk_datetime(year: int, month: int, day: int, hour: int = 0, minute: int = 0, second: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=HK_TZ)


def iso_hk(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def month_number(name: str) -> int:
    value = MONTH_EN.get((name or "").lower())
    if not value:
        raise ValueError(f"unknown month: {name}")
    return value


def parse_eauction_noon_range(text: str) -> Optional[tuple[datetime, datetime]]:
    m = re.search(
        r"\b(\d{1,2})\s+([A-Za-z]+)\s+noon\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+noon\s+(20\d{2})\b",
        text or "",
        re.IGNORECASE,
    )
    if not m:
        return None
    d1, m1, d2, m2, year = m.groups()
    start = hk_datetime(int(year), month_number(m1), int(d1), 12)
    end = hk_datetime(int(year), month_number(m2), int(d2), 12)
    return start, end


def parse_physical_session(text: str) -> Optional[tuple[datetime, datetime, str]]:
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\s+(morning|afternoon)\b", text or "", re.IGNORECASE)
    if not m:
        return None
    day, month_name, year, session = m.groups()
    session = session.lower()
    if session == "morning":
        start = hk_datetime(int(year), month_number(month_name), int(day), 0)
        end = hk_datetime(int(year), month_number(month_name), int(day), 12, 59, 59)
    else:
        start = hk_datetime(int(year), month_number(month_name), int(day), 12)
        end = hk_datetime(int(year), month_number(month_name), int(day), 23, 59, 59)
    return start, end, session


def parse_physical_date(text: str) -> Optional[tuple[datetime, datetime]]:
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b", text or "", re.IGNORECASE)
    if not m:
        return None
    day, month_name, year = m.groups()
    start = hk_datetime(int(year), month_number(month_name), int(day), 0)
    end = hk_datetime(int(year), month_number(month_name), int(day), 23, 59, 59)
    return start, end


def zh_date(dt: datetime) -> str:
    return f"{dt.year}年{dt.month}月{dt.day}日"


def en_date(dt: datetime) -> str:
    return f"{dt.day} {dt.strftime('%B')} {dt.year}"


def absolute_url(href: str) -> str:
    if (href or "").strip().lower().startswith("javascript:"):
        return ""
    return normalize_url(urljoin(BASE_URL, href or ""))


def pdf_signature(href: str) -> str:
    path = urlsplit(absolute_url(href)).path.rsplit("/", 1)[-1]
    signature = unquote(path).lower()
    signature = re.sub(r"\.(eng|chin|chi)(?=\.pdf$)", "", signature)
    signature = re.sub(r"_(eng|chin|chi)(?=\.pdf$)", "", signature)
    signature = re.sub(r"[ _]+", "", signature)
    return signature


def pvrm_recurring_window(now: datetime) -> tuple[datetime, datetime]:
    for year in [now.year, now.year + 1]:
        for month in [1, 5, 9]:
            start = hk_datetime(year, month, 1)
            if month == 12:
                next_month = hk_datetime(year + 1, 1, 1)
            else:
                next_month = hk_datetime(year, month + 1, 1)
            end = next_month - timedelta(seconds=1)
            if now <= end:
                return start, end
    return hk_datetime(now.year + 1, 1, 1), hk_datetime(now.year + 1, 1, 31, 23, 59, 59)


def event_id(kind: str, start: datetime, suffix: str = "") -> str:
    tail = f"-{suffix}" if suffix else ""
    return f"{kind}-{start.date().isoformat()}{tail}"


def make_event(
    *,
    kind: str,
    start: datetime,
    end: datetime,
    source_page_url_en: str,
    source_page_url_zh: str,
    source_text_en: str,
    source_url_en: str,
    source_url_zh: Optional[str] = None,
    action_url_en: Optional[str] = None,
    action_url_zh: Optional[str] = None,
    date_label_en: Optional[str] = None,
    date_label_zh: Optional[str] = None,
    suffix: str = "",
    meta: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {
        "id": event_id(kind, start, suffix),
        "type": kind,
        "start_at": iso_hk(start),
        "end_at": iso_hk(end),
        "date_label_en": date_label_en or f"{en_date(start)} to {en_date(end)}",
        "date_label_zh": date_label_zh or f"{zh_date(start)}至{zh_date(end)}",
        "source_page_url_en": source_page_url_en,
        "source_page_url_zh": source_page_url_zh,
        "source_url_en": source_url_en,
        "source_url_zh": source_url_zh or source_url_en,
        "action_url_en": action_url_en,
        "action_url_zh": action_url_zh,
        "source_text_en": source_text_en,
        "meta": meta or {},
    }


def scrape_application_links(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        lower = href.lower()
        if "pvrm_application" in lower:
            out["pvrm"] = absolute_url(href)
        elif "tvrm_application" in lower:
            out["tvrm"] = absolute_url(href)
    return out


def pvrm_registration_event(now: datetime, app_links_en: dict[str, str], app_links_zh: dict[str, str]) -> dict[str, Any]:
    start, end = pvrm_recurring_window(now)
    source_text = "Computed from the recurring January, May and September PVRM application windows linked from the TD auction overview."

    return make_event(
        kind="pvrm_registration",
        start=start,
        end=end,
        source_page_url_en=MAIN_EN_URL,
        source_page_url_zh=MAIN_ZH_URL,
        source_text_en=source_text,
        source_url_en=app_links_en.get("pvrm") or MAIN_EN_URL,
        source_url_zh=app_links_zh.get("pvrm") or MAIN_ZH_URL,
        date_label_en=f"{en_date(start)} to {en_date(end)}",
        date_label_zh=f"{zh_date(start)}至{zh_date(end)}",
        meta={"source": "computed_recurring_window_from_td_main_page"},
    )


def classify_coming_link(text: str, href: str) -> Optional[tuple[str, str]]:
    haystack = f"{text} {unquote(href or '')}".lower()
    if "e-auction" in haystack:
        return "tvrm_eauction", ""
    session = ""
    if "morning" in haystack or "上午" in haystack:
        session = "morning"
    elif "afternoon" in haystack or "下午" in haystack:
        session = "afternoon"
    if "pvrm" in haystack or "personalized" in haystack or "自訂" in haystack:
        return "pvrm_physical", session
    if "tvrm" in haystack or "traditional" in haystack or "傳統" in haystack:
        return "tvrm_physical", session
    return None


def scrape_coming_link_records(soup: BeautifulSoup) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for a in soup.find_all("a", href=True):
        text = normalize_space(a.get_text(" ", strip=True))
        href = a["href"].strip()
        if not text or ".pdf" not in href.lower() or "content_4802" not in href.lower():
            continue
        classified = classify_coming_link(text, href)
        if not classified:
            continue
        kind, session_hint = classified
        abs_url = absolute_url(href)
        eauction_range = parse_eauction_noon_range(text) if kind == "tvrm_eauction" else None
        session_parsed = parse_physical_session(text) if kind != "tvrm_eauction" else None
        date_parsed = None
        session = session_hint
        start = None
        end = None
        if session_parsed:
            start, end, session = session_parsed
        else:
            date_parsed = parse_physical_date(text) if kind != "tvrm_eauction" else None
            if date_parsed:
                start, end = date_parsed
            elif eauction_range:
                start, end = eauction_range
        out.append(
            {
                "kind": kind,
                "session": session,
                "text": text,
                "url": abs_url,
                "signature": pdf_signature(href),
                "start": start,
                "end": end,
            }
        )
    return out


def scrape_coming_auction_events(now: datetime, soup_en: BeautifulSoup, soup_zh: BeautifulSoup) -> list[dict[str, Any]]:
    zh_records = scrape_coming_link_records(soup_zh)
    events: list[dict[str, Any]] = []

    for record in scrape_coming_link_records(soup_en):
        kind_from_link = record["kind"]
        start = record["start"]
        end = record["end"]
        session = record["session"]
        text = record["text"]
        abs_url = record["url"]
        if not start or not end:
            continue
        zh = next(
            (
                candidate
                for candidate in zh_records
                if candidate["kind"] == kind_from_link
                and candidate["signature"] == record["signature"]
            ),
            None,
        )

        if kind_from_link == "tvrm_eauction":
            events.append(
                make_event(
                    kind="tvrm_eauction",
                    start=start,
                    end=end,
                    source_page_url_en=MAIN_EN_URL,
                    source_page_url_zh=MAIN_ZH_URL,
                    source_text_en=text,
                    source_url_en=abs_url,
                    source_url_zh=(zh or {}).get("url") or abs_url,
                    action_url_en=EAUCTION_URL_EN,
                    action_url_zh=EAUCTION_URL_ZH,
                    date_label_en=text,
                    date_label_zh=(zh or {}).get("text") or f"{zh_date(start)}中午12時至{zh_date(end)}中午12時",
                    meta={"source": "td_coming_auction"},
                )
            )
            continue

        session_zh = "上午" if session == "morning" else "下午"
        events.append(
            make_event(
                kind=kind_from_link,
                start=start,
                end=end,
                source_page_url_en=MAIN_EN_URL,
                source_page_url_zh=MAIN_ZH_URL,
                source_text_en=text,
                source_url_en=abs_url,
                source_url_zh=(zh or {}).get("url") or abs_url,
                date_label_en=text,
                date_label_zh=(zh or {}).get("text") or (f"{zh_date(start)}{session_zh}" if session else zh_date(start)),
                suffix=session,
                meta={"source": "td_coming_auction", **({"session": session} if session else {})},
            )
        )

    return [event for event in events if datetime.fromisoformat(event["end_at"]) >= now]


def dedupe_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for event in sorted(events, key=lambda item: (item["start_at"], item["type"], item["id"])):
        key = (event["type"], event["start_at"], event["end_at"])
        if key in seen:
            continue
        seen.add(key)
        out.append(event)
    return out


def build_events(now: Optional[datetime] = None) -> dict[str, Any]:
    now = now or datetime.now(HK_TZ)
    html_en = request_html(MAIN_EN_URL)
    html_zh = request_html(MAIN_ZH_URL)
    soup_en = BeautifulSoup(html_en, "html.parser")
    soup_zh = BeautifulSoup(html_zh, "html.parser")
    app_links_en = scrape_application_links(soup_en)
    app_links_zh = scrape_application_links(soup_zh)

    events = [pvrm_registration_event(now, app_links_en, app_links_zh)]
    try:
        events.extend(scrape_coming_auction_events(now, soup_en, soup_zh))
    except Exception as exc:
        events.append({
            "id": f"source-warning-{now.date().isoformat()}",
            "type": "source_warning",
            "start_at": iso_hk(now),
            "end_at": iso_hk(now),
            "date_label_en": en_date(now),
            "date_label_zh": zh_date(now),
            "source_page_url_en": MAIN_EN_URL,
            "source_page_url_zh": MAIN_ZH_URL,
            "source_url_en": MAIN_EN_URL,
            "source_url_zh": MAIN_ZH_URL,
            "action_url_en": None,
            "action_url_zh": None,
            "source_text_en": f"Unable to refresh coming auction page: {exc}",
            "meta": {"source": "refresh_warning"},
        })
    events = [event for event in events if event["type"] != "source_warning" or not events]
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "timezone": "Asia/Hong_Kong",
        "source_urls": [MAIN_EN_URL, MAIN_ZH_URL],
        "events": dedupe_events(events),
    }


def main() -> int:
    payload = build_events()
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {DATA_PATH} with {len(payload['events'])} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
