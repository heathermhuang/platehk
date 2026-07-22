#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATASET_LABELS = {
    "pvrm": "PVRM",
    "tvrm_physical": "TVRM physical",
    "tvrm_eauction": "TVRM e-auction",
    "tvrm_legacy": "TVRM legacy",
}
REPORT_DATASETS = ("pvrm", "tvrm_physical", "tvrm_eauction")
MAX_LIST_ITEMS = 8


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _integer(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def capture_snapshot(root: Path = ROOT) -> dict[str, Any]:
    index = load_json(root / "api" / "v1" / "index.json")
    events_payload = load_json(root / "data" / "events.json")
    manifest = load_json(root / "api" / "v1" / "all" / "issues.manifest.json")

    datasets: dict[str, dict[str, Any]] = {}
    for key, value in (index.get("datasets") or {}).items():
        if not isinstance(value, dict):
            continue
        datasets[str(key)] = {
            "issue_count": _integer(value.get("issue_count")),
            "total_rows": _integer(value.get("total_rows")),
            "latest_issue": str(value.get("latest_issue") or ""),
            "latest_issue_key": str(value.get("latest_issue_key") or ""),
        }

    events: dict[str, dict[str, str]] = {}
    for item in events_payload.get("events") or []:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        event_id = str(item["id"])
        events[event_id] = {
            "id": event_id,
            "type": str(item.get("type") or "event"),
            "start_at": str(item.get("start_at") or ""),
            "date_label_en": str(item.get("date_label_en") or ""),
            "date_label_zh": str(item.get("date_label_zh") or ""),
        }

    issues: dict[str, dict[str, Any]] = {}
    for item in manifest.get("issues") or []:
        if not isinstance(item, dict):
            continue
        dataset_key = str(item.get("dataset_key") or "")
        auction_date = str(item.get("auction_date") or "")
        issue_key = str(item.get("auction_key") or "")
        if not issue_key and dataset_key and auction_date:
            issue_key = f"{dataset_key}::{auction_date}"
        if not issue_key:
            continue
        issues[issue_key] = {
            "key": issue_key,
            "dataset_key": dataset_key,
            "auction_date": auction_date,
            "auction_date_label": str(item.get("auction_date_label") or auction_date),
            "count": _integer(item.get("count") or item.get("entry_count")),
        }

    return {
        "schema_version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "generated_at": str(index.get("generated_at") or ""),
        "datasets": datasets,
        "events": events,
        "issues": issues,
    }


def build_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_datasets = before.get("datasets") or {}
    after_datasets = after.get("datasets") or {}
    before_all = before_datasets.get("all") or {}
    after_all = after_datasets.get("all") or {}

    dataset_deltas = []
    for key in REPORT_DATASETS:
        old = before_datasets.get(key) or {}
        new = after_datasets.get(key) or {}
        dataset_deltas.append(
            {
                "key": key,
                "label": DATASET_LABELS[key],
                "record_delta": _integer(new.get("total_rows")) - _integer(old.get("total_rows")),
                "issue_delta": _integer(new.get("issue_count")) - _integer(old.get("issue_count")),
                "total_rows": _integer(new.get("total_rows")),
                "issue_count": _integer(new.get("issue_count")),
                "latest_issue": str(new.get("latest_issue") or ""),
            }
        )

    before_issues = before.get("issues") or {}
    after_issues = after.get("issues") or {}
    new_issues = [value for key, value in after_issues.items() if key not in before_issues]
    new_issues.sort(key=lambda item: (str(item.get("auction_date") or ""), str(item.get("key") or "")), reverse=True)

    before_events = before.get("events") or {}
    after_events = after.get("events") or {}
    new_events = [value for key, value in after_events.items() if key not in before_events]
    new_events.sort(key=lambda item: (str(item.get("start_at") or ""), str(item.get("id") or "")))
    removed_events = [value for key, value in before_events.items() if key not in after_events]

    return {
        "record_delta": _integer(after_all.get("total_rows")) - _integer(before_all.get("total_rows")),
        "issue_delta": _integer(after_all.get("issue_count")) - _integer(before_all.get("issue_count")),
        "total_rows": _integer(after_all.get("total_rows")),
        "issue_count": _integer(after_all.get("issue_count")),
        "dataset_deltas": dataset_deltas,
        "new_issues": new_issues,
        "new_events": new_events,
        "removed_event_count": len(removed_events),
        "event_count": len(after_events),
    }


def _limited_lines(items: list[dict[str, Any]], formatter) -> list[str]:
    lines = [formatter(item) for item in items[:MAX_LIST_ITEMS]]
    remaining = len(items) - len(lines)
    if remaining > 0:
        lines.append(f"• …and {remaining} more")
    return lines


def format_report(
    delta: dict[str, Any],
    *,
    generated_changed: bool,
    committed: bool,
    deploy_enabled: bool,
    drift_before: bool,
    mode: str,
    commit_sha: str,
) -> str:
    record_delta = _integer(delta.get("record_delta"))
    new_record_count = max(0, record_delta)
    new_issue_count = max(0, _integer(delta.get("issue_delta")))
    new_events = list(delta.get("new_events") or [])
    new_issues = list(delta.get("new_issues") or [])

    if new_record_count:
        title = f"🆕 PlateHK: {new_record_count:,} new plate records"
    else:
        title = "✅ PlateHK cloud update complete"

    lines = [
        title,
        "",
        f"New plate records: +{new_record_count:,}",
        f"New result issues: +{new_issue_count:,}",
        f"New upcoming events: +{len(new_events):,}",
    ]
    if record_delta < 0:
        lines.append(f"Database correction: {record_delta:,} records net")

    changed_datasets = [
        item
        for item in delta.get("dataset_deltas") or []
        if _integer(item.get("record_delta")) or _integer(item.get("issue_delta"))
    ]
    if changed_datasets:
        lines.extend(["", "Database additions:"])
        for item in changed_datasets:
            record_change = _integer(item.get("record_delta"))
            issue_change = _integer(item.get("issue_delta"))
            lines.append(
                f"• {item['label']}: {record_change:+,} records, {issue_change:+,} issues"
            )

    if new_issues:
        lines.extend(["", "New result issues:"])
        lines.extend(
            _limited_lines(
                new_issues,
                lambda item: (
                    f"• {DATASET_LABELS.get(str(item.get('dataset_key') or ''), str(item.get('dataset_key') or 'Results'))} "
                    f"{item.get('auction_date_label') or item.get('auction_date') or 'unknown date'}: "
                    f"{_integer(item.get('count')):,} records"
                ),
            )
        )

    if new_events:
        lines.extend(["", "New upcoming events:"])
        lines.extend(
            _limited_lines(
                new_events,
                lambda item: (
                    f"• {DATASET_LABELS.get(str(item.get('type') or ''), str(item.get('type') or 'Event'))}: "
                    f"{item.get('date_label_en') or item.get('id') or 'unknown date'}"
                ),
            )
        )

    if _integer(delta.get("removed_event_count")):
        lines.append(f"Expired/removed events: {_integer(delta.get('removed_event_count')):,}")

    latest_parts = []
    for item in delta.get("dataset_deltas") or []:
        if item.get("latest_issue"):
            latest_parts.append(f"{item['label']} {item['latest_issue']}")

    deployed = deploy_enabled and (generated_changed or drift_before)
    production_current = deploy_enabled or (not generated_changed and not drift_before)
    if deployed:
        deploy_status = "deployed"
    elif deploy_enabled:
        deploy_status = "no deploy needed"
    else:
        deploy_status = "disabled"

    lines.extend(
        [
            "",
            f"Database total: {_integer(delta.get('total_rows')):,} records / {_integer(delta.get('issue_count')):,} issues",
            f"Current events: {_integer(delta.get('event_count')):,}",
        ]
    )
    if latest_parts:
        lines.append("Latest results: " + "; ".join(latest_parts))
    lines.extend(
        [
            f"Generated changes: {'yes' if generated_changed else 'no'}",
            f"Commit: {commit_sha[:7] if committed and commit_sha else 'none'}",
            f"Cloudflare: {deploy_status}",
            f"Production: {'current' if production_current else 'not deployed'}",
            f"Mode: {mode or 'incremental'}",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build PlateHK before/after update summaries for Telegram.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot", help="Capture current generated database metadata.")
    snapshot_parser.add_argument("--root", default=str(ROOT))
    snapshot_parser.add_argument("--output", required=True)

    report_parser = subparsers.add_parser("report", help="Compare a prior snapshot with current generated data.")
    report_parser.add_argument("--root", default=str(ROOT))
    report_parser.add_argument("--before", required=True)
    report_parser.add_argument("--output", required=True)
    report_parser.add_argument("--generated-changed", default="false")
    report_parser.add_argument("--committed", default="false")
    report_parser.add_argument("--deploy-enabled", default="true")
    report_parser.add_argument("--drift-before", default="false")
    report_parser.add_argument("--mode", default="incremental")
    report_parser.add_argument("--commit-sha", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    if args.command == "snapshot":
        output.write_text(json.dumps(capture_snapshot(root), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Captured PlateHK update snapshot: {output}")
        return 0

    before = load_json(Path(args.before))
    after = capture_snapshot(root)
    report = format_report(
        build_delta(before, after),
        generated_changed=_bool(args.generated_changed),
        committed=_bool(args.committed),
        deploy_enabled=_bool(args.deploy_enabled),
        drift_before=_bool(args.drift_before),
        mode=args.mode,
        commit_sha=args.commit_sha,
    )
    output.write_text(report + "\n", encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
