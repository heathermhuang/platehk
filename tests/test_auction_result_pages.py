from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from unittest.mock import patch

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_auction_result_pages as pages
import build_popular_plate_pages as popular
import verify_auction_result_sources as sources


class AuctionResultPageTests(unittest.TestCase):
    def setUp(self):
        self.rounds = {r['id']: r for r in pages.load_rounds()}

    def test_source_counts_and_known_dispositions(self):
        expected = {
            'pvrm-2026-09-12': (77, 23, 0, 1366000),
            'tvrm_physical-2026-09-12': (57, 0, 163, 1295000),
            'tvrm_eauction-2026-09-17': (216, 4, 0, 1650000),
            'pvrm-2026-09-05': (73, 27, 0, 1767000),
            'pvrm-2026-08-22': (83, 17, 0, 1669000),
            'tvrm_physical-2026-09-05': (68, 0, 152, 1259000),
            'tvrm_physical-2026-08-22': (97, 0, 123, 1454000),
            'tvrm_eauction-2026-09-03': (214, 6, 0, 1485000),
            'tvrm_eauction-2026-08-20': (213, 7, 0, 1550000),
        }
        for key, (sold, fee, unsold, proceeds) in expected.items():
            r = self.rounds[key]
            self.assertEqual(Counter(row['status'] for row in r['rows']), Counter({'sold': sold, 'special_fee': fee, 'unsold': unsold}))
            self.assertEqual(r['official_proceeds_hkd'], proceeds)
        physical = {row['mark']: row for row in self.rounds['tvrm_physical-2026-09-12']['rows']}
        self.assertEqual((physical['1314']['status'], physical['1314']['amount_hkd']), ('sold', 310000))
        self.assertEqual((physical['9549']['status'], physical['9549']['amount_hkd']), ('unsold', None))
        online = {row['mark']: row for row in self.rounds['tvrm_eauction-2026-09-17']['rows']}
        for mark in ['JN 6224', 'UE 4071', 'WE 7470', 'YY 4367']:
            self.assertEqual((online[mark]['status'], online[mark]['amount_hkd']), ('special_fee', 1000))
        self.assertEqual(sources.record('JN 6224', '@1,000', 1), ('JN6224', 1000, 'special_fee', 1, False))
        self.assertEqual(sources.record('9549', 'U/S', 1, True), ('9549', None, 'unsold', 1, True))

    def test_invalid_publication_inputs_fail_closed(self):
        for mutation in [
            lambda r: r['rows'][0].update(status='unsold'),
            lambda r: r['rows'][0].update(amount_hkd=-1),
            lambda r: r.update(official_proceeds_hkd=1),
            lambda r: r.update(source_url='https://example.com/results.pdf'),
            lambda r: r.update(end_date='2025-01-01'),
            lambda r: r['rows'].append(copy.deepcopy(r['rows'][0])),
        ]:
            data = {'schema_version': 1, 'rounds': copy.deepcopy(list(self.rounds.values()))}
            mutation(data['rounds'][0])
            with tempfile.TemporaryDirectory() as folder:
                config = Path(folder) / 'rounds.json'
                config.write_text(json.dumps(data))
                with patch.object(pages, 'CONFIG', config), self.assertRaises(ValueError):
                    pages.load_rounds()

    def test_complete_original_html_and_language_metadata(self):
        for r in self.rounds.values():
            for lang in ('zh', 'en'):
                doc = BeautifulSoup(pages.render_round(r, lang), 'html.parser')
                self.assertEqual(doc.html['lang'], 'en' if lang == 'en' else 'zh-HK')
                canonical = pages.SITE + pages.public_path(r, lang)
                self.assertEqual(doc.select_one('link[rel="canonical"]')['href'], canonical)
                self.assertEqual({x['hreflang']: x['href'] for x in doc.select('link[hreflang]')}, {
                    'zh-HK': pages.SITE + pages.public_path(r, 'zh'), 'en': pages.SITE + pages.public_path(r, 'en')})
                self.assertEqual(len(doc.select('tbody tr')), len(r['rows']))
                self.assertFalse(doc.select('[hidden]'))
                graph = json.loads(doc.select_one('script[type="application/ld+json"]').string)['@graph']
                self.assertEqual(graph[0]['url'], canonical)
                self.assertEqual(graph[0]['name'], doc.h1.get_text())
                self.assertEqual(graph[0]['isBasedOn'], r['source_url'])
                for row in r['rows']:
                    tr = doc.find(id=pages.anchor(row))
                    self.assertEqual(tr['data-status'], row['status'])
                    self.assertEqual(tr.select('td')[1].get_text(), pages.money(row['amount_hkd']))
                    self.assertEqual(tr.select_one('a')['href'], r['source_url'] + f"#page={row['page']}")
                    if row['status'] == 'unsold':
                        self.assertEqual(len(tr.select('a')), 1)
                for a in doc.select('.auction-top a'):
                    self.assertEqual(doc.select_one(a['href'])['data-status'], 'sold')

    def test_online_range_and_subtotals_are_explicit(self):
        doc = BeautifulSoup(pages.render_round(self.rounds['tvrm_eauction-2026-09-17'], 'en'), 'html.parser')
        self.assertIn('17 September 2026 to 21 September 2026', doc.h1.get_text())
        self.assertIn('not an individual mark’s sale or payment date', doc.get_text())
        self.assertIn('Auction-sale subtotal HK$1,646,000 + special fees HK$4,000 = official published proceeds HK$1,650,000', doc.get_text())
        pvrm = pages.render_round(self.rounds['pvrm-2026-09-12'], 'en')
        self.assertIn('HK$1,251,000 + special fees HK$115,000', pvrm)

    def test_build_is_bounded_and_reproducible(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pages.build(root)
            before = {p.relative_to(root): p.read_bytes() for p in root.rglob('*.html')}
            self.assertEqual(len(before), 20)
            pages.build(root)
            self.assertEqual(before, {p.relative_to(root): p.read_bytes() for p in root.rglob('*.html')})
            for lang in ('zh', 'en'):
                doc = BeautifulSoup(pages.render_index(lang), 'html.parser')
                self.assertEqual(len(doc.select('article h2 a')), 9)

    def test_sitemap_preserves_canonical_pages_and_verified_rounds(self):
        manifest = json.loads((ROOT / 'data/popular_plates_manifest.json').read_text())
        tree = ET.fromstring(popular.render_sitemap(manifest))
        namespace = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        urls = [node.text for node in tree.findall('s:url/s:loc', namespace)]
        self.assertEqual(len(urls), 841)
        self.assertNotIn("https://plate.hk/landing.html", urls)
        self.assertEqual(len(urls), len(set(urls)))
        self.assertEqual(sum('/auction-results/' in url for url in urls), 20)
        for page in popular.STATIC_PAGES:
            self.assertIn(page, urls)
        for item in manifest:
            self.assertIn(pages.SITE + item['href'], urls)

    def test_feed_has_stable_complete_entries_and_language_correct_links(self):
        for lang in ('zh', 'en'):
            rendered = pages.render_feed(lang)
            self.assertEqual(rendered, pages.render_feed(lang))
            tree = ET.fromstring(rendered)
            ns = {'a': pages.ATOM}
            entries = tree.findall('a:entry', ns)
            self.assertEqual(len(entries), 9)
            identities = [entry.findtext('a:id', namespaces=ns) for entry in entries]
            self.assertEqual(len(set(identities)), 9)
            for entry, r in zip(entries, pages.load_rounds()):
                self.assertEqual(entry.findtext('a:id', namespaces=ns), pages.SITE + pages.public_path(r, lang))
                self.assertEqual(entry.findtext('a:updated', namespaces=ns), r['verified_on'] + 'T00:00:00Z')
                self.assertEqual(entry.find("a:link[@rel='related']", ns).get('href'), r['source_url'])
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                pages.build(root)
                self.assertEqual((root / pages.feed_path(lang).lstrip('/')).read_text(), rendered)

    def test_older_online_rounds_use_their_own_source_date_ranges(self):
        for key in ('tvrm_eauction-2026-09-03', 'tvrm_eauction-2026-08-20'):
            r = self.rounds[key]
            content = pages.render_round(r, 'en')
            self.assertIn('This round covers ' + pages.date_label(r, 'en'), content)
            self.assertNotIn('This round covers 17–21 September', content)

    def test_homepage_highlights_are_bounded_to_latest_round_per_type(self):
        doc = BeautifulSoup(pages.homepage_highlights(), 'html.parser')
        self.assertEqual(len(doc.select('ul li')), 3)
        self.assertIn('/auction-results/pvrm-2026-09-12.html', str(doc))
        self.assertIn('/auction-results/en/tvrm_eauction-2026-09-17.html', str(doc))
        self.assertNotIn('tvrm_eauction-2026-08-20.html', str(doc))
        summaries = [li.select_one('[data-growth-lang="en"]').get_text(' ', strip=True) for li in doc.select('ul li')]
        self.assertIn('77 auction sales · 100 marks', summaries[0])
        self.assertIn('HK$1,366,000', summaries[0])
        self.assertIn('57 auction sales · 220 marks', summaries[1])
        self.assertIn('216 auction sales · 220 marks', summaries[2])
