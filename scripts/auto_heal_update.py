#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RULES = ROOT / ".github" / "autoheal" / "rules.json"
DEFAULT_OUTPUT = ROOT / "logs" / "autoheal" / "plan.json"


ACTION_COMMANDS = {
    "run_events_repair": [
        "python scripts/build_events.py",
        "python scripts/build_popular_plate_pages.py",
        "python scripts/build_public_api.py",
        "python scripts/build_audit_report.py",
        "python scripts/verify_data_integrity.py",
    ],
    "run_incremental_update": ["MODE=incremental bash scripts/cron_update.sh"],
    "retry_auto_update": ["MODE=incremental bash scripts/cron_update.sh"],
    "run_full_update": ["MODE=full bash scripts/cron_update.sh"],
    "alert_human": [],
    "escalate_llm_repair": [],
    "no_op": [],
}


def load_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text_files(paths: list[Path]) -> str:
    chunks: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        chunks.append(f"\n--- {path} ---\n")
        chunks.append(path.read_text(encoding="utf-8", errors="replace"))
    return "".join(chunks)


def _matches_rule(rule: dict[str, Any], log_text: str) -> list[str]:
    patterns = [str(item) for item in rule.get("patterns") or []]
    matched: list[str] = []
    for pattern in patterns:
        if re.search(pattern, log_text, flags=re.IGNORECASE | re.MULTILINE):
            matched.append(pattern)
    policy = str(rule.get("match", "any")).lower()
    if policy == "all":
        return matched if len(matched) == len(patterns) and patterns else []
    return matched


def _freshness_result_by_name(freshness: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not isinstance(freshness, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for item in freshness.get("results") or []:
        if isinstance(item, dict) and item.get("name"):
            out[str(item["name"])] = item
    return out


def classify_freshness(freshness: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(freshness, dict):
        return None

    status = freshness.get("status")
    by_name = _freshness_result_by_name(freshness)
    drifted = {name for name, item in by_name.items() if item.get("status") == "drift"}
    errors = {name for name, item in by_name.items() if item.get("status") == "error"}

    if status == "current":
        return {
            "classification": "production_current",
            "status": "noop",
            "action": "no_op",
            "confidence": "high",
            "deploy_required": False,
            "reason": "Production events.json and api/v1/index.json already match local generated outputs.",
        }

    if drifted == {"events"}:
        return {
            "classification": "production_events_drift",
            "status": "repairable",
            "action": "run_events_repair",
            "confidence": "high",
            "deploy_required": True,
            "reason": "Only data/events.json drifted; run the narrow event-feed repair path before deploy.",
        }

    if "api_index" in drifted or drifted:
        return {
            "classification": "production_generated_output_drift",
            "status": "repairable",
            "action": "run_incremental_update",
            "confidence": "high",
            "deploy_required": True,
            "reason": "Production generated outputs drifted; run the deterministic updater before deploy.",
        }

    if errors:
        return {
            "classification": "production_freshness_check_error",
            "status": "repairable",
            "action": "retry_auto_update",
            "confidence": "medium",
            "deploy_required": False,
            "reason": "Production freshness check returned errors; retry the deterministic updater/check path once.",
        }

    return None


def classify(log_text: str, freshness: dict[str, Any] | None, rules_config: dict[str, Any]) -> dict[str, Any]:
    matched_rules: list[dict[str, Any]] = []
    rules = sorted(rules_config.get("rules") or [], key=lambda item: int(item.get("priority", 0)), reverse=True)

    for rule in rules:
        matched_patterns = _matches_rule(rule, log_text)
        if not matched_patterns:
            continue
        matched_rules.append(
            {
                "id": rule.get("id"),
                "priority": rule.get("priority", 0),
                "matched_patterns": matched_patterns,
            }
        )
        action = str(rule.get("action"))
        return make_plan(
            classification=str(rule.get("id")),
            status=str(rule.get("status")),
            action=action,
            confidence=str(rule.get("confidence", "medium")),
            deploy_required=bool(rule.get("deploy_required", False)),
            reason=str(rule.get("summary", "Matched an auto-heal rule.")),
            matched_rules=matched_rules,
        )

    freshness_plan = classify_freshness(freshness)
    if freshness_plan:
        return make_plan(matched_rules=matched_rules, **freshness_plan)

    if log_text.strip():
        return make_plan(
            classification="unclassified_failure",
            status="escalate",
            action="escalate_llm_repair",
            confidence="low",
            deploy_required=False,
            reason="No deterministic auto-heal rule matched the failure logs.",
            matched_rules=matched_rules,
        )

    return make_plan(
        classification="no_failure_context",
        status="noop",
        action="no_op",
        confidence="low",
        deploy_required=False,
        reason="No failure logs or freshness drift were provided.",
        matched_rules=matched_rules,
    )


def make_plan(
    *,
    classification: str,
    status: str,
    action: str,
    confidence: str,
    deploy_required: bool,
    reason: str,
    matched_rules: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "classification": classification,
        "status": status,
        "action": action,
        "confidence": confidence,
        "deploy_required": deploy_required,
        "reason": reason,
        "commands": ACTION_COMMANDS.get(action, []),
        "llm_escalation_required": action == "escalate_llm_repair",
        "matched_rules": matched_rules or [],
    }


def write_github_outputs(path: Path, plan: dict[str, Any]) -> None:
    simple_keys = ["classification", "status", "action", "confidence"]
    with path.open("a", encoding="utf-8") as fh:
        for key in simple_keys:
            fh.write(f"{key}={plan.get(key, '')}\n")
        fh.write(f"deploy_required={'true' if plan.get('deploy_required') else 'false'}\n")
        fh.write(f"llm_escalation_required={'true' if plan.get('llm_escalation_required') else 'false'}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify PlateHK auto-update failures and choose safe repair actions.")
    sub = parser.add_subparsers(dest="command", required=True)

    classify_parser = sub.add_parser("classify", help="Create an auto-heal repair plan.")
    classify_parser.add_argument("--rules", default=str(DEFAULT_RULES), help="Path to auto-heal rules JSON.")
    classify_parser.add_argument("--log-file", action="append", default=[], help="Failed workflow log file. Can be repeated.")
    classify_parser.add_argument("--freshness-json", help="Optional check_production_freshness.py --json output.")
    classify_parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Path to write the repair plan JSON.")
    classify_parser.add_argument("--github-output", help="Optional GITHUB_OUTPUT path for workflow step outputs.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command != "classify":
        raise AssertionError(args.command)

    rules_config = load_json_file(Path(args.rules))
    log_text = read_text_files([Path(item) for item in args.log_file])
    freshness = None
    if args.freshness_json:
        freshness_path = Path(args.freshness_json)
        if freshness_path.exists() and freshness_path.stat().st_size > 0:
            freshness = load_json_file(freshness_path)

    plan = classify(log_text, freshness, rules_config)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.github_output:
        write_github_outputs(Path(args.github_output), plan)

    print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
