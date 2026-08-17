from __future__ import annotations

import csv
import importlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

baseline = importlib.import_module("build_seo_aeo_baseline")
recorder = importlib.import_module("record_seo_aeo_evidence")


class SeoAeoEvidenceRecorderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = baseline.load_prompt_config(ROOT / "config" / "seo-aeo-prompts.json")

    def test_records_verbatim_evidence_and_binds_it_to_the_exact_row(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            result = recorder.record_evidence(
                input_dir=input_dir,
                config=self.config,
                platform="chatgpt",
                prompt_id=prompt["id"],
                observed_prompt=prompt["prompt"],
                verbatim_answer="Full answer text with a source citation.",
                model_or_surface="ChatGPT test surface",
                web_search_enabled=True,
                captured_at="2026-08-17T12:30:00+08:00",
                conversation_url="https://chatgpt.com/c/example",
                cited_urls=["https://www.td.gov.hk/example"],
                run_id="chatgpt-source-discovery-test",
            )

            evidence_path = input_dir / result["evidence_path"]
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            self.assertEqual(evidence["observed_prompt"], prompt["prompt"])
            self.assertEqual(evidence["verbatim_answer"], "Full answer text with a source citation.")
            self.assertEqual(evidence["run_id"], result["run_id"])

            with (input_dir / "ai-audit.csv").open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            row = next(item for item in rows if item["platform"] == "chatgpt" and item["prompt_id"] == prompt["id"])
            self.assertEqual(row["run_id"], result["run_id"])
            self.assertEqual(row["observed_prompt"], prompt["prompt"])
            self.assertEqual(row["evidence_path"], result["evidence_path"])
            self.assertEqual(row["evidence_sha256"], result["evidence_sha256"])
            self.assertEqual(row["audit_date"], "2026-08-17")

    def test_rejects_wrong_observed_prompt_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]

            with self.assertRaisesRegex(baseline.BaselineError, "Observed prompt does not match"):
                recorder.record_evidence(
                    input_dir=input_dir,
                    config=self.config,
                    platform="chatgpt",
                    prompt_id=prompt["id"],
                    observed_prompt=self.config["prompts"][1]["prompt"],
                    verbatim_answer="Answer",
                    model_or_surface="ChatGPT test surface",
                    web_search_enabled=True,
                    captured_at="2026-08-17T12:30:00+08:00",
                    run_id="wrong-prompt-test",
                )
            self.assertFalse((input_dir / "evidence").exists())

    def test_refuses_to_overwrite_an_existing_observation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            kwargs = {
                "input_dir": input_dir,
                "config": self.config,
                "platform": "chatgpt",
                "prompt_id": prompt["id"],
                "observed_prompt": prompt["prompt"],
                "verbatim_answer": "Answer",
                "model_or_surface": "ChatGPT test surface",
                "web_search_enabled": True,
                "captured_at": "2026-08-17T12:30:00+08:00",
                "conversation_url": "https://chatgpt.com/c/no-overwrite-test",
                "run_id": "no-overwrite-test",
            }
            recorder.record_evidence(**kwargs)
            with self.assertRaisesRegex(baseline.BaselineError, "Evidence already recorded"):
                recorder.record_evidence(**kwargs)

    def test_screenshot_must_stay_inside_private_input_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            with self.assertRaisesRegex(baseline.BaselineError, "screenshot_path must be relative"):
                recorder.record_evidence(
                    input_dir=input_dir,
                    config=self.config,
                    platform="chatgpt",
                    prompt_id=prompt["id"],
                    observed_prompt=prompt["prompt"],
                    verbatim_answer="Answer",
                    model_or_surface="ChatGPT test surface",
                    web_search_enabled=True,
                    captured_at="2026-08-17T12:30:00+08:00",
                    screenshot_paths=["../outside.png"],
                    run_id="path-boundary-test",
                )

    def test_requires_a_conversation_url_or_screenshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            with self.assertRaisesRegex(baseline.BaselineError, "conversation_url or screenshot_path"):
                recorder.record_evidence(
                    input_dir=input_dir,
                    config=self.config,
                    platform="chatgpt",
                    prompt_id=prompt["id"],
                    observed_prompt=prompt["prompt"],
                    verbatim_answer="Answer",
                    model_or_surface="ChatGPT test surface",
                    web_search_enabled=True,
                    captured_at="2026-08-17T12:30:00+08:00",
                    run_id="missing-locator-test",
                )

    def test_removes_new_evidence_if_csv_binding_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            with mock.patch.object(recorder, "_atomic_write_csv", side_effect=OSError("write failed")):
                with self.assertRaisesRegex(OSError, "write failed"):
                    recorder.record_evidence(
                        input_dir=input_dir,
                        config=self.config,
                        platform="chatgpt",
                        prompt_id=prompt["id"],
                        observed_prompt=prompt["prompt"],
                        verbatim_answer="Answer",
                        model_or_surface="ChatGPT test surface",
                        web_search_enabled=True,
                        captured_at="2026-08-17T12:30:00+08:00",
                        conversation_url="https://chatgpt.com/c/rollback-test",
                        run_id="rollback-test",
                    )
            self.assertFalse(any((input_dir / "evidence").rglob("*.json")))


if __name__ == "__main__":
    unittest.main()
