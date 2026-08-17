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

    def test_records_screenshot_only_with_generated_run_id_and_search_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            screenshot = input_dir / "captures" / "answer.png"
            screenshot.parent.mkdir(parents=True)
            screenshot.write_bytes(b"test-png")
            prompt = self.config["prompts"][0]
            result = recorder.record_evidence(
                input_dir=input_dir,
                config=self.config,
                platform="perplexity",
                prompt_id=prompt["id"],
                observed_prompt=prompt["prompt"],
                verbatim_answer="Screenshot-backed answer",
                model_or_surface="Perplexity test surface",
                web_search_enabled=False,
                captured_at="2026-08-17T12:30:00+08:00",
                screenshot_paths=["captures/answer.png"],
            )
            self.assertIn("--perplexity--source-discovery-zh--", result["run_id"])
            audit = baseline.load_ai_audit(input_dir / "ai-audit.csv", self.config)
            self.assertEqual(len(audit["evidence_rows"]), 1)

    def test_rejects_invalid_platform_prompt_urls_and_run_id(self) -> None:
        prompt = self.config["prompts"][0]
        cases = (
            ({"platform": "unknown"}, "Unknown platform"),
            ({"prompt_id": "unknown"}, "Unknown prompt_id"),
            ({"conversation_url": "file:///tmp/chat"}, "conversation_url must be an HTTP"),
            ({"cited_urls": ["not-a-url"]}, "cited_url must be an HTTP"),
            ({"run_id": "contains spaces"}, "run_id may contain only"),
        )
        for overrides, message in cases:
            with self.subTest(case=message), tempfile.TemporaryDirectory() as tmp_dir:
                input_dir = Path(tmp_dir) / "seo-aeo"
                baseline.initialise_inputs(input_dir, self.config)
                kwargs = {
                    "input_dir": input_dir,
                    "config": self.config,
                    "platform": "chatgpt",
                    "prompt_id": prompt["id"],
                    "observed_prompt": prompt["prompt"],
                    "verbatim_answer": "Answer",
                    "model_or_surface": "test surface",
                    "web_search_enabled": True,
                    "captured_at": "2026-08-17T12:30:00+08:00",
                    "conversation_url": "https://chatgpt.com/c/valid",
                    "run_id": "valid-run",
                }
                kwargs.update(overrides)
                with self.assertRaisesRegex(baseline.BaselineError, message):
                    recorder.record_evidence(**kwargs)

    def test_cli_records_prompt_and_answer_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            prompt_file = Path(tmp_dir) / "prompt.txt"
            answer_file = Path(tmp_dir) / "answer.txt"
            prompt_file.write_text(prompt["prompt"], encoding="utf-8")
            answer_file.write_text("CLI answer", encoding="utf-8")
            result = recorder.main(
                [
                    "--input-dir", str(input_dir),
                    "--platform", "chatgpt",
                    "--prompt-id", prompt["id"],
                    "--observed-prompt-file", str(prompt_file),
                    "--answer-file", str(answer_file),
                    "--model-or-surface", "ChatGPT test surface",
                    "--web-search-enabled", "yes",
                    "--captured-at", "2026-08-17T12:30:00+08:00",
                    "--conversation-url", "https://chatgpt.com/c/cli-test",
                    "--run-id", "cli-test",
                ]
            )
            self.assertEqual(result, 0)
            self.assertEqual(len(baseline.load_ai_audit(input_dir / "ai-audit.csv", self.config)["evidence_rows"]), 1)

    def test_refuses_existing_evidence_file_collision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_dir = Path(tmp_dir) / "seo-aeo"
            baseline.initialise_inputs(input_dir, self.config)
            prompt = self.config["prompts"][0]
            collision = input_dir / "evidence" / "chatgpt" / prompt["id"] / "collision.json"
            collision.parent.mkdir(parents=True)
            collision.write_text("existing", encoding="utf-8")
            with self.assertRaisesRegex(baseline.BaselineError, "Evidence file already exists"):
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
                    conversation_url="https://chatgpt.com/c/collision",
                    run_id="collision",
                )


if __name__ == "__main__":
    unittest.main()
