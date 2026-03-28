#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def verify_dataset(base: Path, label: str) -> int:
    manifest_path = base / "issues.manifest.json"
    auctions_path = base / "auctions.json"
    preset_path = base / "preset.amount_desc.top1000.json"

    missing = [p for p in [manifest_path, auctions_path, preset_path] if not p.exists()]
    if missing:
        print(f"[{label}] Missing required files:")
        for p in missing:
            print(f"- {p}")
        return 1

    manifest = load_json(manifest_path)
    auctions = load_json(auctions_path)
    preset = load_json(preset_path)

    issues = manifest.get("issues", [])
    total_rows = manifest.get("total_rows", 0)
    issue_count = manifest.get("issue_count", 0)

    if issue_count != len(issues):
        print(f"[{label}] issue_count mismatch: manifest={issue_count}, actual={len(issues)}")
        return 1

    total_from_shards = 0
    for issue in issues:
        date_iso = issue.get("auction_date")
        file_rel = issue.get("file")
        expected_count = issue.get("count")
        if not date_iso or not file_rel:
            print(f"[{label}] Invalid issue entry: {issue}")
            return 1
        shard_path = base / file_rel
        if not shard_path.exists():
            print(f"[{label}] Missing shard: {shard_path}")
            return 1
        rows = load_json(shard_path)
        if len(rows) != expected_count:
            print(f"[{label}] Shard count mismatch on {date_iso}: expected={expected_count}, actual={len(rows)}")
            return 1
        total_from_shards += len(rows)

    if total_from_shards != total_rows:
        print(f"[{label}] Total row mismatch: manifest={total_rows}, shards={total_from_shards}")
        return 1

    auction_dates = {x.get("auction_date") for x in auctions}
    shard_dates = {x.get("auction_date") for x in issues}
    if shard_dates - auction_dates:
        print(f"[{label}] Some shard dates are missing in auctions.json:")
        for d in sorted(shard_dates - auction_dates):
            print(f"- {d}")
        return 1

    if len(preset) > 1000:
        print(f"[{label}] Preset too large: {len(preset)} rows")
        return 1

    for i in range(1, len(preset)):
        prev = preset[i - 1]
        curr = preset[i]
        prev_amt = prev.get("amount_hkd") if prev.get("amount_hkd") is not None else -1
        curr_amt = curr.get("amount_hkd") if curr.get("amount_hkd") is not None else -1
        if prev_amt < curr_amt:
            print(f"[{label}] Preset order is not amount_desc at row {i}")
            return 1

    print(f"[{label}] Data integrity OK")
    print(f"- issues: {len(issues)}")
    print(f"- total rows: {total_rows}")
    print(f"- preset rows: {len(preset)}")
    return 0


def main() -> int:
    datasets = [
        (DATA, "pvrm"),
        (DATA / "tvrm_physical", "tvrm_physical"),
        (DATA / "tvrm_eauction", "tvrm_eauction"),
        (DATA / "tvrm_legacy", "tvrm_legacy"),
    ]
    rc = 0
    for base, label in datasets:
        if not base.exists():
            continue
        # Only verify if it looks like a dataset directory.
        if not (base / "issues.manifest.json").exists():
            continue
        rc = max(rc, verify_dataset(base, label))
    return rc


if __name__ == "__main__":
    sys.exit(main())
