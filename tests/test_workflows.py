from __future__ import annotations

import importlib.util
import json
import random
import re
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WorkflowTests(unittest.TestCase):
    def test_scheduled_workflows_use_ci_deploy_command(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertIn("--require-market-snapshot", package["scripts"]["cf:deploy"])
        self.assertIn("--require-market-snapshot", package["scripts"]["cf:deploy:ci"])
        for workflow_name in ["auto-update.yml", "auto-heal.yml"]:
            workflow = (ROOT / ".github" / "workflows" / workflow_name).read_text(encoding="utf-8")
            self.assertIn("run: npm run cf:deploy:ci", workflow)
            self.assertNotIn("run: npm run cf:deploy\n", workflow)

    def test_market_refresh_workflows_are_wired(self) -> None:
        auto_update = (ROOT / ".github" / "workflows" / "auto-update.yml").read_text(encoding="utf-8")
        scrape_marker = "python scripts/scrape_28car_market.py"
        updater_marker = "run: bash scripts/cron_update.sh"
        self.assertIn('cron: "40 0 * * *"', auto_update)
        self.assertIn("--max-pages 0", auto_update)
        self.assertIn("--require-complete", auto_update)
        self.assertLess(auto_update.index(scrape_marker), auto_update.index(updater_marker))

        self.assertFalse((ROOT / ".github" / "workflows" / "broker-notifications.yml").exists())

        auto_heal = (ROOT / ".github" / "workflows" / "auto-heal.yml").read_text(encoding="utf-8")
        self.assertIn("python scripts/scrape_28car_market.py", auto_heal)
        self.assertIn("--require-complete", auto_heal)
        self.assertLess(auto_heal.index("python scripts/scrape_28car_market.py"), auto_heal.index("Execute deterministic repair"))
        for workflow in (auto_update, auto_heal):
            self.assertIn("python scripts/check_market_production.py --base-url https://plate.hk", workflow)

    def test_auto_heal_supports_safe_repair_drills(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "auto-heal.yml").read_text(encoding="utf-8")

        self.assertIn("dry_run:", workflow)
        self.assertIn("Run repair and verification without committing or deploying", workflow)
        self.assertIn("steps.changes.outputs.changed == 'true' && (github.event_name != 'workflow_dispatch' || github.event.inputs.dry_run != 'true')", workflow)
        self.assertIn("Open human repair issue", workflow)
        self.assertIn("autoheal-evidence-${{ github.run_id }}", workflow)

    def test_cron_update_rebuilds_unified_all_outputs(self) -> None:
        script = (ROOT / "scripts" / "cron_update.sh").read_text(encoding="utf-8")
        self.assertIn("python3 scripts/build_events.py", script)
        self.assertIn("python3 scripts/build_all_dataset.py", script)
        self.assertIn("python3 scripts/build_all_results_preset.py", script)
        self.assertIn("python3 scripts/build_all_search_index.py", script)
        self.assertIn("python3 scripts/build_hot_search_cache.py", script)
        self.assertIn("python3 scripts/build_public_api.py", script)

        build_site = (ROOT / "scripts" / "build_site.sh").read_text(encoding="utf-8")
        self.assertIn("python3 scripts/build_events.py", build_site)

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

    def test_duplicate_generated_artifact_gate_checks_tracked_files(self) -> None:
        proc = subprocess.run(
            ["python3", "scripts/check_duplicate_generated_artifacts.py"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertIn("No duplicate generated artifacts found", proc.stdout)

    def test_duplicate_generated_artifact_checker_can_clean_working_tree_scope(self) -> None:
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp_dir:
            tmp_root = Path(tmp_dir)
            rel_root = tmp_root.relative_to(ROOT).as_posix()
            duplicate = tmp_root / "sample 2.json"
            duplicate.write_text("{}", encoding="utf-8")

            proc = subprocess.run(
                [
                    "python3",
                    "scripts/check_duplicate_generated_artifacts.py",
                    "--scope",
                    "working-tree",
                    "--root",
                    rel_root,
                    "--delete",
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )

            self.assertIn("Deleted 1 duplicate generated artifacts", proc.stdout)
            self.assertFalse(duplicate.exists())

    def test_production_freshness_normalizes_publish_pruned_all_plates_asset(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "check_production_freshness",
            ROOT / "scripts" / "check_production_freshness.py",
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            plates = tmp_root / "api" / "v1" / "all" / "plates.json"
            plates.parent.mkdir(parents=True)
            plates.write_text("{}", encoding="utf-8")
            value = {"datasets": {"all": {"files": {"plates": "/api/v1/all/plates.json", "auctions": "x"}}}}

            normalized, notes = module.normalize_api_index_for_publish(tmp_root, value, max_asset_bytes=1)

        self.assertNotIn("plates", normalized["datasets"]["all"]["files"])
        self.assertIn("auctions", normalized["datasets"]["all"]["files"])
        self.assertEqual(value["datasets"]["all"]["files"]["plates"], "/api/v1/all/plates.json")
        self.assertTrue(notes)

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
        self.assertIn("about.html", listing)
        self.assertIn("mcp.html", listing)
        self.assertIn("plates/index.html", listing)
        self.assertIn("plates/88.html", listing)
        self.assertIn("sitemap.xml", listing)
        self.assertIn("robots.txt", listing)
        self.assertIn("llms.txt", listing)
        self.assertIn("agent.md", listing)

    def test_build_cloudflare_public_excludes_pipeline_bulks(self) -> None:
        proc = subprocess.run(
            ["python3", "scripts/build_cloudflare_public.py"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=180,
        )
        self.assertIn(".tmp/cloudflare-public", proc.stdout)
        publish = ROOT / ".tmp" / "cloudflare-public"
        self.assertTrue((publish / "index.html").exists())
        self.assertTrue((publish / "about.html").exists())
        self.assertTrue((publish / "data" / "hot_search" / "manifest.json").exists())
        self.assertTrue((publish / "data" / "events.json").exists())
        self.assertTrue((publish / "data" / "TVRM auction result (1973-2026).xls").exists())
        self.assertTrue((publish / "api" / "v1" / "all" / "results.chunks.json").exists())
        search_index = publish / "api" / "v1" / "all" / "search-index"
        search_meta = json.loads((search_index / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(search_meta["schema_version"], 1)
        self.assertGreater(search_meta["bigram_counts"]["UA"], 0)
        self.assertTrue((search_index / "prefix1" / "H.json").exists())
        self.assertTrue((search_index / "bigram" / "UA.json").exists())
        legacy_query = "KL777"
        legacy_token = min(
            {legacy_query[idx:idx + 2] for idx in range(len(legacy_query) - 1)},
            key=lambda token: (search_meta["bigram_counts"][token], token),
        )
        legacy_rows = json.loads(
            (search_index / "bigram" / f"{legacy_token}.json").read_text(encoding="utf-8")
        )["rows"]
        self.assertTrue(any(
            search_meta["row_metadata"][row[0]][0] == "tvrm_legacy"
            and re.sub(r"[^A-Z0-9]+", "", str(row[1] or "").upper()) == legacy_query
            and row[3] == 28000
            for row in legacy_rows
        ))
        self.assertTrue((publish / "api" / "v1" / "tvrm_eauction" / "results.chunks.json").exists())
        self.assertTrue((publish / "data" / "all.prefix2" / "HK.json").exists())
        self.assertTrue((publish / ".well-known" / "api-catalog.json").exists())
        self.assertTrue((publish / ".well-known" / "agent-skills" / "index.json").exists())
        self.assertFalse((publish / "data" / "market" / "28car.active.json").exists())
        sw = (publish / "sw.js").read_text(encoding="utf-8")
        self.assertRegex(sw, r"const CACHE_NAME = 'pvrm-static-[0-9a-f]{12}';")
        self.assertFalse(list((publish / "plates").glob("* [0-9].html")))
        self.assertFalse((publish / "data" / "results.json").exists())
        self.assertFalse((publish / "data" / "pdfs").exists())
        self.assertFalse((publish / "data" / "tvrm_physical" / "pdfs").exists())
        self.assertFalse((publish / "data" / "tvrm_eauction" / "pdfs").exists())

    def test_build_cloudflare_public_skips_missing_optional_data_dirs(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "build_cloudflare_public",
            ROOT / "scripts" / "build_cloudflare_public.py",
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "publish" / "data" / "missing-index"
            module.copy_optional_path(Path(tmp) / "missing-index", target)
            self.assertFalse(target.exists())

    def test_private_market_snapshot_is_sharded_and_rejects_extra_fields(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "build_cloudflare_public_market_test",
            ROOT / "scripts" / "build_cloudflare_public.py",
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        offer = {
            "listing_id": "n12",
            "source_url": "https://m.28car.com/num_dsp.php?h_vid=12",
            "price_type": "fixed",
            "asking_price_hkd": 80000,
            "first_seen_at": "2026-08-12T00:00:00Z",
            "last_seen_at": "2026-08-12T00:00:00Z",
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            source = tmp_root / "data" / "market" / "28car.active.json"
            source.parent.mkdir(parents=True)
            payload = {
                "schema_version": 1,
                "source": "28car",
                "scraped_at": "2026-08-12T00:00:00Z",
                "fresh_for_hours": 72,
                "coverage": {"complete": True},
                "signal_count": 1,
                "plate_count": 1,
                "signals": {"JZ": [offer]},
            }
            source.write_text(json.dumps(payload), encoding="utf-8")
            module.ROOT = tmp_root
            module.TARGET = tmp_root / "publish"
            module.copy_private_market_signals()

            manifest = json.loads((module.TARGET / "_market" / "28car" / "manifest.json").read_text())
            shard = json.loads((module.TARGET / "_market" / "28car" / "J.json").read_text())
            self.assertNotIn("signals", manifest)
            self.assertEqual(shard["signals"]["JZ"], [offer])
            self.assertFalse((module.TARGET / "data" / "market" / "28car.active.json").exists())

            payload["signals"]["JZ"][0]["seller"] = "must not publish"
            source.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "Non-allowlisted"):
                module.copy_private_market_signals()

    def test_deploy_publish_requires_a_complete_fresh_private_market_snapshot(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "build_cloudflare_public_deploy_market_test",
            ROOT / "scripts" / "build_cloudflare_public.py",
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            module.ROOT = Path(tmp)
            with self.assertRaisesRegex(RuntimeError, "required for deploys"):
                module.copy_private_market_signals(required=True)

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
