from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "build_update_telegram_report",
        ROOT / "scripts" / "build_update_telegram_report.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _snapshot(*, all_rows: int, all_issues: int, eauction_rows: int, eauction_issues: int):
    return {
        "datasets": {
            "all": {
                "total_rows": all_rows,
                "issue_count": all_issues,
                "latest_issue": "2026-07-12",
            },
            "pvrm": {
                "total_rows": 40,
                "issue_count": 2,
                "latest_issue": "2026-05-16",
            },
            "tvrm_physical": {
                "total_rows": 60,
                "issue_count": 3,
                "latest_issue": "2026-07-12",
            },
            "tvrm_eauction": {
                "total_rows": eauction_rows,
                "issue_count": eauction_issues,
                "latest_issue": "2026-07-23" if eauction_issues > 1 else "2026-06-25",
            },
        },
        "issues": {
            "pvrm::2026-05-16": {
                "key": "pvrm::2026-05-16",
                "dataset_key": "pvrm",
                "auction_date": "2026-05-16",
                "auction_date_label": "16 May 2026",
                "count": 40,
            }
        },
        "events": {
            "tvrm_eauction-2026-07-23": {
                "id": "tvrm_eauction-2026-07-23",
                "type": "tvrm_eauction",
                "start_at": "2026-07-23T12:00:00+08:00",
                "date_label_en": "23 July noon to 27 July noon 2026",
            }
        },
    }


class UpdateTelegramReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = _load_module()

    def test_delta_and_report_highlight_new_plate_records_issue_and_event(self) -> None:
        before = _snapshot(all_rows=100, all_issues=6, eauction_rows=0, eauction_issues=1)
        after = _snapshot(all_rows=130, all_issues=7, eauction_rows=30, eauction_issues=2)
        after["issues"]["tvrm_eauction::2026-07-23"] = {
            "key": "tvrm_eauction::2026-07-23",
            "dataset_key": "tvrm_eauction",
            "auction_date": "2026-07-23",
            "auction_date_label": "23 July 2026",
            "count": 30,
        }
        after["events"]["tvrm_eauction-2026-08-06"] = {
            "id": "tvrm_eauction-2026-08-06",
            "type": "tvrm_eauction",
            "start_at": "2026-08-06T12:00:00+08:00",
            "date_label_en": "6 August noon to 10 August noon 2026",
        }

        delta = self.module.build_delta(before, after)
        report = self.module.format_report(
            delta,
            generated_changed=True,
            committed=True,
            deploy_enabled=True,
            drift_before=True,
            mode="incremental",
            commit_sha="abcdef1234567890",
        )

        self.assertEqual(delta["record_delta"], 30)
        self.assertEqual(delta["issue_delta"], 1)
        self.assertEqual(len(delta["new_issues"]), 1)
        self.assertEqual(len(delta["new_events"]), 1)
        self.assertIn("🆕 PlateHK: 30 new plate records", report)
        self.assertIn("TVRM e-auction: +30 records, +1 issues", report)
        self.assertIn("23 July 2026: 30 records", report)
        self.assertIn("6 August noon to 10 August noon 2026", report)
        self.assertIn("Cloudflare: deployed", report)
        self.assertIn("Production: current", report)
        self.assertIn("Commit: abcdef1", report)

    def test_no_change_report_is_explicit_and_does_not_claim_deploy(self) -> None:
        snapshot = _snapshot(all_rows=100, all_issues=6, eauction_rows=0, eauction_issues=1)
        delta = self.module.build_delta(snapshot, snapshot)
        report = self.module.format_report(
            delta,
            generated_changed=False,
            committed=False,
            deploy_enabled=True,
            drift_before=False,
            mode="incremental",
            commit_sha="",
        )

        self.assertIn("New plate records: +0", report)
        self.assertIn("New result issues: +0", report)
        self.assertIn("Cloudflare: no deploy needed", report)
        self.assertIn("Production: current", report)
        self.assertIn("Commit: none", report)

    def test_generated_changes_with_deploy_disabled_report_stale_production(self) -> None:
        before = _snapshot(all_rows=100, all_issues=6, eauction_rows=0, eauction_issues=1)
        after = _snapshot(all_rows=101, all_issues=6, eauction_rows=1, eauction_issues=1)
        report = self.module.format_report(
            self.module.build_delta(before, after),
            generated_changed=True,
            committed=True,
            deploy_enabled=False,
            drift_before=True,
            mode="incremental",
            commit_sha="abcdef1234567890",
        )

        self.assertIn("Cloudflare: disabled", report)
        self.assertIn("Production: not deployed", report)


if __name__ == "__main__":
    unittest.main()
