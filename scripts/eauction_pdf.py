"""Fingerprint the exact extracted PDF text consumed by the auction parser.

The public download regenerates encrypted PDF bytes on every request. Retain
byte hashes for provenance; compare extracted text to detect real corrections.
"""
from __future__ import annotations
import hashlib
import sys
from pathlib import Path
import pypdfium2 as pdfium


def content_digest(path: Path) -> str:
    with pdfium.PdfDocument(str(path)) as document:
        pages = []
        for index in range(len(document)):
            page=document[index]
            text_page=page.get_textpage()
            try:
                pages.append(text_page.get_text_range())
            finally:
                text_page.close()
                page.close()
    text = "\n".join(pages)
    if not text.strip():
        raise ValueError("SOURCE_PARSE_UNVERIFIED: E-Auction PDF has no extractable text")
    return hashlib.sha256(text.encode()).hexdigest()


if __name__ == '__main__':
    print(content_digest(Path(sys.argv[1])))
