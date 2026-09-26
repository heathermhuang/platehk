#!/usr/bin/env python3
"""Independently compare curated HTML inputs with complete official PDF handouts.

Pass a directory containing <round-id>.pdf. This check neither downloads sources
nor changes the curated publication set.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import pdfplumber
from build_auction_result_pages import load_rounds

TRADITIONAL_ROW = re.compile(
    r'(?P<special>\*)?\s*(?P<mark>(?:[A-Z]{1,2}\s+)?\d{1,4}|[A-Z]{1,2})\s+'
    r'(?P<amount>@?\d{1,3}(?:,\d{3})+|U/S)(?=\s|$)'
)


def record(mark: str, raw: str, page: int, special: bool = False) -> tuple:
    normalized = re.sub(r'\s+', '', mark)
    amount = None if raw == 'U/S' else int(raw.replace('@', '').replace(',', ''))
    status = 'unsold' if raw == 'U/S' else 'special_fee' if raw.startswith('@') else 'sold'
    return normalized, amount, status, page, special


def extract_records(path: Path, dataset: str) -> list[tuple]:
    records = []
    with pdfplumber.open(path) as doc:
        for page_number, page in enumerate(doc.pages, 1):
            if dataset == 'pvrm':
                # A separate raw-cell extraction checks the curated bbox-parser output.
                for table in page.extract_tables():
                    for row in table:
                        if len(row) != 3 or not row[0] or not row[2]:
                            continue
                        amount = re.sub(r'\s+', '', row[2])
                        if re.fullmatch(r'@?\d{1,3}(?:,\d{3})+', amount):
                            records.append(record(row[0], amount, page_number))
            else:
                for line in (page.extract_text() or '').splitlines():
                    matches = list(TRADITIONAL_ROW.finditer(line))
                    # Data rows have four/five cells; exclude dates, prose and footer fees.
                    if len(matches) != (4 if dataset == 'tvrm_eauction' else 5):
                        continue
                    for match in matches:
                        records.append(record(match['mark'], match['amount'], page_number, bool(match['special'])))
    return records


def verify(pdf_dir: Path) -> list[dict]:
    results = []
    for r in load_rounds():
        path = pdf_dir / f"{r['id']}.pdf"
        if hashlib.sha256(path.read_bytes()).hexdigest() != r['source_sha256']:
            raise ValueError(f"Source changed: {r['id']}; review the complete handout before updating")
        actual = extract_records(path, r['dataset'])
        expected = [(re.sub(r'\s+', '', row['mark']), row['amount_hkd'], row['status'], row['page'], row['special_mark']) for row in r['rows']]
        if sorted(actual, key=lambda row: row[0]) != sorted(expected, key=lambda row: row[0]):
            raise ValueError(f"Mark/amount/disposition/page mismatch: {r['id']}")
        with pdfplumber.open(path) as doc:
            text = '\n'.join(page.extract_text() or '' for page in doc.pages)
            total = re.search(r'total (?:sale )?proceeds[^$]*\$([\d,]+)', text, re.I)
            if not total or int(total[1].replace(',', '')) != r['official_proceeds_hkd']:
                raise ValueError(f"Official proceeds mismatch: {r['id']}")
            if len(doc.pages) != r['source_pages']:
                raise ValueError(f"Incomplete handout: {r['id']}")
        results.append({'round': r['id'], 'matched_records': len(actual), 'complete_pages': r['source_pages'], 'official_proceeds_hkd': r['official_proceeds_hkd'], 'source_sha256': r['source_sha256']})
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf-dir', type=Path, required=True)
    print(json.dumps(verify(parser.parse_args().pdf_dir), ensure_ascii=False, indent=2))
