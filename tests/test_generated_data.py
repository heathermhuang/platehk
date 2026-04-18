from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_plate(value) -> str:
    if isinstance(value, list):
        raw = "".join(str(x or "") for x in value)
    elif value is None:
        raw = ""
    else:
        raw = str(value)
    return raw.upper().replace(" ", "").replace("I", "1").replace("O", "0").strip()


class GeneratedDataTests(unittest.TestCase):
    def test_legacy_overlap_report_matches_source_data(self) -> None:
        physical = _load(DATA / "tvrm_physical" / "results.slim.json")
        eauction = _load(DATA / "tvrm_eauction" / "results.slim.json")
        legacy = _load(DATA / "tvrm_legacy" / "results.slim.json")
        overlap = _load(DATA / "all.tvrm_legacy_overlap.json")

        nonlegacy_exact_keys = {
            json.dumps(
                [_normalize_plate(r.get("single_line") or r.get("double_line")), r.get("amount_hkd"), r.get("auction_date")],
                ensure_ascii=False,
                separators=(",", ":"),
            )
            for r in physical + eauction
        }
        nonlegacy_coarse_keys = {
            json.dumps([_normalize_plate(r.get("single_line") or r.get("double_line")), r.get("amount_hkd")], ensure_ascii=False, separators=(",", ":"))
            for r in physical + eauction
        }
        legacy_rows_to_drop = 0
        legacy_overlap_keys = set()
        legacy_overlap_exact_keys = set()
        for row in legacy:
            if row.get("date_precision") == "day":
                key = json.dumps(
                    [_normalize_plate(row.get("single_line") or row.get("double_line")), row.get("amount_hkd"), row.get("auction_date")],
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                if key in nonlegacy_exact_keys:
                    legacy_rows_to_drop += 1
                    legacy_overlap_exact_keys.add(key)
            else:
                key = json.dumps([_normalize_plate(row.get("single_line") or row.get("double_line")), row.get("amount_hkd")], ensure_ascii=False, separators=(",", ":"))
                if key in nonlegacy_coarse_keys:
                    legacy_rows_to_drop += 1
                    legacy_overlap_keys.add(key)

        self.assertEqual(overlap["rows_to_drop"], legacy_rows_to_drop)
        self.assertEqual(set(overlap["keys"]), legacy_overlap_keys)
        self.assertEqual(set(overlap["exact_keys"]), legacy_overlap_exact_keys)

    def test_search_index_artifacts_are_coherent(self) -> None:
        meta = _load(DATA / "all.search.meta.json")
        short_exact = _load(DATA / "all.short_exact.json")
        prefix1 = _load(DATA / "all.prefix1.top200.json")

        self.assertEqual(meta["short_exact_keys"], len(short_exact))
        self.assertGreater(meta["prefix1_keys"], 20)
        self.assertEqual(meta["char1_keys"], 0)
        self.assertEqual(meta["bigram_keys"], 0)
        self.assertIn("A", prefix1)
        self.assertGreater(prefix1["A"]["total"], 0)
        self.assertGreater(len(prefix1["A"]["rows"]), 0)
        for row in prefix1["A"]["rows"][:50]:
            plate = _normalize_plate(row.get("single_line") or row.get("double_line"))
            self.assertTrue(plate.startswith("A"))

    def test_public_api_index_includes_legacy_dataset(self) -> None:
        index = _load(ROOT / "api" / "v1" / "index.json")
        self.assertIn("tvrm_legacy", index["datasets"])
        legacy = index["datasets"]["tvrm_legacy"]
        self.assertEqual(legacy["base"], "/api/v1/tvrm_legacy")
        self.assertGreater(legacy["total_rows"], 40000)

    def test_legacy_dataset_is_pre_2007_year_ranges_only(self) -> None:
        manifest = _load(DATA / "tvrm_legacy" / "issues.manifest.json")
        self.assertEqual(manifest["issue_count"], 4)
        self.assertTrue(all(issue.get("date_precision") == "year_range" for issue in manifest["issues"]))
        self.assertEqual(manifest["issues"][0]["auction_date_label"], "2000-2006")
        self.assertEqual(manifest["issues"][-1]["auction_date_label"], "1973-1979")

    def test_exact_workbook_rows_are_merged_into_dated_tvrm_datasets(self) -> None:
        physical_manifest = _load(DATA / "tvrm_physical" / "issues.manifest.json")
        self.assertLessEqual(physical_manifest["issues"][-1]["auction_date"], "2007-12-31")
        issue_rows = _load(DATA / "tvrm_physical" / "issues" / "2007-01-13.json")
        self.assertGreater(len(issue_rows), 0)
        self.assertTrue(any(row.get("source_type") == "xlsx_exact_dates" for row in issue_rows))

    def test_workbook_backed_tvrm_issues_keep_root_relative_source_metadata(self) -> None:
        physical_auctions = _load(DATA / "tvrm_physical" / "auctions.json")
        eauction_auctions = _load(DATA / "tvrm_eauction" / "auctions.json")

        physical_workbook = next(item for item in physical_auctions if str(item.get("pdf_url") or "").endswith(".xlsx"))
        self.assertEqual(physical_workbook["source_format"], "xlsx")
        self.assertTrue(str(physical_workbook["pdf_url"]).startswith("./data/"))

        eauction_workbook = next(
            (item for item in eauction_auctions if str(item.get("pdf_url") or "").endswith(".xlsx")),
            None,
        )
        if eauction_workbook is not None:
            self.assertEqual(eauction_workbook["source_format"], "xlsx")
            self.assertTrue(str(eauction_workbook["pdf_url"]).startswith("./data/"))

    def test_hot_search_cache_manifest_and_sample_exist(self) -> None:
        manifest = _load(DATA / "hot_search" / "manifest.json")
        self.assertEqual(manifest["dataset"], "all")
        self.assertEqual(manifest["sort"], "amount_desc")
        self.assertGreater(manifest["query_count"], 50)

        sample = _load(DATA / "hot_search" / "all_amount_desc" / "88.json")
        self.assertEqual(sample["dataset"], "all")
        self.assertEqual(sample["q"], "88")
        self.assertEqual(sample["sort"], "amount_desc")
        self.assertGreater(sample["total"], 100)
        self.assertGreater(len(sample["rows"]), 0)

    def test_all_amount_desc_preset_exists_and_is_sorted(self) -> None:
        rows = _load(DATA / "all.preset.amount_desc.top1000.json")
        self.assertEqual(len(rows), 1000)
        self.assertTrue(all(row.get("dataset_key") for row in rows[:20]))
        amounts = [int(row.get("amount_hkd") or -1) for row in rows[:50]]
        self.assertEqual(amounts, sorted(amounts, reverse=True))

    def test_audit_report_contains_validation_metrics(self) -> None:
        audit = _load(DATA / "audit.json")
        self.assertIn("validation", audit)
        self.assertIn("tvrm_legacy", audit["validation"])
        self.assertIn("null_amount_rows", audit["validation"]["pvrm"])
        self.assertIn("overlap_rows_hidden_in_all", audit["validation"]["tvrm_legacy"])


if __name__ == "__main__":
    unittest.main()
