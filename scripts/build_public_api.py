#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
API = ROOT / "api" / "v1"


DATASETS = {
    "pvrm": DATA,
    "tvrm_physical": DATA / "tvrm_physical",
    "tvrm_eauction": DATA / "tvrm_eauction",
    "tvrm_legacy": DATA / "tvrm_legacy",
}


def _read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def _write_json(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def build() -> int:
    audit_p = DATA / "audit.json"
    generated_at = None
    if audit_p.exists():
        generated_at = (_read_json(audit_p) or {}).get("generated_at")

    index = {
        "version": "v1",
        "generated_at": generated_at,
        "datasets": {},
        "notes": [
            "All data comes from Transport Department published PDFs and official workbook exports. If any discrepancy is found, the official published results shall prevail.",
            "This API is a static Open Data API. For full-text search, use the issue shards and build your own index, or use an external query service.",
        ],
    }

    # Build a stable API tree that mirrors the existing data files.
    for key, base in DATASETS.items():
        out = API / key
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True, exist_ok=True)

        manifest = _read_json(base / "issues.manifest.json")
        auctions = _read_json(base / "auctions.json")

        # Copy core files
        _copy(base / "issues.manifest.json", out / "issues.manifest.json")
        _copy(base / "auctions.json", out / "auctions.json")
        _copy(base / "results.slim.json", out / "results.slim.json")
        _copy(base / "preset.amount_desc.top1000.json", out / "preset.amount_desc.top1000.json")

        # Copy per-issue shards
        issues_dir = base / "issues"
        for item in manifest.get("issues", []):
            f = item.get("file")
            if not f:
                continue
            src = base / f
            dst = out / f
            if src.exists():
                _copy(src, dst)

        index["datasets"][key] = {
            "base": f"/api/v1/{key}",
            "issue_count": int(manifest.get("issue_count") or 0),
            "total_rows": int(manifest.get("total_rows") or 0),
            "latest_issue": (manifest.get("issues") or [{}])[0].get("auction_date") if manifest.get("issues") else None,
            "files": {
                "issues_manifest": f"/api/v1/{key}/issues.manifest.json",
                "auctions": f"/api/v1/{key}/auctions.json",
                "results_slim": f"/api/v1/{key}/results.slim.json",
                "preset_amount_desc_top1000": f"/api/v1/{key}/preset.amount_desc.top1000.json",
                "issue_shard_template": f"/api/v1/{key}/issues/{{auction_date}}.json",
            },
            "pdfs_listed": len(auctions),
        }

    _write_json(API / "index.json", index)
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
