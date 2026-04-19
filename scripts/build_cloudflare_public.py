#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
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
    "data",
    "plates",
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

IGNORE_BULKY_PATTERNS = (
    ".DS_Store",
    "__pycache__",
    "pdfs",
    "results.json",
    "results.slim.json",
    "sources.tsv",
    "urls.txt",
    "urls.all.txt",
    "results.slim 2.json",
    "issues.manifest 2.json",
    "preset.amount_desc.top1000 2.json",
    "* 2.json",
    "* 3.json",
    "* 2.html",
    "* 3.html",
)


def copy_path(src: Path, dst: Path, *, allow_hidden: bool = False) -> None:
    if src.name.startswith(".") and not allow_hidden:
        return
    if src.is_dir():
        shutil.copytree(
            src,
            dst,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(*IGNORE_BULKY_PATTERNS),
        )
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


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


def main() -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True, exist_ok=True)

    for rel in ROOT_FILES:
        copy_path(ROOT / rel, TARGET / rel)

    for rel in ROOT_DIRS:
        copy_path(ROOT / rel, TARGET / rel)

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

    print(f"Built Cloudflare publish directory at {TARGET}")


if __name__ == "__main__":
    main()
