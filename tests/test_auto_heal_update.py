from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "auto_heal_update",
        ROOT / "scripts" / "auto_heal_update.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class AutoHealUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = _load_module()
        cls.rules = json.loads((ROOT / ".github" / "autoheal" / "rules.json").read_text(encoding="utf-8"))

    def classify(self, log_text: str = "", freshness=None):
        return self.module.classify(log_text, freshness, self.rules)

    def test_events_only_drift_uses_narrow_event_repair(self) -> None:
        plan = self.classify(
            freshness={
                "status": "drift",
                "results": [
                    {"name": "events", "status": "drift"},
                    {"name": "api_index", "status": "current"},
                ],
            }
        )

        self.assertEqual(plan["status"], "repairable")
        self.assertEqual(plan["classification"], "production_events_drift")
        self.assertEqual(plan["action"], "run_events_repair")
        self.assertTrue(plan["deploy_required"])
        self.assertIn("python scripts/build_events.py", plan["commands"])

    def test_api_index_drift_runs_incremental_update(self) -> None:
        plan = self.classify(
            freshness={
                "status": "drift",
                "results": [
                    {"name": "events", "status": "current"},
                    {"name": "api_index", "status": "drift"},
                ],
            }
        )

        self.assertEqual(plan["status"], "repairable")
        self.assertEqual(plan["classification"], "production_generated_output_drift")
        self.assertEqual(plan["action"], "run_incremental_update")

    def test_missing_cloudflare_token_blocks_human_required_work(self) -> None:
        plan = self.classify("::error::Set the CLOUDFLARE_API_TOKEN GitHub Actions repository secret.")

        self.assertEqual(plan["status"], "blocked")
        self.assertEqual(plan["action"], "alert_human")
        self.assertFalse(plan["deploy_required"])

    def test_shell_syntax_failure_escalates_to_llm_repair_lane(self) -> None:
        plan = self.classify("scripts/cron_update.sh: line 21: syntax error near unexpected token `('")

        self.assertEqual(plan["status"], "escalate")
        self.assertEqual(plan["action"], "escalate_llm_repair")
        self.assertTrue(plan["llm_escalation_required"])

    def test_issue_count_shrink_runs_full_repair(self) -> None:
        plan = self.classify("Guardrail failed: issue_count shrank after incremental build.")

        self.assertEqual(plan["status"], "repairable")
        self.assertEqual(plan["action"], "run_full_update")
        self.assertTrue(plan["deploy_required"])

    def test_cloud_evicted_copy_timeout_retries_on_clean_runner(self) -> None:
        plan = self.classify("RuntimeError: Timed out clone-copying api/v1/tvrm_physical/issues/2023-10-21.json; the file may be cloud-evicted.")

        self.assertEqual(plan["status"], "repairable")
        self.assertEqual(plan["classification"], "cloud_evicted_copy_timeout")
        self.assertEqual(plan["action"], "retry_auto_update")
        self.assertFalse(plan["deploy_required"])

    def test_github_output_writer_uses_simple_booleans(self) -> None:
        plan = self.classify(
            freshness={
                "status": "drift",
                "results": [
                    {"name": "events", "status": "drift"},
                    {"name": "api_index", "status": "current"},
                ],
            }
        )

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "github.out"
            self.module.write_github_outputs(output, plan)
            text = output.read_text(encoding="utf-8")

        self.assertIn("classification=production_events_drift\n", text)
        self.assertIn("action=run_events_repair\n", text)
        self.assertIn("deploy_required=true\n", text)

    def test_workflow_is_failure_triggered_and_uses_classifier(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "auto-heal.yml").read_text(encoding="utf-8")

        self.assertIn("workflow_run:", workflow)
        self.assertIn("Auto Update Data", workflow)
        self.assertIn("scripts/auto_heal_update.py classify", workflow)
        self.assertIn("issues: write", workflow)
        self.assertIn("Open human repair issue", workflow)
        self.assertIn("Stop for human or LLM repair", workflow)
        self.assertIn("steps.plan.outputs.status == 'escalate'", workflow)
        self.assertIn("actions/upload-artifact@v4", workflow)
        self.assertIn("dry_run", workflow)
        self.assertIn("github.event.inputs.dry_run != 'true'", workflow)
        self.assertIn("npm run cf:deploy:ci", workflow)


if __name__ == "__main__":
    unittest.main()
