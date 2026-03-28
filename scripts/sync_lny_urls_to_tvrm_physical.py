#!/usr/bin/env python3
"""
Sync Lunar New Year / CNY mixed-result PDFs into TVRM physical URL list.

Source of truth: PVRM auctions metadata (data/auctions.json), which already contains
the historical LNY/CNY PDFs (some of which include both TVRM and PVRM).
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PVRM_AUCTIONS = ROOT / "data" / "auctions.json"
TVRM_URLS_ALL = ROOT / "data" / "tvrm_physical" / "urls.all.txt"
TVRM_URLS = ROOT / "data" / "tvrm_physical" / "urls.txt"


def is_lny_like(url: str) -> bool:
    u = (url or "").lower()
    return ("lny" in u) or ("cny" in u) or ("lunar_new_year" in u)


def main() -> int:
    if not PVRM_AUCTIONS.exists():
        raise SystemExit(f"Missing {PVRM_AUCTIONS}")
    if not TVRM_URLS_ALL.exists():
        raise SystemExit(f"Missing {TVRM_URLS_ALL} (build TVRM physical first)")

    auctions = json.loads(PVRM_AUCTIONS.read_text("utf-8"))
    lny_urls = []
    for x in auctions:
        u = x.get("pdf_url") or ""
        if not u:
            continue
        if x.get("is_lny"):
            lny_urls.append(u)
            continue
        # Some early LNY PDFs use generic names; keep a second hint based on very large totals + Feb dates.
        if is_lny_like(u):
            lny_urls.append(u)
            continue
        if re.fullmatch(r"https?://.*?/content_4806/\d{8}ret\.pdf", u, re.IGNORECASE):
            # Empirically, these are LNY auction result PDFs on the PVRM index.
            lny_urls.append(u)

    lny_urls = sorted(set(lny_urls))
    if not lny_urls:
        print("No LNY/CNY URLs found in data/auctions.json")
        return 0

    existing = set(TVRM_URLS_ALL.read_text("utf-8", errors="replace").splitlines())
    merged = sorted(set(existing) | set(lny_urls))
    TVRM_URLS_ALL.write_text("\n".join([x for x in merged if x.strip()]) + "\n", "utf-8")
    TVRM_URLS.write_text("\n".join([x for x in merged if x.strip()]) + "\n", "utf-8")
    print(f"Added {len(set(lny_urls) - existing)} URLs. Total now: {len(merged)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
