#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import hashlib
import importlib.util
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / ".tmp" / "cloudflare-public"
RESULTS_CHUNK_ROWS = 12000
MAX_WORKERS_ASSET_BYTES = 25 * 1024 * 1024
SEARCH_INDEX_SCHEMA_VERSION = 1

ROOT_FILES = [
    "index.html",
    "landing.html",
    "audit.html",
    "api.html",
    "camera.html",
    "changelog.html",
    "terms.html",
    "privacy.html",
    "mcp.html",
    "robots.txt",
    "sitemap.xml",
    "llms.txt",
    "agent.md",
    "skill.md",
    "sw.js",
]

ROOT_DIRS = [
    "assets",
    "mcp",
]

SPECIAL_ROOT_DIRS = [
    ".well-known",
]

API_V1_DATASETS = [
    "all",
    "pvrm",
    "tvrm_physical",
    "tvrm_eauction",
    "tvrm_legacy",
]

DATA_ROOT_FILES = [
    "TVRM auction result (1973-2026).xls",
    "TVRM auction result (2006-2026).xlsx",
    "all.prefix1.top200.json",
    "all.preset.amount_desc.top1000.json",
    "all.search.meta.json",
    "all.short_exact.json",
    "all.tvrm_legacy_overlap.json",
    "audit.json",
    "auctions.json",
    "events.json",
    "issues.manifest.json",
    "popular_plates_manifest.json",
    "preset.amount_desc.top1000.json",
    "tvrm_eauction/auctions.json",
    "tvrm_eauction/issues.manifest.json",
    "tvrm_eauction/preset.amount_desc.top1000.json",
    "tvrm_legacy/auctions.json",
    "tvrm_legacy/issues.manifest.json",
    "tvrm_legacy/preset.amount_desc.top1000.json",
    "tvrm_physical/auctions.json",
    "tvrm_physical/issues.manifest.json",
    "tvrm_physical/preset.amount_desc.top1000.json",
]

DATA_ROOT_DIRS = [
    "all.bigram",
    "all.char1",
    "all.prefix2",
    "hot_search",
]

IGNORE_BULKY_PATTERNS = (
    ".DS_Store",
    "__pycache__",
    "all",
    "pdfs",
    "results.json",
    "results.slim.json",
    "sources.tsv",
    "urls.txt",
    "urls.all.txt",
    "results.slim 2.json",
    "issues.manifest 2.json",
    "preset.amount_desc.top1000 2.json",
    "* 2",
    "* 3",
    "* 4",
    "* [2-9]",
    "* 2.json",
    "* 3.json",
    "* 4.json",
    "* 2.*",
    "* 3.*",
    "* [2-9].*",
    "* [0-9].html",
    "* 2.html",
    "* 3.html",
    "design-style-preview.css",
    "XXF5o5o5",
)


def copy_path(src: Path, dst: Path, *, allow_hidden: bool = False, ignore_patterns: tuple[str, ...] = ()) -> None:
    if src.name.startswith(".") and not allow_hidden:
        return
    if src.is_dir():
        shutil.copytree(
            src,
            dst,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(*IGNORE_BULKY_PATTERNS, *ignore_patterns),
            copy_function=copy_file_bytes,
        )
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    copy_file_bytes(src, dst)


def copy_file_bytes(src: str | Path, dst: str | Path) -> str:
    src_path = Path(src)
    dst_path = Path(dst)
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["cp", "-c", str(src_path), str(dst_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
        return str(dst_path)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Timed out clone-copying {src_path}; the file may be cloud-evicted.") from exc
    except (OSError, subprocess.CalledProcessError):
        pass
    with src_path.open("rb") as fsrc, dst_path.open("wb") as fdst:
        shutil.copyfileobj(fsrc, fdst, length=1024 * 1024)
    return str(dst_path)


def copy_optional_path(src: Path, dst: Path, *, allow_hidden: bool = False, ignore_patterns: tuple[str, ...] = ()) -> None:
    if not src.exists():
        return
    copy_path(src, dst, allow_hidden=allow_hidden, ignore_patterns=ignore_patterns)


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def normalize_search_plate(row: dict) -> str:
    value = row.get("single_line") or row.get("double_line") or ""
    if isinstance(value, list):
        value = "".join(str(part or "") for part in value)
    return re.sub(r"[^A-Z0-9]+", "", str(value).upper())


def build_complete_search_index(rows: list[dict], dataset_dir: Path) -> None:
    """Build compact, complete candidate shards for dynamic search.

    Search previously had to read every results chunk when a query missed the
    small curated indexes. Each shard below stores compact row arrays plus a
    shared metadata table, keeping arbitrary searches exact without copying the
    98 MB unified dataset into a Worker request.
    """
    search_dir = dataset_dir / "search-index"
    prefix_dir = search_dir / "prefix1"
    bigram_dir = search_dir / "bigram"
    prefix_dir.mkdir(parents=True, exist_ok=True)
    bigram_dir.mkdir(parents=True, exist_ok=True)

    row_metadata: list[list] = []
    row_metadata_ids: dict[str, int] = {}
    result_states: list[list] = []
    result_state_ids: dict[str, int] = {}
    prefix_rows: dict[str, list[list]] = {}
    bigram_rows: dict[str, list[list]] = {}

    for row in rows:
        plate = normalize_search_plate(row)
        if not plate:
            continue

        metadata = [
            row.get("dataset_key"),
            row.get("auction_key"),
            row.get("auction_date"),
            row.get("auction_date_label"),
            row.get("date_precision"),
            row.get("year_range"),
            row.get("is_lny"),
            row.get("pdf_url"),
            row.get("source_url"),
            row.get("source_format"),
            row.get("source_type"),
            row.get("source_sheet"),
        ]
        metadata_key = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        metadata_id = row_metadata_ids.get(metadata_key)
        if metadata_id is None:
            metadata_id = len(row_metadata)
            row_metadata_ids[metadata_key] = metadata_id
            row_metadata.append(metadata)

        result_state = [row.get("result_status"), row.get("result_text")]
        result_state_key = json.dumps(result_state, ensure_ascii=False, separators=(",", ":"))
        result_state_id = result_state_ids.get(result_state_key)
        if result_state_id is None:
            result_state_id = len(result_states)
            result_state_ids[result_state_key] = result_state_id
            result_states.append(result_state)

        compact_row = [
            metadata_id,
            row.get("single_line"),
            row.get("double_line"),
            row.get("amount_hkd"),
            result_state_id,
        ]
        prefix_rows.setdefault(plate[0], []).append(compact_row)
        for token in {plate[idx:idx + 2] for idx in range(len(plate) - 1)}:
            bigram_rows.setdefault(token, []).append(compact_row)

    write_json(search_dir / "meta.json", {
        "schema_version": SEARCH_INDEX_SCHEMA_VERSION,
        "row_metadata": row_metadata,
        "result_states": result_states,
        "prefix_counts": {token: len(bucket) for token, bucket in sorted(prefix_rows.items())},
        "bigram_counts": {token: len(bucket) for token, bucket in sorted(bigram_rows.items())},
    })
    for token, bucket in sorted(prefix_rows.items()):
        write_json(prefix_dir / f"{token}.json", {"rows": bucket})
    for token, bucket in sorted(bigram_rows.items()):
        write_json(bigram_dir / f"{token}.json", {"rows": bucket})


def load_complete_search_index_rows() -> list[dict]:
    """Load every child dataset row before unified-view overlap filtering."""
    rows: list[dict] = []
    for dataset in API_V1_DATASETS:
        if dataset == "all":
            continue
        source = ROOT / "api" / "v1" / dataset / "results.slim.json"
        if not source.exists():
            continue
        auctions_source = ROOT / "api" / "v1" / dataset / "auctions.json"
        auctions = json.loads(auctions_source.read_text()) if auctions_source.exists() else []
        auctions_by_date = {
            str(auction.get("auction_date") or ""): auction
            for auction in auctions
            if isinstance(auction, dict)
        }
        for source_row in json.loads(source.read_text()):
            row = dict(source_row)
            auction_date = str(row.get("auction_date") or "")
            auction = auctions_by_date.get(auction_date, {})
            row["dataset_key"] = dataset
            row["auction_key"] = f"{dataset}::{auction_date}" if auction_date else ""
            for key in ("auction_date_label", "date_precision", "year_range"):
                if row.get(key) is None and auction.get(key) is not None:
                    row[key] = auction[key]
            row["is_lny"] = bool(row.get("is_lny") if row.get("is_lny") is not None else auction.get("is_lny"))
            for key in ("pdf_url", "source_url", "source_format", "source_type", "source_sheet"):
                if not row.get(key) and auction.get(key):
                    row[key] = auction[key]
            rows.append(row)
    return rows


def copy_public_data_files() -> None:
    data_root = ROOT / "data"
    target_data = TARGET / "data"
    for rel in DATA_ROOT_FILES:
        copy_path(data_root / rel, target_data / rel)
    for rel in DATA_ROOT_DIRS:
        copy_optional_path(data_root / rel, target_data / rel)


def copy_private_market_signals(*, required: bool = False) -> None:
    source = ROOT / "data" / "market" / "28car.active.json"
    if not source.exists():
        if required:
            raise RuntimeError(
                "A fresh private market snapshot is required for deploys; run scripts/scrape_28car_market.py first"
            )
        return
    payload = json.loads(source.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1 or payload.get("source") != "28car":
        raise RuntimeError("Invalid 28car market signal schema")
    signals = payload.get("signals")
    if not isinstance(signals, dict):
        raise RuntimeError("Invalid 28car market signal payload")
    allowed_offer_fields = {
        "listing_id",
        "source_url",
        "price_type",
        "asking_price_hkd",
        "first_seen_at",
        "last_seen_at",
    }
    for plate_norm, offers in signals.items():
        if not isinstance(offers, list):
            raise RuntimeError(f"Invalid 28car offers for {plate_norm}")
        if any(not isinstance(offer, dict) or set(offer) != allowed_offer_fields for offer in offers):
            raise RuntimeError(f"Non-allowlisted 28car fields for {plate_norm}")
    if required:
        if payload.get("coverage", {}).get("complete") is not True:
            raise RuntimeError("A complete 28car market snapshot is required for deploys")
        try:
            scraped_at = datetime.fromisoformat(str(payload.get("scraped_at") or "").replace("Z", "+00:00"))
        except ValueError as exc:
            raise RuntimeError("Invalid 28car market snapshot timestamp") from exc
        fresh_hours = max(1, min(168, int(payload.get("fresh_for_hours") or 72)))
        now = datetime.now(timezone.utc)
        if scraped_at < now - timedelta(hours=fresh_hours) or scraped_at > now + timedelta(minutes=10):
            raise RuntimeError("The private 28car market snapshot is outside its freshness window")
    target = TARGET / "_market" / "28car"
    metadata = {key: value for key, value in payload.items() if key != "signals"}
    shards: dict[str, dict] = {}
    for plate_norm, offers in signals.items():
        shard = str(plate_norm or "")[:1]
        if not re.fullmatch(r"[A-Z0-9]", shard):
            continue
        shards.setdefault(shard, {})[plate_norm] = offers
    write_json(target / "manifest.json", {
        **metadata,
        "shards": sorted(shards),
    })
    for shard, shard_signals in sorted(shards.items()):
        write_json(target / f"{shard}.json", {
            "schema_version": payload.get("schema_version"),
            "source": payload.get("source"),
            "scraped_at": payload.get("scraped_at"),
            "fresh_for_hours": payload.get("fresh_for_hours"),
            "coverage": payload.get("coverage"),
            "signals": shard_signals,
        })


def copy_plate_pages() -> None:
    target_plates = TARGET / "plates"
    target_plates.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location(
        "build_popular_plate_pages",
        ROOT / "scripts" / "build_popular_plate_pages.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load build_popular_plate_pages.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    entries = module.build_plate_data()
    entries_by_norm = {entry["plate_norm"]: entry for entry in entries}
    for idx, entry in enumerate(entries):
        related = entries[max(0, idx - 4): idx] + entries[idx + 1: idx + 5]
        page = module.render_page(entries_by_norm, entry, related)
        (target_plates / f"{entry['plate_norm']}.html").write_text(page, encoding="utf-8")
    (target_plates / "index.html").write_text(module.render_index(entries), encoding="utf-8")
    (TARGET / "about.html").write_text(module.render_about(), encoding="utf-8")


def build_results_chunks(dataset: str) -> None:
    src = ROOT / "api" / "v1" / dataset / "results.slim.json"
    if not src.exists():
        return
    rows = json.loads(src.read_text())
    dataset_dir = TARGET / "api" / "v1" / dataset
    chunks_dir = dataset_dir / "results.chunks"
    if chunks_dir.exists():
        shutil.rmtree(chunks_dir)
    chunks_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "dataset": dataset,
        "total_rows": len(rows),
        "chunk_rows": RESULTS_CHUNK_ROWS,
        "chunks": [],
    }
    for idx in range(0, len(rows), RESULTS_CHUNK_ROWS):
        chunk = rows[idx:idx + RESULTS_CHUNK_ROWS]
        filename = f"{idx // RESULTS_CHUNK_ROWS:04d}.json"
        rel_file = f"results.chunks/{filename}"
        write_json(dataset_dir / rel_file, chunk)
        manifest["chunks"].append({
            "file": rel_file,
            "count": len(chunk),
            "start": idx,
            "end": idx + len(chunk) - 1,
        })
    write_json(dataset_dir / "results.chunks.json", manifest)


def prune_oversized_assets() -> None:
    publish_index_path = TARGET / "api" / "v1" / "index.json"
    publish_index = json.loads(publish_index_path.read_text()) if publish_index_path.exists() else None
    oversized_paths = [
        TARGET / "data" / "all" / "plates.json",
        TARGET / "api" / "v1" / "all" / "plates.json",
    ]
    removed = False
    for path in oversized_paths:
        if path.exists() and path.stat().st_size > MAX_WORKERS_ASSET_BYTES:
            path.unlink()
            removed = True
    if removed and isinstance(publish_index, dict):
        datasets = publish_index.get("datasets")
        if isinstance(datasets, dict):
            all_dataset = datasets.get("all")
            if isinstance(all_dataset, dict):
                files = all_dataset.get("files")
                if isinstance(files, dict):
                    files.pop("plates", None)
        write_json(publish_index_path, publish_index)


def publish_fingerprint() -> str:
    digest = hashlib.sha256()
    for path in sorted(p for p in TARGET.rglob("*") if p.is_file() and p.name != "sw.js"):
        rel = path.relative_to(TARGET).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:12]


def stamp_service_worker_cache_name() -> None:
    sw_path = TARGET / "sw.js"
    if not sw_path.exists():
        return
    source = sw_path.read_text(encoding="utf-8")
    fingerprint = publish_fingerprint()
    stamped = re.sub(
        r"const CACHE_NAME = ['\"][^'\"]+['\"];",
        f"const CACHE_NAME = 'pvrm-static-{fingerprint}';",
        source,
        count=1,
    )
    sw_path.write_text(stamped, encoding="utf-8")


def main(*, require_market_snapshot: bool = False) -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True, exist_ok=True)

    for rel in ROOT_FILES:
        copy_path(ROOT / rel, TARGET / rel)

    for rel in ROOT_DIRS:
        copy_path(ROOT / rel, TARGET / rel)

    copy_plate_pages()

    copy_public_data_files()
    copy_private_market_signals(required=require_market_snapshot)

    for rel in SPECIAL_ROOT_DIRS:
        copy_path(ROOT / rel, TARGET / rel, allow_hidden=True)

    api_dir = TARGET / "api"
    api_dir.mkdir(parents=True, exist_ok=True)
    copy_path(ROOT / "api" / "openapi.yaml", api_dir / "openapi.yaml")
    api_v1_dir = api_dir / "v1"
    api_v1_dir.mkdir(parents=True, exist_ok=True)
    copy_path(ROOT / "api" / "v1" / "index.json", api_v1_dir / "index.json")
    for dataset in API_V1_DATASETS:
        copy_path(ROOT / "api" / "v1" / dataset, api_v1_dir / dataset)
        build_results_chunks(dataset)
    build_complete_search_index(load_complete_search_index_rows(), api_v1_dir / "all")
    prune_oversized_assets()
    stamp_service_worker_cache_name()

    print(f"Built Cloudflare publish directory at {TARGET}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-market-snapshot", action="store_true")
    args = parser.parse_args()
    main(require_market_snapshot=args.require_market_snapshot)
