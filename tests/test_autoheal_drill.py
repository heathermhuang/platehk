from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import autoheal_drill as drill
import cloud_repair_gate

BROKEN = 'def normalize_plate(value):\n    return value.strip()\n'
FIXED = 'def normalize_plate(value):\n    return "".join(value.split()).upper()\n'


class AutohealDrillTests(unittest.TestCase):
    def test_real_fixture_failure_enters_normal_gate_and_source_holds_still_win(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate = root / drill.CANDIDATE
            candidate.parent.mkdir(parents=True)
            candidate.write_text(BROKEN)
            rules = root / ".github/autoheal/rules.json"
            rules.parent.mkdir(parents=True)
            rules.write_bytes((ROOT / ".github/autoheal/rules.json").read_bytes())
            evidence = root / "evidence"
            receipt = drill.prepare(root, evidence)
            self.assertTrue(receipt["baseline_failed"])
            self.assertIn("FAIL:", (evidence / "failed.log").read_text())
            self.assertEqual(cloud_repair_gate.escalation_outputs(evidence, "owner/repo")["should_run"], "true")
            (evidence / "failed.log").write_text("SOURCE_PARSE_UNVERIFIED\n" + (evidence / "failed.log").read_text())
            self.assertEqual(cloud_repair_gate.escalation_outputs(evidence, "owner/repo")["should_run"], "false")
            candidate.write_text(FIXED)
            self.assertTrue(drill.check_candidate(candidate)[0])
            with self.assertRaisesRegex(ValueError, "must fail"):
                drill.prepare(root, evidence)

    def make_repo(self, directory):
        root = Path(directory)
        subprocess.run(["git", "init", "--quiet", str(root)], check=True)
        candidate = root / drill.CANDIDATE
        candidate.parent.mkdir(parents=True)
        candidate.write_text(BROKEN)
        (root / "production.py").write_text("untouched\n")
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(["git", "-c", "user.name=Drill test", "-c", "user.email=drill@example.invalid",
                        "commit", "--quiet", "-m", "fixture"], cwd=root, check=True)
        return root, candidate

    def test_patch_validator_accepts_a_real_repair_and_rejects_production_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root, candidate = self.make_repo(directory)
            candidate.write_text(FIXED)
            patch = root / "candidate.patch"
            patch.write_bytes(subprocess.check_output(["git", "diff", "--binary"], cwd=root))
            candidate.write_text(BROKEN)
            drill.validate_patch(root, patch)
            subprocess.run(["git", "apply", "--index", str(patch)], cwd=root, check=True)
            self.assertTrue(drill.check_candidate(candidate)[0])
        with tempfile.TemporaryDirectory() as directory:
            root, candidate = self.make_repo(directory)
            candidate.write_text(FIXED)
            (root / "production.py").write_text("modified\n")
            patch = root / "unsafe.patch"
            patch.write_bytes(subprocess.check_output(["git", "diff"], cwd=root))
            candidate.write_text(BROKEN)
            (root / "production.py").write_text("untouched\n")
            with self.assertRaisesRegex(ValueError, "only the candidate"):
                drill.validate_patch(root, patch)

    def test_patch_validator_rejects_mode_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root, candidate = self.make_repo(directory)
            candidate.chmod(0o755)
            patch = root / "mode.patch"
            patch.write_bytes(subprocess.check_output(["git", "diff"], cwd=root))
            with self.assertRaisesRegex(ValueError, "file modes"):
                drill.validate_patch(root, patch)

    def test_drill_pr_cannot_target_main_or_be_merged_or_escape_its_run(self):
        receipt = {"baseRefName": "codex/autoheal-drill-base-123", "headRefName": "codex/autoheal-drill-repair-123",
                   "isDraft": True, "mergedAt": None, "state": "OPEN"}
        drill.verify_pr(receipt, "123", closed=False)
        drill.verify_pr({**receipt, "state": "CLOSED"}, "123", closed=True)
        for change in [{"baseRefName": "main"}, {"headRefName": "codex/other"}, {"isDraft": False},
                       {"mergedAt": "2026-11-10"}, {"state": "MERGED"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                drill.verify_pr({**receipt, **change}, "123", closed=False)
        with self.assertRaises(ValueError):
            drill.verify_pr(receipt, "123\nmain", closed=False)


if __name__ == "__main__":
    unittest.main()
