#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "all"
ISSUES_DIR = OUT / "issues"

DATASETS = {
    "pvrm": DATA,
    "tvrm_physical": DATA / "tvrm_physical",
    "tvrm_eauction": DATA / "tvrm_eauction",
    "tvrm_legacy": DATA / "tvrm_legacy",
}
DATASET_ORDER = {
    "pvrm": 0,
    "tvrm_physical": 1,
    "tvrm_eauction": 2,
    "tvrm_legacy": 3,
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


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


def plate_display(row: dict) -> str:
    if row.get("single_line"):
        return str(row["single_line"])
    double_line = row.get("double_line")
    if isinstance(double_line, list):
        return " ".join(str(part or "").strip() for part in double_line if str(part or "").strip()).strip()
    return ""


def compare_row(row: dict) -> tuple:
    amount = row.get("amount_hkd")
    return (
        -(int(amount) if amount is not None else -1),
        str(row.get("auction_date") or ""),
        DATASET_ORDER.get(str(row.get("dataset_key") or ""), 99),
        str(row.get("single_line") or ""),
    )


def compare_issue(row: dict) -> tuple:
    return (
        str(row.get("auction_date") or ""),
        DATASET_ORDER.get(str(row.get("dataset_key") or ""), 99),
    )


def exact_duplicate_key(row: dict) -> str:
    return json.dumps(
        [
            str(row.get("dataset_key") or ""),
            str(row.get("auction_date") or ""),
            str(row.get("date_precision") or ""),
            str(row.get("year_range") or ""),
            normalize_plate(row.get("single_line") or row.get("double_line")),
            row.get("amount_hkd"),
            str(row.get("result_status") or ""),
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def legacy_overlap_key(row: dict) -> str:
    normalized = normalize_plate(row.get("single_line") or row.get("double_line"))
    amount = row.get("amount_hkd")
    if row.get("date_precision") == "day" and row.get("auction_date"):
        return json.dumps([normalized, amount, str(row["auction_date"])], ensure_ascii=False, separators=(",", ":"))
    return json.dumps([normalized, amount], ensure_ascii=False, separators=(",", ":"))


def load_legacy_overlap_lookup() -> tuple[set[str], set[str], int]:
    physical = load_json(DATA / "tvrm_physical" / "results.slim.json")
    eauction = load_json(DATA / "tvrm_eauction" / "results.slim.json")
    legacy = load_json(DATA / "tvrm_legacy" / "results.slim.json")

    nonlegacy_exact = set()
    nonlegacy_coarse = set()
    for row in physical + eauction:
        tagged = {**row, "dataset_key": "nonlegacy"}
        nonlegacy_exact.add(
            json.dumps(
                [
                    normalize_plate(tagged.get("single_line") or tagged.get("double_line")),
                    tagged.get("amount_hkd"),
                    tagged.get("auction_date"),
                ],
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        nonlegacy_coarse.add(
            json.dumps(
                [
                    normalize_plate(tagged.get("single_line") or tagged.get("double_line")),
                    tagged.get("amount_hkd"),
                ],
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )

    overlap_exact: set[str] = set()
    overlap_coarse: set[str] = set()
    rows_to_drop = 0
    for row in legacy:
        key = legacy_overlap_key(row)
        if row.get("date_precision") == "day":
            if key in nonlegacy_exact:
                overlap_exact.add(key)
                rows_to_drop += 1
        elif key in nonlegacy_coarse:
            overlap_coarse.add(key)
            rows_to_drop += 1
    return overlap_exact, overlap_coarse, rows_to_drop


def row_richness(row: dict) -> int:
    score = 0
    if row.get("result_status") and row.get("result_status") != "unknown":
        score += 4
    if row.get("result_text"):
        score += 2
    if row.get("source_url"):
        score += 2
    if row.get("source_type"):
        score += 2
    if row.get("source_sheet"):
        score += 1
    if row.get("source_format"):
        score += 1
    if row.get("auction_date_label"):
        score += 1
    if row.get("date_precision"):
        score += 1
    if row.get("year_range"):
        score += 1
    if row.get("pdf_url"):
        score += 1
    return score


def merge_duplicate_rows(left: dict, right: dict) -> dict:
    base = dict(left)
    alt = dict(right)
    if row_richness(alt) > row_richness(base):
        base, alt = alt, base

    merged = dict(base)
    for key, value in alt.items():
        if merged.get(key) in (None, "", []):
            merged[key] = value

    pdf_urls = {str(x) for x in merged.get("pdf_urls") or [] if str(x)}
    source_urls = {str(x) for x in merged.get("source_urls") or [] if str(x)}
    for candidate in [left.get("pdf_url"), right.get("pdf_url")]:
        if candidate:
            pdf_urls.add(str(candidate))
    for candidate in [left.get("source_url"), right.get("source_url")]:
        if candidate:
            source_urls.add(str(candidate))
    if pdf_urls:
        merged["pdf_urls"] = sorted(pdf_urls)
    if source_urls:
        merged["source_urls"] = sorted(source_urls)
    if not merged.get("pdf_url") and pdf_urls:
        merged["pdf_url"] = sorted(pdf_urls)[0]
    if not merged.get("source_url") and source_urls:
        merged["source_url"] = sorted(source_urls)[0]
    return merged


def dedupe_issue_rows(rows: list[dict]) -> tuple[list[dict], int]:
    merged: dict[str, dict] = {}
    duplicates_removed = 0
    for row in rows:
        key = exact_duplicate_key(row)
        if key in merged:
            merged[key] = merge_duplicate_rows(merged[key], row)
            duplicates_removed += 1
            continue
        merged[key] = dict(row)
    deduped = list(merged.values())
    deduped.sort(key=compare_row)
    return deduped, duplicates_removed


def build_plate_summaries(rows: list[dict]) -> list[dict]:
    by_plate: dict[str, dict] = {}
    for row in rows:
        plate_norm = normalize_plate(row.get("single_line") or row.get("double_line"))
        if not plate_norm:
            continue
        summary = by_plate.get(plate_norm)
        amount = row.get("amount_hkd")
        amount_value = None if amount is None else int(amount)
        display = plate_display(row) or plate_norm
        row_date = str(row.get("auction_date") or "")
        if summary is None:
            by_plate[plate_norm] = {
                "plate_norm": plate_norm,
                "plate_display": display,
                "dataset_keys": {str(row.get("dataset_key") or "")},
                "auction_record_count": 1,
                "first_auction_date": row_date,
                "last_auction_date": row_date,
                "highest_amount_hkd": amount_value,
                "latest_amount_hkd": amount_value,
                "latest_dataset_key": str(row.get("dataset_key") or ""),
                "latest_auction_key": str(row.get("auction_key") or ""),
            }
            continue

        summary["auction_record_count"] += 1
        summary["dataset_keys"].add(str(row.get("dataset_key") or ""))
        if row_date and (not summary["first_auction_date"] or row_date < summary["first_auction_date"]):
            summary["first_auction_date"] = row_date
        if row_date and (not summary["last_auction_date"] or row_date > summary["last_auction_date"]):
            summary["last_auction_date"] = row_date
            summary["latest_amount_hkd"] = amount_value
            summary["latest_dataset_key"] = str(row.get("dataset_key") or "")
            summary["latest_auction_key"] = str(row.get("auction_key") or "")
        if amount_value is not None and (
            summary["highest_amount_hkd"] is None or amount_value > summary["highest_amount_hkd"]
        ):
            summary["highest_amount_hkd"] = amount_value
            summary["plate_display"] = display

    out = []
    for summary in by_plate.values():
        out.append(
            {
                **summary,
                "dataset_keys": sorted(x for x in summary["dataset_keys"] if x),
                "has_multiple_auction_records": summary["auction_record_count"] > 1,
            }
        )
    out.sort(key=lambda item: item["plate_norm"])
    return out


def build() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    if ISSUES_DIR.exists():
        shutil.rmtree(ISSUES_DIR)
    ISSUES_DIR.mkdir(parents=True, exist_ok=True)

    overlap_exact, overlap_coarse, overlap_rows = load_legacy_overlap_lookup()

    all_rows: list[dict] = []
    all_auctions_asc: list[dict] = []
    manifest_items_desc: list[dict] = []
    stats = {
        "input_rows": 0,
        "exact_duplicate_rows_removed": 0,
        "legacy_overlap_rows_removed": overlap_rows,
    }

    for dataset_key, base in DATASETS.items():
        manifest = load_json(base / "issues.manifest.json")
        auctions = load_json(base / "auctions.json")
        auctions_by_date = {str(item.get("auction_date") or ""): dict(item) for item in auctions}

        for issue in manifest.get("issues", []):
            auction_date = str(issue.get("auction_date") or "")
            if not auction_date:
                continue
            shard_rel = str(issue.get("file") or f"issues/{auction_date}.json")
            issue_rows = load_json(base / shard_rel)
            auction_meta = auctions_by_date.get(auction_date) or {"auction_date": auction_date}
            auction_key = f"{dataset_key}::{auction_date}"

            tagged_rows = []
            for row in issue_rows:
                item = dict(row)
                item["dataset_key"] = dataset_key
                item["auction_key"] = auction_key
                if item.get("auction_date_label") in (None, "") and auction_meta.get("auction_date_label") not in (None, ""):
                    item["auction_date_label"] = auction_meta.get("auction_date_label")
                if item.get("date_precision") in (None, "") and auction_meta.get("date_precision") not in (None, ""):
                    item["date_precision"] = auction_meta.get("date_precision")
                if item.get("year_range") in (None, "") and auction_meta.get("year_range") not in (None, ""):
                    item["year_range"] = auction_meta.get("year_range")
                if item.get("is_lny") is None and auction_meta.get("is_lny") is not None:
                    item["is_lny"] = bool(auction_meta.get("is_lny"))
                tagged_rows.append(item)

            stats["input_rows"] += len(tagged_rows)
            deduped_rows, removed = dedupe_issue_rows(tagged_rows)
            stats["exact_duplicate_rows_removed"] += removed

            visible_rows = []
            for row in deduped_rows:
                if dataset_key == "tvrm_legacy":
                    overlap_key = legacy_overlap_key(row)
                    overlap_bucket = overlap_exact if row.get("date_precision") == "day" else overlap_coarse
                    if overlap_key in overlap_bucket:
                        continue
                visible_rows.append(row)

            if not visible_rows:
                continue

            filename = f"{dataset_key}--{auction_date}.json"
            write_json(ISSUES_DIR / filename, visible_rows)
            all_rows.extend(visible_rows)

            issue_meta = {
                "auction_key": auction_key,
                "dataset_key": dataset_key,
                "auction_date": auction_date,
                "auction_date_label": auction_meta.get("auction_date_label"),
                "date_precision": auction_meta.get("date_precision"),
                "year_range": auction_meta.get("year_range"),
                "is_lny": bool(auction_meta.get("is_lny")),
                "pdf_url": auction_meta.get("pdf_url"),
                "entry_count": len(visible_rows),
                "total_sale_proceeds_hkd": auction_meta.get("total_sale_proceeds_hkd"),
                "error": auction_meta.get("error"),
            }
            all_auctions_asc.append(issue_meta)
            manifest_items_desc.append(
                {
                    **issue_meta,
                    "count": len(visible_rows),
                    "file": f"issues/{filename}",
                }
            )

    all_rows.sort(
        key=lambda row: (
            str(row.get("auction_date") or ""),
            DATASET_ORDER.get(str(row.get("dataset_key") or ""), 99),
            str(row.get("single_line") or ""),
        )
    )
    all_auctions_asc.sort(key=compare_issue)
    manifest_items_desc.sort(
        key=lambda row: (
            str(row.get("auction_date") or ""),
            -DATASET_ORDER.get(str(row.get("dataset_key") or ""), 99),
        ),
        reverse=True,
    )

    preset_amount_desc = sorted(all_rows, key=compare_row)[:1000]
    plate_summaries = build_plate_summaries(all_rows)

    audit_path = DATA / "audit.json"
    generated_at = None
    if audit_path.exists():
        generated_at = (load_json(audit_path) or {}).get("generated_at")

    manifest = {
        "dataset": "all",
        "generated_at": generated_at,
        "total_rows": len(all_rows),
        "issue_count": len(manifest_items_desc),
        "plate_count": len(plate_summaries),
        "issues": manifest_items_desc,
        "build_stats": stats,
    }

    write_json(OUT / "results.slim.json", all_rows)
    write_json(OUT / "auctions.json", all_auctions_asc)
    write_json(OUT / "issues.manifest.json", manifest)
    write_json(OUT / "preset.amount_desc.top1000.json", preset_amount_desc)
    write_json(OUT / "plates.json", plate_summaries)
    write_json(DATA / "all.preset.amount_desc.top1000.json", preset_amount_desc)

    print(
        json.dumps(
            {
                "dataset": "all",
                "total_rows": len(all_rows),
                "issue_count": len(manifest_items_desc),
                "plate_count": len(plate_summaries),
                **stats,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
