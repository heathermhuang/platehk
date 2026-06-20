#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import shutil
import subprocess
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
API = ROOT / "api" / "v1"


DATASETS = {
    "all": DATA / "all",
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


def _without_generated_at(obj):
    value = copy.deepcopy(obj)
    if isinstance(value, dict):
        value.pop("generated_at", None)
    return value


def _copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        subprocess.run(
            ["cp", "-c", str(src), str(dst)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
        return
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Timed out clone-copying {src}; the file may be cloud-evicted.") from exc
    except (OSError, subprocess.CalledProcessError):
        pass
    with src.open("rb") as fsrc, dst.open("wb") as fdst:
        shutil.copyfileobj(fsrc, fdst, length=1024 * 1024)


def build() -> int:
    index = {
        "version": "v1",
        "generated_at": date.today().isoformat(),
        "datasets": {},
        "notes": [
            "All data comes from Transport Department published PDFs and official workbook exports. If any discrepancy is found, the official published results shall prevail.",
            "This API is a static Open Data API. For full-text search, use the issue shards and build your own index, or use an external query service.",
        ],
    }

    # Build a stable API tree that mirrors the existing data files.
    for key, base in DATASETS.items():
        out = API / key
        out.mkdir(parents=True, exist_ok=True)

        manifest = _read_json(base / "issues.manifest.json")
        auctions = _read_json(base / "auctions.json")
        manifest_issues = manifest.get("issues") or []
        latest_issue = manifest_issues[0] if manifest_issues else {}
        issue_key_field = "auction_key" if key == "all" else "auction_date"
        expected_root_files = {
            "issues.manifest.json",
            "auctions.json",
            "results.slim.json",
            "preset.amount_desc.top1000.json",
        }

        # Copy core files
        _copy(base / "issues.manifest.json", out / "issues.manifest.json")
        _copy(base / "auctions.json", out / "auctions.json")
        _copy(base / "results.slim.json", out / "results.slim.json")
        _copy(base / "preset.amount_desc.top1000.json", out / "preset.amount_desc.top1000.json")
        if (base / "plates.json").exists():
            _copy(base / "plates.json", out / "plates.json")
            expected_root_files.add("plates.json")
        elif (out / "plates.json").exists():
            (out / "plates.json").unlink()
        for stale in out.glob("*.json"):
            if stale.name not in expected_root_files:
                stale.unlink()

        # Copy only manifest-listed per-issue shards. This avoids carrying
        # Finder/iCloud duplicate files such as " 2.json" into the public API.
        expected_issue_files = set()
        issues_out = out / "issues"
        issues_out.mkdir(parents=True, exist_ok=True)
        for item in manifest.get("issues", []):
            f = item.get("file")
            if not f:
                continue
            src = base / f
            dst = out / f
            if src.exists():
                expected_issue_files.add(dst.name)
                _copy(src, dst)
        for stale in issues_out.glob("*.json"):
            if stale.name not in expected_issue_files:
                stale.unlink()

        index["datasets"][key] = {
            "base": f"/api/v1/{key}",
            "issue_count": int(manifest.get("issue_count") or 0),
            "total_rows": int(manifest.get("total_rows") or 0),
            "latest_issue": latest_issue.get("auction_date"),
            "latest_issue_key": latest_issue.get(issue_key_field) or latest_issue.get("auction_date"),
            "issue_key_field": issue_key_field,
            "files": {
                "issues_manifest": f"/api/v1/{key}/issues.manifest.json",
                "auctions": f"/api/v1/{key}/auctions.json",
                "results_slim": f"/api/v1/{key}/results.slim.json",
                "preset_amount_desc_top1000": f"/api/v1/{key}/preset.amount_desc.top1000.json",
                "issue_shard_template": (
                    f"/api/v1/{key}/issues/{{auction_key}}.json"
                    if key == "all"
                    else f"/api/v1/{key}/issues/{{auction_date}}.json"
                ),
                **({"plates": f"/api/v1/{key}/plates.json"} if (base / "plates.json").exists() else {}),
            },
            "pdfs_listed": len(auctions),
        }

    index_path = API / "index.json"
    if index_path.exists():
        existing_index = _read_json(index_path)
        if _without_generated_at(existing_index) == _without_generated_at(index):
            index["generated_at"] = existing_index.get("generated_at") or index["generated_at"]

    _write_json(index_path, index)
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
