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
    def test_cron_update_rebuilds_unified_all_outputs(self) -> None:
        script = (ROOT / "scripts" / "cron_update.sh").read_text(encoding="utf-8")
        self.assertIn("python3 scripts/build_events.py", script)
        self.assertIn("python3 scripts/build_all_dataset.py", script)
        self.assertIn("python3 scripts/build_all_results_preset.py", script)
        self.assertIn("python3 scripts/build_all_search_index.py", script)
        self.assertIn("python3 scripts/build_hot_search_cache.py", script)
        self.assertIn("python3 scripts/build_public_api.py", script)

    def test_tvrm_scraper_recognizes_current_eauction_url_patterns(self) -> None:
        import sys

        sys.path.insert(0, str(ROOT / "scripts"))
        import build_tvrm_dataset

        cross_month = (
            "https://www.td.gov.hk/filemanager/tc/content_4804/"
            "E-Auction%20Result%20Handout%2030%20April-4%20May%20%202026.Chin.pdf"
        )
        underscore_suffix = (
            "https://www.td.gov.hk/filemanager/sc/content_4804/"
            "E-Auction%20Result%20Handout%2026-30%20March%202026_ch.pdf"
        )
        single_physical = (
            "https://www.td.gov.hk/filemanager/sc/content_4804/"
            "TVRMs%20Auction%20Result%20Handout%2025%20April%202026_TC.pdf"
        )

        self.assertEqual(build_tvrm_dataset.classify_pdf_kind(cross_month, ""), "eauction")
        self.assertEqual(build_tvrm_dataset.extract_date_from_href(cross_month), "2026-04-30")
        self.assertEqual(build_tvrm_dataset.classify_pdf_kind(underscore_suffix, ""), "eauction")
        self.assertEqual(build_tvrm_dataset.extract_date_from_href(underscore_suffix), "2026-03-26")
        self.assertEqual(build_tvrm_dataset.classify_pdf_kind(single_physical, ""), "physical")
        self.assertEqual(build_tvrm_dataset.extract_date_from_href(single_physical), "2026-04-25")
        self.assertIsNone(
            build_tvrm_dataset.classify_pdf_kind(
                "https://www.td.gov.hk/filemanager/tc/content_4804/G%20Notes%20TVRM%20Auction_Rev%204%202025_chi.pdf",
                "傳統車輛登記號碼拍賣重要事項須知",
            )
        )

    def test_build_events_matches_multiple_eauction_windows_to_their_zh_links(self) -> None:
        import sys

        from bs4 import BeautifulSoup

        sys.path.insert(0, str(ROOT / "scripts"))
        import build_events

        html_en = """
        <ul>
          <li><a href="/filemanager/en/content_4802/E-Auction%20Handout%20for%2028.5-1.6.2026.Eng.pdf">28 May noon to 1 June noon 2026</a></li>
          <li><a href="/filemanager/en/content_4802/E-Auction%20Handout%20for%2011-15.6.2026.Eng.pdf">11 June noon to 15 June noon 2026</a></li>
        </ul>
        """
        html_zh = """
        <ul>
          <li><a href="/filemanager/tc/content_4802/E-Auction%20Handout%20for%2028.5-1.6.2026.Chin.pdf">2026年5月28日中午至6月1日中午</a></li>
          <li><a href="/filemanager/tc/content_4802/E-Auction%20Handout%20for%2011-15.6.2026.Chin.pdf">2026年6月11日中午至6月15日中午</a></li>
        </ul>
        """

        events = build_events.scrape_coming_auction_events(
            build_events.hk_datetime(2026, 5, 27),
            BeautifulSoup(html_en, "html.parser"),
            BeautifulSoup(html_zh, "html.parser"),
        )

        eauctions = [event for event in events if event["type"] == "tvrm_eauction"]
        self.assertEqual(len(eauctions), 2)
        self.assertEqual(eauctions[0]["date_label_zh"], "2026年5月28日中午至6月1日中午")
        self.assertTrue(eauctions[0]["source_url_zh"].endswith("28.5-1.6.2026.Chin.pdf"))
        self.assertEqual(eauctions[1]["date_label_zh"], "2026年6月11日中午至6月15日中午")
        self.assertTrue(eauctions[1]["source_url_zh"].endswith("11-15.6.2026.Chin.pdf"))

    def test_build_events_keeps_unsessioned_physical_auction_dates(self) -> None:
        import sys

        from bs4 import BeautifulSoup

        sys.path.insert(0, str(ROOT / "scripts"))
        import build_events

        html_en = """
        <ul>
          <li><a href="/filemanager/en/content_4802/TVRM%20Auction%20Handout%20for%2013.6.2026.Eng.pdf">13 June 2026</a></li>
        </ul>
        """
        html_zh = """
        <ul>
          <li><a href="/filemanager/tc/content_4802/TVRM%20Auction%20Handout%20for%2013.6.2026.Chin.pdf">2026年6月13日</a></li>
        </ul>
        """

        events = build_events.scrape_coming_auction_events(
            build_events.hk_datetime(2026, 5, 27),
            BeautifulSoup(html_en, "html.parser"),
            BeautifulSoup(html_zh, "html.parser"),
        )

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["type"], "tvrm_physical")
        self.assertEqual(event["date_label_en"], "13 June 2026")
        self.assertEqual(event["date_label_zh"], "2026年6月13日")
        self.assertEqual(event["id"], "tvrm_physical-2026-06-13")

    def test_verify_data_integrity_checks_all_dataset(self) -> None:
        proc = subprocess.run(
            ["python3", "scripts/verify_data_integrity.py"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertIn("[all] Data integrity OK", proc.stdout)

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
                f"http://127.0.0.1:{port}/api/search?dataset=all&q=88&page=1&page_size=5&sort=amount_desc",
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
        self.assertTrue((publish / "data" / "events.json").exists())
        self.assertTrue((publish / "data" / "TVRM auction result (1973-2026).xls").exists())
        self.assertTrue((publish / "api" / "v1" / "all" / "results.chunks.json").exists())
        self.assertTrue((publish / "api" / "v1" / "tvrm_eauction" / "results.chunks.json").exists())
        self.assertTrue((publish / ".well-known" / "api-catalog.json").exists())
        self.assertTrue((publish / ".well-known" / "agent-skills" / "index.json").exists())
        self.assertFalse(list((publish / "plates").glob("* [0-9].html")))
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
