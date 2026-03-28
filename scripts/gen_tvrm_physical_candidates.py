#!/usr/bin/env python3
import sys
from datetime import date, timedelta
from urllib.parse import quote

BASE = "https://www.td.gov.hk"

MONTH_EN = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def main() -> int:
    # Conservative default range; adjust if you have evidence of earlier PDFs.
    start = date(2000, 1, 1)
    end = date.today()
    if len(sys.argv) >= 2:
        start = date.fromisoformat(sys.argv[1])
    if len(sys.argv) >= 3:
        end = date.fromisoformat(sys.argv[2])

    # Physical auctions are typically on weekends.
    for d in daterange(start, end):
        if d.weekday() not in (5, 6):  # Sat/Sun
            continue
        ymd = d.strftime("%Y%m%d")
        y = d.year
        m = d.month
        dd = d.day

        yield_urls = set()

        # Most common recent pattern (observed 2022+).
        if y >= 2022:
            yield_urls.update([
                f"{BASE}/filemanager/tc/content_4804/tvrm_auction_result_{ymd}_chi.pdf",
                f"{BASE}/filemanager/en/content_4804/tvrm_auction_result_{ymd}_en.pdf",
                f"{BASE}/filemanager/sc/content_4804/tvrm_auction_result_{ymd}_ch.pdf",
            ])

        # 2023 variant observed in the wild: tvrm_result_YYYYMMDD_*.pdf
        if y >= 2023:
            yield_urls.add(f"{BASE}/filemanager/en/content_4804/tvrm_result_{ymd}_en.pdf")
            yield_urls.add(f"{BASE}/filemanager/tc/content_4804/tvrm_result_{ymd}_chi.pdf")
            yield_urls.add(f"{BASE}/filemanager/sc/content_4804/tvrm_result_{ymd}_ch.pdf")

        # Another observed pattern:
        #   /filemanager/sc/content_4804/TVRMs%20Auction%20Result%20Handout%2018%20May%202025.Chin.pdf
        # Variants exist across tc/sc/en folders and suffixes.
        if y >= 2024:
            mname = MONTH_EN[d.month - 1]
            day = d.day
            year = d.year
            base_names = [
                f"TVRMs%20Auction%20Result%20Handout%20{day}%20{mname}%20{year}",
                f"TVRM%20Auction%20Result%20Handout%20{day}%20{mname}%20{year}",
            ]
            suffixes = [".Chin.pdf", ".Eng.pdf", "_CH.pdf", "_EN.pdf"]
            for folder in ["tc", "sc", "en"]:
                for bn in base_names:
                    for suf in suffixes:
                        yield_urls.add(f"{BASE}/filemanager/{folder}/content_4804/{bn}{suf}")

        # Older years (pre content_4804) had many "common/" naming variants.
        # Add the variants from the community brute-force scraper.
        common = []
        common.append(f"{BASE}/filemanager/common/tvrm_auction_result_{dd}_{m}_{y}.pdf")
        common.append(f"{BASE}/filemanager/common/tvrm_auction_result_{dd:02d}_{m:02d}_{y}.pdf")
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result_{dd}.{m}.{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result_{dd:02d}.{m:02d}.{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result_{y}.{m}.{dd}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result_{y}.{m:02d}.{dd:02d}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"{ymd} tvrm auction result.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"{ymd}_tvrm auction result.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"{ymd}tvrmauctionresult.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"auction result handout_{y}.{m}.{dd}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"auction result handout_{y}.{m:02d}.{dd:02d}.pdf"))
        common.append(f"{BASE}/filemanager/common/auction-result-handout_{dd:02d}-{m:02d}-{y}.pdf")
        common.append(f"{BASE}/filemanager/common/auction-result-handout_{dd}-{m}-{y}.pdf")
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result handout_{dd}.{m}.{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result handout_{dd:02d}.{m:02d}.{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result handout {dd}-{m}-{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result handout {dd:02d}-{m:02d}-{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result {dd}-{m}-{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result {dd:02d}-{m:02d}-{y}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction result {ymd}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction results handout_{ymd}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"auction results handout for tvrm auction_{ymd}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction handout_{ymd}.pdf"))
        common.append(f"{BASE}/filemanager/common/" + quote(f"tvrm auction handout_{ymd} (rev).pdf"))
        common.append(f"{BASE}/filemanager/common/tvrm_auction_result_{ymd}.pdf")
        common.append(f"{BASE}/filemanager/common/tvrm_result_{ymd}.pdf")
        common.append(f"{BASE}/filemanager/common/tvrm_resultt{ymd}.pdf")
        for u in common:
            yield_urls.add(u)

        for u in sorted(yield_urls):
            print(u)

    # Some historical result PDFs (not always linked from the latest pages) use non-date naming,
    # e.g. "tvrm-auctionresult2018iv-22.pdf". Brute-force these patterns too.
    romans = ["i", "ii", "iii", "iv", "I", "II", "III", "IV"]
    for y in range(start.year, end.year + 1):
        for roman in romans:
            for n in range(1, 81):
                print(f"{BASE}/filemanager/common/tvrm-auctionresult{y}{roman}-{n}.pdf")
                print(f"{BASE}/filemanager/common/tvrm-auctionresult{y}{roman}-{n:02d}.pdf")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
