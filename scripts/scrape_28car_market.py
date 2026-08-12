#!/usr/bin/env python3
"""Build a privacy-minimised exact-match signal index from public 28car listings.

The output deliberately excludes seller names, phone numbers, comments, photos,
descriptions, view counts, and other free-form listing content. It is intended for
server-side exact-plate lookups, not for publishing a browsable copy of 28car.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import html
import json
import re
import threading
import time
import urllib.error
import urllib.request
import urllib.robotparser
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "market" / "28car.active.json"
LISTING_URL = "https://m.28car.com/num_lst.php?h_f_do=1"
ROBOTS_URL = "https://m.28car.com/robots.txt"
DETAIL_URL = "https://m.28car.com/num_dsp.php?h_vid={vid}&h_url_dsp_src=%2Fnum_lst.php&h_vw=1&h_f_do=1"
USER_AGENT = "PlateHKMarketSignalBot/1.0 (+https://plate.hk/terms.html)"
SCHEMA_VERSION = 1

RECORD_RE = re.compile(
    r"<!--\s*Record\s+\d+\s*-->(.*?)(?=<!--\s*Record\s+\d+\s*-->|\Z)",
    re.IGNORECASE | re.DOTALL,
)
TOTAL_PAGES_RE = re.compile(r"genPage\(\s*(\d+)\s*,\s*\d+\s*\)", re.IGNORECASE)
VID_RE = re.compile(r"goDsp\(\s*\d+\s*,\s*(\d+)\s*,\s*['\"]n['\"]\s*\)", re.IGNORECASE)
LISTING_ID_RE = re.compile(r"(?:編號|\bn[o.]?\b)\s*[:：]?\s*(n\d+)", re.IGNORECASE)
PLATE_RE = re.compile(
    r"<font\b[^>]*\bsize\s*=\s*['\"]?3['\"]?[^>]*>\s*<b>(.*?)</b>",
    re.IGNORECASE | re.DOTALL,
)
PRICE_RE = re.compile(
    r"<td\b[^>]*\bwidth\s*=\s*['\"]?13%['\"]?[^>]*>\s*<font\b[^>]*>(.*?)</font>",
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class ListingSignal:
    plate_norm: str
    listing_id: str
    source_url: str
    price_type: str
    asking_price_hkd: int | None


class PoliteRateLimiter:
    def __init__(self, minimum_interval_seconds: float) -> None:
        self.minimum_interval_seconds = max(0.0, minimum_interval_seconds)
        self._lock = threading.Lock()
        self._next_start = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            delay = max(0.0, self._next_start - now)
            self._next_start = max(now, self._next_start) + self.minimum_interval_seconds
        if delay:
            time.sleep(delay)


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def isoformat(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_timestamp(value: Any) -> dt.datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return dt.datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except ValueError:
        return None


def clean_text(fragment: str) -> str:
    return " ".join(html.unescape(TAG_RE.sub(" ", fragment or "")).split())


def normalize_plate(value: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())
    return normalized.replace("I", "1").replace("O", "0").replace("Q", "")


def parse_price(value: str) -> tuple[str, int | None]:
    text = clean_text(value)
    match = re.search(r"\$?\s*([0-9][0-9,]*)", text)
    if not match:
        return "contact", None
    amount = int(match.group(1).replace(",", ""))
    if amount <= 0:
        return "contact", None
    return "fixed", amount


def parse_page(source: str) -> tuple[int | None, list[ListingSignal]]:
    total_match = TOTAL_PAGES_RE.search(source)
    total_pages = int(total_match.group(1)) if total_match else None
    signals: list[ListingSignal] = []
    for block_match in RECORD_RE.finditer(source):
        block = block_match.group(1)
        vid_match = VID_RE.search(block)
        listing_id_match = LISTING_ID_RE.search(html.unescape(block[:900]))
        plate_match = PLATE_RE.search(block)
        price_match = PRICE_RE.search(block)
        if not (vid_match and listing_id_match and plate_match and price_match):
            continue
        plate_norm = normalize_plate(clean_text(plate_match.group(1)))
        if not plate_norm or len(plate_norm) > 16:
            continue
        price_type, asking_price_hkd = parse_price(price_match.group(1))
        signals.append(
            ListingSignal(
                plate_norm=plate_norm,
                listing_id=listing_id_match.group(1).lower(),
                source_url=DETAIL_URL.format(vid=vid_match.group(1)),
                price_type=price_type,
                asking_price_hkd=asking_price_hkd,
            )
        )
    return total_pages, signals


def decode_page(payload: bytes) -> str:
    for encoding in ("big5hkscs", "big5", "utf-8"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("big5", errors="replace")


def fetch_text(url: str, timeout_seconds: float, limiter: PoliteRateLimiter, attempts: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        limiter.wait()
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.6",
                "User-Agent": USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status} for {url}")
                return decode_page(response.read())
        except (OSError, urllib.error.URLError, RuntimeError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(min(2 ** (attempt - 1), 4))
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def assert_robots_allows(timeout_seconds: float, limiter: PoliteRateLimiter) -> None:
    robots_text = fetch_text(ROBOTS_URL, timeout_seconds, limiter)
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(ROBOTS_URL)
    parser.parse(robots_text.splitlines())
    if not parser.can_fetch(USER_AGENT, LISTING_URL):
        raise RuntimeError("28car robots.txt does not allow this listing fetch; stopping without scraping")


def page_url(page: int) -> str:
    return f"{LISTING_URL}&h_page={page}"


def fetch_page(page: int, timeout_seconds: float, limiter: PoliteRateLimiter) -> tuple[int, list[ListingSignal]]:
    source = fetch_text(page_url(page), timeout_seconds, limiter)
    _, signals = parse_page(source)
    if not signals:
        raise RuntimeError(f"No listing records parsed from page {page}; source layout may have changed")
    return page, signals


def read_existing(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        decoded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def existing_by_listing_id(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    signals = payload.get("signals")
    if not isinstance(signals, dict):
        return output
    for plate_norm, offers in signals.items():
        if not isinstance(offers, list):
            continue
        for offer in offers:
            if not isinstance(offer, dict):
                continue
            listing_id = str(offer.get("listing_id") or "")
            if listing_id:
                output[listing_id] = {**offer, "plate_norm": str(plate_norm)}
    return output


def build_payload(
    fetched: list[ListingSignal],
    existing: dict[str, Any],
    *,
    scraped_at: dt.datetime,
    requested_pages: list[int],
    successful_pages: list[int],
    failed_pages: list[int],
    total_pages: int,
    stale_hours: int,
) -> dict[str, Any]:
    previous = existing_by_listing_id(existing)
    complete = (
        not failed_pages
        and requested_pages == list(range(1, total_pages + 1))
        and successful_pages == requested_pages
    )
    current: dict[str, dict[str, Any]] = {}
    for signal in fetched:
        prior = previous.get(signal.listing_id, {})
        current[signal.listing_id] = {
            "plate_norm": signal.plate_norm,
            "listing_id": signal.listing_id,
            "source_url": signal.source_url,
            "price_type": signal.price_type,
            "asking_price_hkd": signal.asking_price_hkd,
            "first_seen_at": str(prior.get("first_seen_at") or isoformat(scraped_at)),
            "last_seen_at": isoformat(scraped_at),
        }

    if not complete:
        cutoff = scraped_at - dt.timedelta(hours=stale_hours)
        for listing_id, prior in previous.items():
            if listing_id in current:
                continue
            last_seen = parse_timestamp(prior.get("last_seen_at"))
            if not last_seen or last_seen < cutoff:
                continue
            current[listing_id] = {
                "plate_norm": str(prior.get("plate_norm") or ""),
                "listing_id": listing_id,
                "source_url": str(prior.get("source_url") or ""),
                "price_type": "fixed" if prior.get("price_type") == "fixed" else "contact",
                "asking_price_hkd": prior.get("asking_price_hkd") if prior.get("price_type") == "fixed" else None,
                "first_seen_at": str(prior.get("first_seen_at") or prior.get("last_seen_at") or isoformat(scraped_at)),
                "last_seen_at": str(prior.get("last_seen_at") or isoformat(scraped_at)),
            }

    by_plate: dict[str, list[dict[str, Any]]] = {}
    for offer in current.values():
        plate_norm = normalize_plate(offer.pop("plate_norm", ""))
        if not plate_norm:
            continue
        by_plate.setdefault(plate_norm, []).append(offer)
    for offers in by_plate.values():
        offers.sort(key=lambda item: (item["asking_price_hkd"] is None, item["asking_price_hkd"] or 0, item["listing_id"]))

    payload = {
        "schema_version": SCHEMA_VERSION,
        "source": "28car",
        "source_index_url": LISTING_URL,
        "scraped_at": isoformat(scraped_at),
        "fresh_for_hours": stale_hours,
        "coverage": {
            "complete": complete,
            "total_pages_reported": total_pages,
            "requested_pages": len(requested_pages),
            "successful_pages": len(successful_pages),
            "failed_pages": failed_pages,
        },
        "signal_count": sum(len(offers) for offers in by_plate.values()),
        "plate_count": len(by_plate),
        "signals": dict(sorted(by_plate.items())),
    }
    validate_payload(payload)
    return payload


def validate_payload(payload: dict[str, Any]) -> None:
    root_keys = {
        "schema_version",
        "source",
        "source_index_url",
        "scraped_at",
        "fresh_for_hours",
        "coverage",
        "signal_count",
        "plate_count",
        "signals",
    }
    coverage_keys = {"complete", "total_pages_reported", "requested_pages", "successful_pages", "failed_pages"}
    offer_keys = {
        "listing_id",
        "source_url",
        "price_type",
        "asking_price_hkd",
        "first_seen_at",
        "last_seen_at",
    }
    if set(payload) != root_keys:
        raise ValueError(f"Unexpected root fields: {sorted(set(payload) ^ root_keys)}")
    if set(payload["coverage"]) != coverage_keys:
        raise ValueError("Unexpected coverage fields")
    if payload["source"] != "28car" or payload["schema_version"] != SCHEMA_VERSION:
        raise ValueError("Unexpected source or schema version")
    signals = payload["signals"]
    if not isinstance(signals, dict):
        raise ValueError("signals must be an object")
    count = 0
    for plate_norm, offers in signals.items():
        if normalize_plate(plate_norm) != plate_norm or not plate_norm:
            raise ValueError(f"Invalid plate key: {plate_norm!r}")
        if not isinstance(offers, list):
            raise ValueError(f"Offers for {plate_norm} must be a list")
        for offer in offers:
            count += 1
            if not isinstance(offer, dict) or set(offer) != offer_keys:
                raise ValueError(f"Unexpected offer fields for {plate_norm}")
            if not re.fullmatch(r"n\d+", str(offer["listing_id"])):
                raise ValueError("Invalid listing ID")
            if not re.fullmatch(r"https://m\.28car\.com/num_dsp\.php\?.+", str(offer["source_url"])):
                raise ValueError("Invalid source URL")
            if offer["price_type"] not in {"fixed", "contact"}:
                raise ValueError("Invalid price type")
            if offer["price_type"] == "fixed" and not isinstance(offer["asking_price_hkd"], int):
                raise ValueError("Fixed-price offer is missing an integer amount")
            if offer["price_type"] == "contact" and offer["asking_price_hkd"] is not None:
                raise ValueError("Contact-price offer must not contain an amount")
            if not parse_timestamp(offer["first_seen_at"]) or not parse_timestamp(offer["last_seen_at"]):
                raise ValueError("Invalid signal timestamps")
    if count != payload["signal_count"] or len(signals) != payload["plate_count"]:
        raise ValueError("Signal counts do not match payload")


def assert_refresh_publishable(*, max_pages: int, require_complete: bool, failed_pages: list[int]) -> None:
    if failed_pages and (max_pages == 0 or require_complete):
        preview = ", ".join(str(page) for page in failed_pages[:10])
        suffix = "..." if len(failed_pages) > 10 else ""
        raise RuntimeError(
            f"Complete refresh required but {len(failed_pages)} page(s) failed: {preview}{suffix}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-pages", type=int, default=25, help="0 means all reported pages")
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--request-delay", type=float, default=0.85, help="minimum seconds between request starts")
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--stale-hours", type=int, default=72)
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="exit without writing when any requested page fails",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.start_page < 1 or args.max_pages < 0 or not 1 <= args.concurrency <= 6:
        raise SystemExit("Invalid page or concurrency options")
    if args.request_delay < 0.5:
        raise SystemExit("--request-delay must be at least 0.5 seconds")
    if not 1 <= args.stale_hours <= 168:
        raise SystemExit("--stale-hours must be between 1 and 168")

    limiter = PoliteRateLimiter(args.request_delay)
    assert_robots_allows(args.timeout, limiter)
    first_source = fetch_text(page_url(1), args.timeout, limiter)
    total_pages, first_signals = parse_page(first_source)
    if not total_pages or not first_signals:
        raise SystemExit("Unable to determine 28car pagination or parse the first page")

    last_page = total_pages if args.max_pages == 0 else min(total_pages, args.start_page + args.max_pages - 1)
    requested_pages = list(range(args.start_page, last_page + 1))
    fetched_by_page: dict[int, list[ListingSignal]] = {}
    failed_pages: list[int] = []
    if 1 in requested_pages:
        fetched_by_page[1] = first_signals

    remaining_pages = [page for page in requested_pages if page != 1]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {
            executor.submit(fetch_page, page, args.timeout, limiter): page
            for page in remaining_pages
        }
        for future in concurrent.futures.as_completed(futures):
            page = futures[future]
            try:
                parsed_page, signals = future.result()
                fetched_by_page[parsed_page] = signals
                print(f"Parsed page {parsed_page}/{last_page}: {len(signals)} signals")
            except Exception as exc:  # keep a partial, explicitly labelled snapshot
                failed_pages.append(page)
                print(f"Page {page} failed: {exc}")

    successful_pages = sorted(fetched_by_page)
    if not successful_pages:
        raise SystemExit("No listing pages were parsed successfully")
    try:
        assert_refresh_publishable(
            max_pages=args.max_pages,
            require_complete=args.require_complete,
            failed_pages=sorted(failed_pages),
        )
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
    deduped: dict[str, ListingSignal] = {}
    for page in successful_pages:
        for signal in fetched_by_page[page]:
            deduped[signal.listing_id] = signal

    output = args.output.resolve()
    payload = build_payload(
        list(deduped.values()),
        read_existing(output),
        scraped_at=utc_now(),
        requested_pages=requested_pages,
        successful_pages=successful_pages,
        failed_pages=sorted(failed_pages),
        total_pages=total_pages,
        stale_hours=args.stale_hours,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"Wrote {payload['signal_count']} minimal signals for {payload['plate_count']} plates "
        f"to {output} (coverage complete={payload['coverage']['complete']})"
    )


if __name__ == "__main__":
    main()
