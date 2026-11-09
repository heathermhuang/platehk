"""Fail, classify, and verify a synthetic repair without touching production data."""
from __future__ import annotations

import argparse
import importlib.util
import io
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = "tests/fixtures/autoheal_drill/candidate.py"


def check_candidate(path: Path) -> tuple[bool, str]:
    class DrillContract(unittest.TestCase):
        def test_normalizes_plate_without_losing_characters(self):
            spec = importlib.util.spec_from_file_location("drill_candidate", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            for value, expected in [(" ab 123 ", "AB123"), ("a\tb\n12", "AB12"), ("mm6", "MM6"), ("", "")]:
                with self.subTest(value=value):
                    self.assertEqual(module.normalize_plate(value), expected)

    output = io.StringIO()
    result = unittest.TextTestRunner(stream=output).run(unittest.defaultTestLoader.loadTestsFromTestCase(DrillContract))
    return result.wasSuccessful(), output.getvalue()


def prepare(root: Path, evidence: Path) -> dict:
    # Imported only in the trusted pre-model job; copied validation code needs no
    # repository imports after a generated patch has been applied.
    from auto_heal_update import classify

    passed, log = check_candidate(root / CANDIDATE)
    if passed:
        raise ValueError("Drill fixture must fail before model execution")
    freshness = {"status": "current", "results": [], "synthetic_drill": True}
    rules = json.loads((root / ".github/autoheal/rules.json").read_text())
    plan = classify(log, freshness, rules)
    if (plan["classification"], plan["status"], plan["action"]) != (
        "verification_failure", "escalate", "escalate_llm_repair"
    ):
        raise ValueError("Drill failure did not enter the normal verification escalation lane")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "failed.log").write_text(log)
    for name, value in [("plan.json", plan), ("freshness.json", freshness), ("issue.json", {})]:
        (evidence / name).write_text(json.dumps(value, indent=2) + "\n")
    receipt = {"synthetic_drill": True, "fixture": CANDIDATE, "baseline_failed": True,
               "classification": plan["classification"]}
    (evidence / "drill.json").write_text(json.dumps(receipt, indent=2) + "\n")
    return receipt


def validate_patch(root: Path, patch: Path) -> None:
    content = patch.read_bytes()
    if re.search(rb"(?m)^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to) ", content):
        raise ValueError("Drill patch cannot change file modes or rename files")
    result = subprocess.run(["git", "apply", "--numstat", "-z", "-"], input=content,
                            cwd=root, check=True, capture_output=True)
    entries = [item.split(b"\t", 2) for item in result.stdout.split(b"\0") if item]
    if (len(entries) != 1 or len(entries[0]) != 3 or entries[0][2] != CANDIDATE.encode()
            or not all(count.isdigit() for count in entries[0][:2])):
        raise ValueError("Drill patch must modify only the candidate fixture")
    subprocess.run(["git", "apply", "--check", "--index", "-"], input=content, cwd=root,
                   check=True, capture_output=True)


def verify_pr(receipt: dict, run_id: str, *, closed: bool) -> None:
    if not re.fullmatch(r"[1-9][0-9]*", run_id):
        raise ValueError("Invalid drill run ID")
    if (receipt.get("baseRefName") != f"codex/autoheal-drill-base-{run_id}"
            or receipt.get("headRefName") != f"codex/autoheal-drill-repair-{run_id}"
            or receipt.get("isDraft") is not True or receipt.get("mergedAt") is not None
            or receipt.get("state") != ("CLOSED" if closed else "OPEN")):
        raise ValueError("Drill PR must remain isolated, draft, and unmerged")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("verify-candidate")
    prep = sub.add_parser("prepare")
    prep.add_argument("--evidence", type=Path, required=True)
    patch = sub.add_parser("validate-patch")
    patch.add_argument("patch", type=Path)
    pr = sub.add_parser("verify-pr")
    pr.add_argument("--receipt", type=Path, required=True)
    pr.add_argument("--run-id", required=True)
    pr.add_argument("--closed", action="store_true")
    args = parser.parse_args()
    if args.command == "verify-candidate":
        passed, log = check_candidate(args.root / CANDIDATE)
        print(log, end="")
        return 0 if passed else 1
    if args.command == "prepare":
        print(json.dumps(prepare(args.root, args.evidence)))
    elif args.command == "validate-patch":
        validate_patch(args.root, args.patch)
    else:
        verify_pr(json.loads(args.receipt.read_text()), args.run_id, closed=args.closed)
        print("Controlled drill PR isolation verified" + ("; closed without merging" if args.closed else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
