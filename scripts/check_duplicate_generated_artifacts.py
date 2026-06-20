#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOTS = ("api/v1", "assets", "data", "plates")
DUPLICATE_RE = re.compile(r"(^|/)[^/]+ [2-9](\.[^/]*)?$")
SKIP_PARTS = {".git", ".tmp", "node_modules", "playwright-report", "__pycache__"}


def is_duplicate_path(path: str) -> bool:
    return bool(DUPLICATE_RE.search(path))


def under_roots(path: str, roots: tuple[str, ...]) -> bool:
    return any(path == root or path.startswith(f"{root}/") for root in roots)


def tracked_files() -> list[str]:
    proc = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [item.decode("utf-8", errors="replace") for item in proc.stdout.split(b"\0") if item]


def working_tree_files(roots: tuple[str, ...]) -> list[str]:
    out: list[str] = []
    for root in roots:
        base = ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            if any(part in SKIP_PARTS for part in path.relative_to(ROOT).parts):
                continue
            out.append(rel)
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail when Finder/agent duplicate generated artifacts are present.",
    )
    parser.add_argument(
        "--scope",
        choices=("tracked", "working-tree"),
        default="tracked",
        help="tracked checks committed files; working-tree scans generated output folders.",
    )
    parser.add_argument(
        "--root",
        action="append",
        dest="roots",
        help="Repo-relative root to scan. Defaults to generated/public artifact roots.",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete duplicate artifacts. Only allowed with --scope working-tree and never deletes tracked files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.delete and args.scope != "working-tree":
        print("--delete is only allowed with --scope working-tree.", file=sys.stderr)
        return 2
    roots = tuple(args.roots or DEFAULT_ROOTS)
    tracked = set(tracked_files())
    files = sorted(tracked) if args.scope == "tracked" else working_tree_files(roots)
    duplicates = sorted(path for path in files if under_roots(path, roots) and is_duplicate_path(path))
    if duplicates:
        if args.delete:
            tracked_duplicates = [path for path in duplicates if path in tracked]
            if tracked_duplicates:
                print("Refusing to delete tracked duplicate artifacts:", file=sys.stderr)
                for path in tracked_duplicates[:200]:
                    print(f"  {path}", file=sys.stderr)
                return 1
            for path in duplicates:
                (ROOT / path).unlink()
            print(f"Deleted {len(duplicates)} duplicate generated artifacts.")
            return 0
        print("Duplicate generated artifacts found:", file=sys.stderr)
        for path in duplicates[:200]:
            print(f"  {path}", file=sys.stderr)
        if len(duplicates) > 200:
            print(f"  ... and {len(duplicates) - 200} more", file=sys.stderr)
        print("Remove these before commit/release; they are usually Finder or agent copies.", file=sys.stderr)
        return 1
    print(f"No duplicate generated artifacts found in {args.scope} scope.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
