#!/usr/bin/env python3
import sys
from datetime import date, timedelta

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
    # E-auction started much later than physical auctions; default from 2019.
    start = date(2019, 1, 1)
    end = date.today()
    if len(sys.argv) >= 2:
        start = date.fromisoformat(sys.argv[1])
    if len(sys.argv) >= 3:
        end = date.fromisoformat(sys.argv[2])

    for d in daterange(start, end):
        if d.weekday() != 3:  # Thu
            continue
        d2 = d + timedelta(days=4)  # Mon

        # Observed naming on TD filemanager uses English month names and "Chin"/"Eng" suffix.
        for month_name, year in {(MONTH_EN[d.month - 1], d.year), (MONTH_EN[d2.month - 1], d2.year)}:
            # Chinese (Traditional) PDF
            print(
                f"{BASE}/filemanager/tc/content_4804/E-Auction%20Result%20Handout%20{d.day}-{d2.day}%20{month_name}%20{year}.Chin.pdf"
            )
            # English PDF (may or may not exist)
            print(
                f"{BASE}/filemanager/en/content_4804/E-Auction%20Result%20Handout%20{d.day}-{d2.day}%20{month_name}%20{year}.Eng.pdf"
            )

    # Additional observed pattern (session codes):
    #   Online_Auction_Result_NSRM-YY-MM-NN_en.pdf
    for y in range(start.year, end.year + 2):
        yy = y % 100
        for m in range(1, 13):
            for seq in range(1, 6):
                print(f"{BASE}/filemanager/en/content_4804/Online_Auction_Result_NSRM-{yy:02d}-{m:02d}-{seq:02d}_en.pdf")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
