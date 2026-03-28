#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT_SHORT = DATA / "all.short_exact.json"
OUT_PREFIX1 = DATA / "all.prefix1.top200.json"
OUT_TVRM_DEDUPE = DATA / "all.tvrm_legacy_overlap.json"
OUT_SEARCH_META = DATA / "all.search.meta.json"
OUT_CHAR1_DIR = DATA / "all.char1"
OUT_BIGRAM_DIR = DATA / "all.bigram"
OUT_PREFIX2_DIR = DATA / "all.prefix2"

DATASET_DIRS = {
    "pvrm": DATA,
    "tvrm_physical": DATA / "tvrm_physical",
    "tvrm_eauction": DATA / "tvrm_eauction",
    "tvrm_legacy": DATA / "tvrm_legacy",
}

MAX_PREFIX1_ROWS = 200


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_plate(value) -> str:
    if isinstance(value, list):
        raw = "".join(str(x or "") for x in value)
    elif value is None:
        raw = ""
    else:
        raw = str(value)
    return (
        raw.upper()
        .replace(" ", "")
        .replace("I", "1")
        .replace("O", "0")
        .replace("Q", "")
        .strip()
    )


def plate_norm_for_row(row: dict) -> str:
    return normalize_plate(row.get("single_line") or row.get("double_line"))


def exact_overlap_key(row: dict) -> str:
    return json.dumps(
        [plate_norm_for_row(row), row.get("amount_hkd"), row.get("auction_date")],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def coarse_overlap_key(row: dict) -> str:
    return json.dumps(
        [plate_norm_for_row(row), row.get("amount_hkd")],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def should_drop_legacy_row(row: dict, overlap_exact: set[str], overlap_coarse: set[str]) -> bool:
    if row.get("dataset_key") != "tvrm_legacy":
        return False
    if row.get("date_precision") == "day":
        return exact_overlap_key(row) in overlap_exact
    return coarse_overlap_key(row) in overlap_coarse


def compare_rows(row: dict) -> tuple:
    amount = row.get("amount_hkd")
    amount_sort = -(int(amount) if amount is not None else -1)
    return (
        amount_sort,
        str(row.get("auction_date") or ""),
        str(row.get("single_line") or ""),
    )


def tag_row(dataset_key: str, row: dict) -> dict:
    return {
        **row,
        "dataset_key": dataset_key,
        "auction_key": f"{dataset_key}::{row.get('auction_date') or ''}",
    }


def iter_dataset_rows(dataset_key: str):
    base = DATASET_DIRS[dataset_key]
    manifest = load_json(base / "issues.manifest.json")
    for issue in manifest.get("issues", []):
        file_rel = issue.get("file")
        if not file_rel:
            continue
        rows = load_json(base / file_rel)
        for row in rows:
            yield tag_row(dataset_key, row)


def trim_bucket(rows: list[dict], limit: int) -> list[dict]:
    rows.sort(key=compare_rows)
    del rows[limit:]
    return rows


def build() -> int:
    short_exact: dict[str, list[dict]] = {}
    prefix1_rows: dict[str, list[dict]] = {}
    prefix1_totals: dict[str, int] = {}

    nonlegacy_exact_keys: set[str] = set()
    nonlegacy_coarse_keys: set[str] = set()
    legacy_overlap_exact_keys: set[str] = set()
    legacy_overlap_coarse_keys: set[str] = set()
    legacy_overlap_rows = 0
    overlap_samples: list[dict] = []

    dataset_order = ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"]

    for dataset_key in dataset_order:
        for row in iter_dataset_rows(dataset_key):
            if dataset_key != "tvrm_legacy":
                nonlegacy_exact_keys.add(exact_overlap_key(row))
                nonlegacy_coarse_keys.add(coarse_overlap_key(row))
            else:
                drop = False
                if row.get("date_precision") == "day":
                    key = exact_overlap_key(row)
                    if key in nonlegacy_exact_keys:
                        legacy_overlap_exact_keys.add(key)
                        drop = True
                else:
                    key = coarse_overlap_key(row)
                    if key in nonlegacy_coarse_keys:
                        legacy_overlap_coarse_keys.add(key)
                        drop = True
                if drop:
                    legacy_overlap_rows += 1
                    if len(overlap_samples) < 50:
                        overlap_samples.append(
                            {
                                "single_line": row.get("single_line"),
                                "amount_hkd": row.get("amount_hkd"),
                                "auction_date": row.get("auction_date"),
                                "auction_date_label": row.get("auction_date_label"),
                                "date_precision": row.get("date_precision"),
                            }
                        )
                    continue

            norm = plate_norm_for_row(row)
            if not norm:
                continue

            if len(norm) <= 2:
                short_exact.setdefault(norm, []).append(row)

            prefix = norm[:1]
            if prefix:
                prefix1_totals[prefix] = prefix1_totals.get(prefix, 0) + 1
                bucket = prefix1_rows.setdefault(prefix, [])
                bucket.append(row)
                if len(bucket) > MAX_PREFIX1_ROWS * 2:
                    trim_bucket(bucket, MAX_PREFIX1_ROWS)

    for q, rows in short_exact.items():
        rows.sort(key=compare_rows)
    for q, rows in prefix1_rows.items():
        trim_bucket(rows, MAX_PREFIX1_ROWS)

    OUT_SHORT.write_text(json.dumps(short_exact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUT_PREFIX1.write_text(
        json.dumps(
            {
                q: {"total": prefix1_totals.get(q, len(rows)), "rows": rows}
                for q, rows in sorted(prefix1_rows.items())
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    for path in [OUT_CHAR1_DIR, OUT_BIGRAM_DIR, OUT_PREFIX2_DIR]:
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)

    OUT_TVRM_DEDUPE.write_text(
        json.dumps(
            {
                "keys": sorted(legacy_overlap_coarse_keys),
                "exact_keys": sorted(legacy_overlap_exact_keys),
                "rows_to_drop": legacy_overlap_rows,
                "sample_rows": overlap_samples,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    OUT_SEARCH_META.write_text(
        json.dumps(
            {
                "prefix1_keys": len(prefix1_rows),
                "prefix2_keys": 0,
                "char1_keys": 0,
                "bigram_keys": 0,
                "short_exact_keys": len(short_exact),
                "legacy_overlap_keys": len(legacy_overlap_coarse_keys),
                "legacy_overlap_exact_keys": len(legacy_overlap_exact_keys),
                "legacy_overlap_rows": legacy_overlap_rows,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
