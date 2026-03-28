#!/usr/bin/env python3
"""
Parse Lunar New Year (LNY/CNY) auction result PDFs that may contain BOTH:
- Traditional Vehicle Registration Marks (TVRM)
- Personalized Vehicle Registration Marks (PVRM)

Key constraints:
- Many of these PDFs don't expose extractable tables.
- Some are numbered lists (e.g. "19. * 18 16,500,000") which parse best from PDF text.
- Some are multi-column without numbering (e.g. 2016cny_auction_result.pdf) which parse best
  using positioned words.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import pdfplumber
import pypdfium2 as pdfium

AMOUNT_TOKEN_RE = re.compile(r"^\d{1,3}(?:,\d{3})+$")
UNSOLD_TOKEN_RE = re.compile(r"^(U/S|UNSOLD|未售出)$", re.IGNORECASE)

# Stopwords that indicate a "total proceeds" line or header rather than a mark.
LNY_STOPWORDS = {
    "TOTAL",
    "SALE",
    "PROCEEDS",
    "FROM",
    "TODAY",
    "TODAY'S",
    "TODAYS",
    "AUCTION",
    "RESULT",
    "OF",
    "VEHICLE",
    "REGISTRATION",
    "MARK",
    "MARKS",
    "HELD",
    "ON",
    "SPECIAL",
    "TRADITIONAL",
    "PERSONALIZED",
    "U/S",
}


def is_lny_url(url: str) -> bool:
    u = (url or "").lower()
    return ("lny" in u) or ("cny" in u) or ("lunar_new_year" in u)


@dataclass
class LnyRow:
    kind: str  # "tvrm" | "pvrm"
    single_line: str
    amount_hkd: Optional[int]


def _normalize_mark_tokens(tokens: list[str]) -> str:
    cleaned: list[str] = []
    for t in tokens:
        t = (t or "").strip()
        if not t:
            continue
        if t in {"*", ".", "$"}:
            continue
        cleaned.append(t.lstrip("*"))

    # Drop leading item index tokens like "19." or "19" (but keep single-token digit marks).
    while len(cleaned) > 1 and re.fullmatch(r"\d+\.?", cleaned[0]):
        cleaned.pop(0)

    # Drop trailing punctuation-only token.
    while cleaned and re.fullmatch(r"[.·•]+", cleaned[-1]):
        cleaned.pop()

    return " ".join(cleaned).strip()


def _classify_and_format_mark(mark: str) -> tuple[str, str]:
    """
    Returns (kind, formatted_single_line)
      kind: "tvrm" | "pvrm" | "invalid"
    """
    m = (mark or "").strip().upper()
    m = re.sub(r"\s+", " ", m)

    # Marks are strictly letters/digits/spaces. Anything else is not a mark (e.g. "HK$" in totals).
    if re.search(r"[^A-Z0-9 ]", m):
        return ("invalid", "")

    compact = m.replace(" ", "")

    # Traditional formats:
    # - up to 4 digits
    # - 1-2 letters + up to 4 digits
    if re.fullmatch(r"\d{1,4}", compact):
        return ("tvrm", compact)
    mm = re.fullmatch(r"([A-Z]{1,2})(\d{1,4})", compact)
    if mm:
        return ("tvrm", f"{mm.group(1)} {mm.group(2)}")

    # Personalized special marks can be a single letter (e.g. "W", "R", "D") in LNY mixed PDFs.
    if re.fullmatch(r"[A-Z]", compact):
        return ("pvrm", compact)

    # Two-letter tokens can be personalized marks (e.g. "KK") in LNY mixed PDFs.
    # However, "HK" appears frequently in total proceeds lines ("HK$ ...") and is not a mark.
    if re.fullmatch(r"[A-Z]{2}", compact):
        if compact == "HK":
            return ("invalid", "")
        return ("pvrm", compact)

    return ("pvrm", m)


def _pdfium_text(pdf_path: str) -> str:
    doc = pdfium.PdfDocument(pdf_path)
    parts = []
    for i in range(len(doc)):
        parts.append(doc[i].get_textpage().get_text_range() or "")
    return "\n".join(parts).replace("\r", "\n")


def _has_numbered_items_pdfium(pdf_path: str) -> bool:
    try:
        t = _pdfium_text(pdf_path)
    except Exception:
        return False
    return bool(re.search(r"\b\d{1,3}\.\s*\*?\s*(?:[A-Z0-9]{1,8})\s+(?:U/S|[\d,]{1,12})\b", t, re.I))


def _parse_lny_by_numbered_text(pdf_path: str) -> list[LnyRow]:
    blob = _pdfium_text(pdf_path)
    blob = re.sub(r"[ \t]+", " ", blob)

    out: list[LnyRow] = []
    # N. [*] MARK AMOUNT|U/S
    re_entry = re.compile(
        r"\b\d{1,3}\.\s*\*?\s*([A-Z]{1,2}\s*\d{1,4}|\d{1,4}|[A-Z]{1,2}|[A-Z0-9]{3,8})\s+(U/S|[\d,]{1,12})\b",
        re.IGNORECASE,
    )
    for m in re_entry.finditer(blob):
        mark = (m.group(1) or "").strip()
        amt = (m.group(2) or "").strip()
        if UNSOLD_TOKEN_RE.fullmatch(amt):
            continue
        try:
            amount = int(amt.replace(",", ""))
        except ValueError:
            continue
        kind, formatted = _classify_and_format_mark(mark)
        if kind == "invalid" or not formatted:
            continue
        out.append(LnyRow(kind=kind, single_line=formatted, amount_hkd=amount))
    return out


def _group_words_into_lines(words: list[dict], y_tol: float = 2.0) -> list[list[str]]:
    # pdfplumber 'top' is y from top. Bucket words by y (within tolerance), then sort by x.
    lines: list[dict] = []  # {y: float, toks: list[(x0, text)]}
    for w in words:
        txt = (w.get("text") or "").strip()
        if not txt:
            continue
        top = float(w.get("top") or 0.0)
        x0 = float(w.get("x0") or 0.0)

        for line in lines:
            if abs(float(line["y"]) - top) <= y_tol:
                line["toks"].append((x0, txt))
                break
        else:
            lines.append({"y": top, "toks": [(x0, txt)]})

    out: list[list[str]] = []
    for line in lines:
        out.append([t for _, t in sorted(line["toks"], key=lambda x: x[0])])
    return out


def _parse_lny_by_positioned_words(pdf_path: str) -> list[LnyRow]:
    out: list[LnyRow] = []
    with pdfplumber.open(pdf_path) as doc:
        for page in doc.pages:
            words = page.extract_words() or []
            for toks in _group_words_into_lines(words):
                if not any(AMOUNT_TOKEN_RE.fullmatch(t) for t in toks):
                    continue

                pending: list[str] = []
                for t in toks:
                    if t == "$":
                        continue
                    if UNSOLD_TOKEN_RE.fullmatch(t):
                        pending = []
                        continue
                    if AMOUNT_TOKEN_RE.fullmatch(t):
                        if not pending:
                            continue
                        mark_raw = _normalize_mark_tokens(pending)
                        pending = []
                        if not mark_raw:
                            continue
                        up = mark_raw.upper()
                        if any(w in LNY_STOPWORDS for w in up.split()):
                            continue
                        kind, formatted = _classify_and_format_mark(mark_raw)
                        if kind == "invalid" or not formatted:
                            continue
                        try:
                            amount = int(t.replace(",", ""))
                        except ValueError:
                            continue
                        out.append(LnyRow(kind=kind, single_line=formatted, amount_hkd=amount))
                        continue
                    pending.append(t)
    return out


def parse_lny_mixed_pdf(pdf_path: str) -> list[LnyRow]:
    if _has_numbered_items_pdfium(pdf_path):
        # Some PDFs lose tokens in pdfium text extraction; combine both strategies.
        rows = _parse_lny_by_numbered_text(pdf_path) + _parse_lny_by_positioned_words(pdf_path)
    else:
        rows = _parse_lny_by_positioned_words(pdf_path)

    uniq: dict[tuple[str, str, Optional[int]], LnyRow] = {}
    for r in rows:
        uniq[(r.kind, r.single_line, r.amount_hkd)] = r
    return list(uniq.values())
