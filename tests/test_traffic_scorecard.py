"""Synthetic export fixtures for scorecard arithmetic and invalid-source guards."""
import argparse
import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_traffic_scorecard as scorecard


class TrafficScorecardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, path, fields, rows):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def gsc(self, name, start, country='Hong Kong'):
        folder = self.root / name
        self.write(folder / 'Chart.csv', ['Date', 'Clicks', 'Impressions', 'Position'], [
            {'Date': f'2026-09-{start:02}', 'Clicks': 1, 'Impressions': 10, 'Position': 1},
            {'Date': f'2026-09-{start+1:02}', 'Clicks': 3, 'Impressions': 30, 'Position': 3}])
        self.write(folder / 'Filters.csv', ['Filter', 'Value'], [
            {'Filter': 'Search type', 'Value': 'Web'}, {'Filter': 'Country', 'Value': country},
            {'Filter': 'Date', 'Value': f'Synthetic period {start}'}])
        return folder

    def test_daily_totals_and_position_use_correct_denominators(self):
        result = scorecard.read_gsc(self.gsc('current', 3))
        self.assertEqual((result['clicks'], result['impressions']), (4, 40))
        self.assertEqual(result['ctr'], .1)
        self.assertEqual(result['average_position'], 2.5)
        self.assertIsNone(result['homepage_click_share'])

    def test_equal_scope_and_nonoverlap_are_required(self):
        previous = scorecard.read_gsc(self.gsc('previous', 1))
        current = scorecard.read_gsc(self.gsc('current', 3))
        self.assertEqual(scorecard.compare_gsc(current, previous)['clicks_growth'], 0)
        with self.assertRaises(ValueError):
            scorecard.compare_gsc(previous, previous)
        changed = dict(current, filters=dict(current['filters'], Country='United States'))
        with self.assertRaises(ValueError):
            scorecard.compare_gsc(changed, previous)

    def test_duplicate_days_and_fractional_counts_are_rejected(self):
        path = self.gsc('duplicate', 1)
        rows = [{'Date': '2026-09-01', 'Clicks': 1, 'Impressions': 10, 'Position': 1}] * 2
        self.write(path / 'Chart.csv', rows[0].keys(), rows)
        with self.assertRaises(ValueError):
            scorecard.read_gsc(path)
        with self.assertRaises(ValueError):
            scorecard.number('1.5', integer=True)

    def test_ga4_outcomes_reconcile_and_filter_to_hong_kong(self):
        path = self.write(self.root / 'events.csv', ['Country', 'Event name', 'Event count'], [
            {'Country': 'Hong Kong', 'Event name': 'lookup_complete', 'Event count': 10},
            {'Country': 'Hong Kong', 'Event name': 'lookup_success', 'Event count': 8},
            {'Country': 'Hong Kong', 'Event name': 'lookup_no_result', 'Event count': 2},
            {'Country': 'United States', 'Event name': 'lookup_success', 'Event count': 100}])
        result = scorecard.read_ga4(path, 'Hong Kong', 'events')
        self.assertEqual(result['lookup_success_rate'], .8)
        self.assertEqual(result['lookup_no_result_rate'], .2)
        self.assertNotIn('lookup_error', result['event_counts'])
        self.assertFalse(scorecard.read_ga4(path, 'Singapore', 'events')['available'])
        rows = scorecard.csv_rows(path.read_text())
        rows[2]['Event count'] = 1
        self.write(path, rows[0].keys(), rows)
        with self.assertRaises(ValueError):
            scorecard.read_ga4(path, 'Hong Kong', 'events')

    def test_returning_users_are_not_cohort_retention_or_summed_across_rows(self):
        row = {'Country': 'Hong Kong', 'Total users': 20, 'Returning users': 5}
        path = self.write(self.root / 'users.csv', row.keys(), [row])
        result = scorecard.read_ga4(path, 'Hong Kong', 'users')
        self.assertEqual(result['returning_user_share'], .25)
        self.assertIsNone(result['cohort_retention_7d'])
        self.write(path, row.keys(), [row, dict(row, Country='HK')])
        with self.assertRaises(ValueError):
            scorecard.read_ga4(path, 'Hong Kong', 'users')

    def test_missing_sources_do_not_create_measurements_or_leadership_claims(self):
        args = argparse.Namespace(gsc_current=self.gsc('current', 3), gsc_previous=None,
            ga4_events=None, ga4_users=None, ga4_start=None, ga4_end=None, ga4_country='Hong Kong')
        result = scorecard.build(args)
        self.assertEqual(result['preferred_source'], 'not_established')
        self.assertIn('ga4_users', result['missing_sources'])
        self.assertNotIn('ga4_events', result)
