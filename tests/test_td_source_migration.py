from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_dataset
import build_events
import build_tvrm_dataset
import merge_tvrm_exact_workbook

BASE = 'https://www.td.gov.hk'
ROOT = '/tc/public_services/vehicle_registration_mark_n/ar/'


class TdSourceMigrationTests(unittest.TestCase):
    def test_migrated_pvrm_metadata_preserves_old_mixed_tvrm_inputs(self):
        repo = Path(__file__).resolve().parents[1]
        old = [
            {'auction_date': date, 'auction_date_label': date, 'is_lny': True,
             'pdf_url': BASE + '/filemanager/tc/content_4806/' + name}
            for date, name in [('2008-02-23', '20080223ret.pdf'), ('2009-02-07', '20090207ret.pdf'), ('2010-02-28', 'auctionresultshandout_20100228.pdf')]
        ]
        sources = dict(line.split('\t', 1)[::-1] for line in (repo / 'data/tvrm_physical/sources.tsv').read_text().splitlines())
        counts = []

        def build_one(kind, pdfs, out_dir, *, lny_url_set, pvrm_date_by_url):
            if kind == 'physical':
                for pdf in pdfs:
                    path = repo / 'data/tvrm_physical/pdfs' / sources[pdf.pdf_url]
                    parsed = build_tvrm_dataset.parse_tvrm_document(kind, path, pdf, lny_url_set, pvrm_date_by_url)
                    counts.append(len(parsed['rows']))

        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / 'tvrm_physical').mkdir()
            (data / 'tvrm_eauction').mkdir()
            migrated = [{**x, 'pdf_url': x['pdf_url'].replace('content_4806', 'content_5438')} for x in old]
            (data / 'auctions.json').write_text(json.dumps(migrated))
            (data / 'tvrm_physical/auctions.json').write_text(json.dumps(old))
            (data / 'tvrm_physical/urls.all.txt').write_text('\n'.join(x['pdf_url'] for x in old))
            with patch.object(build_tvrm_dataset, 'DATA_DIR', data), \
                    patch.object(build_tvrm_dataset, 'scrape_index_seed_pdfs', return_value=[]), \
                    patch.object(build_tvrm_dataset, 'discover_physical_standard_pdfs', return_value=[]), \
                    patch.object(build_tvrm_dataset, 'discover_eauction_by_thursdays', return_value=[]), \
                    patch.object(build_tvrm_dataset, 'build_one', side_effect=build_one), \
                    patch.object(build_tvrm_dataset.subprocess, 'check_call'):
                build_tvrm_dataset.build()
        self.assertEqual(counts, [36, 39, 37])

    def test_grouped_metadata_retains_each_mixed_pdf_without_labeling_other_pdfs(self):
        url = BASE + '/filemanager/tc/content_4806/20080223ret.pdf'
        alias = url.replace('content_4806', 'content_5438')
        ordinary = BASE + '/filemanager/tc/content_4804/tvrm_auction_result_20080223_chi.pdf'
        day = '2008-02-23'
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            base = data / 'tvrm_physical'
            (base / 'issues').mkdir(parents=True)
            records = [{'auction_date': day, 'pdf_url': u, 'is_lny': mixed} for u, mixed in [(url, True), (alias, True), (ordinary, False)]]
            (base / 'auctions.json').write_text(json.dumps(records))
            (base / 'issues.manifest.json').write_text(json.dumps({'issues': [{'auction_date': day}]}))
            (base / 'issues' / (day + '.json')).write_text(json.dumps([{'auction_date': day, 'single_line': '18', 'double_line': None, 'amount_hkd': 16500000, 'pdf_url': url}]))
            with patch.object(merge_tvrm_exact_workbook, 'DATA', data):
                state = merge_tvrm_exact_workbook.load_dataset_state('tvrm_physical')
                self.assertEqual(set(state['auctions_by_date'][day].get('lny_pdf_urls', [])), {url, alias})
                merge_tvrm_exact_workbook.rebuild_dataset('tvrm_physical', state)
                rebuilt = merge_tvrm_exact_workbook.load_dataset_state('tvrm_physical')
            meta = rebuilt['auctions_by_date'][day]
            self.assertEqual(set(meta['lny_pdf_urls']), {url, alias})
            self.assertEqual(set(meta['pdf_urls']), {url, alias, ordinary})

            # The grouped representative can be an ordinary PDF; classification is per source.
            (data / 'auctions.json').write_text('[]')
            (base / 'urls.all.txt').write_text(url)
            (data / 'tvrm_eauction').mkdir()
            contexts = []
            def capture(kind, pdfs, out_dir, *, lny_url_set, pvrm_date_by_url):
                if kind == 'physical':
                    contexts.append(lny_url_set)
            with patch.object(build_tvrm_dataset, 'DATA_DIR', data), \
                    patch.object(build_tvrm_dataset, 'scrape_index_seed_pdfs', return_value=[]), \
                    patch.object(build_tvrm_dataset, 'discover_physical_standard_pdfs', return_value=[]), \
                    patch.object(build_tvrm_dataset, 'discover_eauction_by_thursdays', return_value=[]), \
                    patch.object(build_tvrm_dataset, 'build_one', side_effect=capture), \
                    patch.object(build_tvrm_dataset.subprocess, 'check_call'):
                build_tvrm_dataset.build()
            self.assertEqual(contexts, [{url, alias}])

    def test_pvrm_discovery_retains_current_archive_and_mixed_lny_results(self):
        pages = {
            BASE + ROOT + 'cy/index.html': '<li><a href="/filemanager/tc/content_5436/pvrm_result_20261003_chi.pdf">2026年10月3日上午</a></li>',
            BASE + ROOT + 'pyar/index.html': '<li><a href="/filemanager/tc/content_5437/20060916pvrmret.pdf">2006年9月16日</a></li>',
            BASE + ROOT + 'lnyar/index.html': '<li><a href="/filemanager/tc/content_5438/20080223ret.pdf">2008年2月23日</a></li>',
            BASE + ROOT + 'index.html': '<table><tr><td><a href="/filemanager/tc/content_5416/TVRMs Auction Result Handout 3 Oct 2026.pdf">拍賣結果</a></td></tr><tr><td><a href="/filemanager/tc/content_5420/lny_auction_result_20260301_CHI.pdf">2026</a></td></tr></table>',
        }
        with patch.object(build_dataset, 'request_bytes', side_effect=lambda url: pages[url].encode()):
            items = build_dataset.scrape_pdf_index()
        self.assertEqual(len(items), 4)
        self.assertEqual({x.date_iso for x in items}, {'2006-09-16', '2008-02-23', '2026-03-01', '2026-10-03'})
        self.assertEqual(items[-1].session, '上午')
        self.assertTrue(all('TVRM' not in x.pdf_url for x in items))

    def test_tvrm_discovery_uses_new_results_page_and_abbreviated_months(self):
        html = '<table><tr><td>2026年10月3日</td><td><a href="/filemanager/tc/content_5416/TVRMs Auction Result Handout 3 Oct 2026.pdf">拍賣結果</a></td></tr></table>'
        with patch.object(build_tvrm_dataset, 'request_bytes', return_value=html.encode()) as request:
            items = build_tvrm_dataset.scrape_index_seed_pdfs()
        self.assertEqual(request.call_args.args[0], BASE + ROOT + 'index.html')
        self.assertEqual(items[0].date_iso, '2026-10-03')

    def test_calendar_reads_row_dates_and_linkless_online_windows(self):
        en = '''<table><tr><td>8 October noon to 12 October noon 2026</td><td><a href="https://e-auction.td.gov.hk/en">E-Auction</a></td></tr><tr><td>22 October noon to 26 October noon 2026</td></tr></table>
        <table><tr><td>10 October 2026 (Sat)</td><td><a href="/filemanager/tc/content_5419/TVRM%20Auction%20Handout%20for%2010.10.2026.Chi.pdf">Auction List (afternoon)</a></td></tr><tr><td>10 October 2026 (Sat)</td><td><a href="/filemanager/tc/content_5419/PVRM%20Auction%20Handout%20for%2010.10.2026.Chi.pdf">Auction List (morning)</a></td></tr></table>'''
        zh = en.replace('8 October noon to 12 October noon 2026', '2026年10月8日中午至2026年10月12日中午').replace('22 October noon to 26 October noon 2026', '2026年10月22日中午至2026年10月26日中午').replace('10 October 2026 (Sat)', '2026年10月10日(星期六)').replace('Auction List (afternoon)', '拍賣名單(下午)').replace('Auction List (morning)', '拍賣名單(上午)')
        items = build_events.scrape_coming_auction_events(build_events.hk_datetime(2026, 10, 9), BeautifulSoup(en, 'html.parser'), BeautifulSoup(zh, 'html.parser'))
        self.assertEqual(len(items), 4)
        physical = {x['type']: x for x in items if x['type'] != 'tvrm_eauction'}
        self.assertEqual(physical['pvrm_physical']['start_at'], '2026-10-10T00:00:00+08:00')
        self.assertEqual(physical['tvrm_physical']['start_at'], '2026-10-10T12:00:00+08:00')
        online = [x for x in items if x['type'] == 'tvrm_eauction']
        self.assertEqual(online[1]['start_at'], '2026-10-22T12:00:00+08:00')
        self.assertIn('10月22日', online[1]['date_label_zh'])


if __name__ == '__main__':
    unittest.main()
