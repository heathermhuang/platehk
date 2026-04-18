#!/usr/bin/env python3
import hashlib
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit

import pdfplumber
import pypdfium2 as pdfium
from bs4 import BeautifulSoup
from lny_mixed_parser import is_lny_url, parse_lny_mixed_pdf

# TVRM (Traditional Vehicle Registration Marks) datasets:
# 1) Physical auction result handouts (實體拍賣結果)
# 2) Online "E-Auction" result handouts (拍牌易網上拍賣結果) -- PDFs hosted on td.gov.hk filemanager

BASE_URL = "https://www.td.gov.hk"
INDEX_URL_TVRM = "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/tvrm_auction/index.html"

DATA_DIR = Path("data")


AMOUNT_RE = re.compile(r"@?\$?\s*([0-9][0-9,]*)")
TOTAL_EN_RE = re.compile(
    r"Total\s+sale\s+proceeds\s+from\s+today'?s\s+auction\s*[:：]?\s*(?:HK)?\s*\$?\s*([0-9,]+)",
    re.IGNORECASE,
)
TOTAL_ZH_RE = re.compile(r"全日拍賣所得款項\s*[:：]?\s*(?:HK)?\s*\$?\s*([0-9,]+)", re.IGNORECASE)

DATE_ZH_RE = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
DATE_EN_RE_DMY = re.compile(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b")
DATE_EN_RE_MDY = re.compile(r"\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b")
FILENAME_DATE_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")

PLATE_PREFIX_RE = re.compile(r"^[A-Z]{1,2}$")
PLATE_NUMBER_RE = re.compile(r"^\d{1,4}$")
UNSOLD_RE = re.compile(r"^(U/S|UNSOLD|未售出)$", re.IGNORECASE)


@dataclass
class AuctionPdf:
    kind: str  # "physical" | "eauction"
    date_iso: str
    date_label_zh: str
    pdf_url: str


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(unquote(parts.path), safe="/%")
    query = quote(unquote(parts.query), safe="=&%")
    return urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def request_bytes(url: str) -> bytes:
    url = normalize_url(url)
    return subprocess.check_output(["curl", "-L", "-s", url], timeout=60)


def request_head_ok(url: str) -> bool:
    url = normalize_url(url)
    try:
        code = subprocess.check_output(
            ["curl", "-I", "-L", "-s", "-o", "/dev/null", "-w", "%{http_code}", url],
            timeout=20,
        ).decode("utf-8", errors="replace")
        return code.strip().startswith("2")
    except (subprocess.CalledProcessError, TimeoutError):
        return False


def extract_date_from_href(href: str) -> Optional[str]:
    m = FILENAME_DATE_RE.search(href)
    if not m:
        decoded = unquote(href or "")
        normalized = re.sub(r"[_%]+", " ", decoded)
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
        same_month = re.search(r"\b(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b", normalized)
        if same_month:
            d1, _d2, mon, y = same_month.groups()
            mth = month_map.get(mon.lower())
            if mth:
                try:
                    return date(int(y), mth, int(d1)).isoformat()
                except ValueError:
                    return None
        cross_month = re.search(
            r"\b(\d{1,2})\s+([A-Za-z]+)\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b",
            normalized,
        )
        if cross_month:
            d1, mon1, _d2, _mon2, y = cross_month.groups()
            mth = month_map.get(mon1.lower())
            if mth:
                try:
                    return date(int(y), mth, int(d1)).isoformat()
                except ValueError:
                    return None
        return None
    y, mth, d = map(int, m.groups())
    try:
        return date(y, mth, d).isoformat()
    except ValueError:
        return None


def extract_zh_date_from_text(text: str) -> Optional[str]:
    m = DATE_ZH_RE.search(text or "")
    if not m:
        return None
    y, mth, d = map(int, m.groups())
    try:
        return date(y, mth, d).isoformat()
    except ValueError:
        return None


def format_zh_date(date_iso: str) -> str:
    dt = datetime.strptime(date_iso, "%Y-%m-%d").date()
    return f"{dt.year}年{dt.month}月{dt.day}日"


def parse_amount_hkd(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    t = normalize_space(raw.replace("\n", " "))
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


def local_pdf_name(date_iso: str, pdf_url: str) -> str:
    digest = hashlib.sha1(pdf_url.encode("utf-8")).hexdigest()[:10]
    return f"{date_iso}_{digest}.pdf"


def scrape_index_seed_pdfs() -> list[AuctionPdf]:
    html = request_bytes(INDEX_URL_TVRM).decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    out: list[AuctionPdf] = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if ".pdf" not in href.lower():
            continue
        abs_url = normalize_url(urljoin(BASE_URL, href))
        if abs_url in seen:
            continue
        seen.add(abs_url)

        label = normalize_space(a.get_text(" ", strip=True))
        parent_text = normalize_space(a.parent.get_text(" ", strip=True) if a.parent else "")
        around = f"{label} {parent_text}"

        kind = None
        if re.search(r"E-Auction|網上|Online Vehicle Registration Marks|拍牌易", around, re.IGNORECASE):
            kind = "eauction"
        # New index entries may have date-only anchor text; detect e-auction by filename pattern.
        if re.search(r"E-Auction\s*Result\s*Handout|Online_Auction_Result_NSRM", abs_url, re.IGNORECASE):
            kind = "eauction"
        if re.search(r"實體|TVRM|傳統車輛登記號碼拍賣結果|auction result", around, re.IGNORECASE):
            # The page contains both; when ambiguous, prefer physical if filename looks like tvrm_auction_result_...
            if "tvrm_auction_result_" in abs_url.lower():
                kind = "physical"
            elif kind is None:
                kind = "physical"

        if kind is None:
            # Skip unrelated PDFs (notes, maps, etc.)
            continue

        date_iso = extract_date_from_href(abs_url) or extract_zh_date_from_text(around)
        if not date_iso:
            # For e-auction PDFs, filename may not include yyyymmdd; we will fill from PDF content later.
            date_iso = "1970-01-01"

        out.append(AuctionPdf(kind=kind, date_iso=date_iso, date_label_zh=format_zh_date(date_iso) if date_iso != "1970-01-01" else "", pdf_url=abs_url))

    # Keep deterministic order
    out.sort(key=lambda x: (x.kind, x.date_iso, x.pdf_url))
    return out


def load_urls_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    out: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        u = normalize_space(line)
        if not u or ".pdf" not in u.lower():
            continue
        out.append(normalize_url(u))
    # keep order while deduping
    return list(dict.fromkeys(out))


def build_pdf_entries_from_urls(kind: str, urls: list[str]) -> list[AuctionPdf]:
    entries: list[AuctionPdf] = []
    for url in urls:
        date_iso = extract_date_from_href(url) or "1970-01-01"
        date_label = format_zh_date(date_iso) if date_iso != "1970-01-01" else ""
        entries.append(AuctionPdf(kind=kind, date_iso=date_iso, date_label_zh=date_label, pdf_url=url))
    return entries


def discover_physical_standard_pdfs(start: date, end: date) -> list[AuctionPdf]:
    # The most stable naming pattern observed on TD filemanager:
    # /filemanager/tc/content_4804/tvrm_auction_result_YYYYMMDD_chi.pdf
    out: list[AuctionPdf] = []
    d = start
    while d <= end:
        if d.weekday() not in (5, 6):  # Sat/Sun
            d += timedelta(days=1)
            continue
        ymd = d.strftime("%Y%m%d")
        url = f"{BASE_URL}/filemanager/tc/content_4804/tvrm_auction_result_{ymd}_chi.pdf"
        if request_head_ok(url):
            date_iso = d.isoformat()
            out.append(AuctionPdf(kind="physical", date_iso=date_iso, date_label_zh=format_zh_date(date_iso), pdf_url=normalize_url(url)))
        d += timedelta(days=1)
    return out


MONTH_EN = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def discover_eauction_by_thursdays(start: date, end: date) -> list[AuctionPdf]:
    # Many e-auction result PDFs are named like:
    # E-Auction Result Handout 5-9 February 2026.Chin.pdf
    # e-auction runs Thu -> Mon (5 days) in most cases.
    out: list[AuctionPdf] = []
    d = start
    while d <= end:
        if d.weekday() != 3:  # Thursday
            d += timedelta(days=1)
            continue
        d2 = d + timedelta(days=4)  # Monday
        # Guard: keep most candidates within same month; if cross-month, still try both month names.
        candidates = []
        for month_name, year in {(MONTH_EN[d.month - 1], d.year), (MONTH_EN[d2.month - 1], d2.year)}:
            candidates.append(
                f"{BASE_URL}/filemanager/tc/content_4804/E-Auction%20Result%20Handout%20{d.day}-{d2.day}%20{month_name}%20{year}.Chin.pdf"
            )
            candidates.append(
                f"{BASE_URL}/filemanager/en/content_4804/E-Auction%20Result%20Handout%20{d.day}-{d2.day}%20{month_name}%20{year}.Eng.pdf"
            )
        for url in candidates:
            if request_head_ok(url):
                # date_iso for e-auction is a range; store start date to key issue, and we'll refine label from PDF text.
                date_iso = d.isoformat()
                out.append(AuctionPdf(kind="eauction", date_iso=date_iso, date_label_zh=format_zh_date(date_iso), pdf_url=normalize_url(url)))
        d += timedelta(days=1)
    # Dedup by URL
    uniq = {}
    for x in out:
        uniq[x.pdf_url] = x
    return sorted(uniq.values(), key=lambda x: (x.date_iso, x.pdf_url))


def extract_total_sale_proceeds(pdf_path: Path) -> Optional[int]:
    doc = pdfium.PdfDocument(str(pdf_path))
    for page_index in reversed(range(len(doc))):
        raw = doc[page_index].get_textpage().get_text_range()
        text = normalize_space(raw)
        m = TOTAL_EN_RE.search(text) or TOTAL_ZH_RE.search(text)
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

    try:
        doc = pdfium.PdfDocument(str(pdf_path))
    except Exception:
        return None

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


def parse_physical_pdf_rows(pdf_path: Path, source: AuctionPdf) -> list[dict]:
    rows: list[dict] = []
    with pdfplumber.open(str(pdf_path)) as doc:
        for page_no, page in enumerate(doc.pages, start=1):
            tables = page.extract_tables() or []
            for table in tables:
                for row in table:
                    if not row:
                        continue
                    cells = [normalize_space(c or "") for c in row]
                    # Scan for repeating triples: PREFIX, NUMBER, AMOUNT/U/S
                    i = 0
                    while i + 2 < len(cells):
                        a, b, c = cells[i], cells[i + 1], cells[i + 2]
                        if PLATE_PREFIX_RE.fullmatch(a) and PLATE_NUMBER_RE.fullmatch(b):
                            amt = parse_amount_hkd(c)
                            if amt is not None:
                                single = f"{a} {b}"
                                rows.append(
                                    {
                                        "auction_date": source.date_iso,
                                        "single_line": single,
                                        "double_line": None,
                                        "amount_hkd": amt,
                                        "pdf_url": source.pdf_url,
                                        "page": page_no,
                                    }
                                )
                            # unsold rows are ignored (amt None)
                            i += 3
                            continue
                        i += 1
    return rows


def parse_lny_mixed_rows_for_tvrm(pdf_path: Path, source: AuctionPdf) -> list[dict]:
    rows: list[dict] = []
    for r in parse_lny_mixed_pdf(str(pdf_path)):
        if r.kind != "tvrm":
            continue
        rows.append(
            {
                "auction_date": source.date_iso,
                "single_line": r.single_line,
                "double_line": None,
                "amount_hkd": r.amount_hkd,
                "pdf_url": source.pdf_url,
                "page": None,
            }
        )
    # deterministic order
    rows.sort(key=lambda x: (x["single_line"], x["amount_hkd"] if x["amount_hkd"] is not None else -1))
    return rows


E_TEXT_RE = re.compile(
    r"\b([A-Z]{1,2})\s+(\d{1,4})\s+(@?\d{1,3}(?:,\d{3})*|\d{1,9})\b"
)


def parse_eauction_pdf_rows(pdf_path: Path, source: AuctionPdf) -> tuple[list[dict], Optional[str]]:
    # Parse text extracted by pdfium; tables are often not detected.
    rows: list[dict] = []
    doc = pdfium.PdfDocument(str(pdf_path))
    full = []
    for page_index in range(len(doc)):
        full.append(doc[page_index].get_textpage().get_text_range())
    text = "\n".join(full)

    # Try to derive a more accurate date label for this "issue" from the header text.
    # Example: "2026年2月5日至2026年2月9日..."
    compact_text = re.sub(r"\s+", "", text)
    range_match = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日至(\d{4})年(\d{1,2})月(\d{1,2})日", compact_text)
    date_label = None
    if range_match:
        y1, m1, d1, y2, m2, d2 = map(int, range_match.groups())
        date_label = f"{y1}年{m1}月{d1}日至{y2}年{m2}月{d2}日"
    else:
        # Newer handouts may omit the second year in Chinese, e.g. "2026年2月26日至3月2日".
        range_match2 = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日至(\d{1,2})月(\d{1,2})日", compact_text)
        if range_match2:
            y1, m1, d1, m2, d2 = map(int, range_match2.groups())
            date_label = f"{y1}年{m1}月{d1}日至{y1}年{m2}月{d2}日"
        else:
            en_norm = normalize_space(text)
            same_month_en = re.search(
                r"\b(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b",
                en_norm,
                re.IGNORECASE,
            )
            if same_month_en:
                d1, d2, mon, y = same_month_en.groups()
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
                mth = month_map.get(mon.lower())
                if mth:
                    date_label = f"{int(y)}年{mth}月{int(d1)}日至{int(y)}年{mth}月{int(d2)}日"
            else:
                cross_month_en = re.search(
                    r"\b(\d{1,2})\s+([A-Za-z]+)\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b",
                    en_norm,
                    re.IGNORECASE,
                )
                if cross_month_en:
                    d1, mon1, d2, mon2, y = cross_month_en.groups()
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
                    m1 = month_map.get(mon1.lower())
                    m2 = month_map.get(mon2.lower())
                    if m1 and m2:
                        date_label = f"{int(y)}年{m1}月{int(d1)}日至{int(y)}年{m2}月{int(d2)}日"

    for m in E_TEXT_RE.finditer(text):
        prefix, number, raw_amount = m.group(1), m.group(2), m.group(3)
        amt = parse_amount_hkd(raw_amount)
        if amt is None:
            continue
        rows.append(
            {
                "auction_date": source.date_iso,
                "single_line": f"{prefix} {number}",
                "double_line": None,
                "amount_hkd": amt,
                "pdf_url": source.pdf_url,
                "page": None,
            }
        )
    # Dedup within PDF (text extraction can sometimes repeat)
    uniq = {}
    for r in rows:
        key = (r["single_line"], r["amount_hkd"])
        uniq[key] = r
    return list(uniq.values()), date_label


def extract_start_date_from_zh_range(label: Optional[str]) -> Optional[str]:
    if not label:
        return None
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", label)
    if not m:
        return None
    y, mth, d = map(int, m.groups())
    try:
        return date(y, mth, d).isoformat()
    except ValueError:
        return None


def build_one(
    kind: str,
    pdfs: list[AuctionPdf],
    out_dir: Path,
    lny_url_set: Optional[set[str]] = None,
    pvrm_date_by_url: Optional[dict[str, str]] = None,
) -> int:
    # Layout matches the PVRM dataset (manifest + per-issue shards + amount-desc preset).
    base = out_dir
    pdf_dir = base / "pdfs"
    issues_dir = base / "issues"
    base.mkdir(parents=True, exist_ok=True)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    issues_dir.mkdir(parents=True, exist_ok=True)

    slim_rows: list[dict] = []
    meta: list[dict] = []
    source_updates: dict[str, str] = {}

    for idx, pdf in enumerate(pdfs, start=1):
        # e-auction seed date might be placeholder; we will keep it as "start date" key.
        fname = local_pdf_name(pdf.date_iso, pdf.pdf_url)
        source_updates[fname] = pdf.pdf_url
        pdf_path = pdf_dir / fname
        if not pdf_path.exists():
            try:
                pdf_path.write_bytes(request_bytes(pdf.pdf_url))
            except (subprocess.CalledProcessError, TimeoutError) as exc:
                meta.append(
                    {
                        "auction_date": pdf.date_iso,
                        "auction_date_label": pdf.date_label_zh,
                        "pdf_url": pdf.pdf_url,
                        "entry_count": 0,
                        "total_sale_proceeds_hkd": None,
                        "error": str(exc),
                    }
                )
                continue

        try:
            if kind == "physical":
                date_iso = pdf.date_iso
                date_label = pdf.date_label_zh
                # Fill placeholder dates from PVRM metadata when filename has no date.
                if date_iso == "1970-01-01" and pvrm_date_by_url and pdf.pdf_url in pvrm_date_by_url:
                    date_iso = pvrm_date_by_url[pdf.pdf_url]
                    date_label = format_zh_date(date_iso)
                date_from_pdf = extract_first_date_from_pdf(pdf_path)
                if date_from_pdf and date_from_pdf != date_iso:
                    print(
                        f"[physical] WARN: filename/index date mismatch; using PDF date {date_from_pdf}"
                        f" url={pdf.pdf_url}"
                    )
                    date_iso = date_from_pdf
                    date_label = format_zh_date(date_iso)
                source = AuctionPdf(
                    kind=pdf.kind,
                    date_iso=date_iso,
                    date_label_zh=date_label,
                    pdf_url=pdf.pdf_url,
                )
                if (lny_url_set and pdf.pdf_url in lny_url_set) or is_lny_url(pdf.pdf_url):
                    rows = parse_lny_mixed_rows_for_tvrm(pdf_path, source)
                else:
                    rows = parse_physical_pdf_rows(pdf_path, source)
            else:
                rows, date_label = parse_eauction_pdf_rows(pdf_path, pdf)
                date_label = date_label or pdf.date_label_zh
            total_proceeds = extract_total_sale_proceeds(pdf_path)
        except Exception as exc:  # noqa: BLE001
            meta.append(
                {
                    "auction_date": pdf.date_iso,
                    "auction_date_label": pdf.date_label_zh,
                    "pdf_url": pdf.pdf_url,
                    "entry_count": 0,
                    "total_sale_proceeds_hkd": None,
                    "error": str(exc),
                }
            )
            continue

        if kind == "physical":
            # If we corrected the date from PDF content, reflect it in metadata.
            auction_date = source.date_iso
            auction_date_label = date_label
        else:
            auction_date_label = date_label
            if pdf.date_iso == "1970-01-01":
                auction_date = extract_start_date_from_zh_range(date_label) or pdf.date_iso
            else:
                auction_date = pdf.date_iso

        meta.append(
            {
                "auction_date": auction_date,
                "auction_date_label": auction_date_label,
                "pdf_url": pdf.pdf_url,
                "entry_count": len(rows),
                "total_sale_proceeds_hkd": total_proceeds,
                "is_lny": bool((lny_url_set and pdf.pdf_url in lny_url_set) or is_lny_url(pdf.pdf_url)),
                "error": None,
            }
        )
        if auction_date != pdf.date_iso:
            # Ensure rows use corrected issue date.
            for r in rows:
                r["auction_date"] = auction_date
        slim_rows.extend(rows)
        if idx % 20 == 0 or idx == len(pdfs):
            print(f"  [{kind}] 進度: {idx}/{len(pdfs)}")

    # Stable sort
    slim_rows.sort(key=lambda r: (r["auction_date"], r["single_line"]))

    (base / "results.slim.json").write_text(
        json.dumps(slim_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (base / "auctions.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Keep filename->url mapping for downstream re-parsers.
    sources_tsv = base / "sources.tsv"
    merged_sources: dict[str, str] = {}
    if sources_tsv.exists():
        for line in sources_tsv.read_text(encoding="utf-8", errors="replace").splitlines():
            if "\t" not in line:
                continue
            fn, url = line.split("\t", 1)
            fn = fn.strip()
            url = url.strip()
            if fn and url:
                merged_sources[fn] = url
    merged_sources.update(source_updates)
    sources_tsv.write_text(
        "\n".join(f"{fn}\t{url}" for fn, url in sorted(merged_sources.items())) + "\n",
        encoding="utf-8",
    )

    # Shards
    by_issue: dict[str, list[dict]] = {}
    for r in slim_rows:
        by_issue.setdefault(r["auction_date"], []).append(r)
    issue_dates_desc = sorted(by_issue.keys(), reverse=True)

    manifest_items = []
    for date_iso in issue_dates_desc:
        rows = by_issue[date_iso]
        (issues_dir / f"{date_iso}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        manifest_items.append({"auction_date": date_iso, "count": len(rows), "file": f"issues/{date_iso}.json"})

    manifest = {"total_rows": len(slim_rows), "issue_count": len(manifest_items), "issues": manifest_items}
    (base / "issues.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    amount_desc = sorted(
        slim_rows,
        key=lambda r: (-(r["amount_hkd"] if r["amount_hkd"] is not None else -1), r["auction_date"], r["single_line"]),
    )
    (base / "preset.amount_desc.top1000.json").write_text(
        json.dumps(amount_desc[:1000], ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    return 0


def build() -> int:
    print("[1/4] 抓取 TVRM 頁面 PDF (seed)...")
    seeds = scrape_index_seed_pdfs()

    # Split seeds by kind
    seed_physical = [x for x in seeds if x.kind == "physical"]
    seed_eauction = [x for x in seeds if x.kind == "eauction"]
    print(f"seed physical={len(seed_physical)} 份, seed e-auction={len(seed_eauction)} 份")

    pvrm_date_by_url: dict[str, str] = {}
    lny_url_set: set[str] = set()
    pvrm_auctions_path = DATA_DIR / "auctions.json"
    if pvrm_auctions_path.exists():
        try:
            pvrm_auctions = json.loads(pvrm_auctions_path.read_text(encoding="utf-8"))
            for x in pvrm_auctions:
                u = normalize_url(str(x.get("pdf_url") or ""))
                d = str(x.get("auction_date") or "").strip()
                if u and d:
                    pvrm_date_by_url[u] = d
                if u and (x.get("is_lny") or re.fullmatch(r"https?://.*?/content_4806/\d{8}ret\.pdf", u, re.IGNORECASE)):
                    lny_url_set.add(u)
        except Exception:
            pass

    # Keep historical URL inventories so incremental updates never truncate old issues.
    existing_physical_urls = load_urls_file(DATA_DIR / "tvrm_physical" / "urls.all.txt")
    existing_eauction_urls = load_urls_file(DATA_DIR / "tvrm_eauction" / "urls.all.txt")
    existing_physical = build_pdf_entries_from_urls("physical", existing_physical_urls)
    existing_eauction = build_pdf_entries_from_urls("eauction", existing_eauction_urls)
    print(
        f"existing inventory: physical={len(existing_physical)} 份, "
        f"e-auction={len(existing_eauction)} 份"
    )

    def latest_date_from_manifest(manifest_path: Path) -> Optional[date]:
        if not manifest_path.exists():
            return None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            issues = manifest.get("issues", [])
            dates = [x.get("auction_date") for x in issues if x and x.get("auction_date")]
            if not dates:
                return None
            d = max(dates)
            return datetime.strptime(d, "%Y-%m-%d").date()
        except Exception:
            return None

    def latest_date_from_urls(urls: list[str]) -> Optional[date]:
        dates: list[date] = []
        for u in urls:
            iso = extract_date_from_href(u)
            if not iso:
                continue
            try:
                dates.append(datetime.strptime(iso, "%Y-%m-%d").date())
            except ValueError:
                continue
        return max(dates) if dates else None

    end = date.today()

    print("[2/4] 進一步探索實體拍賣 PDF (按週末日期枚舉)...")
    existing_physical_latest = latest_date_from_manifest(DATA_DIR / "tvrm_physical" / "issues.manifest.json")
    existing_physical_latest_url = latest_date_from_urls(existing_physical_urls)
    latest_physical = max(
        [d for d in (existing_physical_latest, existing_physical_latest_url) if d is not None],
        default=None,
    )
    start = (latest_physical + timedelta(days=1)) if latest_physical else date(2000, 1, 1)
    discovered_physical = discover_physical_standard_pdfs(start, end)
    print(f"discovered physical={len(discovered_physical)} 份")

    print("[3/4] 進一步探索網上拍賣 PDF (按週四日期枚舉)...")
    existing_ea_latest = latest_date_from_manifest(DATA_DIR / "tvrm_eauction" / "issues.manifest.json")
    existing_ea_latest_url = latest_date_from_urls(existing_eauction_urls)
    latest_ea = max(
        [d for d in (existing_ea_latest, existing_ea_latest_url) if d is not None],
        default=None,
    )
    # If we already have an inventory but cannot infer an exact latest date from URL naming,
    # skip brute-force discovery to avoid expensive full-history HEAD scans.
    if latest_ea is None and existing_eauction_urls:
        ea_start = end + timedelta(days=1)
    else:
        # E-auction started in recent years; using latest known date prevents huge scans.
        ea_start = (latest_ea + timedelta(days=1)) if latest_ea else date(2024, 1, 1)
    discovered_eauction = discover_eauction_by_thursdays(ea_start, end)
    print(f"discovered e-auction={len(discovered_eauction)} 份")

    # Merge (dedup by URL)
    physical_map = {x.pdf_url: x for x in (existing_physical + seed_physical + discovered_physical)}
    eauction_map = {x.pdf_url: x for x in (existing_eauction + seed_eauction + discovered_eauction)}

    physical_pdfs = sorted(physical_map.values(), key=lambda x: (x.date_iso, x.pdf_url))
    eauction_pdfs = sorted(eauction_map.values(), key=lambda x: (x.date_iso, x.pdf_url))

    print(f"[4/4] 下載並解析: physical={len(physical_pdfs)}, e-auction={len(eauction_pdfs)}")

    out_physical = DATA_DIR / "tvrm_physical"
    out_eauction = DATA_DIR / "tvrm_eauction"

    print("解析實體拍賣...")
    build_one("physical", physical_pdfs, out_physical, lny_url_set=lny_url_set, pvrm_date_by_url=pvrm_date_by_url)
    print("解析網上拍賣...")
    build_one("eauction", eauction_pdfs, out_eauction, lny_url_set=lny_url_set, pvrm_date_by_url=pvrm_date_by_url)
    print("整合 2007+ 工作簿成交日期到 TVRM 日期分期...")
    subprocess.check_call([sys.executable, str(Path(__file__).with_name("merge_tvrm_exact_workbook.py"))])

    # Refresh URL inventories for future incremental runs.
    (out_physical / "urls.all.txt").write_text("\n".join(x.pdf_url for x in physical_pdfs) + "\n", encoding="utf-8")
    (out_physical / "urls.txt").write_text("\n".join(x.pdf_url for x in physical_pdfs) + "\n", encoding="utf-8")
    (out_eauction / "urls.all.txt").write_text("\n".join(x.pdf_url for x in eauction_pdfs) + "\n", encoding="utf-8")
    (out_eauction / "urls.txt").write_text("\n".join(x.pdf_url for x in eauction_pdfs) + "\n", encoding="utf-8")

    print("建立 TVRM 1973-2006 歷史年份分段資料集...")
    subprocess.check_call([sys.executable, str(Path(__file__).with_name("build_tvrm_legacy_dataset.py"))])
    print("建立跨資料集搜尋索引...")
    subprocess.check_call([sys.executable, str(Path(__file__).with_name("build_all_search_index.py"))])

    print("完成 TVRM datasets")
    return 0


if __name__ == "__main__":
    sys.exit(build())
