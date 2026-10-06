from __future__ import annotations
import hashlib,json,sys,tempfile,unittest
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import build_dataset,refresh_sources,run_cached_builder
from pdf_parse_cache import PdfParseCache,parser_version

URL='https://www.td.gov.hk/filemanager/tc/content_4806/lny_auction_result_20260301_CHI.pdf'

def blank_pdf():
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Count 1 /Kids [3 0 R] >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',b'<< /Length 0 >>\nstream\n\nendstream']
    raw=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):
        offsets.append(len(raw));raw+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(raw);raw+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets)
    return raw+f'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()

def bundle(kind='pvrm'):
    row={'single_line':'TEST','amount_hkd':1000,'auction_date':'2026-03-01','pdf_url':URL}
    result={'rows':[row],'total_proceeds_hkd':1000,'is_lny':True}
    if kind=='pvrm':result['total_proceeds_raw']='1,000'
    else:result.update(auction_date='2026-03-01',auction_date_label='2026年3月1日')
    return result

class RefreshPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.pdf=self.root/'source.pdf';self.pdf.write_bytes(blank_pdf());self.sha=hashlib.sha256(self.pdf.read_bytes()).hexdigest();self.receipts=self.root/'receipts.jsonl'
        self.probe={'probe_id':'fixture-probe','updates':[{'url':URL,'sha256':self.sha,'kind':'physical'}],'index_urls':[URL]}
        self.catalog={URL:{'kind':'pvrm','sha256':self.sha,'consumers':['pvrm','physical']}}
        self.pvrm=PdfParseCache(parser_version(('scripts/build_dataset.py','scripts/lny_mixed_parser.py')),self.root/'cache')
        self.tvrm=PdfParseCache(parser_version(('scripts/build_tvrm_dataset.py','scripts/build_dataset.py','scripts/lny_mixed_parser.py','scripts/parse_tvrm_pdfs.py')),self.root/'cache')
        self.env=patch.dict('os.environ',{'GITHUB_RUN_ID':'local'});self.env.start()
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def capture(self,kind,value=None,probe='fixture-probe'):
        context={'pdf_url':URL}
        if kind!='pvrm':context['kind']=kind
        run_cached_builder.capture_result(self.pvrm if kind=='pvrm' else self.tvrm,self.pdf,context,value if value is not None else bundle(kind),probe,self.receipts)
    def verify(self):refresh_sources.validate_catalog(self.catalog,self.probe,receipts=self.receipts)
    def test_cached_entry_alone_is_not_current_run_evidence(self):
        self.pvrm.parse(self.pdf,{'pdf_url':URL},lambda:bundle())
        with self.assertRaisesRegex(ValueError,'receipts are missing'):self.verify()
    def test_shared_pdf_requires_each_dataset_and_zero_rows_stop_publication(self):
        self.capture('pvrm')
        with self.assertRaisesRegex(ValueError,'consuming dataset'):self.verify()
        empty=bundle('physical');empty['rows']=[];self.capture('physical',empty)
        with self.assertRaisesRegex(ValueError,'zero extracted rows'):self.verify()
    def test_actual_textless_pdf_is_held_instead_of_acknowledged(self):
        source=build_dataset.AuctionPdf('2026-03-01','2026年3月1日',None,URL)
        value=build_dataset.parse_pvrm_document(self.pdf,source);self.assertEqual(value['rows'],[])
        self.capture('pvrm',value)
        with self.assertRaisesRegex(ValueError,'zero extracted rows'):self.verify()
    def test_qualified_shared_results_supply_all_consumer_counts(self):
        self.capture('pvrm');self.capture('physical');self.verify()
        self.assertEqual(self.catalog[URL]['parsed'],{'pvrm':1,'physical':1})
    def test_stale_or_malformed_results_cannot_satisfy_the_guard(self):
        self.capture('pvrm',probe='previous-probe')
        with self.assertRaisesRegex(ValueError,'stale or malformed'):self.verify()
        self.receipts.unlink();self.capture('pvrm',{'rows':[{}]})
        with self.assertRaisesRegex(ValueError,'stale or malformed'):self.verify()
    def test_cache_hits_produce_new_receipts_without_reparsing(self):
        tmp=self.root/'.tmp';tmp.mkdir();(tmp/'source-probe.json').write_text(json.dumps({'probe_id':'fixture-probe'}))
        context={'pdf_url':URL};self.pvrm.parse(self.pdf,context,lambda:bundle())
        def execute(_path,run_name):self.pvrm.parse(self.pdf,context,lambda:self.fail('valid cache must be reused'))
        with patch.object(run_cached_builder,'ROOT',self.root),patch.object(run_cached_builder,'RECEIPTS',self.receipts),patch.object(run_cached_builder.runpy,'run_path',side_effect=execute):
            run_cached_builder.run_builder('pvrm',reset=True)
        record=json.loads(self.receipts.read_text());self.assertTrue(record['schema_valid']);self.assertEqual(record['row_count'],1);self.assertEqual(record['probe_id'],'fixture-probe');self.assertEqual(self.pvrm.hits,1)
    def test_zero_cached_rows_cannot_remove_an_unchanged_nonempty_source(self):
        value=bundle();value['rows']=[]
        run_cached_builder.capture_result(self.pvrm,self.pdf,{'pdf_url':URL},value,'fixture-probe',self.receipts,expected_nonempty=True)
        self.probe['updates']=[]
        with self.assertRaisesRegex(ValueError,'previously nonempty'):self.verify()
    def test_builder_caught_parser_exception_still_leaves_a_failed_receipt(self):
        tmp=self.root/'.tmp';tmp.mkdir();(tmp/'source-probe.json').write_text(json.dumps({'probe_id':'fixture-probe'}))
        def failed():raise RuntimeError('parser failed')
        def execute(_path,run_name):
            try:self.pvrm.parse(self.pdf,{'pdf_url':URL},failed)
            except RuntimeError:pass
        with patch.object(run_cached_builder,'ROOT',self.root),patch.object(run_cached_builder,'RECEIPTS',self.receipts),patch.object(run_cached_builder.runpy,'run_path',side_effect=execute):
            run_cached_builder.run_builder('pvrm',reset=True)
        self.assertFalse(json.loads(self.receipts.read_text())['schema_valid'])
        with self.assertRaisesRegex(ValueError,'stale or malformed'):self.verify()
    def test_merged_workbook_counts_do_not_create_a_false_pdf_baseline(self):
        tmp=self.root/'.tmp';tmp.mkdir();(tmp/'source-probe.json').write_text(json.dumps({'probe_id':'fixture-probe'}))
        data=self.root/'data/tvrm_physical';data.mkdir(parents=True)
        (data/'auctions.json').write_text(json.dumps([{'pdf_url':URL,'entry_count':220}]))
        (data/'results.slim.json').write_text(json.dumps([{'pdf_url':URL,'source_type':'xlsx_exact_dates'}]))
        context={'pdf_url':URL,'kind':'physical'};value=bundle('physical');value['rows']=[]
        def execute(_path,run_name):self.tvrm.parse(self.pdf,context,lambda:value)
        with patch.object(run_cached_builder,'ROOT',self.root),patch.object(run_cached_builder,'RECEIPTS',self.receipts),patch.object(run_cached_builder.runpy,'run_path',side_effect=execute):
            run_cached_builder.run_builder('tvrm',reset=True)
        self.assertFalse(json.loads(self.receipts.read_text())['expected_nonempty'])
        self.probe['updates']=[];self.verify()
        self.probe['updates']=[{'url':URL,'sha256':self.sha,'kind':'physical'}]
        with self.assertRaisesRegex(ValueError,'zero extracted rows'):self.verify()

if __name__=='__main__':unittest.main()
