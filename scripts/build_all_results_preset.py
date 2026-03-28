#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_plate(value) -> str:
    if isinstance(value, list):
        raw = "".join(str(x or "") for x in value)
    elif value is None:
        raw = ""
    else:
        raw = str(value)
    return raw.upper().replace(" ", "").replace("I", "1").replace("O", "0").replace("Q", "").strip()


def duplicate_key_for_row(row: dict) -> str:
    normalized = normalize_plate(row.get("single_line") or row.get("double_line"))
    amount = row.get("amount_hkd")
    if row.get("date_precision") == "day" and row.get("auction_date"):
        return json.dumps([normalized, amount, str(row["auction_date"])], ensure_ascii=False, separators=(",", ":"))
    return json.dumps([normalized, amount], ensure_ascii=False, separators=(",", ":"))


def sort_key(row: dict):
    amount = row.get("amount_hkd")
    amount = -1 if amount is None else int(amount)
    date = str(row.get("auction_date") or "")
    plate = str(row.get("single_line") or "")
    return (-amount, date, plate)


def main() -> None:
    sources = [
        ("pvrm", DATA / "preset.amount_desc.top1000.json"),
        ("tvrm_physical", DATA / "tvrm_physical" / "preset.amount_desc.top1000.json"),
        ("tvrm_eauction", DATA / "tvrm_eauction" / "preset.amount_desc.top1000.json"),
        ("tvrm_legacy", DATA / "tvrm_legacy" / "preset.amount_desc.top1000.json"),
    ]
    overlap = load_json(DATA / "all.tvrm_legacy_overlap.json")
    overlap_coarse = set(overlap.get("keys") or [])
    overlap_exact = set(overlap.get("exact_keys") or [])

    merged: list[dict] = []
    for dataset_key, path in sources:
        rows = load_json(path)
        for row in rows:
            item = dict(row)
            item["dataset_key"] = dataset_key
            if dataset_key == "tvrm_legacy":
                key = duplicate_key_for_row(item)
                bucket = overlap_exact if item.get("date_precision") == "day" else overlap_coarse
                if key in bucket:
                    continue
            merged.append(item)

    merged.sort(key=sort_key)
    out = merged[:1000]
    target = DATA / "all.preset.amount_desc.top1000.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {target} rows={len(out)}")


if __name__ == "__main__":
    main()
