from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from auction_outcomes import LABELS, enrich_sources, raw_status
from build_auction_result_pages import load_rounds


class AuctionOutcomeTests(unittest.TestCase):
    def test_amounts_do_not_imply_a_sale_or_an_allocation(self):
        self.assertEqual(raw_status({"amount_hkd": 5000}), "unknown")
        self.assertEqual(raw_status({"amount_hkd": 5000, "amount_raw": "5,000"}), "sold")
        for raw in ("@5,000", "5,000@", "@ 5,000"):
            self.assertEqual(raw_status({"amount_hkd": 5000, "amount_raw": raw}), "assigned_special_fee")
        self.assertEqual(raw_status({"amount_hkd": 6000, "amount_raw": "@5,000"}), "unknown")
        self.assertEqual(raw_status({"amount_hkd": None, "amount_raw": "U/S"}), "unsold")

    def test_verified_outcomes_match_the_round_without_reclassifying_other_sales(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "issues").mkdir()
            rows = [{"single_line": "AA 88", "auction_date": day, "amount_hkd": 5000}
                    for day in ("2026-01-01", "2026-02-01")]
            (base / "results.slim.json").write_text(json.dumps(rows))
            (base / "results.json").write_text(json.dumps([{**rows[0], "amount_raw": "5,000"}]))
            (base / "issues.manifest.json").write_text(json.dumps({"issues": [{"auction_date": day} for day in ("2026-01-01", "2026-02-01")]}))
            rounds = [{"dataset": "pvrm", "id": "pvrm-2026-02-01", "start_date": "2026-02-01",
                       "source_url": "https://www.td.gov.hk/result.pdf", "rows": [
                           {"mark": "AA 88", "status": "special_fee", "amount_hkd": 5000, "page": 1},
                           {"mark": "BB 88", "status": "unsold", "amount_hkd": None, "page": 1}]}]
            enrich_sources(base, rounds)
            first = (base / "results.slim.json").read_bytes()
            actual = json.loads(first)
            self.assertEqual([r["result_status"] for r in actual], ["sold", "assigned_special_fee", "unsold"])
            self.assertIsNone(actual[-1]["amount_hkd"])
            enrich_sources(base, rounds)
            self.assertEqual(first, (base / "results.slim.json").read_bytes())
            rounds[0]["rows"][0]["amount_hkd"] = 10000
            with self.assertRaisesRegex(ValueError, "conflicts"):
                enrich_sources(base, rounds)

    def test_all_verified_handout_rows_survive_in_each_public_dataset(self):
        for auction in load_rounds():
            dataset = auction["dataset"]
            base = ROOT / "api/v1" / dataset
            rows = json.loads((base / "issues" / f"{auction['start_date']}.json").read_text())
            by_mark = {r["single_line"].replace(" ", ""): r for r in rows}
            for expected in auction["rows"]:
                row = by_mark[expected["mark"].replace(" ", "")]
                self.assertEqual(row["amount_hkd"], expected["amount_hkd"])
                status = "assigned_special_fee" if expected["status"] == "special_fee" else expected["status"]
                self.assertEqual(row["result_status"], status)

    def test_every_canonical_record_and_summary_exposes_its_outcome(self):
        rows = json.loads((ROOT / "data/all/results.slim.json").read_text())
        for row in rows:
            self.assertIn(row["result_status"], LABELS)
            self.assertEqual(row["result_text"], LABELS[row["result_status"]][1])
            if row["result_status"] == "unsold":
                self.assertIsNone(row["amount_hkd"])
        for row in json.loads((ROOT / "data/all/plates.json").read_text()):
            self.assertIn(row["highest_result_status"], LABELS)
            self.assertIn(row["latest_result_status"], LABELS)

    def test_static_english_answers_do_not_reuse_chinese_outcome_labels(self):
        from bs4 import BeautifulSoup
        import build_popular_plate_pages as pages
        entry = pages.build_plate_data()[0]
        doc = BeautifulSoup(pages.render_page({entry["plate_norm"]: entry}, entry, []), "html.parser")
        english = " ".join(node.get_text() for node in doc.select('[data-lang-only="en"]'))
        for labels in LABELS.values():
            self.assertNotIn(labels[0], english)
        self.assertIn(LABELS[entry["top_row"]["result_status"]][1], english)
        graph = json.loads(doc.select_one('script[type="application/ld+json"]').string)
        faq = next(item for item in graph["@graph"] if item.get("@type") == "FAQPage")
        for question in faq["mainEntity"]:
            if question["name"].startswith("What"):
                self.assertNotIn("結果未核實", question["acceptedAnswer"]["text"])

    def test_python_and_browser_outcome_vocabulary_agree(self):
        script = "import './assets/auction-outcomes.js'; console.log(JSON.stringify(Object.fromEntries(['sold','assigned_special_fee','unsold','unknown'].map(result_status=>[result_status,['zh','en'].map(lang=>globalThis.PlateAuctionOutcomes.label({result_status},lang))]))))"
        actual = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT))
        self.assertEqual(actual, {key: list(labels) for key, labels in LABELS.items()})


if __name__ == "__main__":
    unittest.main()
