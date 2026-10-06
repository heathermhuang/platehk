"""Record the parsing results actually used by this run, including cache hits."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import runpy
import sys
from pathlib import Path

from pdf_parse_cache import PdfParseCache

ROOT = Path(__file__).resolve().parents[1]
RECEIPTS = ROOT / '.tmp/parse-receipts.jsonl'
BUILDERS = {'pvrm': 'build_dataset.py', 'tvrm': 'build_tvrm_dataset.py'}


def valid_bundle(value: dict, kind: str) -> bool:
    keys = {'rows', 'is_lny', 'total_proceeds_hkd'} | ({'total_proceeds_raw'} if kind == 'pvrm' else {'auction_date', 'auction_date_label'})
    if not isinstance(value, dict) or not keys <= value.keys():
        return False
    if not isinstance(value['rows'], list) or not all(isinstance(row, dict) for row in value['rows']) or not isinstance(value['is_lny'], bool):
        return False
    for row in value['rows']:
        if not all(isinstance(row.get(key), str) and row[key].strip() for key in ['single_line', 'auction_date', 'pdf_url']):
            return False
        amount = row.get('amount_hkd')
        if amount is not None and (type(amount) is not int or amount < 0):
            return False
    total = value['total_proceeds_hkd']
    if total is not None and (type(total) is not int or total < 0):
        return False
    if kind == 'pvrm':
        return value['total_proceeds_raw'] is None or isinstance(value['total_proceeds_raw'], str)
    return all(isinstance(value[key], str) for key in ['auction_date', 'auction_date_label'])


def capture_result(cache: PdfParseCache, path: Path, context: dict, value: dict, probe_id: str, output: Path | None = None, *, expected_nonempty: bool = False) -> None:
    output = output or RECEIPTS
    kind = context.get('kind', 'pvrm')
    try:
        sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        sha256 = ''
    record = {'probe_id': probe_id, 'run_id': os.environ.get('GITHUB_RUN_ID', 'local'),
              'url': context.get('pdf_url'), 'sha256': sha256,
              'kind': kind, 'parser_version': cache.version, 'context': context,
              'expected_nonempty': expected_nonempty,
              'schema_valid': kind in ('pvrm', 'physical', 'eauction') and valid_bundle(value, kind) and all(row['pdf_url'] == context.get('pdf_url') for row in value['rows']),
              'row_count': len(value.get('rows', [])) if isinstance(value, dict) and isinstance(value.get('rows'), list) else 0}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + '\n')


def run_builder(name: str, *, reset: bool = False) -> None:
    probe = json.loads((ROOT / '.tmp/source-probe.json').read_text())
    prior = {}
    for kind, folder in [('pvrm', 'data'), ('physical', 'data/tvrm_physical'), ('eauction', 'data/tvrm_eauction')]:
        # Auction metadata may combine workbook and alternate-language rows.
        # Only rows actually attributed to this PDF establish its baseline.
        rows = ROOT / folder / 'results.slim.json'
        if rows.exists():
            for row in json.loads(rows.read_text()):
                if row.get('source_type') != 'xlsx_exact_dates':
                    prior[(kind, row.get('pdf_url'))] = True
    if reset:
        RECEIPTS.parent.mkdir(parents=True, exist_ok=True)
        RECEIPTS.write_text('')
    original = PdfParseCache.parse

    def recorded(cache, path, context, parser):
        try:
            value = original(cache, path, context, parser)
        except Exception:
            capture_result(cache, path, context, {}, probe['probe_id'])
            raise
        capture_result(cache, path, context, value, probe['probe_id'], expected_nonempty=prior.get((context.get('kind', 'pvrm'), context.get('pdf_url')), False))
        return value

    PdfParseCache.parse = recorded
    try:
        runpy.run_path(str(ROOT / 'scripts' / BUILDERS[name]), run_name='__main__')
    finally:
        PdfParseCache.parse = original


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('builder', choices=BUILDERS)
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    run_builder(args.builder, reset=args.reset)
