from __future__ import annotations

import json
import random
import subprocess
import time
import unittest
import urllib.request
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WorkflowTests(unittest.TestCase):
    def test_run_local_serves_root_without_db_health_dependency(self) -> None:
        port = random.randint(18080, 18999)
        try:
            proc = subprocess.run(
                ["bash", "scripts/run_local.sh", str(port)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.assertIn(f"http://127.0.0.1:{port}", proc.stdout)
            time.sleep(1)
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=10) as resp:
                body = resp.read(256).decode("utf-8", errors="replace")
            self.assertEqual(resp.status, 200)
            self.assertIn("<!doctype html>", body.lower())
        finally:
            subprocess.run(["bash", "scripts/stop_local.sh", str(port)], cwd=ROOT, check=False, capture_output=True, text=True)

    def test_run_local_search_api_works_without_cloudflare_cache_runtime(self) -> None:
        # Regression: ISSUE-001 - local worker search crashed when Cloudflare cache globals were unavailable.
        # Found by /qa on 2026-04-19
        # Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-04-19.md
        port = random.randint(19000, 19999)
        try:
            proc = subprocess.run(
                ["bash", "scripts/run_local.sh", str(port)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )
            self.assertIn(f"http://127.0.0.1:{port}", proc.stdout)
            time.sleep(1)
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/search?dataset=all&q=HKB88&page=1&page_size=5&sort=amount_desc",
                headers={"Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(resp.status, 200)
            self.assertIsInstance(payload, dict)
            self.assertIn("rows", payload)
            self.assertIn("total", payload)
        finally:
            subprocess.run(["bash", "scripts/stop_local.sh", str(port)], cwd=ROOT, check=False, capture_output=True, text=True)

    def test_run_local_all_issue_api_supports_auction_keys(self) -> None:
        port = random.randint(20000, 20999)
        try:
            proc = subprocess.run(
                ["bash", "scripts/run_local.sh", str(port)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )
            self.assertIn(f"http://127.0.0.1:{port}", proc.stdout)
            time.sleep(1)

            with urllib.request.urlopen(
                urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/issues?dataset=all",
                    headers={"Accept": "application/json"},
                ),
                timeout=15,
            ) as resp:
                issues_payload = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(resp.status, 200)
            self.assertEqual(issues_payload["dataset"], "all")
            first_issue = next(item for item in issues_payload["issues"] if item.get("auction_key"))
            self.assertIn("::", first_issue["auction_key"])

            issue_query = urllib.parse.urlencode(
                {"dataset": "all", "auction_date": first_issue["auction_key"]},
                quote_via=urllib.parse.quote,
            )
            with urllib.request.urlopen(
                urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/issue?{issue_query}",
                    headers={"Accept": "application/json"},
                ),
                timeout=15,
            ) as resp:
                issue_payload = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(resp.status, 200)
            self.assertEqual(issue_payload["issue"]["auction_key"], first_issue["auction_key"])
            self.assertGreater(len(issue_payload["rows"]), 0)
            self.assertTrue(all(row.get("dataset_key") for row in issue_payload["rows"][:20]))
            self.assertTrue(all(row.get("auction_key") == first_issue["auction_key"] for row in issue_payload["rows"][:20]))

            sample_row = next(
                row for row in issue_payload["rows"]
                if isinstance(row.get("single_line"), str) and row["single_line"].strip()
            )
            search_query = urllib.parse.urlencode(
                {
                    "dataset": "all",
                    "q": sample_row["single_line"],
                    "issue": first_issue["auction_key"],
                    "page": 1,
                    "page_size": 10,
                    "sort": "amount_desc",
                },
                quote_via=urllib.parse.quote,
            )
            with urllib.request.urlopen(
                urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/search?{search_query}",
                    headers={"Accept": "application/json"},
                ),
                timeout=15,
            ) as resp:
                search_payload = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(resp.status, 200)
            self.assertEqual(search_payload["issue"], first_issue["auction_key"])
            self.assertGreater(search_payload["total"], 0)
            self.assertTrue(all(row.get("auction_key") == first_issue["auction_key"] for row in search_payload["rows"]))
        finally:
            subprocess.run(["bash", "scripts/stop_local.sh", str(port)], cwd=ROOT, check=False, capture_output=True, text=True)
    def test_package_release_contains_core_outputs(self) -> None:
        out = ROOT / ".tmp" / "releases" / "test-release.tar.gz"
        if out.exists():
            out.unlink()
        proc = subprocess.run(
            ["bash", "scripts/package_release.sh", "--smoke", str(out)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertTrue(out.exists(), proc.stdout + proc.stderr)
        listing = subprocess.run(
            ["tar", "-tzf", str(out)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout
        self.assertIn("index.html", listing)
        self.assertIn("api/v1/index.json", listing)
        self.assertIn("data/all.search.meta.json", listing)
        self.assertIn("data/all.prefix1.top200.json", listing)
        self.assertIn("data/all.tvrm_legacy_overlap.json", listing)

    def test_build_cloudflare_public_excludes_pipeline_bulks(self) -> None:
        proc = subprocess.run(
            ["python3", "scripts/build_cloudflare_public.py"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertIn(".tmp/cloudflare-public", proc.stdout)
        publish = ROOT / ".tmp" / "cloudflare-public"
        self.assertTrue((publish / "index.html").exists())
        self.assertTrue((publish / "data" / "hot_search" / "manifest.json").exists())
        self.assertTrue((publish / "data" / "TVRM auction result (1973-2026).xls").exists())
        self.assertTrue((publish / "api" / "v1" / "all" / "results.chunks.json").exists())
        self.assertTrue((publish / "api" / "v1" / "tvrm_eauction" / "results.chunks.json").exists())
        self.assertTrue((publish / ".well-known" / "api-catalog.json").exists())
        self.assertTrue((publish / ".well-known" / "agent-skills" / "index.json").exists())
        self.assertFalse((publish / "data" / "results.json").exists())
        self.assertFalse((publish / "data" / "pdfs").exists())
        self.assertFalse((publish / "data" / "tvrm_physical" / "pdfs").exists())
        self.assertFalse((publish / "data" / "tvrm_eauction" / "pdfs").exists())

    def test_release_ready_script_runs(self) -> None:
        proc = subprocess.run(
            ["bash", "scripts/release_ready.sh", "--fast"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertIn("Release checklist", proc.stdout)
        self.assertIn("Smoke package:", proc.stdout)


if __name__ == "__main__":
    unittest.main()
