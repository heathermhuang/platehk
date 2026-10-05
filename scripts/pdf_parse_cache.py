"""Reuse validated parsing results only for identical PDF bytes and parser inputs."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import sys
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]


def parser_version(files: tuple[str, ...]) -> str:
    digest = hashlib.sha256()
    for name in sorted((*files, 'scripts/pdf_parse_cache.py', 'requirements.txt')):
        digest.update(name.encode())
        digest.update((ROOT / name).read_bytes())
    for package in ('pdfplumber', 'pdfminer.six', 'pypdfium2'):
        digest.update(f'{package}:{importlib.metadata.version(package)}'.encode())
    digest.update(str(sys.version_info[:2]).encode())
    return digest.hexdigest()


class PdfParseCache:
    def __init__(self, version: str, directory: Path | None = None):
        self.version = version
        self.directory = directory or Path(os.environ.get('PDF_PARSE_CACHE_DIR', '.tmp/pdf-parse-cache'))
        self.hits = 0
        self.misses = 0

    def parse(self, path: Path, context: dict, parser: Callable[[], dict]) -> dict:
        pdf_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        identity = {'version': self.version, 'pdf_sha256': pdf_hash, 'context': context}
        key = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        target = self.directory / f'{key}.json'
        if os.environ.get('PDF_PARSE_FORCE') != '1':
            try:
                entry = json.loads(target.read_text(encoding='utf-8'))
                value = entry['value']
                if entry['identity'] == identity and isinstance(value.get('rows'), list):
                    self.hits += 1
                    return value
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                pass
        self.misses += 1
        value = parser()  # Exceptions and incomplete results must never be cached.
        if not isinstance(value, dict) or not isinstance(value.get('rows'), list):
            raise ValueError('PDF parser did not return a row list')
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(f'.{os.getpid()}.tmp')
        temporary.write_text(json.dumps({'identity': identity, 'value': value}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        temporary.replace(target)
        return value
