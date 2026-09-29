#!/usr/bin/env python3
"""Build a private scorecard from native English GSC and GA4 CSV exports.

This command reads supplied exports only. It neither changes analytics settings
nor infers market leadership, missing observations, or cohort retention.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import zipfile
from datetime import date, timedelta
from pathlib import Path


def csv_rows(text: str) -> list[dict]:
    lines = text.lstrip('\ufeff').splitlines()
    while lines and (not lines[0].strip() or lines[0].startswith('#')):
        lines.pop(0)
    return list(csv.DictReader(io.StringIO('\n'.join(lines))))


def export_table(path: Path, name: str, required: bool = True) -> list[dict]:
    if path.is_dir():
        matches = [p for p in path.iterdir() if p.name.lower() == name.lower()]
        content = matches[0].read_text(encoding='utf-8-sig') if len(matches) == 1 else None
    else:
        with zipfile.ZipFile(path) as archive:
            matches = [p for p in archive.infolist() if Path(p.filename).name.lower() == name.lower()]
            if len(matches) > 1:
                raise ValueError(f'Duplicate export table: {name}')
            if matches and matches[0].file_size > 20_000_000:
                raise ValueError('Export table exceeds the bounded reader limit')
            content = archive.read(matches[0]).decode('utf-8-sig') if matches else None
    if content is None:
        if required:
            raise ValueError(f'Missing {name} in {path.name}')
        return []
    return csv_rows(content)


def number(value: str, *, integer: bool = False) -> float:
    result = float(str(value).replace(',', '').strip())
    if not math.isfinite(result) or result < 0 or (integer and not result.is_integer()):
        raise ValueError(f'Invalid nonnegative metric: {value}')
    return int(result) if integer else result


def ratio(numerator, denominator):
    return numerator / denominator if numerator is not None and denominator else None


def read_gsc(path: Path) -> dict:
    chart = export_table(path, 'Chart.csv')
    if not chart or not {'Date', 'Clicks', 'Impressions', 'Position'} <= chart[0].keys():
        raise ValueError('Use a single-period English GSC export containing Chart.csv')
    dates = sorted(date.fromisoformat(row['Date']) for row in chart)
    if len(set(dates)) != len(dates) or (dates[-1] - dates[0]).days + 1 != len(dates):
        raise ValueError('GSC dates must be unique and consecutive')
    clicks = sum(number(row['Clicks'], integer=True) for row in chart)
    impressions = sum(number(row['Impressions'], integer=True) for row in chart)
    if clicks > impressions:
        raise ValueError('GSC clicks exceed impressions')
    positioned = [(number(row['Position']), number(row['Impressions'], integer=True)) for row in chart if number(row['Position']) > 0]
    position_weight = sum(count for _, count in positioned)
    filters = {row['Filter']: row['Value'] for row in export_table(path, 'Filters.csv')}
    if filters.get('Search type') != 'Web':
        raise ValueError('The scorecard requires a GSC Web-search export')
    # A query filter changes the denominator; preserve all exported filters.
    country = filters.get('Country', 'All countries')
    queries = export_table(path, 'Queries.csv', required=False)
    pages = export_table(path, 'Pages.csv', required=False)
    opportunities = []
    for row in queries:
        count, seen = number(row['Clicks'], integer=True), number(row['Impressions'], integer=True)
        if count > seen:
            raise ValueError('Query clicks exceed impressions')
        query = row.get('Top queries') or row.get('Query')
        if not query:
            raise ValueError('Missing query identity')
        if seen >= 100:
            opportunities.append({'query': query, 'clicks': count, 'impressions': seen,
                                  'ctr': ratio(count, seen), 'position': number(row['Position'])})
    opportunities.sort(key=lambda row: row['impressions'], reverse=True)
    homepage = next((row for row in pages if (row.get('Top pages') or row.get('Page')) == 'https://plate.hk/'), None)
    return {
        'source': path.name, 'start': dates[0].isoformat(), 'end': dates[-1].isoformat(), 'days': len(dates),
        'filters': filters, 'country': country, 'clicks': clicks, 'impressions': impressions,
        'ctr': ratio(clicks, impressions),
        'average_position': ratio(sum(position * count for position, count in positioned), position_weight),
        'position_impression_coverage': ratio(position_weight, impressions),
        'homepage_click_share': ratio(number(homepage['Clicks'], integer=True), clicks) if homepage else None,
        'query_rows': len(queries), 'page_rows': len(pages), 'high_impression_queries': opportunities[:20],
        'caveats': ['Query rows omit anonymized and truncated queries; do not sum them for property totals.',
                    'Page and property aggregations can differ; homepage share is a directional concentration measure.',
                    'Google can export unavailable UI values as zero; inspect suspicious zero rows at the source.']
    }


def compare_gsc(current: dict, previous: dict) -> dict:
    if current['filters'].keys() != previous['filters'].keys():
        raise ValueError('GSC comparison filters differ')
    if {k: v for k, v in current['filters'].items() if k != 'Date'} != {k: v for k, v in previous['filters'].items() if k != 'Date'}:
        raise ValueError('GSC comparison scopes differ')
    if current['days'] != previous['days'] or date.fromisoformat(previous['end']) + timedelta(days=1) != date.fromisoformat(current['start']):
        raise ValueError('Compare equally long consecutive periods, without overlap')
    return {metric + '_change': current[metric] - previous[metric] for metric in ('clicks', 'impressions')} | {
        'clicks_growth': ratio(current['clicks'] - previous['clicks'], previous['clicks']),
        'impressions_growth': ratio(current['impressions'] - previous['impressions'], previous['impressions']),
        'ctr_change_points': (current['ctr'] - previous['ctr']) * 100 if current['ctr'] is not None and previous['ctr'] is not None else None,
    }


def country_key(value: str) -> str:
    key = value.strip().lower()
    return 'hong kong' if key in {'hk', 'hkg', 'hong kong'} else key


def read_ga4(path: Path, country: str, kind: str) -> dict:
    rows = csv_rows(path.read_text(encoding='utf-8-sig'))
    if not rows or 'Country' not in rows[0]:
        raise ValueError('GA4 exports must include the Country dimension')
    selected = [row for row in rows if country_key(row['Country']) == country_key(country)]
    if not selected:
        return {'source': path.name, 'country': country, 'available': False, 'reason': 'No country row was returned; missing data is not zero.'}
    if kind == 'users':
        if len(selected) != 1:
            raise ValueError('User export must have one row per country; do not sum distinct users')
        total = number(selected[0]['Total users'], integer=True)
        returning = number(selected[0]['Returning users'], integer=True)
        if returning > total:
            raise ValueError('Returning users exceed total users')
        return {'source': path.name, 'country': country, 'available': True,
                'total_users': total, 'returning_users': returning, 'returning_user_share': ratio(returning, total),
                'cohort_retention_7d': None, 'cohort_retention_30d': None,
                'caveat': 'Returning-user share is not same-age cohort retention. New and returning users can overlap within a period.'}
    counts = {}
    for row in selected:
        name = row['Event name']
        if name in counts:
            raise ValueError('Event export must have one row per country and event')
        counts[name] = number(row['Event count'], integer=True)
    complete, success = counts.get('lookup_complete'), counts.get('lookup_success')
    if complete is not None and success is not None and success > complete:
        raise ValueError('Lookup outcomes do not reconcile; inspect ingestion and source filters')
    empty = complete - success if complete is not None and success is not None else None
    if empty is not None and 'lookup_no_result' in counts and empty != counts['lookup_no_result']:
        raise ValueError('Lookup outcomes do not reconcile; inspect ingestion and source filters')
    return {'source': path.name, 'country': country, 'available': True, 'event_counts': counts,
            'lookup_success_rate': ratio(success, complete), 'lookup_no_result_rate': ratio(empty, complete),
            'caveats': ['Counts describe observed lookup outcomes, not unique people or verified satisfaction.',
                        'Feed-open and feed-copy events measure intent; completed reader subscriptions are unobserved.',
                        'Missing event rows remain unavailable; ingestion delays can prevent reconciliation.']}


def build(args) -> dict:
    result = {'schema_version': 1, 'preferred_source': 'not_established',
              'preferred_source_reason': 'First-party traffic does not establish competitor share or a representative first-choice preference.'}
    if args.gsc_current:
        result['gsc_current'] = read_gsc(args.gsc_current)
    if args.gsc_previous:
        if not args.gsc_current:
            raise ValueError('A current GSC export is required for comparison')
        result['gsc_previous'] = read_gsc(args.gsc_previous)
        result['gsc_comparison'] = compare_gsc(result['gsc_current'], result['gsc_previous'])
    if args.ga4_events or args.ga4_users:
        if not args.ga4_start or not args.ga4_end:
            raise ValueError('Record the GA4 reporting dates with --ga4-start and --ga4-end')
        if date.fromisoformat(args.ga4_start) > date.fromisoformat(args.ga4_end):
            raise ValueError('Reversed GA4 reporting dates')
        result['ga4_period'] = {'start': args.ga4_start, 'end': args.ga4_end,
                              'caveat': 'Reporting dates are supplied from the export selection. GA4 and GSC use their respective reporting time zones.'}
    if args.ga4_events:
        result['ga4_events'] = read_ga4(args.ga4_events, args.ga4_country, 'events')
    if args.ga4_users:
        result['ga4_users'] = read_ga4(args.ga4_users, args.ga4_country, 'users')
    result['missing_sources'] = [key for key in ('gsc_current', 'gsc_comparison', 'ga4_events', 'ga4_users') if key not in result]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gsc-current', type=Path)
    parser.add_argument('--gsc-previous', type=Path)
    parser.add_argument('--ga4-events', type=Path)
    parser.add_argument('--ga4-users', type=Path)
    parser.add_argument('--ga4-start')
    parser.add_argument('--ga4-end')
    parser.add_argument('--ga4-country', default='Hong Kong')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if not any((args.gsc_current, args.ga4_events, args.ga4_users)):
        parser.error('Supply at least one authoritative export; no live measurements are invented')
    try:
        rendered = json.dumps(build(args), ensure_ascii=False, indent=2) + '\n'
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        parser.error(str(error))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding='utf-8')
    else:
        print(rendered, end='')


if __name__ == '__main__':
    main()
