#!/usr/bin/env python3
"""
TVRM Auction Result Scraper
============================
Discovers and downloads ALL historical Traditional Vehicle Registration Mark
auction result PDFs from td.gov.hk by brute-forcing known URL patterns
across every Saturday/Sunday from 2006 to present.

The TD website only lists the last 3 results, but the PDFs remain accessible
at their original URLs. This script tries multiple naming conventions that
have been used over the years.

Covers three auction types:
  1. Physical auctions (TVRM) - weekend events, ~2012-present
  2. E-Auctions (online) - weekly Mon-Fri sessions, started ~Jan 2025
  3. LNY special auctions - Lunar New Year charity events

Usage:
    python tvrm_auction_scraper.py                  # Discover all PDFs
    python tvrm_auction_scraper.py --download       # Discover and download
    python tvrm_auction_scraper.py --download --parse  # Download and extract data to CSV
"""

import asyncio
import aiohttp
import os
import re
import csv
import json
import argparse
from datetime import datetime, timedelta, date
from urllib.parse import quote
from pathlib import Path


BASE_URL = "https://www.td.gov.hk"

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

MONTH_ABBREVS = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]


def generate_url_patterns(d: date) -> list[str]:
    """Generate all possible URL paths for a given physical auction date."""
    y = d.year
    m = d.month
    dd = d.day
    month_name = MONTH_NAMES[m]

    patterns = []

    # === Pattern Group 1: /filemanager/*/content_4804/ (2022+) ===
    yyyymmdd = f"{y}{m:02d}{dd:02d}"

    if y >= 2022:
        # Common recent patterns (tc/en/sc)
        for folder in ["tc", "en", "sc"]:
            patterns.append(f"/filemanager/{folder}/content_4804/tvrm_auction_result_{yyyymmdd}_chi.pdf")
            patterns.append(f"/filemanager/{folder}/content_4804/tvrm_auction_result_{yyyymmdd}_ch.pdf")
            patterns.append(f"/filemanager/{folder}/content_4804/tvrm_auction_result_{yyyymmdd}_en.pdf")
        # 2023 variant
        for folder in ["tc", "en", "sc"]:
            patterns.append(f"/filemanager/{folder}/content_4804/tvrm_result_{yyyymmdd}_chi.pdf")
            patterns.append(f"/filemanager/{folder}/content_4804/tvrm_result_{yyyymmdd}_ch.pdf")
            patterns.append(f"/filemanager/{folder}/content_4804/tvrm_result_{yyyymmdd}_en.pdf")

    if y >= 2024:
        # Handout naming variants
        base_names = [
            f"TVRMs Auction Result Handout {dd} {month_name} {y}",
            f"TVRM Auction Result Handout {dd} {month_name} {y}",
        ]
        suffixes = [".Chin.pdf", ".Eng.pdf", "_CH.pdf", "_EN.pdf", "_Chi.pdf"]
        for folder in ["tc", "en", "sc"]:
            for bn in base_names:
                for suf in suffixes:
                    patterns.append(f"/filemanager/{folder}/content_4804/" + quote(f"{bn}{suf}"))

    # === Pattern Group 2: /filemanager/common/ (pre-2023, many variants) ===

    # tvrm_auction_result_D_M_YYYY.pdf (e.g., 7_8_2021)
    patterns.append(f"/filemanager/common/tvrm_auction_result_{dd}_{m}_{y}.pdf")

    # tvrm_auction_result_DD_MM_YYYY.pdf (with leading zeros)
    patterns.append(f"/filemanager/common/tvrm_auction_result_{dd:02d}_{m:02d}_{y}.pdf")

    # "tvrm auction result_DD.MM.YYYY.pdf" (e.g., 14.12.2019)
    patterns.append(
        f"/filemanager/common/" + quote(f"tvrm auction result_{dd}.{m}.{y}.pdf")
    )
    patterns.append(
        f"/filemanager/common/" + quote(f"tvrm auction result_{dd:02d}.{m:02d}.{y}.pdf")
    )

    # "tvrm auction result_YYYY.M.D.pdf" (e.g., 2017.12.2)
    patterns.append(
        f"/filemanager/common/" + quote(f"tvrm auction result_{y}.{m}.{dd}.pdf")
    )
    patterns.append(
        f"/filemanager/common/" + quote(f"tvrm auction result_{y}.{m:02d}.{dd:02d}.pdf")
    )

    # "YYYYMMDD tvrm auction result.pdf" (e.g., 20160529)
    patterns.append(
        f"/filemanager/common/" + quote(f"{yyyymmdd} tvrm auction result.pdf")
    )

    # "auction result handout_YYYY.M.D.pdf" (e.g., 2016.6.5)
    patterns.append(
        f"/filemanager/common/" + quote(f"auction result handout_{y}.{m}.{dd}.pdf")
    )
    patterns.append(
        f"/filemanager/common/" + quote(f"auction result handout_{y}.{m:02d}.{dd:02d}.pdf")
    )

    # "auction-result-handout_DD-MM-YYYY.pdf" (e.g., 18-11-2017)
    patterns.append(
        f"/filemanager/common/auction-result-handout_{dd:02d}-{m:02d}-{y}.pdf"
    )
    patterns.append(
        f"/filemanager/common/auction-result-handout_{dd}-{m}-{y}.pdf"
    )

    # "tvrm auction result handout_DD.MM.YYYY.pdf"
    patterns.append(
        f"/filemanager/common/" + quote(f"tvrm auction result handout_{dd}.{m}.{y}.pdf")
    )
    patterns.append(
        f"/filemanager/common/" + quote(f"tvrm auction result handout_{dd:02d}.{m:02d}.{y}.pdf")
    )

    # tvrm_auction_result_YYYYMMDD.pdf (no language suffix, under common)
    patterns.append(f"/filemanager/common/tvrm_auction_result_{yyyymmdd}.pdf")

    # tvrm_result_YYYYMMDD.pdf (no language suffix, under common)
    patterns.append(f"/filemanager/common/tvrm_result_{yyyymmdd}.pdf")

    # Extra common variants observed in the dataset
    patterns.append(f"/filemanager/common/" + quote(f"{yyyymmdd}_tvrm auction result.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"{yyyymmdd}tvrmauctionresult.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result {dd}-{m}-{y}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result {dd:02d}-{m:02d}-{y}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result {yyyymmdd}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result handout {dd}-{m}-{y}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result handout {dd:02d}-{m:02d}-{y}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction handout_{yyyymmdd}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction handout_{yyyymmdd} (rev).pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction handout_{y}.{m}.{dd}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction handout_{y}.{m:02d}.{dd:02d}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction handout_{dd}.{m}.{y}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction handout_{dd:02d}.{m:02d}.{y}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result handout_{y}.{m}.{dd}.pdf"))
    patterns.append(f"/filemanager/common/" + quote(f"tvrm auction result handout_{y}.{m:02d}.{dd:02d}.pdf"))

    return patterns


def generate_eauction_urls(start_year: int = 2024, end_year: int = None) -> list[str]:
    """Generate URLs for E-Auction (online) results.

    E-Auctions run Mon-Fri in weekly sessions. Two URL patterns:
    1. Online_Auction_Result_NSRM-YY-MM-NN_en.pdf
    2. E-Auction Result Handout D-D Month YYYY.Eng.pdf
    """
    if end_year is None:
        end_year = date.today().year + 1

    urls = []
    for y in range(start_year, end_year + 1):
        yy = y % 100
        for m in range(1, 13):
            month_name = MONTH_NAMES[m]
            month_abbr = MONTH_ABBREVS[m]

            # Pattern 1: NSRM session codes (up to 4 sessions per month)
            for seq in range(1, 6):
                for folder in ["en", "tc", "sc"]:
                    urls.append(
                        f"{BASE_URL}/filemanager/{folder}/content_4804/"
                        f"Online_Auction_Result_NSRM-{yy:02d}-{m:02d}-{seq:02d}_en.pdf"
                    )
                    urls.append(
                        f"{BASE_URL}/filemanager/{folder}/content_4804/"
                        f"Online_Auction_Result_NSRM-{yy:02d}-{m:02d}-{seq:02d}_ch.pdf"
                    )
                    urls.append(
                        f"{BASE_URL}/filemanager/{folder}/content_4804/"
                        f"Online_Auction_Result_NSRM-{yy:02d}-{m:02d}-{seq:02d}_chi.pdf"
                    )

            # Pattern 2: E-Auction Handout with date ranges (try common Mon-Fri spans)
            for start_day in range(1, 29):
                for span in [4]:  # Mon-Fri = 5 days, so start to start+4
                    end_day = start_day + span
                    if end_day > 31:
                        continue
                    for folder in ["en", "tc", "sc"]:
                        # Full month name with .Eng
                        urls.append(
                            f"{BASE_URL}/filemanager/{folder}/content_4804/"
                            + quote(f"E-Auction Result Handout {start_day}-{end_day} {month_name} {y}.Eng.pdf")
                        )
                        urls.append(
                            f"{BASE_URL}/filemanager/{folder}/content_4804/"
                            + quote(f"E-Auction Result Handout {start_day}-{end_day} {month_name} {y}.Chin.pdf")
                        )
                        # Abbreviated month with space Eng
                        urls.append(
                            f"{BASE_URL}/filemanager/{folder}/content_4804/"
                            + quote(f"E-Auction Result Handout {start_day}-{end_day} {month_abbr} {y} Eng.pdf")
                        )
                        # Full month name with space Eng
                        urls.append(
                            f"{BASE_URL}/filemanager/{folder}/content_4804/"
                            + quote(f"E-Auction Result Handout {start_day}-{end_day} {month_name} {y} Eng.pdf")
                        )
    return urls


def generate_lny_urls(start_year: int = 2012, end_year: int = None) -> list[str]:
    """Generate URLs for Lunar New Year special auction results.

    These are under /filemanager/en/content_4806/ and typically happen in Jan-Feb.
    """
    if end_year is None:
        end_year = date.today().year + 1

    urls = []
    for y in range(start_year, end_year + 1):
        for m in [1, 2]:
            for d in range(1, 29):
                yyyymmdd = f"{y}{m:02d}{d:02d}"
                # lny_auction_result_YYYYMMDD_ENG.pdf
                urls.append(f"{BASE_URL}/filemanager/en/content_4806/lny_auction_result_{yyyymmdd}_ENG.pdf")
                # Some have trailing space before .pdf
                urls.append(f"{BASE_URL}/filemanager/en/content_4806/lny_auction_result_{yyyymmdd}_ENG%20.pdf")
                # Chinese folders / variants
                urls.append(f"{BASE_URL}/filemanager/tc/content_4806/lny_auction_result_{yyyymmdd}_CHI.pdf")
                urls.append(f"{BASE_URL}/filemanager/sc/content_4806/lny_auction_result_{yyyymmdd}_CH.pdf")
                # Older LNY/PVRM mixed results under content_4806 with ret suffix
                urls.append(f"{BASE_URL}/filemanager/tc/content_4806/{yyyymmdd}ret.pdf")
    return urls


def generate_weekend_dates(start_year: int = 2006, end_date: date = None) -> list[date]:
    """Generate all Saturday and Sunday dates from start_year to end_date."""
    if end_date is None:
        end_date = date.today()

    start = date(start_year, 1, 1)
    # Find first Saturday
    while start.weekday() != 5:  # 5 = Saturday
        start += timedelta(days=1)

    dates = []
    current = start
    while current <= end_date:
        dates.append(current)  # Saturday
        dates.append(current + timedelta(days=1))  # Sunday
        current += timedelta(days=7)

    return [d for d in dates if d <= end_date]


async def check_url(session: aiohttp.ClientSession, url: str, semaphore: asyncio.Semaphore) -> tuple[str, bool, int]:
    """Check if a URL exists using HEAD request, fallback to GET with range."""
    async with semaphore:
        # First try HEAD; if inconclusive or blocked, fall back to GET range.
        head_status = 0
        try:
            async with session.head(url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                head_status = resp.status
                if resp.status == 200:
                    content_type = resp.headers.get("Content-Type", "")
                    if "pdf" in content_type.lower() or "octet" in content_type.lower():
                        return (url, True, resp.status)
                    # Some servers return 200 for HTML error pages; check size
                    content_len = resp.headers.get("Content-Length", "0")
                    try:
                        if int(content_len) > 5000:  # PDFs are usually > 5KB
                            return (url, True, resp.status)
                    except Exception:
                        pass
        except Exception:
            head_status = 0

        # Fallback: try GET with range header
        try:
            headers = {"Range": "bytes=0-4"}
            async with session.get(url, headers=headers, allow_redirects=True,
                                   timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status in (200, 206):
                    data = await resp.read()
                    if data[:4] == b"%PDF":
                        return (url, True, resp.status)
                return (url, False, resp.status)
        except Exception:
            return (url, False, head_status)


async def discover_pdfs(start_year: int = 2006, concurrency: int = 50) -> list[dict]:
    """Discover all available TVRM auction result PDFs (physical, E-Auction, LNY)."""
    dates = generate_weekend_dates(start_year)
    print(f"[Phase 1/3] Physical auctions: scanning {len(dates)} weekend dates from {start_year} to today...")
    print(f"Using {concurrency} concurrent connections\n")

    semaphore = asyncio.Semaphore(concurrency)
    found = []
    total_checked = 0
    total_urls = 0

    connector = aiohttp.TCPConnector(limit=concurrency, ttl_dns_cache=300)
    headers = {"User-Agent": "PVRM-Indexer/1.0"}
    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        # --- Phase 1: Physical auction PDFs ---
        batch_size = 30
        for i in range(0, len(dates), batch_size):
            batch_dates = dates[i:i + batch_size]
            tasks = []

            for d in batch_dates:
                patterns = generate_url_patterns(d)
                for pattern in patterns:
                    url = BASE_URL + pattern
                    tasks.append(check_url(session, url, semaphore))

            total_urls += len(tasks)
            results = await asyncio.gather(*tasks)

            for url, exists, status in results:
                total_checked += 1
                if exists:
                    auction_date = _extract_date_from_url(url)
                    entry = {
                        "url": url,
                        "date": auction_date,
                        "type": "physical",
                        "filename": url.split("/")[-1],
                    }
                    if not any(f["date"] == auction_date and f["url"] == url for f in found):
                        found.append(entry)
                        print(f"  FOUND: {entry['date']} -> {entry['filename']}")

            date_range = f"{batch_dates[0]} to {batch_dates[-1]}"
            print(f"  Scanned {date_range} | Checked: {total_checked}/{total_urls} URLs | Found: {len(found)} PDFs")

        # --- Phase 2: E-Auction (online) PDFs ---
        eauction_urls = generate_eauction_urls(start_year=2024)
        print(f"\n[Phase 2/3] E-Auctions: scanning {len(eauction_urls)} URL patterns...")
        batch_size_ea = 200
        for i in range(0, len(eauction_urls), batch_size_ea):
            batch = eauction_urls[i:i + batch_size_ea]
            tasks = [check_url(session, url, semaphore) for url in batch]
            results = await asyncio.gather(*tasks)

            for url, exists, status in results:
                if exists:
                    auction_date = _extract_date_from_url(url)
                    entry = {
                        "url": url,
                        "date": auction_date,
                        "type": "e-auction",
                        "filename": url.split("/")[-1],
                    }
                    if not any(f["url"] == url for f in found):
                        found.append(entry)
                        print(f"  FOUND [E-Auction]: {entry['filename']}")

        ea_count = sum(1 for f in found if f.get("type") == "e-auction")
        print(f"  E-Auction scan complete: found {ea_count} PDFs")

        # --- Phase 3: LNY special auction PDFs ---
        lny_urls = generate_lny_urls(start_year=start_year)
        print(f"\n[Phase 3/3] LNY auctions: scanning {len(lny_urls)} URL patterns...")
        tasks = [check_url(session, url, semaphore) for url in lny_urls]
        results = await asyncio.gather(*tasks)

        for url, exists, status in results:
            if exists:
                auction_date = _extract_date_from_url(url)
                entry = {
                    "url": url,
                    "date": auction_date,
                    "type": "lny",
                    "filename": url.split("/")[-1],
                }
                if not any(f["url"] == url for f in found):
                    found.append(entry)
                    print(f"  FOUND [LNY]: {entry['date']} -> {entry['filename']}")

        lny_count = sum(1 for f in found if f.get("type") == "lny")
        print(f"  LNY scan complete: found {lny_count} PDFs")

        # --- Phase 4: Legacy roman / non-date filenames ---
        romans = ["i", "ii", "iii", "iv", "I", "II", "III", "IV"]
        legacy_urls = []
        for y in range(start_year, date.today().year + 1):
            for roman in romans:
                for n in range(1, 81):
                    legacy_urls.append(f"{BASE_URL}/filemanager/common/tvrm-auctionresult{y}{roman}-{n}.pdf")
                    legacy_urls.append(f"{BASE_URL}/filemanager/common/tvrm-auctionresult{y}{roman}-{n:02d}.pdf")
        print(f"\n[Phase 4/4] Legacy roman patterns: scanning {len(legacy_urls)} URL patterns...")
        batch_size_legacy = 400
        for i in range(0, len(legacy_urls), batch_size_legacy):
            batch = legacy_urls[i:i + batch_size_legacy]
            tasks = [check_url(session, url, semaphore) for url in batch]
            results = await asyncio.gather(*tasks)
            for url, exists, status in results:
                if exists:
                    auction_date = _extract_date_from_url(url)
                    entry = {
                        "url": url,
                        "date": auction_date,
                        "type": "physical",
                        "filename": url.split("/")[-1],
                    }
                    if not any(f["url"] == url for f in found):
                        found.append(entry)
                        print(f"  FOUND [Legacy]: {entry['filename']}")

    # Sort by date
    found.sort(key=lambda x: x["date"])

    # Deduplicate by date+type (keep first URL found for each date)
    seen = set()
    unique = []
    for entry in found:
        key = (entry["date"], entry.get("type", "physical"))
        if key not in seen:
            seen.add(key)
            unique.append(entry)
        else:
            for u in unique:
                if (u["date"], u.get("type")) == key:
                    if "alt_urls" not in u:
                        u["alt_urls"] = []
                    u["alt_urls"].append(entry["url"])
                    break

    return unique


def _extract_date_from_url(url: str) -> str:
    """Extract the auction date from a URL."""
    filename = url.split("/")[-1]
    filename = filename.replace("%20", " ")

    # Try YYYYMMDD pattern
    m = re.search(r'(\d{4})(\d{2})(\d{2})', filename)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"

    # Try D_M_YYYY or DD_MM_YYYY
    m = re.search(r'_(\d{1,2})_(\d{1,2})_(\d{4})', filename)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

    # Try DD.MM.YYYY or D.M.YYYY
    m = re.search(r'_(\d{1,2})\.(\d{1,2})\.(\d{4})\.pdf', filename)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

    # Try YYYY.M.D or YYYY.MM.DD
    m = re.search(r'_(\d{4})\.(\d{1,2})\.(\d{1,2})\.pdf', filename)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    # Try DD-MM-YYYY
    m = re.search(r'_(\d{1,2})-(\d{1,2})-(\d{4})', filename)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

    # Try "DD Month YYYY" in handout format (full month name)
    m = re.search(r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})', filename)
    if m:
        month_num = MONTH_NAMES.index(m.group(2))
        return f"{m.group(3)}-{month_num:02d}-{int(m.group(1)):02d}"

    # Try abbreviated month name (Jan, Feb, Mar, etc.)
    m = re.search(r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})', filename)
    if m:
        month_num = MONTH_ABBREVS.index(m.group(2))
        return f"{m.group(3)}-{month_num:02d}-{int(m.group(1)):02d}"

    # NSRM session code: NSRM-YY-MM-NN (year, month, session number)
    m = re.search(r'NSRM-(\d{2})-(\d{2})-(\d{2})', filename)
    if m:
        year = 2000 + int(m.group(1))
        month = int(m.group(2))
        session = int(m.group(3))
        return f"{year}-{month:02d}-S{session:02d}"

    return "unknown"


async def download_pdf(session: aiohttp.ClientSession, entry: dict, output_dir: str,
                       semaphore: asyncio.Semaphore) -> tuple[str, bool]:
    """Download a single PDF."""
    url = entry["url"]
    async with semaphore:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    auction_date = entry.get("date", _extract_date_from_url(url))
                    auction_type = entry.get("type", "physical")
                    prefix = {"physical": "tvrm", "e-auction": "eauction", "lny": "lny"}.get(auction_type, "tvrm")
                    filename = f"{prefix}_auction_{auction_date}.pdf"
                    filepath = os.path.join(output_dir, filename)
                    content = await resp.read()
                    with open(filepath, "wb") as f:
                        f.write(content)
                    return (url, True)
            return (url, False)
        except Exception as e:
            print(f"  Error downloading {url}: {e}")
            return (url, False)


async def download_all(found_pdfs: list[dict], output_dir: str, concurrency: int = 10):
    """Download all discovered PDFs."""
    os.makedirs(output_dir, exist_ok=True)
    semaphore = asyncio.Semaphore(concurrency)

    print(f"\nDownloading {len(found_pdfs)} PDFs to {output_dir}/")

    connector = aiohttp.TCPConnector(limit=concurrency)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [
            download_pdf(session, entry, output_dir, semaphore)
            for entry in found_pdfs
        ]
        results = await asyncio.gather(*tasks)

    success = sum(1 for _, ok in results if ok)
    print(f"\nDownloaded {success}/{len(found_pdfs)} PDFs successfully")


async def main():
    parser = argparse.ArgumentParser(description="TVRM Auction Result PDF Scraper")
    parser.add_argument("--download", action="store_true", help="Download discovered PDFs")
    parser.add_argument("--parse", action="store_true", help="Parse downloaded PDFs to CSV (requires pymupdf)")
    parser.add_argument("--output-dir", default="tvrm_auction_pdfs", help="Download directory (default: tvrm_auction_pdfs)")
    parser.add_argument("--start-year", type=int, default=2006, help="Start year for scanning (default: 2006)")
    parser.add_argument("--concurrency", type=int, default=50, help="Max concurrent requests (default: 50)")
    parser.add_argument("--results-file", default="tvrm_discovered.json", help="Save discovery results to JSON")
    args = parser.parse_args()

    print("=" * 60)
    print("TVRM Auction Result PDF Scraper")
    print("=" * 60)
    print(f"Scanning td.gov.hk from {args.start_year} to {date.today()}")
    print(f"Trying multiple URL naming patterns per date\n")

    # Phase 1: Discover
    found = await discover_pdfs(start_year=args.start_year, concurrency=args.concurrency)

    print(f"\n{'=' * 60}")
    print(f"Discovery complete: Found {len(found)} unique auction result PDFs")
    print(f"{'=' * 60}")

    if found:
        # Type breakdown
        from collections import Counter
        type_counts = Counter(f.get("type", "physical") for f in found)
        print(f"\nBreakdown by type:")
        for t, c in type_counts.most_common():
            print(f"  {t:12s}: {c} PDFs")

        # Year breakdown
        year_counts = Counter(f["date"][:4] for f in found)
        print(f"\nBreakdown by year:")
        for y in sorted(year_counts):
            print(f"  {y}: {year_counts[y]} auctions")

        print(f"\nDate range: {found[0]['date']} to {found[-1]['date']}\n")
        print("All discovered PDFs:")
        for i, entry in enumerate(found, 1):
            t = entry.get("type", "physical")
            tag = {"physical": "", "e-auction": " [E-Auction]", "lny": " [LNY]"}.get(t, "")
            print(f"  {i:3d}. {entry['date']}{tag}  {entry['url']}")

    # Save results
    with open(args.results_file, "w") as f:
        json.dump(found, f, indent=2)
    print(f"\nResults saved to {args.results_file}")

    # Phase 2: Download
    if args.download and found:
        await download_all(found, args.output_dir, concurrency=min(args.concurrency, 10))

    # Phase 3: Parse
    if args.parse and args.download and found:
        try:
            import fitz  # pymupdf
        except ImportError:
            print("\nTo parse PDFs, install pymupdf: pip install pymupdf")
            return

        print(f"\nParsing downloaded PDFs...")
        all_results = []
        pdf_dir = args.output_dir

        for entry in found:
            auction_date = entry["date"]
            auction_type = entry.get("type", "physical")
            prefix = {"physical": "tvrm", "e-auction": "eauction", "lny": "lny"}.get(auction_type, "tvrm")
            filename = f"{prefix}_auction_{auction_date}.pdf"
            filepath = os.path.join(pdf_dir, filename)

            if not os.path.exists(filepath):
                continue

            try:
                doc = fitz.open(filepath)
                text = ""
                for page in doc:
                    text += page.get_text()
                doc.close()

                results = parse_auction_pdf_text(text, auction_date)
                all_results.extend(results)
                print(f"  Parsed {auction_date}: {len(results)} marks")
            except Exception as e:
                print(f"  Error parsing {filename}: {e}")

        if all_results:
            csv_path = "tvrm_auction_all_results.csv"
            with open(csv_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "date", "mark", "prefix", "number", "price",
                    "status", "session", "is_special_mark"
                ])
                writer.writeheader()
                writer.writerows(all_results)
            print(f"\nExported {len(all_results)} auction results to {csv_path}")


if __name__ == "__main__":
    asyncio.run(main())
