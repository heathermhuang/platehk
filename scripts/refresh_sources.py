"""Refresh only observer-verified PDF changes and publish the actual parsed-input catalog."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

import build_dataset
import build_tvrm_dataset
from pdf_parse_cache import parser_version

ROOT = Path(__file__).resolve().parents[1]


def pdf_inventory(root: Path = ROOT) -> dict[str, dict]:
    inventory = {}
    for base, kind in [(root / 'data', 'pvrm'), (root / 'data/tvrm_physical', 'physical'), (root / 'data/tvrm_eauction', 'eauction')]:
        metadata = json.loads((base / 'auctions.json').read_text())
        names = {}
        if kind == 'pvrm':
            for item in metadata:
                name = item.get('pdf_local') or ''
                if name:
                    names[item.get('pdf_url')] = Path(name).name
        else:
            for line in (base / 'sources.tsv').read_text().splitlines():
                if '\t' in line:
                    name,url = line.split('\t',1)
                    if Path(name).name != name:
                        raise ValueError('Invalid PDF inventory filename')
                    if (base / 'pdfs' / name).exists():
                        current = names.get(url)
                        rank = lambda value: (value.startswith('1970-01-01_'), value)
                        if current is None or rank(name) < rank(current):
                            names[url] = name
        metadata_by_url = {item.get('pdf_url'):item for item in metadata}
        for url,name in names.items():
            if urlsplit(url).hostname != 'www.td.gov.hk' or not url.startswith('https://'):
                continue
            item = metadata_by_url.get(url,{})
            path = base / 'pdfs' / name
            if path.exists():
                existing = inventory.get(url)
                if existing:
                    if path not in existing['paths']:
                        existing['paths'].append(path)
                else:
                    inventory[url] = {'kind':kind, 'date':item.get('auction_date') or build_tvrm_dataset.extract_date_from_href(url) or '', 'paths':[path]}
    return inventory


def apply_updates(probe: dict, root: Path = ROOT) -> int:
    inventory = pdf_inventory(root)
    updated = 0
    for item in probe.get('updates', []):
        url = item['url']
        parts = urlsplit(url)
        if parts.scheme != 'https' or parts.hostname != 'www.td.gov.hk' or parts.port or parts.username or parts.password or parts.query or parts.fragment or not parts.path.startswith('/filemanager/'):
            raise ValueError('Untrusted PDF update URL')
        kind = item['kind']
        if url in inventory:
            paths = inventory[url]['paths']
        elif kind == 'pvrm':
            pdf = build_dataset.AuctionPdf(item['date'],item['date'],None,url)
            paths = [root / 'data/pdfs' / build_dataset.local_pdf_name(pdf)]
        elif kind in ('physical','eauction'):
            name = build_tvrm_dataset.local_pdf_name(item['date'] or '1970-01-01',url)
            paths = [root / f'data/tvrm_{"physical" if kind == "physical" else "eauction"}/pdfs' / name]
        else:
            raise ValueError('Invalid PDF update kind')
        raw = subprocess.check_output(['curl','--fail','--silent','--show-error','--max-time','60','--proto','=https',url],timeout=65)
        if not raw.startswith(b'%PDF-') or hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Observed PDF hash no longer matches source; retain previous input')
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix('.download')
            temporary.write_bytes(raw)
            temporary.replace(path)
        updated += 1
    return updated


def catalog(root: Path = ROOT) -> dict:
    output = {}
    for url,item in pdf_inventory(root).items():
        hashes = {hashlib.sha256(path.read_bytes()).hexdigest() for path in item['paths']}
        if len(hashes) != 1:
            raise ValueError(f'Conflicting parsed PDF copies for {url}')
        output[url] = {'kind':item['kind'],'date':item['date'],'sha256':hashes.pop()}
    return output


def validate_catalog(value: dict, probe: dict) -> None:
    for item in probe.get('updates', []):
        if value.get(item['url'], {}).get('sha256') != item['sha256']:
            raise ValueError('Changed PDF did not reach the parsed-input catalog')
    missing = set(probe.get('index_urls', [])) - set(value)
    if missing:
        raise ValueError(f'{len(missing)} observed result PDFs are missing from the input catalog; publication stopped')
    expected = {(item['url'],item['sha256']) for item in probe.get('updates', [])}
    if expected:
        versions = {
            parser_version(('scripts/build_dataset.py','scripts/lny_mixed_parser.py')),
            parser_version(('scripts/build_tvrm_dataset.py','scripts/build_dataset.py','scripts/lny_mixed_parser.py','scripts/parse_tvrm_pdfs.py')),
        }
        for path in (ROOT / '.tmp/pdf-parse-cache').glob('*.json'):
            try:
                entry=json.loads(path.read_text())
                identity=entry['identity']
                if identity['version'] in versions and isinstance(entry['value'].get('rows'),list):
                    expected.discard((identity['context'].get('pdf_url'),identity['pdf_sha256']))
            except (OSError,ValueError,KeyError,TypeError):
                continue
        if expected:
            raise ValueError('Changed PDF has no successful result from the current parser; publication stopped')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['apply','catalog'])
    args = parser.parse_args()
    if args.command == 'apply':
        probe = json.loads((ROOT / '.tmp/source-probe.json').read_text())
        print(f'Refreshed {apply_updates(probe)} observer-verified PDF inputs')
    else:
        value = catalog()
        probe_path = ROOT / '.tmp/source-probe.json'
        if probe_path.exists():
            validate_catalog(value,json.loads(probe_path.read_text()))
        (ROOT / '.tmp').mkdir(exist_ok=True)
        (ROOT / '.tmp/source-catalog.json').write_text(json.dumps(value,sort_keys=True))
        print(f'Catalogued {len(value)} parsed PDF inputs')


if __name__ == '__main__':
    main()
