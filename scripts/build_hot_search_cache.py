#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT_DIR = DATA / "hot_search" / "all_amount_desc"
OUT_MANIFEST = DATA / "hot_search" / "manifest.json"
POPULAR_MANIFEST = DATA / "popular_plates_manifest.json"
OVERLAP = DATA / "all.tvrm_legacy_overlap.json"

DATASET_DIRS = {
    "pvrm": DATA,
    "tvrm_physical": DATA / "tvrm_physical",
    "tvrm_eauction": DATA / "tvrm_eauction",
    "tvrm_legacy": DATA / "tvrm_legacy",
}

MAX_QUERIES = 240
MAX_ROWS = 200
CURATED = [
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


def load_overlap_keys() -> tuple[set[str], set[str]]:
    raw = load_json(OVERLAP)
    return set(raw.get("exact_keys") or []), set(raw.get("keys") or [])


def should_drop_legacy_row(row: dict, overlap_exact: set[str], overlap_coarse: set[str]) -> bool:
    if row.get("dataset_key") != "tvrm_legacy":
        return False
    if row.get("date_precision") == "day":
        return exact_overlap_key(row) in overlap_exact
    return coarse_overlap_key(row) in overlap_coarse


def candidate_queries() -> list[str]:
    popular = load_json(POPULAR_MANIFEST)
    out: list[str] = []
    seen: set[str] = set()

    def add(q: str) -> None:
        norm = normalize_plate(q)
        if len(norm) < 1 or norm in seen:
            return
        seen.add(norm)
        out.append(norm)

    for q in CURATED:
        add(q)
    for item in popular[:MAX_QUERIES]:
        display = str(item.get("plate_display") or item.get("plate_norm") or "")
        norm = normalize_plate(display)
        add(norm)
        for width in (2, 3, 4):
            if len(norm) >= width:
                add(norm[:width])
    return out


def trim_bucket(rows: list[dict], limit: int) -> list[dict]:
    rows.sort(key=compare_rows)
    del rows[limit:]
    return rows


def build() -> int:
    overlap_exact, overlap_coarse = load_overlap_keys()
    queries = candidate_queries()
    query_set = set(queries)
    query_lengths = sorted({len(q) for q in queries})
    totals = {q: 0 for q in queries}
    top_rows = {q: [] for q in queries}

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for dataset_key in ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"]:
        for row in iter_dataset_rows(dataset_key):
            if should_drop_legacy_row(row, overlap_exact, overlap_coarse):
                continue
            plate = plate_norm_for_row(row)
            if not plate:
                continue
            matched_queries: set[str] = set()
            for size in query_lengths:
                if size > len(plate):
                    continue
                for start in range(0, len(plate) - size + 1):
                    token = plate[start : start + size]
                    if token in query_set:
                        matched_queries.add(token)
            for query in matched_queries:
                totals[query] += 1
                bucket = top_rows[query]
                bucket.append(row)
                if len(bucket) > MAX_ROWS * 2:
                    trim_bucket(bucket, MAX_ROWS)

    manifest: list[dict] = []
    for query in queries:
        rows = top_rows[query]
        if not totals[query]:
            continue
        trim_bucket(rows, MAX_ROWS)
        payload = {
            "dataset": "all",
            "q": query,
            "issue": None,
            "sort": "amount_desc",
            "page": 1,
            "page_size": MAX_ROWS,
            "total": totals[query],
            "rows": rows,
            "cached_rows": len(rows),
        }
        (OUT_DIR / f"{query}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        manifest.append({"q": query, "total": totals[query], "cached_rows": len(rows)})

    OUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    OUT_MANIFEST.write_text(
        json.dumps(
            {
                "dataset": "all",
                "sort": "amount_desc",
                "query_count": len(manifest),
                "queries": manifest,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Built {len(manifest)} hot search cache files into {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
