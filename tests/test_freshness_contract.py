from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FreshnessContractTests(unittest.TestCase):
    def test_frontend_freshness_comes_only_from_dataset_generated_at(self) -> None:
        index_config = (ROOT / "assets" / "index.config.js").read_text(encoding="utf-8")
        index_data = (ROOT / "assets" / "index.data.js").read_text(encoding="utf-8")
        index_js = (ROOT / "assets" / "index.js").read_text(encoding="utf-8")
        load_dataset_start = index_data.index("  async function loadDataset(datasetKey) {")
        load_dataset_end = index_data.index("\n  return {", load_dataset_start)
        load_dataset_source = index_data[load_dataset_start:load_dataset_end]

        self.assertNotIn("lastUpdatedDate = new Date()", load_dataset_source)
        self.assertIn('const dateOnly = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw)', index_data)
        self.assertIn("lastUpdatedDate = parseDatasetGeneratedAt(payload.generated_at)", load_dataset_source)
        self.assertIn("generated_at: lastUpdatedDate ? payload.generated_at.trim() : null", load_dataset_source)
        self.assertIn('updateUnavailable: "資料更新時間未提供"', index_config)
        self.assertIn('updateUnavailable: "Dataset update unavailable"', index_config)
        self.assertIn('t("updateUnavailable")', index_js)


if __name__ == "__main__":
    unittest.main()
