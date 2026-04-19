#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "all" / "preset.amount_desc.top1000.json"
TARGET = DATA / "all.preset.amount_desc.top1000.json"


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    rows = json.loads(SOURCE.read_text(encoding="utf-8"))
    TARGET.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {TARGET} rows={len(rows)}")


if __name__ == "__main__":
    main()
