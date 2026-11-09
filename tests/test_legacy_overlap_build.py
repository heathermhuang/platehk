from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_all_dataset as combined
import build_all_short_exact_index as search


class LegacyOverlapBuildTests(unittest.TestCase):
    def test_combined_and_search_builds_agree_on_historical_resales(self):
        historic = {"single_line": "AB 123", "amount_hkd": 1000,
                    "auction_date": "1980-01-01", "date_precision": "year_range",
                    "year_range": "1980-1989", "result_status": "sold"}
        dated = {**historic, "auction_date": "2020-01-01", "date_precision": "day", "year_range": None}
        resale = {**dated, "auction_date": "2021-01-01"}
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            data = Path(directory)
            datasets = {key: data / key for key in ("tvrm_physical", "tvrm_eauction", "tvrm_legacy")}
            for key, rows in {"tvrm_physical": [dated], "tvrm_eauction": [],
                              "tvrm_legacy": [historic, dated, resale]}.items():
                base = datasets[key]
                combined.write_json(base / "results.slim.json", rows)
                auctions = [{"auction_date": row["auction_date"]} for row in rows]
                combined.write_json(base / "auctions.json", auctions)
                combined.write_json(base / "issues.manifest.json", {"issues": auctions})
                for row in rows:
                    combined.write_json(base / "issues" / f"{row['auction_date']}.json", [row])
            stack.enter_context(patch.multiple(combined, DATA=data, DATASETS=datasets,
                                              OUT=data / "all", ISSUES_DIR=data / "all/issues"))
            outputs = {name: data / getattr(search, name).relative_to(search.DATA)
                       for name in ("POPULAR_MANIFEST", "OUT_SHORT", "OUT_PREFIX1", "OUT_TVRM_DEDUPE",
                                    "OUT_SEARCH_META", "OUT_CHAR1_DIR", "OUT_BIGRAM_DIR", "OUT_PREFIX2_DIR")}
            stack.enter_context(patch.multiple(search, DATA=data, **outputs))
            with contextlib.redirect_stdout(io.StringIO()):
                combined.build()
                search.build()
            rows = combined.load_json(data / "all/results.slim.json")
            retained = [row for row in rows if row["dataset_key"] == "tvrm_legacy"]
            self.assertEqual([row["auction_date"] for row in retained], ["1980-01-01", "2021-01-01"])
            report = combined.load_json(outputs["OUT_TVRM_DEDUPE"])
            self.assertEqual(report["rows_to_drop"], 1)
            self.assertEqual(report["keys"], [])
            self.assertEqual(report["exact_keys"], ['["AB123",1000,"2020-01-01"]'])
            self.assertEqual([row["auction_date"] for row in report["sample_rows"]], ["2020-01-01"])
            self.assertEqual(combined.load_json(outputs["OUT_SEARCH_META"])["legacy_overlap_rows"], 1)
            cached = combined.load_json(outputs["OUT_PREFIX1"])["A"]["rows"]
            self.assertEqual(len(cached), 3)
            self.assertFalse(search.should_drop_legacy_row(retained[0], set(report["exact_keys"]), set(report["keys"])))

if __name__ == "__main__":
    unittest.main()
