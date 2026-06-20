#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "https://plate.hk"
MAX_WORKERS_ASSET_BYTES = 25 * 1024 * 1024


@dataclass(frozen=True)
class CheckTarget:
    name: str
    rel_path: str


TARGETS = (
    CheckTarget("events", "data/events.json"),
    CheckTarget("api_index", "api/v1/index.json"),
)


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_local_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_api_index_for_publish(local_root: Path, value, max_asset_bytes: int = MAX_WORKERS_ASSET_BYTES):
    normalized = copy.deepcopy(value)
    notes: list[str] = []
    all_plates_path = local_root / "api" / "v1" / "all" / "plates.json"
    if all_plates_path.exists() and all_plates_path.stat().st_size > max_asset_bytes:
        datasets = normalized.get("datasets") if isinstance(normalized, dict) else None
        all_dataset = datasets.get("all") if isinstance(datasets, dict) else None
        files = all_dataset.get("files") if isinstance(all_dataset, dict) else None
        if isinstance(files, dict) and files.pop("plates", None) is not None:
            notes.append("removed all.files.plates because api/v1/all/plates.json exceeds the Worker asset limit")
    return normalized, notes


def fetch_json(url: str, timeout: float):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "platehk-freshness-check/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return json.loads(resp.read().decode("utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare live Plate.hk JSON freshness against local generated outputs.",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Production base URL to compare.")
    parser.add_argument("--local-root", default=str(ROOT), help="Repo root containing generated local outputs.")
    parser.add_argument("--timeout", type=float, default=20.0, help="Per-request timeout in seconds.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON summary.")
    parser.add_argument("--fail-on-drift", action="store_true", help="Exit non-zero when production differs from local.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    local_root = Path(args.local_root)
    results = []

    for target in TARGETS:
        local_path = local_root / target.rel_path
        url = f"{base_url}/{target.rel_path}"
        result = {
            "name": target.name,
            "path": target.rel_path,
            "url": url,
            "status": "unknown",
            "matches": False,
            "error": "",
        }
        try:
            local_value = load_local_json(local_path)
            normalizations: list[str] = []
            if target.name == "api_index":
                local_value, normalizations = normalize_api_index_for_publish(local_root, local_value)
            live_value = fetch_json(url, args.timeout)
            result["matches"] = canonical_json(local_value) == canonical_json(live_value)
            result["status"] = "current" if result["matches"] else "drift"
            if normalizations:
                result["normalizations"] = normalizations
        except (OSError, json.JSONDecodeError, urllib.error.URLError, RuntimeError) as exc:
            result["status"] = "error"
            result["error"] = str(exc)
        results.append(result)

    has_error = any(item["status"] == "error" for item in results)
    has_drift = any(item["status"] == "drift" for item in results)
    summary_status = "error" if has_error else ("drift" if has_drift else "current")
    summary = {
        "base_url": base_url,
        "status": summary_status,
        "results": results,
    }

    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        if summary_status == "current":
            print("Production freshness OK: live events.json and api/v1/index.json match local outputs.")
        elif summary_status == "drift":
            print("Production freshness drift detected:")
            for item in results:
                if item["status"] == "drift":
                    print(f"  {item['path']} differs from {item['url']}")
            print("Treat this as a deploy trigger even if source PDF polling found no new results.")
        else:
            print("Production freshness check could not complete:", file=sys.stderr)
            for item in results:
                if item["status"] == "error":
                    print(f"  {item['path']}: {item['error']}", file=sys.stderr)

    if has_error:
        return 3
    if has_drift and args.fail_on_drift:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
