#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import fitz
import pypdfium2 as pdfium
import xlrd
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLS_PATH = ROOT / "data" / "TVRM auction result (1973-2026).xls"
TMP_DIR = ROOT / ".tmp" / "press_attachments"


@dataclass(frozen=True)
class Case:
    auction_date: str
    attachment_url: str
    sheet_name: str


CASES: list[Case] = [
    Case("2009-12-13", "http://gia.info.gov.hk/general/200911/23/P200911230118_0118_59274.pdf", "2000-2009"),
    Case("2009-12-20", "http://gia.info.gov.hk/general/200912/03/P200912030133_0133_59626.pdf", "2000-2009"),
    Case("2010-01-09", "http://gia.info.gov.hk/general/200912/23/P200912230109_0109_60427.pdf", "2010-2019"),
    Case("2010-12-19", "http://gia.info.gov.hk/general/201012/08/P201012080244_0244_72682.pdf", "2010-2019"),
]


def normalize_mark(value: str) -> str:
    value = value.upper().replace("*", " ")
    value = re.sub(r"\s+", "", value)
    return value


def download(case: Case) -> Path:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{case.auction_date}.pdf"
    if not out.exists():
        urllib.request.urlretrieve(case.attachment_url, out)
    return out


def extract_marks_from_text(pdf_path: Path) -> list[str]:
    doc = pdfium.PdfDocument(str(pdf_path))
    text = "\n".join(doc[i].get_textpage().get_text_range() for i in range(len(doc)))
    marks: list[str] = []
    for line in text.splitlines():
        m = re.match(r"\s*(\d+)\.\s+(\*\s*)?(.+?)\s*$", line)
        if m:
            marks.append(m.group(3).strip())
    return marks


def extract_marks_with_ocr(pdf_path: Path) -> list[str]:
    image_path = TMP_DIR / f"{pdf_path.stem}.png"
    if not image_path.exists():
        pix = fitz.open(str(pdf_path))[0].get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
        pix.save(str(image_path))

    ocr = RapidOCR()
    result, _ = ocr(str(image_path))
    lines = [item[1].strip() for item in (result or [])]

    marks: list[str] = []
    i = 0
    while i < len(lines):
        if re.fullmatch(r"\d+\.", lines[i]):
            j = i + 1
            tokens: list[str] = []
            while j < len(lines):
                token = lines[j]
                if (
                    re.fullmatch(r"\d+\.", token)
                    or "markswill" in token.replace(" ", "").lower()
                    or "marks will" in token.lower()
                    or token.startswith("Time:")
                    or token.startswith("Note:")
                ):
                    break
                if token != "*":
                    tokens.append(token)
                j += 1
            if tokens:
                marks.append(" ".join(tokens))
            i = j
        else:
            i += 1
    return marks


def build_price_map(xls_path: Path, sheet_name: str) -> dict[str, int]:
    book = xlrd.open_workbook(str(xls_path))
    sheet = book.sheet_by_name(sheet_name)
    out: dict[str, int] = {}
    for row in range(1, sheet.nrows):
        mark = normalize_mark(str(sheet.cell_value(row, 0)).strip())
        price = int(float(sheet.cell_value(row, 1)))
        if mark not in out or price > out[mark]:
            out[mark] = price
    return out


def collect_matches(case: Case, xls_path: Path, top_n: int) -> tuple[list[str], list[tuple[int, str]]]:
    pdf_path = download(case)
    marks = extract_marks_from_text(pdf_path)
    if len(marks) < 50:
        marks = extract_marks_with_ocr(pdf_path)

    price_map = build_price_map(xls_path, case.sheet_name)
    matches: list[tuple[int, str]] = []
    seen: set[str] = set()
    for raw in marks:
        key = normalize_mark(raw)
        if key in seen or key not in price_map:
            continue
        seen.add(key)
        matches.append((price_map[key], raw))
    matches.sort(reverse=True)
    return marks, matches[:top_n]


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract TVRM press-attachment marks and seed search terms from the FOI XLS.")
    parser.add_argument("--date", action="append", help="Auction date to inspect, e.g. 2009-12-20. Repeatable.")
    parser.add_argument("--top", type=int, default=20, help="How many high-price seed marks to show per case.")
    parser.add_argument(
        "--xls-path",
        default=os.environ.get("TVRM_XLS_PATH", str(DEFAULT_XLS_PATH)),
        help="Path to the TVRM workbook. Defaults to data/TVRM auction result (1973-2026).xls or $TVRM_XLS_PATH.",
    )
    args = parser.parse_args()
    xls_path = Path(args.xls_path).expanduser()
    if not xls_path.exists():
        raise SystemExit(f"Workbook not found: {xls_path}")

    selected = [case for case in CASES if not args.date or case.auction_date in set(args.date)]
    if not selected:
        raise SystemExit("No matching cases.")

    for case in selected:
        marks, matches = collect_matches(case, xls_path, args.top)
        print(f"\n[{case.auction_date}] attachment={case.attachment_url}")
        print(f"marks_extracted={len(marks)}  matched_against_xls={len(matches)}")
        for price, mark in matches:
            print(f"  {mark}  HK${price:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
