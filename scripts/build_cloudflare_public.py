#!/usr/bin/env python3
from __future__ import annotations

import json
import hashlib
import importlib.util
import re
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / ".tmp" / "cloudflare-public"
RESULTS_CHUNK_ROWS = 12000
MAX_WORKERS_ASSET_BYTES = 25 * 1024 * 1024

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


def copy_public_data_files() -> None:
    data_root = ROOT / "data"
    target_data = TARGET / "data"
    for rel in DATA_ROOT_FILES:
        copy_path(data_root / rel, target_data / rel)
    for rel in DATA_ROOT_DIRS:
        copy_optional_path(data_root / rel, target_data / rel)


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


def main() -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True, exist_ok=True)

    for rel in ROOT_FILES:
        copy_path(ROOT / rel, TARGET / rel)

    for rel in ROOT_DIRS:
        copy_path(ROOT / rel, TARGET / rel)

    copy_plate_pages()

    copy_public_data_files()

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
    prune_oversized_assets()
    stamp_service_worker_cache_name()

    print(f"Built Cloudflare publish directory at {TARGET}")


if __name__ == "__main__":
    main()
