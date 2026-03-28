from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG = ROOT / "logs" / "security-events.log"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize plate.hk security event logs.")
    parser.add_argument("--path", type=Path, default=DEFAULT_LOG, help="Path to security-events.log")
    parser.add_argument("--hours", type=int, default=24, help="Only include events from the last N hours")
    parser.add_argument("--top", type=int, default=10, help="Show top N paths/clients")
    return parser.parse_args()


def parse_ts(raw: str) -> datetime | None:
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def main() -> int:
    args = parse_args()
    if not args.path.is_file():
        print(f"No security log found at {args.path}")
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, args.hours))
    events = []
    for line in args.path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        ts = parse_ts(str(payload.get("ts", "")))
        if ts is None or ts < cutoff:
            continue
        events.append(payload)

    print(f"Security events in last {max(1, args.hours)}h: {len(events)}")
    if not events:
        return 0

    by_event = Counter(str(event.get("event") or "unknown") for event in events)
    by_path = Counter(str(event.get("path") or "unknown") for event in events)
    by_client = Counter(str(event.get("client") or "unknown") for event in events)

    print("\nTop events:")
    for name, count in by_event.most_common(args.top):
        print(f"- {name}: {count}")

    print("\nTop paths:")
    for name, count in by_path.most_common(args.top):
        print(f"- {name}: {count}")

    print("\nTop client fingerprints:")
    for name, count in by_client.most_common(args.top):
        print(f"- {name}: {count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
