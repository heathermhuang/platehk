from __future__ import annotations

import importlib.util
import json
import sys
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
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

    def test_source_failure_and_unqualified_parse_alert_without_rebuilding_or_using_a_model(self):
        for marker in ['SOURCE_OBSERVATION_UNAVAILABLE', 'SOURCE_PARSE_UNVERIFIED']:
            plan = self.classify(marker + '\nValueError: source failed', freshness={'status':'current','results':[]})
            self.assertEqual(plan['status'], 'blocked')
            self.assertEqual(plan['action'], 'alert_human')
            self.assertEqual(plan['commands'], [])
            self.assertFalse(plan['llm_escalation_required'])

    def test_shell_syntax_failure_escalates_to_llm_repair_lane(self) -> None:
        plan = self.classify("scripts/cron_update.sh: line 21: syntax error near unexpected token `('")

        self.assertEqual(plan["status"], "escalate")
        self.assertEqual(plan["action"], "escalate_llm_repair")
        self.assertTrue(plan["llm_escalation_required"])

    def test_old_source_alert_requires_verified_newer_unchanged_source_evidence(self) -> None:
        observer = {"last_checked_at":"2026-10-14T01:10:00Z", "last_outcome":"unchanged", "last_error":None,
                    "pending_source_count":0, "lease_until":0, "source_revision":"a"*64,
                    "source_observation":{"checked_at":"2026-10-14T01:10:00Z", "source_revision":"a"*64, "source_error_count":0}}
        now = datetime(2026, 10, 14, 1, 20, tzinfo=timezone.utc)
        args = {"observer":observer, "observer_verified":True, "failed_run_updated_at":"2026-10-14T01:00:00Z", "now":now}
        plan = self.module.classify("SOURCE_OBSERVATION_UNAVAILABLE", {"status":"current"}, self.rules, **args)
        self.assertEqual(plan["classification"], "source_observation_recovered")
        self.assertEqual(plan["status"], "noop")
        self.assertEqual(plan["commands"], [])
        for changes in [{"source_observation":{**observer["source_observation"], "checked_at":"2026-10-13T23:00:00Z"}}, {"last_outcome":"published"},
                        {"last_outcome":"failed"}, {"last_error":"pdf_http_503"}, {"pending_source_count":1},
                        {"lease_until":int(now.timestamp())+100},
                        *[{"source_observation":{**observer["source_observation"], **change}} for change in
                          [{"checked_at":"invalid"}, {"checked_at":"2026-10-14T02:00:00Z"}, {"source_revision":"b"*64}, {"source_error_count":1}]],
                        {"source_observation":None}, {"source_revision":"unversioned"}]:
            with self.subTest(changes=changes):
                blocked = self.module.classify("SOURCE_OBSERVATION_UNAVAILABLE", {"status":"current"}, self.rules,
                    **{**args,"observer":{**observer,**changes}})
                self.assertEqual(blocked["status"], "blocked")
        for changes in [{"pending_source_count":False}, {"lease_until":False}, {"lease_until":"0"},
                        {"source_observation":{**observer["source_observation"], "source_error_count":False}}]:
            self.assertEqual(self.module.classify("SOURCE_OBSERVATION_UNAVAILABLE", {"status":"current"}, self.rules,
                **{**args,"observer":{**observer,**changes}})["status"], "blocked")
        for changes in [{"observer_verified":False}, {"failed_run_updated_at":None},
                        {"failed_run_updated_at":"2026-10-14T01:15:00Z"}]:
            self.assertEqual(self.module.classify("SOURCE_OBSERVATION_UNAVAILABLE", {"status":"current"}, self.rules,
                **{**args,**changes})["status"], "blocked")
        for log in ["SOURCE_PARSE_UNVERIFIED", "SOURCE_OBSERVATION_UNAVAILABLE\nSOURCE_PARSE_UNVERIFIED",
                    "SOURCE_OBSERVATION_UNAVAILABLE\nSet the CLOUDFLARE_API_TOKEN"]:
            self.assertEqual(self.module.classify(log, {"status":"current"}, self.rules, **args)["status"], "blocked")
        self.assertEqual(self.module.classify("SOURCE_OBSERVATION_UNAVAILABLE", {"status":"drift"}, self.rules, **args)["status"], "blocked")

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

    def test_recovery_cli_requires_a_complete_status_receipt(self) -> None:
        now = datetime.now(timezone.utc)
        observed = now-timedelta(minutes=1)
        receipt = {"last_outcome":"unchanged", "last_error":None, "pending_source_count":0, "lease_until":0,
                   "source_revision":"a"*64, "source_observation":{"source_revision":"a"*64,
                    "checked_at":observed.isoformat(), "source_error_count":0}}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/"failed.log").write_text("SOURCE_OBSERVATION_UNAVAILABLE")
            (root/"freshness.json").write_text(json.dumps({"status":"current"}))
            for content, expected in [(json.dumps(receipt), "noop"), ("{partial", "blocked"), (None, "blocked")]:
                status = root/"status.json"
                if content is None:
                    status.unlink(missing_ok=True)
                else:
                    status.write_text(content)
                result = subprocess.run([sys.executable, str(ROOT/"scripts/auto_heal_update.py"), "classify",
                    "--log-file", str(root/"failed.log"), "--freshness-json", str(root/"freshness.json"),
                    "--observer-json", str(status), "--observer-verified", "true",
                    "--failed-run-updated-at", (now-timedelta(minutes=5)).isoformat(), "--output", str(root/"plan.json")],
                    capture_output=True, text=True, check=True)
                self.assertEqual(json.loads(result.stdout)["status"], expected)

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
        self.assertIn("npm run cf:deploy:official", workflow)
        self.assertIn("node scripts/refresh_control.mjs restore-market", workflow)
        self.assertNotIn("python scripts/scrape_28car_market.py", workflow)
        evidence = workflow.index("name: Inspect current observer after a source failure")
        classify = workflow.index("name: Classify repair plan")
        alert = workflow.index("name: Open human repair issue")
        self.assertLess(evidence, classify)
        self.assertLess(classify, alert)
        self.assertIn('echo "verified=true"', workflow[evidence:classify])
        self.assertIn('--observer-verified "$OBSERVER_VERIFIED"', workflow)


if __name__ == "__main__":
    unittest.main()
