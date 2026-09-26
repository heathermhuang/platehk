from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_tvrm_dataset as builder


class PhysicalAuctionParserTests(unittest.TestCase):
    def source(self):
        return builder.AuctionPdf(
            "physical", "2026-09-12", "2026年9月12日",
            "https://www.td.gov.hk/filemanager/tc/content_4804/"
            "TVRMs%20Auction%20Result%20Handout%2012%20Sept%202026_CH.pdf",
        )

    def test_official_september_handout_includes_numeric_mark_and_reconciles(self):
        pdf = ROOT / "data/tvrm_physical/pdfs/2026-09-12_1e3cc10d5e.pdf"
        rows = builder.parse_physical_pdf_rows(pdf, self.source())
        numeric = [r for r in rows if r["single_line"] == "1314"]
        self.assertEqual(len(numeric), 1)
        self.assertEqual(numeric[0]["amount_hkd"], 310000)
        self.assertEqual(numeric[0]["pdf_url"], self.source().pdf_url)
        self.assertEqual(len(rows), 57)
        total = builder.extract_total_sale_proceeds(pdf)
        self.assertEqual(total, 1295000)
        self.assertEqual(sum(r["amount_hkd"] for r in rows), total)

    def test_sparse_mark_cells_preserve_letters_digits_and_unsold_boundary(self):
        table = [
            ["*", "", "1314", "310,000", "", "*", "SB", "8", "175,000", ""],
            ["*", "R", "", "25,500,000", "", "*", "", "7283", "U/S", ""],
            ["*", "CK", "9922", "U/S", "", "*", "WH", "123", "U/S", ""],
        ]
        page = MagicMock()
        page.extract_tables.return_value = [table]
        document = MagicMock()
        document.pages = [page]
        with patch.object(builder.pdfplumber, "open") as open_pdf, \
                patch.object(builder, "extract_total_sale_proceeds", return_value=None):
            open_pdf.return_value.__enter__.return_value = document
            rows = builder.parse_physical_pdf_rows(Path("test.pdf"), self.source())
        self.assertEqual(
            {(r["single_line"], r["amount_hkd"]) for r in rows},
            {("1314", 310000), ("SB 8", 175000), ("R", 25500000)},
        )
        self.assertEqual(len(rows), 3)

    def test_official_june_handout_recovers_rows_outside_detected_table(self):
        pdf = ROOT / "data/tvrm_physical/pdfs/2026-06-27_78ef571b84.pdf"
        source = builder.AuctionPdf(
            "physical", "2026-06-27", "2026年6月27日",
            "https://www.td.gov.hk/filemanager/tc/content_4804/"
            "TVRMs%20Auction%20Result%20Handout%2027%20June%202026_CH.pdf",
        )
        rows = builder.parse_physical_pdf_rows(pdf, source)
        self.assertEqual(len(rows), 64)
        self.assertEqual(sum(row["amount_hkd"] for row in rows), 1227000)
        self.assertIn(("LH 17", 8000), {(r["single_line"], r["amount_hkd"]) for r in rows})
        self.assertIn(("ME 98", 22000), {(r["single_line"], r["amount_hkd"]) for r in rows})
        self.assertTrue(all(row["auction_date"] == "2026-06-27" for row in rows))

    def test_reconciled_fallback_cannot_discard_a_table_record(self):
        page = MagicMock()
        page.extract_tables.return_value = [[["SB", "8", "175,000"]]]
        document = MagicMock()
        document.pages = [page]
        with patch.object(builder.pdfplumber, "open") as open_pdf, \
                patch.object(builder, "extract_total_sale_proceeds", return_value=310000), \
                patch.object(builder, "parse_physical_rows_by_words", return_value=[
                    {"single_line": "1314", "amount_hkd": 310000, "page": 1},
                ]):
            open_pdf.return_value.__enter__.return_value = document
            rows = builder.parse_physical_pdf_rows(Path("test.pdf"), self.source())
        self.assertEqual([(r["single_line"], r["amount_hkd"]) for r in rows], [("SB 8", 175000)])


if __name__ == "__main__":
    unittest.main()
