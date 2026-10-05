from __future__ import annotations
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
from pdf_parse_cache import PdfParseCache
import refresh_sources


class PdfParseCacheTests(unittest.TestCase):
    def test_identical_document_reuses_results_and_changed_inputs_reparse(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pdf = root/'input.pdf'; pdf.write_bytes(b'%PDF-first')
            calls = []
            def parse():
                calls.append(1); return {'rows':[{'plate':'AA88'}], 'total':123}
            cache = PdfParseCache('parser-v1',root/'cache')
            self.assertEqual(cache.parse(pdf,{'date':'2026-10-03'},parse),cache.parse(pdf,{'date':'2026-10-03'},parse))
            self.assertEqual(len(calls),1)
            pdf.write_bytes(b'%PDF-corrected')
            cache.parse(pdf,{'date':'2026-10-03'},parse)
            cache.parse(pdf,{'date':'2026-10-04'},parse)
            PdfParseCache('parser-v2',root/'cache').parse(pdf,{'date':'2026-10-04'},parse)
            self.assertEqual(len(calls),4)

    def test_failed_or_corrupt_results_are_not_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); pdf=root/'input.pdf'; pdf.write_bytes(b'%PDF-test')
            cache=PdfParseCache('v1',root/'cache')
            def failed(): raise RuntimeError('parser failure')
            with self.assertRaises(RuntimeError): cache.parse(pdf,{},failed)
            self.assertFalse((root/'cache').exists())
            cache.parse(pdf,{},lambda:{'rows':[{'plate':'AA88'}]})
            next((root/'cache').glob('*.json')).write_text('broken')
            self.assertEqual(cache.parse(pdf,{},lambda:{'rows':[{'plate':'BB99'}]})['rows'][0]['plate'],'BB99')

    def test_force_reparse_keeps_content_cache_valid(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); pdf=root/'input.pdf'; pdf.write_bytes(b'%PDF-test');cache=PdfParseCache('v1',root/'cache')
            cache.parse(pdf,{},lambda:{'rows':[]})
            with patch.dict(os.environ,{'PDF_PARSE_FORCE':'1'}): cache.parse(pdf,{},lambda:{'rows':[{'plate':'AA88'}]})
            self.assertEqual(cache.parse(pdf,{},lambda: self.fail('must reuse forced results'))['rows'][0]['plate'],'AA88')

    def test_changed_shared_pdf_updates_both_dataset_inputs_and_mismatch_preserves_them(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);a=root/'a.pdf';b=root/'b.pdf';a.write_bytes(b'%PDF-old');b.write_bytes(b'%PDF-old')
            url='https://www.td.gov.hk/filemanager/tc/content_4804/test.pdf'
            raw=b'%PDF-corrected';probe={'updates':[{'url':url,'kind':'physical','sha256':hashlib.sha256(raw).hexdigest()}]}
            with patch.object(refresh_sources,'pdf_inventory',return_value={url:{'paths':[a,b]}}),patch.object(refresh_sources.subprocess,'check_output',return_value=raw):
                self.assertEqual(refresh_sources.apply_updates(probe,root),1)
            self.assertEqual(a.read_bytes(),raw);self.assertEqual(b.read_bytes(),raw)
            with patch.object(refresh_sources,'pdf_inventory',return_value={url:{'paths':[a,b]}}),patch.object(refresh_sources.subprocess,'check_output',return_value=b'%PDF-other'):
                with self.assertRaisesRegex(ValueError,'hash'):refresh_sources.apply_updates(probe,root)
            self.assertEqual(a.read_bytes(),raw)

    def test_source_updates_reject_nonofficial_urls_before_fetch(self):
        with patch.object(refresh_sources,'pdf_inventory',return_value={}),patch.object(refresh_sources.subprocess,'check_output') as fetch:
            for url in ['https://evil.test/filemanager/x.pdf','https://www.td.gov.hk@evil.test/filemanager/x.pdf','http://www.td.gov.hk/filemanager/x.pdf']:
                with self.assertRaisesRegex(ValueError,'Untrusted'):refresh_sources.apply_updates({'updates':[{'url':url}]})
            fetch.assert_not_called()

    def test_real_pvrm_and_physical_documents_match_after_cache_restore(self):
        import build_dataset
        import build_tvrm_dataset
        root=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            cache=PdfParseCache('parity-test',Path(temp))
            pvrm_meta=next(item for item in json.loads((root/'data/auctions.json').read_text()) if item['auction_date']=='2026-10-03')
            source=build_dataset.AuctionPdf(pvrm_meta['auction_date'],pvrm_meta['auction_date_label'],pvrm_meta.get('session'),pvrm_meta['pdf_url'])
            pdf=root/pvrm_meta['pdf_local']
            cold=cache.parse(pdf,{'kind':'pvrm'},lambda:build_dataset.parse_pvrm_document(pdf,source))
            warm=cache.parse(pdf,{'kind':'pvrm'},lambda:self.fail('unchanged PDF was reparsed'))
            self.assertEqual(cold,warm)
            expected=json.loads((root/'data/issues/2026-10-03.json').read_text())
            self.assertEqual(len(warm['rows']),len(expected))
            self.assertEqual(warm['total_proceeds_hkd'],1810000)
            physical_meta=next(item for item in json.loads((root/'data/tvrm_physical/auctions.json').read_text()) if item['auction_date']=='2026-10-03')
            inventory=refresh_sources.pdf_inventory(root)
            pdf=inventory[physical_meta['pdf_url']]['paths'][0]
            source=build_tvrm_dataset.AuctionPdf('physical','2026-10-03',physical_meta['auction_date_label'],physical_meta['pdf_url'])
            cold=cache.parse(pdf,{'kind':'physical'},lambda:build_tvrm_dataset.parse_tvrm_document('physical',pdf,source,set(),{}))
            warm=cache.parse(pdf,{'kind':'physical'},lambda:self.fail('unchanged PDF was reparsed'))
            self.assertEqual(cold,warm)
            self.assertEqual(len(warm['rows']),49)
            self.assertEqual(warm['total_proceeds_hkd'],897000)


if __name__ == '__main__': unittest.main()
