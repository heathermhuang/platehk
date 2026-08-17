from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "build_seo_aeo_baseline",
        ROOT / "scripts" / "build_seo_aeo_baseline.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SeoAeoBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = _load_module()
        cls.config_path = ROOT / "config" / "seo-aeo-prompts.json"
        cls.config = cls.module.load_prompt_config(cls.config_path)

    def _attach_evidence(
        self,
        input_dir: Path,
        row: dict[str, str],
        *,
        run_id: str,
        answer: str = "Verbatim test answer with enough evidence to review.",
    ) -> None:
        evidence_path = Path("evidence") / row["platform"] / f"{row['prompt_id']}--{run_id}.json"
        absolute_path = input_dir / evidence_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": self.module.AUDIT_EVIDENCE_SCHEMA_VERSION,
            "run_id": run_id,
            "platform": row["platform"],
            "prompt_id": row["prompt_id"],
            "observed_prompt": row["prompt"],
            "captured_at": "2026-08-17T12:00:00+08:00",
            "model_or_surface": row["model_or_surface"],
            "web_search_enabled": row["web_search_enabled"] == "yes",
            "verbatim_answer": answer,
            "conversation_url": f"https://example.com/audit/{run_id}",
            "screenshot_paths": [],
            "cited_urls": [],
        }
        absolute_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        row.update(
            {
                "run_id": run_id,
                "observed_prompt": row["prompt"],
                "evidence_path": evidence_path.as_posix(),
                "evidence_sha256": hashlib.sha256(absolute_path.read_bytes()).hexdigest(),
            }
        )

    def test_prompt_corpus_is_bilingual_and_covers_all_platforms(self) -> None:
        self.assertEqual(self.config["platforms"], list(self.module.REQUIRED_PLATFORMS))
        self.assertEqual(len(self.config["prompts"]), 26)
        self.assertEqual(self.config["corpus_version"], "2026-08-16.1")
        pairs: dict[str, set[str]] = {}
        for prompt in self.config["prompts"]:
            pairs.setdefault(prompt["pair_id"], set()).add(prompt["language"])
            self.assertTrue(prompt["target_url"].startswith("https://plate.hk/"))
            self.assertTrue(prompt["accuracy_checks"])
        self.assertEqual(len(pairs), 13)
        self.assertTrue(all(languages == {"zh-HK", "en"} for languages in pairs.values()))

    def test_initialise_writes_full_matrix_and_refuses_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            created = self.module.initialise_inputs(input_dir, self.config)
            self.assertEqual(len(created), 4)
            with (input_dir / "ai-audit.csv").open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 26 * 4)
            self.assertEqual({row["platform"] for row in rows}, set(self.module.REQUIRED_PLATFORMS))
            self.assertTrue(all(not row["brand_cited"] for row in rows))
            self.assertEqual(
                [row["prompt_id"] for row in rows[::26]],
                ["source-discovery-zh"] * len(self.module.REQUIRED_PLATFORMS),
            )
            self.assertTrue(all(not row["observed_prompt"] for row in rows))
            self.assertTrue(all(not row["evidence_path"] for row in rows))
            with self.assertRaises(self.module.BaselineError):
                self.module.initialise_inputs(input_dir, self.config)

    def test_complete_inputs_build_search_and_ai_scorecards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                for index, row in enumerate(rows):
                    brand_cited = row["platform"] in {"chatgpt", "gemini"}
                    row.update(
                        {
                            "audit_date": "2026-08-16",
                            "model_or_surface": "current web app",
                            "web_search_enabled": "yes",
                            "brand_cited": "yes" if brand_cited else "no",
                            "platehk_url_cited": "yes" if row["platform"] == "chatgpt" else "no",
                            "answer_accurate": "yes",
                            "competitor_cited": "no" if brand_cited else "yes",
                            "cited_domains": "plate.hk" if brand_cited else "example.com",
                            "answer_summary": "Evidence-backed answer summary.",
                        }
                    )
                    self._attach_evidence(input_dir, row, run_id=f"run-{index:03d}")
                    writer.writerow(row)

            (input_dir / "gsc-queries.csv").write_text(
                "Top queries,Clicks,Impressions,CTR,Position\n"
                "Plate.hk,10,100,10%,1.2\n"
                "香港車牌拍賣,2,100,2%,8.0\n"
                "88 車牌,3,50,6%,3.0\n",
                encoding="utf-8",
            )
            (input_dir / "bing-queries.csv").write_text(
                "Query,Clicks,Impressions,CTR,Average position\n"
                "hong kong number plate auction,1,20,5%,12\n",
                encoding="utf-8",
            )
            metrics = self.module._site_metrics_template()
            metrics.update({"snapshot_date": "2026-08-16"})
            metrics["search_window"] = {"start_date": "2026-07-17", "end_date": "2026-08-13"}
            metrics["google_search_console"].update(
                {
                    "property": "sc-domain:plate.hk",
                    "property_verified": True,
                    "sitemap_submitted": True,
                    "submitted_urls": 810,
                    "indexed_urls": 600,
                    "manual_actions": "none",
                }
            )
            for device in ("mobile", "desktop"):
                metrics["google_search_console"]["core_web_vitals"][device] = {
                    "lcp": "good",
                    "inp": "not_enough_data",
                    "cls": "good",
                }
            metrics["bing_webmaster_tools"].update(
                {
                    "site_verified": True,
                    "sitemap_submitted": True,
                    "submitted_urls": 810,
                    "indexed_urls": 400,
                }
            )
            (input_dir / "site-metrics.json").write_text(
                json.dumps(metrics, ensure_ascii=False), encoding="utf-8"
            )

            ai = self.module.load_ai_audit(audit_path, self.config)
            gsc = self.module.load_query_export(input_dir / "gsc-queries.csv", source="Google Search Console")
            bing = self.module.load_query_export(input_dir / "bing-queries.csv", source="Bing Webmaster Tools")
            baseline = self.module.build_baseline(
                self.config,
                ai,
                gsc,
                bing,
                self.module.load_site_metrics(input_dir / "site-metrics.json"),
            )

            self.assertEqual(baseline["status"], "complete")
            self.assertEqual(baseline["ai_citations"]["expected_rows"], 104)
            self.assertEqual(baseline["ai_citations"]["tested_rows"], 104)
            self.assertEqual(baseline["ai_citations"]["validated_evidence_rows"], 104)
            self.assertEqual(baseline["ai_citations"]["citation_rate_percent"], 50.0)
            self.assertEqual(baseline["prompt_corpus_version"], "2026-08-16.1")
            self.assertEqual(len(baseline["prompt_corpus_sha256"]), 64)
            self.assertEqual(baseline["ai_citations"]["platforms_with_citations"], 2)
            self.assertEqual(
                baseline["search"]["google_search_console"]["opportunities"][0]["query"],
                "香港車牌拍賣",
            )
            self.assertTrue(baseline["ai_citations"]["lost_prompts"])
            self.assertTrue(baseline["ai_citations"]["fix_pack"])
            report = self.module.render_markdown(baseline)
            self.assertIn("104/104", report)
            self.assertIn("Validated private evidence records: 104/104", report)
            self.assertIn("600/810", report)
            self.assertIn("Technical discovery status", report)
            self.assertIn("2026-07-17 through 2026-08-13", report)
            self.assertIn("Hong Kong Transport Department", report)

    def test_filtered_audit_matrix_preserves_exact_platform_prompt_identity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            source_prompt = "source-discovery-zh"
            retest_path = self.module.initialise_ai_audit(
                root / "source-retest.csv",
                self.config,
                prompt_ids=[source_prompt],
            )
            with retest_path.open(encoding="utf-8", newline="") as handle:
                retest_rows = list(csv.DictReader(handle))
            self.assertEqual(
                [(row["platform"], row["prompt_id"]) for row in retest_rows],
                [(platform, source_prompt) for platform in self.module.REQUIRED_PLATFORMS],
            )

            perplexity_path = self.module.initialise_ai_audit(
                root / "perplexity-replacement.csv",
                self.config,
                platforms=["perplexity"],
            )
            with perplexity_path.open(encoding="utf-8", newline="") as handle:
                perplexity_rows = list(csv.DictReader(handle))
            self.assertEqual(len(perplexity_rows), 26)
            self.assertEqual(perplexity_rows[0]["prompt_id"], source_prompt)
            self.assertTrue(all(row["platform"] == "perplexity" for row in perplexity_rows))

    def test_init_ai_only_cli_builds_requested_correction_matrix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "correction"
            result = self.module.main(
                [
                    "--init-ai-only",
                    "--input-dir",
                    str(input_dir),
                    "--platform",
                    "chatgpt",
                    "--platform",
                    "claude",
                    "--prompt-id",
                    "source-discovery-zh",
                ]
            )
            self.assertEqual(result, 0)
            with (input_dir / "ai-audit.csv").open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(
                [(row["platform"], row["prompt_id"]) for row in rows],
                [("chatgpt", "source-discovery-zh"), ("claude", "source-discovery-zh")],
            )

    def test_blank_templates_are_incomplete_and_do_not_claim_a_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            baseline = self.module.build_baseline(
                self.config,
                self.module.load_ai_audit(input_dir / "ai-audit.csv", self.config),
                self.module.load_query_export(input_dir / "gsc-queries.csv", source="Google Search Console"),
                self.module.load_query_export(input_dir / "bing-queries.csv", source="Bing Webmaster Tools"),
                self.module.load_site_metrics(input_dir / "site-metrics.json"),
            )
            self.assertEqual(baseline["status"], "incomplete")
            self.assertEqual(baseline["ai_citations"]["tested_rows"], 0)
            self.assertTrue(any("untested" in gap for gap in baseline["evidence_gaps"]))
            self.assertIn("No fix pack is generated", self.module.render_markdown(baseline))

    def test_partial_ai_scores_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0]["brand_cited"] = "yes"
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)
            with self.assertRaises(self.module.BaselineError):
                self.module.load_ai_audit(audit_path, self.config)

    def test_unscored_recorded_evidence_is_validated(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0].update(
                {
                    "model_or_surface": "test surface",
                    "web_search_enabled": "yes",
                }
            )
            self._attach_evidence(input_dir, rows[0], run_id="recorded-before-review")
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            audit = self.module.load_ai_audit(audit_path, self.config)
            self.assertEqual(len(audit["rows"]), 0)
            self.assertEqual(len(audit["evidence_rows"]), 1)
            self.assertIn((rows[0]["platform"], rows[0]["prompt_id"]), audit["partial"])

            baseline = self.module.build_baseline(
                self.config,
                audit,
                self.module.load_query_export(input_dir / "gsc-queries.csv", source="Google Search Console"),
                self.module.load_query_export(input_dir / "bing-queries.csv", source="Bing Webmaster Tools"),
                self.module.load_site_metrics(input_dir / "site-metrics.json"),
            )
            self.assertEqual(baseline["ai_citations"]["validated_evidence_rows"], 1)

    def test_unscored_tampered_evidence_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0].update(
                {
                    "model_or_surface": "test surface",
                    "web_search_enabled": "yes",
                }
            )
            self._attach_evidence(input_dir, rows[0], run_id="tampered-before-review")
            rows[0]["evidence_sha256"] = "0" * 64
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "evidence_sha256 does not match"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_scored_ai_row_rejects_prompt_text_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0].update(
                {
                    "audit_date": "2026-08-17",
                    "prompt": self.config["prompts"][1]["prompt"],
                    "model_or_surface": "test surface",
                    "web_search_enabled": "yes",
                    "brand_cited": "no",
                    "platehk_url_cited": "no",
                    "answer_accurate": "yes",
                    "competitor_cited": "no",
                }
            )
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "prompt does not match prompt config"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_scored_ai_row_requires_valid_private_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0].update(
                {
                    "audit_date": "2026-08-17",
                    "model_or_surface": "test surface",
                    "web_search_enabled": "yes",
                    "brand_cited": "no",
                    "platehk_url_cited": "no",
                    "answer_accurate": "yes",
                    "competitor_cited": "no",
                    "answer_summary": "Summary without evidence must not count.",
                }
            )
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "needs a run_id"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_ai_evidence_hash_and_identity_are_verified(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0].update(
                {
                    "audit_date": "2026-08-17",
                    "model_or_surface": "test surface",
                    "web_search_enabled": "yes",
                    "brand_cited": "no",
                    "platehk_url_cited": "no",
                    "answer_accurate": "yes",
                    "competitor_cited": "no",
                    "answer_summary": "Evidence-backed answer summary.",
                }
            )
            self._attach_evidence(input_dir, rows[0], run_id="identity-check")
            rows[0]["evidence_sha256"] = "0" * 64
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "evidence_sha256 does not match"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_ai_evidence_run_id_cannot_be_reused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            for row in rows[:2]:
                row.update(
                    {
                        "audit_date": "2026-08-17",
                        "model_or_surface": "test surface",
                        "web_search_enabled": "yes",
                        "brand_cited": "no",
                        "platehk_url_cited": "no",
                        "answer_accurate": "yes",
                        "competitor_cited": "no",
                        "answer_summary": "Evidence-backed answer summary.",
                    }
                )
                self._attach_evidence(input_dir, row, run_id="duplicate-run")
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "reuses run_id"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_scored_ai_row_requires_an_answer_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[0].update(
                {
                    "audit_date": "2026-08-17",
                    "model_or_surface": "test surface",
                    "web_search_enabled": "yes",
                    "brand_cited": "no",
                    "platehk_url_cited": "no",
                    "answer_accurate": "yes",
                    "competitor_cited": "no",
                }
            )
            self._attach_evidence(input_dir, rows[0], run_id="missing-summary")
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "needs an answer_summary"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_ai_evidence_path_cannot_be_reused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            self.module.initialise_inputs(input_dir, self.config)
            audit_path = input_dir / "ai-audit.csv"
            with audit_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            for index, row in enumerate(rows[:2]):
                row.update(
                    {
                        "audit_date": "2026-08-17",
                        "model_or_surface": "test surface",
                        "web_search_enabled": "yes",
                        "brand_cited": "no",
                        "platehk_url_cited": "no",
                        "answer_accurate": "yes",
                        "competitor_cited": "no",
                        "answer_summary": "Evidence-backed answer summary.",
                    }
                )
                self._attach_evidence(input_dir, row, run_id=f"path-{index}")
            rows[1]["evidence_path"] = rows[0]["evidence_path"]
            rows[1]["evidence_sha256"] = rows[0]["evidence_sha256"]
            with audit_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.module.AUDIT_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(self.module.BaselineError, "reuses evidence_path"):
                self.module.load_ai_audit(audit_path, self.config)

    def test_invalid_query_metrics_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "gsc-queries.csv"
            path.write_text(
                "Query,Clicks,Impressions,Position\ninvalid,11,10,4.2\n",
                encoding="utf-8",
            )
            with self.assertRaises(self.module.BaselineError):
                self.module.load_query_export(path, source="Google Search Console")
            path.write_text(
                "Query,Clicks,Impressions,Position\nDuplicate,1,10,4.2\nduplicate,2,10,5.0\n",
                encoding="utf-8",
            )
            with self.assertRaises(self.module.BaselineError):
                self.module.load_query_export(path, source="Google Search Console")

    def test_site_metrics_require_valid_window_and_typed_values(self) -> None:
        metrics = self.module._site_metrics_template()
        metrics["snapshot_date"] = "2026-02-30"
        metrics["search_window"] = {"start_date": "2026-08-14", "end_date": "2026-08-01"}
        metrics["google_search_console"]["property_verified"] = "yes"
        gaps = self.module.site_metric_gaps(metrics)
        self.assertIn("site metrics snapshot_date", gaps)
        self.assertIn("search_window start_date must not be after end_date", gaps)
        self.assertIn("google_search_console.property_verified", gaps)

    def test_markdown_cells_escape_untrusted_export_text(self) -> None:
        escaped = self.module._markdown("<img src=x>|[click](https://example.com)`code`")
        self.assertNotIn("<img", escaped)
        self.assertNotIn("|[click]", escaped)
        self.assertIn("&lt;img src=x&gt;", escaped)
        self.assertIn("\\|\\[click\\]", escaped)


if __name__ == "__main__":
    unittest.main()
