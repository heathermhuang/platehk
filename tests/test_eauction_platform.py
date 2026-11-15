from __future__ import annotations
import hashlib,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import build_tvrm_dataset as builder
import refresh_sources
from trusted_sources import eauction_reference

ROOT=Path(__file__).resolve().parents[1]
URL='https://e-auction.td.gov.hk/en/auctions/history?result=78&date=2026-11-05'
class EauctionPlatformTests(unittest.TestCase):
    def test_only_canonical_public_round_references_are_accepted(self):
        self.assertEqual(eauction_reference(URL),{'id':78,'date':'2026-11-05'})
        for bad in [URL+'&x=1',URL+'#token',URL.replace('https:','http:'),URL.replace('78','0'),URL.replace('2026-11-05','2026-02-30')]:
            self.assertIsNone(eauction_reference(bad))
        self.assertEqual(builder.extract_date_from_href(URL),'2026-11-05')
    def test_inventory_retains_platform_rounds_and_exact_download_hash_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for folder in ['data','data/tvrm_physical','data/tvrm_eauction']:
                base=root/folder;base.mkdir(parents=True,exist_ok=True)
                (base/'auctions.json').write_text('[]');(base/'sources.tsv').write_text('')
            source=root/'.tmp/eauction-pdfs/78.pdf';source.parent.mkdir(parents=True);source.write_bytes(b'%PDF-fixture')
            item={'url':URL,'date':'2026-11-05','kind':'eauction','sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
            self.assertEqual(refresh_sources.apply_updates({'updates':[item]},root),1)
            self.assertEqual(builder.load_urls_file(root/'data/tvrm_eauction/urls.all.txt'),[URL])
            destination=root/'data/tvrm_eauction/pdfs'/builder.local_pdf_name(item['date'],URL)
            self.assertEqual(destination.read_bytes(),source.read_bytes())
            item['sha256']='0'*64
            with self.assertRaisesRegex(ValueError,'hash no longer matches'):
                refresh_sources.apply_updates({'updates':[item]},root)
    def test_platform_dates_and_proceeds_are_verified_before_publication(self):
        source=builder.AuctionPdf('eauction','2026-11-05','',URL)
        rows=[{'amount_hkd':1000}]
        with patch.object(builder,'parse_eauction_pdf_rows',return_value=(rows,'2026年11月5日至2026年11月9日')),patch.object(builder,'extract_total_sale_proceeds',return_value=2000):
            with self.assertRaisesRegex(ValueError,'reconcile'):
                builder.parse_tvrm_document('eauction',Path('fixture.pdf'),source,None,None)
        with patch.object(builder,'parse_eauction_pdf_rows',return_value=(rows,'2026年10月22日至2026年10月26日')),patch.object(builder,'extract_total_sale_proceeds',return_value=1000):
            with self.assertRaisesRegex(ValueError,'dates differ'):
                builder.parse_tvrm_document('eauction',Path('fixture.pdf'),source,None,None)
    def test_scheduled_collection_precedes_plan_and_remains_model_free(self):
        workflow=(ROOT/'.github/workflows/auto-update.yml').read_text()
        self.assertLess(workflow.index('node scripts/eauction_source.mjs observe'),workflow.index('node scripts/refresh_control.mjs plan'))
        self.assertLess(workflow.index('pypdfium2==5.15.2'),workflow.index('node scripts/eauction_source.mjs observe'))
        self.assertNotIn('OPENAI_API_KEY',workflow)

class EauctionCoverageAlertTests(unittest.TestCase):
    def test_matching_generated_files_cannot_hide_an_overdue_platform_check(self):
        from datetime import datetime,timezone
        import auto_heal_update as heal
        now=datetime(2026,11,15,12,tzinfo=timezone.utc)
        rules=json.loads((ROOT/'.github/autoheal/rules.json').read_text())
        for checked in [None,'2026-11-14T00:00:00Z']:
            observer={'eauction_observation':{'enabled':True,'checked_at':checked,'sources_observed':3}}
            plan=heal.classify('',{'status':'current'},rules,observer=observer,observer_verified=True,now=now)
            self.assertEqual(plan['classification'],'eauction_coverage_overdue')
            self.assertEqual(plan['action'],'alert_human')
            self.assertFalse(plan['llm_escalation_required'])
    def test_pdf_archive_and_original_official_reference_remain_distinct(self):
        import build_cloudflare_public as publish
        from trusted_sources import eauction_pdf_url
        self.assertEqual(eauction_pdf_url(URL),'https://plate.hk/auction-sources/eauction/78.pdf')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);base=root/'data/tvrm_eauction';(base/'pdfs').mkdir(parents=True)
            raw=b'%PDF-original-byte-evidence';(base/'pdfs/result.pdf').write_bytes(raw)
            (base/'sources.tsv').write_text('result.pdf\t'+URL+'\n')
            with patch.object(publish,'ROOT',root),patch.object(publish,'TARGET',root/'public'):
                publish.copy_eauction_source_pdfs()
            self.assertEqual((root/'public/auction-sources/eauction/78.pdf').read_bytes(),raw)
