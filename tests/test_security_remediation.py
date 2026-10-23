from __future__ import annotations
import json
import types
import os
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_all_dataset
import build_events
import build_dataset
import build_tvrm_dataset
import build_tvrm_legacy_dataset as legacy
import merge_tvrm_exact_workbook as exact
import trusted_sources
import cloud_repair_gate
import sync_lny_urls_to_tvrm_physical as lny


class SecurityRemediationTests(unittest.TestCase):
    def test_source_policy_rejects_offhost_redirect_before_requesting_target(self):
        original = urllib.request.Request('https://www.td.gov.hk/source')
        handler = trusted_sources.SourceRedirectHandler(trusted_sources.TD_HOSTS)
        for destination in ['https://evil.test/file', 'http://www.td.gov.hk/file', 'ftp://www.td.gov.hk/file',
                            'https://www.td.gov.hk.evil.test/file', 'https://user@www.td.gov.hk/file', 'https://www.td.gov.hk:444/file']:
            with self.subTest(destination=destination), self.assertRaises(ValueError):
                handler.redirect_request(original, None, 302, 'Found', {}, destination)
        redirected = handler.redirect_request(original, None, 302, 'Found', {}, 'https://www.td.gov.hk/file.pdf')
        self.assertEqual(redirected.full_url, 'https://www.td.gov.hk/file.pdf')

    def test_event_links_allow_official_forms_but_reject_lookalike_and_external_origins(self):
        for url in ['https://evil.test/pvrm_application', '//evil.test/pvrm_application',
                    'javascript:alert(1)', 'https://www.td.gov.hk.evil.test/content_4802/test.pdf']:
            self.assertEqual(build_events.absolute_url(url), '')
        self.assertEqual(build_events.absolute_url('/filemanager/tc/content_4802/test.pdf'),
                         'https://www.td.gov.hk/filemanager/tc/content_4802/test.pdf')
        self.assertEqual(build_events.absolute_url('https://www.gov.hk/en/apps/td/test'), 'https://www.gov.hk/en/apps/td/test')

    def test_missing_verified_pdf_never_falls_back_to_network(self):
        with patch.dict(os.environ, {'PLATEHK_VERIFIED_BUILD': '1'}):
            for builder in [build_dataset, build_tvrm_dataset]:
                with patch.object(builder, 'read_source') as fetcher, self.assertRaisesRegex(ValueError, 'SOURCE_PARSE_UNVERIFIED'):
                    builder.request_bytes('https://www.td.gov.hk/filemanager/tc/content_4804/missing%2Epdf')
                fetcher.assert_not_called()
            with tempfile.TemporaryDirectory() as directory, patch.object(build_tvrm_dataset, 'request_bytes') as fetcher:
                disguised = build_tvrm_dataset.AuctionPdf('physical', '2026-01-01', '', 'https://www.td.gov.hk/filemanager/download')
                with self.assertRaisesRegex(ValueError, 'SOURCE_PARSE_UNVERIFIED'):
                    build_tvrm_dataset.build_one('physical', [disguised], Path(directory))
                fetcher.assert_not_called()

    def test_nonfinite_workbook_amounts_cannot_abort_the_build(self):
        for builder in [legacy, exact]:
            for raw in ['inf', '-inf', '1e999', 'NaN', float('inf')]:
                self.assertIsNone(builder.normalize_amount(raw))
            self.assertEqual(builder.normalize_amount('10,000'), 10000)

    def test_legacy_input_failure_preserves_existing_shards(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            issues = output / 'issues'
            issues.mkdir()
            shard = issues / 'prior.json'
            shard.write_text('["published"]')
            source = output / 'fixture.xls'
            source.touch()
            with patch.object(legacy, 'OUT', output), patch.object(legacy, 'ISSUES_DIR', issues), \
                    patch.object(legacy, 'LEGACY_XLS_PATH', source), patch.object(legacy, 'EXACT_XLSX_PATH', source), \
                    patch.object(legacy, 'load_exact_overlap_signatures', side_effect=ValueError('bad workbook')):
                with self.assertRaises(ValueError):
                    legacy.build()
            self.assertEqual(shard.read_text(), '["published"]')

    def test_lny_sync_rejects_untrusted_pdf_before_writing_either_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            auctions = root / 'auctions.json'
            auctions.write_text(json.dumps([{'pdf_url': 'https://evil.test/lny.pdf', 'is_lny': True}]))
            inventory = root / 'urls.all.txt'
            inventory.write_text('prior')
            active = root / 'urls.txt'
            active.write_text('prior')
            with patch.object(lny, 'PVRM_AUCTIONS', auctions), patch.object(lny, 'TVRM_URLS_ALL', inventory), patch.object(lny, 'TVRM_URLS', active):
                with self.assertRaises(ValueError):
                    lny.main()
            self.assertEqual(inventory.read_text(), 'prior')
            self.assertEqual(active.read_text(), 'prior')

    def test_repair_gate_recomputes_instead_of_trusting_the_uploaded_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory)
            (evidence / 'plan.json').write_text(json.dumps({'action': 'escalate_llm_repair', 'status': 'escalate', 'classification': 'workflow_shell_syntax_regression'}))
            (evidence / 'failed.log').write_text('SOURCE_OBSERVATION_UNAVAILABLE')
            self.assertEqual(cloud_repair_gate.escalation_outputs(evidence, 'owner/repo')['should_run'], 'false')
            (evidence / 'failed.log').write_text('syntax error near unexpected token')
            (evidence / 'issue.json').write_text(json.dumps({'number': '1\nshould_run=true', 'url': 'https://evil.test'}))
            outputs = cloud_repair_gate.escalation_outputs(evidence, 'owner/repo')
            self.assertEqual(outputs['should_run'], 'true')
            self.assertEqual(outputs['issue_number'], '')
            self.assertEqual(outputs['issue_url'], '')
            (evidence / 'issue.json').write_text(json.dumps({'number': 12, 'url': 'https://evil.test'}))
            self.assertEqual(cloud_repair_gate.escalation_outputs(evidence, 'owner/repo')['issue_url'], 'https://github.com/owner/repo/issues/12')

    def test_later_resales_do_not_erase_earlier_decade_records(self):
        row = ['AB123', 1000, '登記號碼在拍賣會中售出']
        sheet = types.SimpleNamespace(nrows=2, cell_value=lambda r, c: row[c])
        book = types.SimpleNamespace(sheet_names=lambda: ['1980-1989', '2000-2009'], sheet_by_name=lambda _: sheet)
        signature = legacy.overlap_signature('AB 123', 1000, 'sold')
        with patch.object(legacy.xlrd, 'open_workbook', return_value=book):
            rows, stats = legacy.load_legacy_rows({signature: {2007}})
        self.assertEqual(len(rows['1980-01-01']), 1)
        self.assertNotIn('2000-01-01', rows)
        self.assertEqual(stats['legacy_rows_skipped_due_to_exact_dates_after_2006'], 1)

    def test_coarse_combined_records_cannot_be_deduplicated_by_plate_and_price_alone(self):
        historic = {'auction_date': '1980-01-01', 'year_range': '1980-1989', 'date_precision': 'year_range', 'single_line': 'AB 123', 'amount_hkd': 1000}
        recent = {**historic, 'auction_date': '2020-01-01', 'date_precision': 'day'}
        with patch.object(build_all_dataset, 'load_json', side_effect=[[recent], [], [historic]]):
            exact_keys, coarse_keys, dropped = build_all_dataset.load_legacy_overlap_lookup()
        self.assertEqual((exact_keys, coarse_keys, dropped), (set(), set(), 0))

    def test_workflows_gate_secret_using_jobs_on_main_and_trusted_issue_sender(self):
        repair = (ROOT / '.github/workflows/cloud-llm-repair.yml').read_text()
        self.assertNotIn('ref: ${{ github.event.workflow_run.head_sha }}', repair)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", repair)
        self.assertIn('github.event.workflow_run.head_repository.full_name == github.repository', repair)
        self.assertIn('python -I "$RUNNER_TEMP/platehk-notify-telegram.py"', repair)
        self.assertLess(repair.index('run: cp scripts/notify_telegram.py'), repair.index('git apply --index codex.patch', repair.index('  open_draft_pr:')))
        issue = (ROOT / '.github/workflows/issue-telegram.yml').read_text()
        self.assertIn('github.event.comment.author_association || github.event.issue.author_association', issue)
        self.assertIn('COLLABORATOR', issue)
        scripts = json.loads((ROOT / 'package.json').read_text())['scripts']
        for key in ['cf:deploy', 'cf:deploy:ci', 'cf:deploy:official']:
            self.assertIn('npm run cf:secrets:check && wrangler deploy', scripts[key])


if __name__ == '__main__':
    unittest.main()
