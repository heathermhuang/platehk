#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
POPULAR_MANIFEST = DATA / "popular_plates_manifest.json"
OUT_SHORT = DATA / "all.short_exact.json"
OUT_PREFIX1 = DATA / "all.prefix1.top200.json"
OUT_TVRM_DEDUPE = DATA / "all.tvrm_legacy_overlap.json"
OUT_SEARCH_META = DATA / "all.search.meta.json"
OUT_CHAR1_DIR = DATA / "all.char1"
OUT_BIGRAM_DIR = DATA / "all.bigram"
OUT_PREFIX2_DIR = DATA / "all.prefix2"

MAX_PREFIX1_ROWS = 600
MAX_PREFIX2_ROWS = 1000
MIN_PREFIX2_TOTAL_TO_PUBLISH = 1000
MAX_CHAR1_ROWS = 600
MAX_COMPLETE_BIGRAM_ROWS = 500
MAX_POPULAR_INDEX_QUERIES = 240
CURATED_INDEX_QUERIES = [
    "88",
    "8888",
    "HK",
    "AA",
    "AB",
    "XX",
    "VV",
    "A1",
    "HK88",
    "HK8",
]


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


def iter_all_rows():
    rows = load_json(DATA / "all" / "results.slim.json")
    for row in rows:
        yield row


def targeted_query_tokens() -> tuple[set[str], set[str]]:
    values: list[str] = []
    values.extend(CURATED_INDEX_QUERIES)
    if POPULAR_MANIFEST.exists():
        for item in load_json(POPULAR_MANIFEST)[:MAX_POPULAR_INDEX_QUERIES]:
            values.append(str(item.get("plate_norm") or item.get("plate_display") or ""))

    prefix2: set[str] = set()
    bigrams: set[str] = set()
    for value in values:
        norm = normalize_plate(value)
        if len(norm) >= 2:
            prefix2.add(norm[:2])
        for idx in range(0, max(0, len(norm) - 1)):
            token = norm[idx : idx + 2]
            if len(token) == 2:
                bigrams.add(token)
    return prefix2, bigrams


def compare_rows_for_query(query: str):
    def _key(row: dict) -> tuple:
        norm = plate_norm_for_row(row)
        rank = 0 if norm == query else 1
        return (rank, *compare_rows(row))

    return _key


def trim_bucket(rows: list[dict], limit: int, query: str = "") -> list[dict]:
    rows.sort(key=compare_rows_for_query(query) if query else compare_rows)
    del rows[limit:]
    return rows


def build() -> int:
    short_exact: dict[str, list[dict]] = {}
    prefix1_rows: dict[str, list[dict]] = {}
    prefix1_totals: dict[str, int] = {}
    prefix2_rows: dict[str, list[dict]] = {}
    prefix2_totals: dict[str, int] = {}
    char1_rows: dict[str, list[dict]] = {}
    char1_totals: dict[str, int] = {}
    bigram_rows: dict[str, list[dict]] = {}
    bigram_totals: dict[str, int] = {}

    legacy_overlap_exact_keys: set[str] = set()
    legacy_overlap_coarse_keys: set[str] = set()
    legacy_overlap_rows = 0
    overlap_samples: list[dict] = []
    target_prefix2, target_bigrams = targeted_query_tokens()

    physical = load_json(DATA / "tvrm_physical" / "results.slim.json")
    eauction = load_json(DATA / "tvrm_eauction" / "results.slim.json")
    legacy = load_json(DATA / "tvrm_legacy" / "results.slim.json")
    nonlegacy_exact_keys = {exact_overlap_key(tag_row("nonlegacy", row)) for row in physical + eauction}
    nonlegacy_coarse_keys = {coarse_overlap_key(tag_row("nonlegacy", row)) for row in physical + eauction}

    for row in legacy:
        if row.get("date_precision") == "day":
            key = exact_overlap_key(tag_row("tvrm_legacy", row))
            if key in nonlegacy_exact_keys:
                legacy_overlap_exact_keys.add(key)
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
        else:
            key = coarse_overlap_key(tag_row("tvrm_legacy", row))
            if key in nonlegacy_coarse_keys:
                legacy_overlap_coarse_keys.add(key)
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

    for row in iter_all_rows():
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
                trim_bucket(bucket, MAX_PREFIX1_ROWS, prefix)

        prefix2 = norm[:2]
        if len(prefix2) == 2 and prefix2 in target_prefix2:
            prefix2_totals[prefix2] = prefix2_totals.get(prefix2, 0) + 1
            bucket = prefix2_rows.setdefault(prefix2, [])
            bucket.append(row)
            if len(bucket) > MAX_PREFIX2_ROWS * 2:
                trim_bucket(bucket, MAX_PREFIX2_ROWS, prefix2)

        for char in sorted(set(norm)):
            char1_totals[char] = char1_totals.get(char, 0) + 1
            bucket = char1_rows.setdefault(char, [])
            bucket.append(row)
            if len(bucket) > MAX_CHAR1_ROWS * 2:
                trim_bucket(bucket, MAX_CHAR1_ROWS, char)

        for token in sorted({norm[idx : idx + 2] for idx in range(0, max(0, len(norm) - 1)) if len(norm[idx : idx + 2]) == 2}):
            if token not in target_bigrams:
                continue
            bigram_totals[token] = bigram_totals.get(token, 0) + 1
            bucket = bigram_rows.setdefault(token, [])
            if len(bucket) <= MAX_COMPLETE_BIGRAM_ROWS:
                bucket.append(row)

    for q, rows in short_exact.items():
        rows.sort(key=compare_rows_for_query(q))
    for q, rows in prefix1_rows.items():
        trim_bucket(rows, MAX_PREFIX1_ROWS, q)
    for q, rows in prefix2_rows.items():
        trim_bucket(rows, MAX_PREFIX2_ROWS, q)
    for q, rows in char1_rows.items():
        trim_bucket(rows, MAX_CHAR1_ROWS, q)
    complete_bigram_rows = {
        q: rows
        for q, rows in bigram_rows.items()
        if bigram_totals.get(q, 0) <= MAX_COMPLETE_BIGRAM_ROWS
    }
    for q, rows in complete_bigram_rows.items():
        rows.sort(key=compare_rows_for_query(q))

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

    publishable_prefix2_rows = {
        q: rows
        for q, rows in prefix2_rows.items()
        if prefix2_totals.get(q, 0) >= MIN_PREFIX2_TOTAL_TO_PUBLISH
    }

    for q, rows in sorted(publishable_prefix2_rows.items()):
        (OUT_PREFIX2_DIR / f"{q}.json").write_text(
            json.dumps(
                {
                    "total": prefix2_totals.get(q, len(rows)),
                    "cached_rows": len(rows),
                    "rows": rows,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
    for q, rows in sorted(char1_rows.items()):
        (OUT_CHAR1_DIR / f"{q}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    for q, rows in sorted(complete_bigram_rows.items()):
        (OUT_BIGRAM_DIR / f"{q}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

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
                "prefix1_cached_rows_per_key": MAX_PREFIX1_ROWS,
                "prefix2_keys": len(publishable_prefix2_rows),
                "prefix2_cached_rows_per_key": MAX_PREFIX2_ROWS,
                "prefix2_min_total_to_publish": MIN_PREFIX2_TOTAL_TO_PUBLISH,
                "char1_keys": len(char1_rows),
                "char1_cached_rows_per_key": MAX_CHAR1_ROWS,
                "bigram_keys": len(complete_bigram_rows),
                "bigram_max_complete_rows": MAX_COMPLETE_BIGRAM_ROWS,
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
