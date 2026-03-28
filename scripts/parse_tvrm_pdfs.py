#!/usr/bin/env python3
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

import pdfplumber
import pypdfium2 as pdfium

sys.path.append(str(Path(__file__).resolve().parent))
from lny_mixed_parser import is_lny_url, parse_lny_mixed_pdf  # noqa: E402


AMOUNT_RE = re.compile(r"@?\$?\s*([0-9][0-9,]*)")
TOTAL_EN_RE = re.compile(
    r"Total\s+sale\s+proceeds\s+from\s+today'?s\s+auction\s*[:：]?\s*(?:HK)?\s*\$?\s*([0-9,]+)",
    re.IGNORECASE,
)
TOTAL_ZH_RE = re.compile(r"全日拍賣所得款項\s*[:：]?\s*(?:HK)?\s*\$?\s*([0-9,]+)", re.IGNORECASE)
TOTAL_ZH_PROCEEDS_RE = re.compile(r"拍賣所得\s*\$?\s*([0-9,]+)")
TOTAL_EN_PROCEEDS_RE = re.compile(r"The\s+total\s+proceeds\s+of\s*\$?\s*([0-9,]+)", re.IGNORECASE)

DATE_ZH_RE = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
DATE_EN_RE_DMY = re.compile(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b")
DATE_EN_RE_MDY = re.compile(r"\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b")
RANGE_ZH_RE = re.compile(
    r"(\d{4})年(\d{1,2})月(\d{1,2})日\s*至\s*(\d{4})年(\d{1,2})月(\d{1,2})日"
)
RANGE_EN_RE = re.compile(
    r"Held\\s+on\\s+(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})\\s+to\\s+(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})",
    re.IGNORECASE,
)
FILENAME_DATE_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")

PLATE_PREFIX_RE = re.compile(r"^[A-Z]{1,2}$")
PLATE_NUMBER_RE = re.compile(r"^\d{1,4}$")
UNSOLD_RE = re.compile(r"^(U/S|UNSOLD|未售出)$", re.IGNORECASE)

E_TEXT_RE = re.compile(r"\b([A-Z]{1,2})\s+(\d{1,4})\s+(@?\d{1,3}(?:,\d{3})*|\d{1,9})\b")

PH_TEXT_RE = re.compile(r"\b\*?\s*([A-Z]{1,2})\s+(\d{1,4})\s+(@?\d{1,3}(?:,\d{3})+|\d{4,9})\b")
PH_LETTERS_ONLY_RE = re.compile(r"\b\*?\s*([A-Z]{1,2})\s+([0-9]{1,3}(?:,[0-9]{3})+)\b")
PH_DIGITS_ONLY_RE = re.compile(r"\b\*?\s*(\d{1,4})\s+([0-9]{1,3}(?:,[0-9]{3})+)\b")

PH_AMOUNT_TOKEN_RE = re.compile(r"^\d{1,3}(?:,\d{3})+$")


@dataclass
class ParsedAuction:
    auction_date: str  # ISO; for e-auction this is range-start date
    auction_date_label: Optional[str]
    pdf_url: str
    total_sale_proceeds_hkd: Optional[int]
    rows: list[dict]


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_amount_hkd(raw: Optional[str]) -> Optional[int]:
    if raw is None:
        return None
    t = normalize_space(str(raw))
    if not t:
        return None
    if UNSOLD_RE.fullmatch(t):
        return None
    m = AMOUNT_RE.search(t)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def extract_date_from_filename(name: str) -> Optional[str]:
    m = FILENAME_DATE_RE.search(name or "")
    if not m:
        return None
    y, mth, d = map(int, m.groups())
    try:
        return date(y, mth, d).isoformat()
    except ValueError:
        return None


def extract_date_from_url(url: str) -> Optional[str]:
    """
    Older TD PDFs often have no YYYYMMDD in filename, but the URL contains the date,
    e.g. "...tvrm auction result 1-5-2011.pdf" or "...handout_26.2.2012.pdf".
    """
    if not url:
        return None
    s = unquote(url)

    # Prefer YYYYMMDD if present.
    m = re.search(r"(20\d{2})(\d{2})(\d{2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None

    # DD-MM-YYYY (common in 2010-2012 filenames). Avoid \b because '_' counts as a word char.
    m = re.search(r"(?<!\d)(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)", s)
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None

    # D.M.YYYY / DD.MM.YYYY
    m = re.search(r"(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)", s)
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None

    # YYYY.M.D / YYYY.MM.DD
    m = re.search(r"(?<!\d)(\d{4})\.(\d{1,2})\.(\d{1,2})(?!\d)", s)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None

    return None


def parse_lny_physical_tvrm_rows(pdf_path: Path, pdf_url: str) -> list[dict]:
    # Parse mixed LNY/CNY PDFs and keep ONLY traditional marks for TVRM dataset.
    out: list[dict] = []
    for r in parse_lny_mixed_pdf(str(pdf_path)):
        if r.kind != "tvrm":
            continue
        out.append({"single_line": r.single_line, "amount_hkd": r.amount_hkd})
    return out


def is_traditional_physical_pdf(pdf_path: Path) -> bool:
    """
    Guardrail: the legacy /filemanager/common/ space contains both TVRM and PVRM PDFs,
    often with very similar filenames (e.g. "auction result handout_YYYY.MM.DD.pdf").
    We must not ingest PVRM PDFs into the TVRM dataset.
    """
    try:
        doc = pdfium.PdfDocument(str(pdf_path))
        raw = doc[0].get_textpage().get_text_range() or ""
    except Exception:
        return False

    text = normalize_space(raw).lower()

    # English headers
    if "traditional vehicle registration marks" in text:
        return True
    if "personalized vehicle registration marks" in text:
        return False

    # Chinese headers
    if "傳統車輛登記號碼" in raw:
        return True
    if "自訂車輛登記號碼" in raw:
        return False

    # Unknown: default to False to avoid polluting the dataset with wrong-type PDFs.
    return False


def parse_physical_rows_by_words(pdf_path: Path) -> list[dict]:
    # Robust for multi-column PDFs; avoids false positives like extracting the "1" from "RR 1 830,000".
    rows: list[dict] = []
    try:
        with pdfplumber.open(str(pdf_path)) as doc:
            for page_no, page in enumerate(doc.pages, start=1):
                words = page.extract_words() or []

                # Bucket words into lines by y coordinate.
                lines: list[dict] = []
                for w in words:
                    txt = (w.get("text") or "").strip()
                    if not txt:
                        continue
                    top = float(w.get("top") or 0.0)
                    x0 = float(w.get("x0") or 0.0)
                    for line in lines:
                        if abs(float(line["y"]) - top) <= 2.0:
                            line["toks"].append((x0, txt))
                            break
                    else:
                        lines.append({"y": top, "toks": [(x0, txt)]})

                for line in lines:
                    toks = [t for _, t in sorted(line["toks"], key=lambda x: x[0])]
                    if not any(PH_AMOUNT_TOKEN_RE.fullmatch(t) for t in toks):
                        continue
                    pending: list[str] = []
                    for t in toks:
                        if t == "$":
                            continue
                        if UNSOLD_RE.fullmatch(t):
                            pending = []
                            continue
                        if PH_AMOUNT_TOKEN_RE.fullmatch(t):
                            if not pending:
                                continue
                            # Normalize mark tokens.
                            cleaned = []
                            for x in pending:
                                x = (x or "").strip()
                                if not x or x in {"*", ".", "$"}:
                                    continue
                                cleaned.append(x.lstrip("*"))
                            # Drop leading item indices like "19." / "19" when followed by real mark tokens.
                            while len(cleaned) > 1 and re.fullmatch(r"\d+\.?", cleaned[0]):
                                cleaned.pop(0)
                            mark = normalize_space(" ".join(cleaned)).upper()
                            pending = []
                            if not mark:
                                continue
                            # Only accept likely TVRM mark patterns.
                            compact = mark.replace(" ", "")
                            if re.fullmatch(r"\d{1,4}", compact):
                                sl = compact
                            else:
                                mm = re.fullmatch(r"([A-Z]{1,2})(\d{1,4})", compact)
                                if mm:
                                    sl = f"{mm.group(1)} {mm.group(2)}"
                                else:
                                    mm2 = re.fullmatch(r"([A-Z]{1,2})\s+(\d{1,4})", mark)
                                    if mm2:
                                        sl = f"{mm2.group(1)} {mm2.group(2)}"
                                    elif re.fullmatch(r"[A-Z]{1,2}", compact):
                                        sl = compact
                                    else:
                                        continue
                            try:
                                amt = int(t.replace(",", ""))
                            except ValueError:
                                continue
                            rows.append({"single_line": sl, "double_line": None, "amount_hkd": amt, "page": page_no})
                            continue
                        pending.append(t)
    except Exception:
        return []

    uniq = {}
    for r in rows:
        uniq[(r["single_line"], r["amount_hkd"])] = r
    return list(uniq.values())


def extract_total_sale_proceeds(pdf_path: Path) -> Optional[int]:
    doc = pdfium.PdfDocument(str(pdf_path))
    for page_index in reversed(range(len(doc))):
        raw = doc[page_index].get_textpage().get_text_range()
        text = normalize_space(raw)
        m = (
            TOTAL_EN_RE.search(text)
            or TOTAL_ZH_RE.search(text)
            or TOTAL_EN_PROCEEDS_RE.search(text)
            or TOTAL_ZH_PROCEEDS_RE.search(text)
        )
        if not m:
            continue
        try:
            return int(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def extract_first_date_from_pdf(pdf_path: Path) -> Optional[str]:
    month_map = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }

    def try_build(y: int, mth: int, d: int) -> Optional[str]:
        try:
            return date(y, mth, d).isoformat()
        except ValueError:
            return None

    doc = pdfium.PdfDocument(str(pdf_path))
    for i in range(min(len(doc), 3)):
        raw = doc[i].get_textpage().get_text_range() or ""
        m = DATE_ZH_RE.search(raw)
        if m:
            y, mth, d = map(int, m.groups())
            out = try_build(y, mth, d)
            if out:
                return out
        compact = re.sub(r"\s+", "", raw)
        m = DATE_ZH_RE.search(compact)
        if m:
            y, mth, d = map(int, m.groups())
            out = try_build(y, mth, d)
            if out:
                return out

        norm = normalize_space(raw)
        m = DATE_EN_RE_DMY.search(norm)
        if m:
            d, mon, y = m.groups()
            mth = month_map.get(mon.lower())
            if mth:
                out = try_build(int(y), mth, int(d))
                if out:
                    return out
        m = DATE_EN_RE_MDY.search(norm)
        if m:
            mon, d, y = m.groups()
            mth = month_map.get(mon.lower())
            if mth:
                out = try_build(int(y), mth, int(d))
                if out:
                    return out
    return None


def extract_eauction_date_label(pdf_path: Path) -> Optional[str]:
    doc = pdfium.PdfDocument(str(pdf_path))
    full = []
    for i in range(len(doc)):
        full.append(doc[i].get_textpage().get_text_range())
    text = "\n".join(full)
    # Some PDFs have odd spacing between digits (e.g. "1 2" for "12"), so use a compact form.
    compact = re.sub(r"\s+", "", text)
    m = RANGE_ZH_RE.search(compact)
    if not m:
        # Try English header
        en_norm = normalize_space(text)
        m2 = RANGE_EN_RE.search(en_norm)
        if not m2:
            return None
        d1s, mon1, y1s, d2s, mon2, y2s = m2.groups()
        month_map = {
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }
        try:
            y1 = int(y1s)
            y2 = int(y2s)
            d1 = int(d1s)
            d2 = int(d2s)
            m1 = month_map.get(mon1.strip().lower())
            m3 = month_map.get(mon2.strip().lower())
            if not m1 or not m3:
                return None
        except ValueError:
            return None
        return f"{y1}年{m1}月{d1}日至{y2}年{m3}月{d2}日"
    y1, m1, d1, y2, m2n, d2 = map(int, m.groups())
    return f"{y1}年{m1}月{d1}日至{y2}年{m2n}月{d2}日"


def parse_physical_rows(pdf_path: Path, pdf_url: str = "", force_lny: bool = False) -> list[dict]:
    # LNY/CNY mixed-result PDFs: always use the word-based parser to avoid
    # partial matches / misalignment from text extraction.
    if force_lny or is_lny_url(pdf_url) or is_lny_url(pdf_path.name):
        return parse_lny_physical_tvrm_rows(pdf_path, pdf_url)

    # Some "common/" PDFs are actually PVRM results; skip them.
    if not is_traditional_physical_pdf(pdf_path):
        return []

    rows = parse_physical_rows_by_words(pdf_path)
    if rows:
        return rows

    rows: list[dict] = []

    # Pass 1: robust text extraction via pdfium + regex (covers many older PDFs, fast).
    doc2 = pdfium.PdfDocument(str(pdf_path))
    for page_no in range(len(doc2)):
        raw = doc2[page_no].get_textpage().get_text_range()
        text = raw or ""

        # Common layout: "BB 6607 3,000" (may contain "@1,000") and repeated in multi-columns.
        for m in PH_TEXT_RE.finditer(text):
            prefix, number, raw_amount = m.group(1), m.group(2), m.group(3)
            amt = parse_amount_hkd(raw_amount)
            if amt is None:
                continue
            rows.append(
                {
                    "single_line": f"{prefix} {number}",
                    "double_line": None,
                    "amount_hkd": amt,
                    "page": page_no + 1,
                }
            )

        # Special marks: letters only, e.g. "VV 6,100,000"
        for m in PH_LETTERS_ONLY_RE.finditer(text):
            mark, raw_amount = m.group(1), m.group(2)
            # Skip if this is actually part of a longer "prefix number amount" match.
            if PLATE_PREFIX_RE.fullmatch(mark) and not mark.isdigit():
                amt = parse_amount_hkd(raw_amount)
                if amt is None:
                    continue
                rows.append(
                    {
                        "single_line": mark,
                        "double_line": None,
                        "amount_hkd": amt,
                        "page": page_no + 1,
                    }
                )

        # Special marks: digits only, e.g. "8388 900,000"
        for m in PH_DIGITS_ONLY_RE.finditer(text):
            # Avoid false positives for the number-part of a normal "AA 1 50,000" style entry.
            # If immediately preceded by a 1-2 letter prefix token, skip.
            ctx = text[max(0, m.start() - 6) : m.start()]
            if re.search(r"[A-Z]{1,2}\s*$", ctx):
                continue
            mark, raw_amount = m.group(1), m.group(2)
            amt = parse_amount_hkd(raw_amount)
            if amt is None:
                continue
            rows.append(
                {
                    "single_line": mark,
                    "double_line": None,
                    "amount_hkd": amt,
                    "page": page_no + 1,
                }
            )

    # Pass 2: table extraction fallback (slow, only if regex found nothing).
    if not rows:
        try:
            with pdfplumber.open(str(pdf_path)) as doc:
                for page_no, page in enumerate(doc.pages, start=1):
                    tables = page.extract_tables() or []
                    for table in tables:
                        for row in table:
                            if not row:
                                continue
                            cells = [normalize_space(c or "") for c in row]
                            i = 0
                            while i + 2 < len(cells):
                                a, b, c = cells[i], cells[i + 1], cells[i + 2]
                                if PLATE_PREFIX_RE.fullmatch(a) and PLATE_NUMBER_RE.fullmatch(b):
                                    amt = parse_amount_hkd(c)
                                    if amt is not None:
                                        rows.append(
                                            {
                                                "single_line": f"{a} {b}",
                                                "double_line": None,
                                                "amount_hkd": amt,
                                                "page": page_no,
                                            }
                                        )
                                    i += 3
                                    continue
                                i += 1
        except Exception:
            pass

    # Pass 3: LNY/CNY mixed-result PDFs (often no tables + text not aligned).
    if not rows and (is_lny_url(pdf_url) or is_lny_url(pdf_path.name)):
        return parse_lny_physical_tvrm_rows(pdf_path, pdf_url)

    # Dedup within PDF
    uniq = {}
    for r in rows:
        uniq[(r["single_line"], r["amount_hkd"])] = r
    return list(uniq.values())


def parse_eauction_rows(pdf_path: Path) -> list[dict]:
    rows: list[dict] = []
    doc = pdfium.PdfDocument(str(pdf_path))
    full = []
    for i in range(len(doc)):
        full.append(doc[i].get_textpage().get_text_range())
    text = "\n".join(full)
    for m in E_TEXT_RE.finditer(text):
        prefix, number, raw_amount = m.group(1), m.group(2), m.group(3)
        amt = parse_amount_hkd(raw_amount)
        if amt is None:
            continue
        rows.append(
            {
                "single_line": f"{prefix} {number}",
                "double_line": None,
                "amount_hkd": amt,
                "page": None,
            }
        )
    uniq = {}
    for r in rows:
        uniq[(r["single_line"], r["amount_hkd"])] = r
    return list(uniq.values())


def build_dataset(base_dir: Path, kind: str) -> int:
    pdf_dir = base_dir / "pdfs"
    issues_dir = base_dir / "issues"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    issues_dir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted([p for p in pdf_dir.glob("*.pdf") if p.is_file()], key=lambda p: p.name)
    if not pdfs:
        print(f"[{kind}] No PDFs found in {pdf_dir}")
        return 1

    # filename<TAB>url
    url_map = {}
    map_path = base_dir / "sources.tsv"
    if map_path.exists():
        for line in map_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                url_map[parts[0]] = parts[1]

    # Fallback URL candidates by auction date from discovered URL inventories.
    date_url_map: dict[str, set[str]] = {}
    for inv_name in ("urls.all.txt", "urls.txt"):
        inv_path = base_dir / inv_name
        if not inv_path.exists():
            continue
        for raw in inv_path.read_text(encoding="utf-8", errors="replace").splitlines():
            u = (raw or "").strip()
            if not u:
                continue
            d = extract_date_from_url(u)
            if not d:
                continue
            date_url_map.setdefault(d, set()).add(u)

    # Some LNY/CNY PDFs don't include a parseable date in filename nor extractable zh date.
    # Use PVRM auctions metadata as a fallback mapping: pdf_url -> auction_date.
    pvrm_url_to_date: dict[str, str] = {}
    pvrm_url_to_is_lny: dict[str, bool] = {}
    try:
        pvrm_auctions = (Path(__file__).resolve().parents[1] / "data" / "auctions.json")
        if pvrm_auctions.exists():
            raw = json.loads(pvrm_auctions.read_text(encoding="utf-8"))
            for x in raw:
                u = x.get("pdf_url")
                d = x.get("auction_date")
                if u and d:
                    pvrm_url_to_date[str(u)] = str(d)
                    pvrm_url_to_is_lny[str(u)] = bool(x.get("is_lny"))
    except Exception:
        pvrm_url_to_date = {}
        pvrm_url_to_is_lny = {}

    def url_preference_key(u: str) -> tuple[int, int, str]:
        # Lower is better.
        # Prefer language-specific content_4804 PDFs over older common/ variants.
        if "/filemanager/tc/content_4804/" in u:
            lang_rank = 0
        elif "/filemanager/sc/content_4804/" in u:
            lang_rank = 1
        elif "/filemanager/en/content_4804/" in u:
            lang_rank = 2
        elif "/filemanager/common/" in u:
            lang_rank = 3
        else:
            lang_rank = 9

        # Prefer result PDFs over handouts/other PDFs.
        ul = u.lower()
        name_rank = 5
        if "tvrm_auction_result_" in ul:
            name_rank = 0
        elif "tvrm%20auction%20result" in ul or "tvrm auction result" in ul:
            name_rank = 1
        elif "tvrmauctionresult" in ul or "tvrm_auction_result" in ul:
            name_rank = 1
        elif "auction_result" in ul or "auction result" in ul or "auction%20result" in ul:
            name_rank = 2
        elif "handout" in ul:
            name_rank = 9
        return (lang_rank, name_rank, u)

    # Merge duplicates across language variants: issue_key -> aggregated data.
    issues: dict[str, dict] = {}

    for idx, p in enumerate(pdfs, start=1):
        if idx % 25 == 0 or idx == 1 or idx == len(pdfs):
            print(f"[{kind}] Parsing {idx}/{len(pdfs)}: {p.name}")
        pdf_url = url_map.get(p.name, "")
        # Prefer PDF content date; filenames can be misleading for legacy common/ PDFs.
        date_label = None
        if kind == "eauction":
            date_iso = extract_date_from_filename(p.name)
            date_label = extract_eauction_date_label(p)
            if date_iso is None and date_label:
                m = DATE_ZH_RE.search(date_label)
                if m:
                    y, mth, d = map(int, m.groups())
                    date_iso = date(y, mth, d).isoformat()
        else:
            date_from_pdf = extract_first_date_from_pdf(p)
            date_from_name = extract_date_from_filename(p.name)
            date_from_url = extract_date_from_url(pdf_url) if pdf_url else None

            if date_from_pdf:
                date_iso = date_from_pdf
                if date_from_name and date_from_name != date_from_pdf:
                    print(
                        f"[{kind}] WARN: filename date mismatch; using PDF date {date_from_pdf}"
                        f" name={p.name}"
                    )
            elif date_from_name:
                date_iso = date_from_name
            elif date_from_url:
                date_iso = date_from_url
            else:
                date_iso = pvrm_url_to_date.get(pdf_url) if pdf_url else None
        if date_iso is None:
            # Unknown date: don't pollute datasets by grouping into "today".
            # Keep a small error list for debugging and skip this PDF.
            print(f"[{kind}] WARN: cannot determine auction date for {p.name} url={pdf_url!r}")
            continue
        issue = issues.setdefault(
            date_iso,
            {
                "auction_date": date_iso,
                "auction_date_label": "",
                "pdf_urls": set(),
                "rows": {},  # (single_line, amount_hkd) -> row
                "total_sale_proceeds_hkd": None,
                "errors": [],
            },
        )
        if date_label and not issue["auction_date_label"]:
            issue["auction_date_label"] = date_label
        if pdf_url:
            issue["pdf_urls"].add(pdf_url)
            if pvrm_url_to_is_lny.get(pdf_url) or is_lny_url(pdf_url):
                issue["is_lny"] = True

        if kind == "physical":
            force_lny = bool(pvrm_url_to_is_lny.get(pdf_url)) if pdf_url else False
            rows = parse_physical_rows(p, pdf_url, force_lny=force_lny)
        else:
            rows = parse_eauction_rows(p)

        total = extract_total_sale_proceeds(p)
        if issue["total_sale_proceeds_hkd"] is None and total is not None:
            issue["total_sale_proceeds_hkd"] = total

        for r in rows:
            k = (r["single_line"], r["amount_hkd"])
            if k not in issue["rows"]:
                issue["rows"][k] = r

    # Build canonical auctions.json (one entry per auction_date) + slim rows
    auctions_meta = []
    all_rows = []
    for date_iso in sorted(issues.keys()):
        issue = issues[date_iso]
        pdf_urls = sorted([u for u in issue["pdf_urls"] if u], key=url_preference_key)
        if not pdf_urls and date_iso in date_url_map:
            pdf_urls = sorted(date_url_map[date_iso], key=url_preference_key)
            if any((is_lny_url(u) for u in pdf_urls)):
                issue["is_lny"] = True
        canonical_pdf = pdf_urls[0] if pdf_urls else ""

        row_items = list(issue["rows"].values())
        auctions_meta.append(
            {
                "auction_date": date_iso,
                "auction_date_label": issue.get("auction_date_label") or "",
                "pdf_url": canonical_pdf,
                "pdf_urls": pdf_urls,
                "entry_count": len(row_items),
                "total_sale_proceeds_hkd": issue.get("total_sale_proceeds_hkd"),
                "is_lny": bool(issue.get("is_lny")),
                "error": None,
            }
        )
        for r in row_items:
            all_rows.append(
                {
                    "auction_date": date_iso,
                    "single_line": r["single_line"],
                    "double_line": None,
                    "amount_hkd": r["amount_hkd"],
                    "pdf_url": canonical_pdf,
                }
            )

    # Shard by auction_date (including issues with zero parsed rows).
    by_issue: dict[str, list[dict]] = {d: [] for d in issues.keys()}
    for r in all_rows:
        by_issue.setdefault(r["auction_date"], []).append(r)
    issue_dates_desc = sorted(issues.keys(), reverse=True)

    manifest_items = []
    for d in issue_dates_desc:
        rows = by_issue[d]
        (issues_dir / f"{d}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        manifest_items.append({"auction_date": d, "count": len(rows), "file": f"issues/{d}.json"})

    # Remove stale issue JSONs no longer present after a rebuild.
    keep = {f"{d}.json" for d in issue_dates_desc}
    for p in issues_dir.glob("*.json"):
        if p.name not in keep:
            try:
                p.unlink()
            except Exception:
                pass

    manifest = {"total_rows": len(all_rows), "issue_count": len(manifest_items), "issues": manifest_items}
    (base_dir / "issues.manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    amount_desc = sorted(
        all_rows,
        key=lambda r: (-(r["amount_hkd"] if r["amount_hkd"] is not None else -1), r["auction_date"], r["single_line"] or ""),
    )
    (base_dir / "preset.amount_desc.top1000.json").write_text(
        json.dumps(amount_desc[:1000], ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (base_dir / "auctions.json").write_text(json.dumps(auctions_meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (base_dir / "results.slim.json").write_text(json.dumps(all_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return 0


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    data = root / "data"
    rc1 = build_dataset(data / "tvrm_physical", "physical")
    rc2 = build_dataset(data / "tvrm_eauction", "eauction")
    return 0 if rc1 == 0 and rc2 == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
