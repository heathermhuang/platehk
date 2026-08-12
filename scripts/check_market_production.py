#!/usr/bin/env python3
"""Verify that a deployed market snapshot is queryable only through the exact-match API."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SNAPSHOT = ROOT / "data" / "market" / "28car.active.json"
Opener = Callable[..., Any]


def sample_signal(snapshot: dict[str, Any]) -> tuple[str, set[str]]:
    signals = snapshot.get("signals")
    if not isinstance(signals, dict):
        raise RuntimeError("Market snapshot has no signal map")
    for plate in sorted(signals):
        offers = signals.get(plate)
        if not isinstance(offers, list) or not offers:
            continue
        urls = {
            str(offer.get("source_url") or "")
            for offer in offers
            if isinstance(offer, dict) and str(offer.get("source_url") or "").startswith("https://m.28car.com/")
        }
        if urls:
            return str(plate), urls
    raise RuntimeError("Market snapshot has no verifiable offer")


def open_json(url: str, *, opener: Opener = urllib.request.urlopen) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "PlateHKMarketDeployCheck/1.0"},
    )
    with opener(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP {response.status} for {url}")
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("Market API returned a non-object response")
    return payload


def verify(snapshot: dict[str, Any], base_url: str, *, opener: Opener = urllib.request.urlopen) -> str:
    plate, source_urls = sample_signal(snapshot)
    base = base_url.rstrip("/")
    query_url = f"{base}/api/market_signal?{urllib.parse.urlencode({'plate': plate})}"
    payload = open_json(query_url, opener=opener)
    if payload.get("availability_detected") is not True or payload.get("plate") != plate:
        raise RuntimeError(f"Deployed market API did not expose the expected exact signal for {plate}")
    if payload.get("source") != "28car" or str(payload.get("source_url") or "") not in source_urls:
        raise RuntimeError(f"Deployed market API signal for {plate} does not match the refreshed snapshot")

    hidden_urls = [
        f"{base}/_market/28car/{plate[0]}.json",
        f"{base}/%5fmarket%2F28car%2F{plate[0]}.json",
    ]
    for hidden_url in hidden_urls:
        request = urllib.request.Request(hidden_url, headers={"User-Agent": "PlateHKMarketDeployCheck/1.0"})
        try:
            with opener(request, timeout=20) as response:
                hidden_status = response.status
        except urllib.error.HTTPError as exc:
            hidden_status = exc.code
            exc.close()
        if hidden_status != 404:
            raise RuntimeError(f"Internal market shard was directly reachable with HTTP {hidden_status}")
    return plate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--base-url", default="https://plate.hk")
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    plate = verify(snapshot, args.base_url)
    print(f"Production exact-match market signal verified for {plate}; internal shard remains hidden.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
