#!/usr/bin/env python3
import hashlib
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit

import pdfplumber
import pypdfium2 as pdfium
from bs4 import BeautifulSoup

sys.path.append(str(Path(__file__).resolve().parent))
from lny_mixed_parser import is_lny_url, parse_lny_mixed_pdf  # noqa: E402

BASE_URL = "https://www.td.gov.hk"
INDEX_URL = "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/pvrm_auction/index.html"
DATA_DIR = Path("data")
PDF_DIR = DATA_DIR / "pdfs"
JSON_PATH = DATA_DIR / "results.json"
SLIM_JSON_PATH = DATA_DIR / "results.slim.json"
META_PATH = DATA_DIR / "auctions.json"
ISSUES_DIR = DATA_DIR / "issues"
ISSUES_MANIFEST_PATH = DATA_DIR / "issues.manifest.json"
PRESET_AMOUNT_DESC_PATH = DATA_DIR / "preset.amount_desc.top1000.json"

DATE_RE = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
FILENAME_DATE_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")
AMOUNT_RE = re.compile(r"@?\$?\s*([0-9][0-9,]*)")
AMOUNT_TOKEN_RE = re.compile(r"@?\d{1,3}(?:,\d{1,3})+@?")
TOTAL_EN_RE = re.compile(
    r"Total\s+sale\s+proceeds\s+from\s+today'?s\s+auction\s*[:：]?\s*(?:HK)?\s*\$?\s*([0-9,]+)",
    re.IGNORECASE,
)
TOTAL_ZH_RE = re.compile(r"全日拍賣所得款項\s*[:：]?\s*(?:HK)?\s*\$?\s*([0-9,]+)", re.IGNORECASE)


@dataclass
class AuctionPdf:
    date_iso: str
    date_label: str
    session: Optional[str]
    pdf_url: str


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def sanitize_plate_line(text: str) -> str:
    # Plates only contain Latin letters, digits and spaces.
    up = text.upper()
    cleaned = re.sub(r"[^A-Z0-9 ]+", " ", up)
    return normalize_space(cleaned)


def looks_like_na_cell(raw: object) -> bool:
    """
    Detect (n/a) cells robustly. Some older PDFs contain garbage replacement chars/control bytes
    around the 'n/a' text, so matching on the raw string can fail.
    """
    if raw is None:
        return True
    s = str(raw).strip().lower()
    if not s:
        return True
    # Keep only characters relevant to 'n/a' markers.
    compact = re.sub(r"[^a-z0-9/()]+", "", s)
    if compact in {"na", "(na)", "n/a", "(n/a)"}:
        return True
    return "n/a" in compact


def extract_date(text: str) -> Optional[tuple[str, str]]:
    m = DATE_RE.search(text)
    if not m:
        return None
    y, mth, d = map(int, m.groups())
    dt = date(y, mth, d)
    return dt.isoformat(), f"{y}年{mth}月{d}日"


def extract_date_from_href(href: str) -> Optional[tuple[str, str]]:
    m = FILENAME_DATE_RE.search(href)
    if not m:
        return None
    y, mth, d = map(int, m.groups())
    try:
        dt = date(y, mth, d)
    except ValueError:
        return None
    return dt.isoformat(), f"{y}年{mth}月{d}日"


def detect_session(text: str) -> Optional[str]:
    if "上午" in text:
        return "上午"
    if "下午" in text:
        return "下午"
    return None


def request_bytes(url: str) -> bytes:
    # Use curl rather than urllib: in some sandboxed environments DNS/networking may
    # work for curl but not for Python's urlopen.
    url = normalize_url(url)
    return subprocess.check_output(["curl", "-L", "-s", url], timeout=60)

def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(unquote(parts.path), safe="/%")
    query = quote(unquote(parts.query), safe="=&%")
    return urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def scrape_pdf_index() -> list[AuctionPdf]:
    html = request_bytes(INDEX_URL).decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    items: list[AuctionPdf] = []
    seen: set[tuple[str, str]] = set()

    for li in soup.find_all("li"):
        anchors = [a for a in li.find_all("a", href=True) if ".pdf" in a["href"].lower()]
        if not anchors:
            continue

        li_text = normalize_space(li.get_text(" ", strip=True))
        date_info = extract_date(li_text)
        session = detect_session(li_text)

        for a in anchors:
            a_text = normalize_space(a.get_text(" ", strip=True))
            if not a_text:
                continue
            href = a["href"].strip()
            pdf_url = normalize_url(urljoin(BASE_URL, href))

            row_date = extract_date(a_text) or date_info or extract_date_from_href(pdf_url)
            if not row_date:
                continue

            key = (row_date[0], pdf_url)
            if key in seen:
                continue
            seen.add(key)

            items.append(
                AuctionPdf(
                    date_iso=row_date[0],
                    date_label=row_date[1],
                    session=session,
                    pdf_url=pdf_url,
                )
            )

    items.sort(key=lambda x: (x.date_iso, x.pdf_url))
    return items


def local_pdf_name(pdf: AuctionPdf) -> str:
    digest = hashlib.sha1(pdf.pdf_url.encode("utf-8")).hexdigest()[:10]
    return f"{pdf.date_iso}_{digest}.pdf"


def printable_text(raw: str) -> str:
    out = []
    for ch in raw:
        code = ord(ch)
        if ch == "\n":
            out.append(" ")
        elif 32 <= code < 127 or ch in "，。$@":
            out.append(ch)
        elif ch.isprintable() and code >= 127:
            out.append(ch)
        else:
            out.append(f"\\x{code:02x}")
    return normalize_space("".join(out))


def clean_plate(raw: Optional[str], preserve_newline: bool = False) -> Optional[str]:
    if not raw:
        return None
    if preserve_newline:
        parts = [sanitize_plate_line(x) for x in raw.splitlines()]
        parts = [p for p in parts if p]
        t = "\n".join(parts)
    else:
        t = sanitize_plate_line(raw.replace("\n", " "))
    if not t:
        return None
    return t


def clean_double_plate(raw: Optional[str]) -> Optional[list[str]]:
    # PVRM double-line marks should render as exactly 2 lines.
    if not raw:
        return None
    parts = [sanitize_plate_line(x) for x in str(raw).splitlines()]
    parts = [p for p in parts if p]
    if not parts:
        return None
    if len(parts) >= 2:
        return [parts[0], parts[1]]
    # If the PDF only yields one line, keep it rather than dropping the fact it's "2-row".
    return [parts[0], ""]


def parse_amount(raw: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    if not raw:
        return None, None
    compact = normalize_space(raw.replace("\n", " "))
    m = AMOUNT_RE.search(compact)
    if not m:
        return None, printable_text(raw)
    try:
        value = int(m.group(1).replace(",", ""))
    except ValueError:
        value = None
    return value, printable_text(raw)


def is_header_row(first: Optional[str]) -> bool:
    if not first:
        return True
    s = normalize_space(first).upper()
    if not s:
        return True
    header_keywords = [
        "IN 1 ROW",
        "IN 2 ROWS",
        "RESULT OF AUCTION",
        "PERSONALIZED VEHICLE REGISTRATION MARKS",
    ]
    # Some PDFs lose spaces during extraction (e.g. "IN1ROW", "IN2ROWS").
    compact = re.sub(r"[^A-Z0-9]+", "", s)
    header_compact = {re.sub(r"[^A-Z0-9]+", "", k.upper()) for k in header_keywords}
    header_compact |= {"IN1ROW", "IN2ROW", "IN1ROWS", "IN2ROWS"}
    if s == "$":
        return True
    return any(k in s for k in header_keywords) or (compact in header_compact)


def parse_amount_token(raw: str) -> tuple[int, str]:
    cleaned = raw.strip()
    value = int(cleaned.replace("@", "").replace(",", ""))
    return value, cleaned


def normalize_amount_token(raw: str) -> Optional[str]:
    t = raw.strip()
    core = t[1:] if t.startswith("@") else t

    # Old reversed encoding may still look like a "normal" grouped number (e.g. "000,501").
    if core.startswith("000,"):
        rev = core[::-1]
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", rev):
            return ("@" if t.startswith("@") else "") + rev

    if re.fullmatch(r"@?\d{1,3}(?:,\d{3})+", t):
        return t

    # Some old files (e.g. 2009-03-21 PM) encode amounts in reverse order: "000,5@" -> "@5,000".
    if re.fullmatch(r"\d{3}(?:,\d{1,3})+@?", t):
        has_at = t.endswith("@")
        core = t[:-1] if has_at else t
        rev = core[::-1]
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", rev):
            return ("@" if has_at else "") + rev
    return None


def extract_page_amounts(pdf_path: Path) -> dict[int, list[tuple[int, str]]]:
    out: dict[int, list[tuple[int, str]]] = {}
    doc = pdfium.PdfDocument(str(pdf_path))
    for page_index in range(len(doc)):
        text = doc[page_index].get_textpage().get_text_range()
        tokens = AMOUNT_TOKEN_RE.findall(text)
        normalized = [normalize_amount_token(t) for t in tokens]
        normalized = [t for t in normalized if t]
        out[page_index + 1] = [parse_amount_token(t) for t in normalized]
    return out


def extract_total_sale_proceeds(pdf_path: Path) -> tuple[Optional[int], Optional[str]]:
    doc = pdfium.PdfDocument(str(pdf_path))
    for page_index in reversed(range(len(doc))):
        raw = doc[page_index].get_textpage().get_text_range()
        text = normalize_space(raw)
        m = TOTAL_EN_RE.search(text) or TOTAL_ZH_RE.search(text)
        if not m:
            continue
        raw_amount = m.group(1)
        try:
            amount = int(raw_amount.replace(",", ""))
            return amount, raw_amount
        except ValueError:
            return None, raw_amount
    return None, None


def _pad_bbox(
    page: pdfplumber.page.Page,
    bbox: tuple[float, float, float, float],
    *,
    left: float = 0.0,
    top: float = 0.0,
    right: float = 0.0,
    bottom: float = 0.0,
) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = bbox
    x0 = max(0.0, float(x0) - left)
    y0 = max(0.0, float(y0) - top)
    x1 = min(float(getattr(page, "width", x1)), float(x1) + right)
    y1 = min(float(getattr(page, "height", y1)), float(y1) + bottom)
    return (x0, y0, x1, y1)


def extract_text_by_bbox(page: pdfplumber.page.Page, bbox: tuple[float, float, float, float]) -> str:
    """
    Extract text from a cell bbox using per-character positions and reconstruct spaces based on gaps.
    This is more faithful than table-extracted strings, which often inject/remove spaces.
    """
    try:
        sub = page.within_bbox(bbox)
        chars = sub.chars or []
    except Exception:
        chars = []
    if not chars:
        return ""

    # Group chars into lines by top coordinate.
    items = []
    for ch in chars:
        t = ch.get("text")
        if not t:
            continue
        # Keep only printable; we'll sanitize plates later.
        items.append(
            {
                "text": t,
                "x0": float(ch.get("x0", 0.0)),
                "x1": float(ch.get("x1", 0.0)),
                "top": float(ch.get("top", 0.0)),
                "size": float(ch.get("size", 10.0) or 10.0),
            }
        )
    if not items:
        return ""
    items.sort(key=lambda x: (x["top"], x["x0"]))

    lines: list[dict] = []
    for it in items:
        placed = False
        for ln in lines:
            # Tolerance scales with font size.
            tol = max(2.0, 0.35 * min(ln["size"], it["size"]))
            if abs(ln["top"] - it["top"]) <= tol:
                ln["items"].append(it)
                placed = True
                break
        if not placed:
            lines.append({"top": it["top"], "size": it["size"], "items": [it]})

    out_lines: list[str] = []
    for ln in sorted(lines, key=lambda x: x["top"]):
        # pdfplumber chars frequently include literal " " glyphs (sometimes overlapping)
        # even when there is no visible space in the rendered PDF. For plates we must
        # preserve only visually present spaces, so we ignore whitespace glyphs and
        # infer spaces from geometric gaps between non-space glyphs.
        glyphs = [x for x in ln["items"] if x.get("text") not in {None, "\n"} and not str(x.get("text")).isspace()]
        glyphs = sorted(glyphs, key=lambda x: x["x0"])
        if not glyphs:
            continue

        # Compute a per-line spacing threshold.
        widths = [max(0.0, g["x1"] - g["x0"]) for g in glyphs]
        widths = [w for w in widths if w > 0.0]
        median_w = sorted(widths)[len(widths) // 2] if widths else 6.0

        gaps: list[float] = []
        for a, b in zip(glyphs, glyphs[1:]):
            gap = float(b["x0"]) - float(a["x1"])
            if gap > 0:
                gaps.append(gap)

        if len(gaps) >= 3:
            sg = sorted(gaps)
            median_gap = sg[len(sg) // 2]
            # "Real" spaces should stand out from normal inter-glyph gaps.
            thr = max(2.0, median_w * 0.9, median_gap * 3.5)
        else:
            # With very few glyphs we can't estimate a stable median gap, so fall back
            # to a conservative width-based threshold.
            thr = max(2.0, median_w * 0.8)

        s = ""
        prev = None
        for cur in glyphs:
            if prev is not None:
                gap = cur["x0"] - prev["x1"]
                if gap > thr:
                    s += " "
            s += cur["text"]
            prev = cur
        out_lines.append(s.strip())
    return "\n".join([x for x in out_lines if x])


def _compact_plate(text: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (text or "").upper())


def _choose_best_double_raw(single: str, candidates: list[str]) -> str:
    """
    Given multiple possible raw extractions for the double-line cell (bbox/table/padded bbox),
    pick the one that is most likely complete.
    """
    expected = _compact_plate(single)
    best = ""
    best_score = (-1, -1, -1)  # (exact_match, compact_len, has_newline)
    for raw in candidates:
        r = (raw or "").strip()
        if not r:
            continue
        comp = _compact_plate(r)
        if not comp:
            continue
        exact = 1 if expected and comp == expected else 0
        has_nl = 1 if "\n" in r else 0
        # Prefer exact match; else prefer more characters (but don't exceed expected when known).
        if expected and len(comp) > len(expected):
            continue
        score = (exact, len(comp), has_nl)
        if score > best_score:
            best_score = score
            best = r
    return best


def parse_pdf_rows(pdf_path: Path, source: AuctionPdf) -> list[dict]:
    rows: list[dict] = []

    # LNY/CNY mixed-result PDFs: table extraction can yield bogus rows (e.g. "HK" paired with total proceeds).
    # Detect early and use the dedicated mixed parser instead.
    try:
        first = pdfium.PdfDocument(str(pdf_path))[0].get_textpage().get_text_range() or ""
    except Exception:
        first = ""
    first_up = (first or "").upper()
    has_traditional_marks = "TRADITIONAL VEHICLE REGISTRATION MARKS" in first_up or "傳統車輛登記號碼" in first
    has_personalized_marks = "PERSONALIZED VEHICLE REGISTRATION MARKS" in first_up or "自訂車輛登記號碼" in first
    mixed_hint = is_lny_url(source.pdf_url) or ("LUNAR NEW YEAR" in first_up) or (has_traditional_marks and has_personalized_marks)
    if mixed_hint:
        mixed = parse_lny_mixed_pdf(str(pdf_path))
        for r in mixed:
            if r.kind != "pvrm":
                continue
            sl = clean_plate(r.single_line, preserve_newline=False)
            if not sl:
                continue
            rows.append(
                {
                    "auction_date": source.date_iso,
                    "auction_date_label": source.date_label,
                    "session": source.session,
                    "single_line": sl,
                    "double_line": None,
                    "amount_hkd": r.amount_hkd,
                    "amount_raw": None,
                    "pdf_url": source.pdf_url,
                    "pdf_local": str(pdf_path),
                    "page": 1,
                }
            )
        return rows

    page_amounts = extract_page_amounts(pdf_path)

    with pdfplumber.open(str(pdf_path)) as doc:
        for page_no, page in enumerate(doc.pages, start=1):
            page_rows: list[dict] = []
            tables = page.find_tables() or []
            for table in tables:
                extracted = table.extract() or []
                for r_idx, row in enumerate(extracted):
                    if not row or len(row) < 3:
                        continue

                    # Prefer bbox-based text for fidelity.
                    try:
                        cells = table.rows[r_idx].cells
                    except Exception:
                        cells = []
                    if len(cells) >= 3:
                        raw_single = extract_text_by_bbox(page, cells[0])
                        raw_double_bbox = extract_text_by_bbox(page, cells[1])
                        # Some PDFs have 2-line text in the "double-line" column but the detected
                        # table cell bbox only covers the lower line. Try a padded bbox and/or
                        # fall back to table-extracted raw string.
                        raw_double_table = row[1] or ""
                        raw_double_bbox_padded = ""
                        if ("\n" in str(raw_double_table)) and ("\n" not in str(raw_double_bbox)):
                            padded = _pad_bbox(page, cells[1], top=16.0, bottom=6.0)
                            raw_double_bbox_padded = extract_text_by_bbox(page, padded)
                        chosen = _choose_best_double_raw(raw_single, [raw_double_bbox_padded, raw_double_bbox, raw_double_table])
                        raw_double = chosen or raw_double_bbox
                        raw_amount = extract_text_by_bbox(page, cells[2])
                    else:
                        raw_single = row[0] or ""
                        raw_double = row[1] or ""
                        raw_amount = row[2] if len(row) > 2 else ""

                    single = clean_plate(raw_single, preserve_newline=False)
                    is_na_double = looks_like_na_cell(raw_double) or bool(
                        re.search(r"\(\s*n\s*/\s*a\s*\)", str(raw_double), re.IGNORECASE)
                    )
                    double = None if is_na_double else clean_double_plate(raw_double)
                    if double == ["NA", ""] or double == ["N", "A"]:
                        double = None
                    amount_raw = raw_amount

                    if is_header_row(single):
                        continue
                    if not single:
                        continue

                    amount_hkd, amount_text = parse_amount(amount_raw)

                    page_rows.append(
                        {
                            "auction_date": source.date_iso,
                            "auction_date_label": source.date_label,
                            "session": source.session,
                            "single_line": single,
                            "double_line": double,
                            "amount_hkd": amount_hkd,
                            "amount_raw": amount_text,
                            "pdf_url": source.pdf_url,
                            "pdf_local": str(pdf_path),
                            "page": page_no,
                        }
                    )
            if not page_rows:
                continue

            mapped = page_amounts.get(page_no, [])
            # Keep table-parsed amounts when available; use text-sequence mapping only for missing values.
            fill_index = 0
            for row in page_rows:
                if row["amount_hkd"] is not None:
                    continue
                if fill_index >= len(mapped):
                    break
                row["amount_hkd"] = mapped[fill_index][0]
                row["amount_raw"] = mapped[fill_index][1]
                fill_index += 1
            rows.extend(page_rows)

    # LNY/CNY mixed-result PDFs often have no extractable tables.
    # Parse by positioned words and keep only PVRM marks.
    if not rows:
        try:
            first = pdfium.PdfDocument(str(pdf_path))[0].get_textpage().get_text_range() or ""
        except Exception:
            first = ""
        first_up = (first or "").upper()
        has_traditional_marks = "TRADITIONAL VEHICLE REGISTRATION MARKS" in first_up
        has_personalized_marks = "PERSONALIZED VEHICLE REGISTRATION MARKS" in first_up
        has_zh_traditional = "傳統車輛登記號碼" in (first or "")
        has_zh_personalized = "自訂車輛登記號碼" in (first or "")
        mixed_hint = (
            is_lny_url(source.pdf_url)
            or ("LUNAR NEW YEAR" in first_up)
            or (has_traditional_marks and has_personalized_marks)
            or (has_zh_traditional and has_zh_personalized)
        )
    else:
        mixed_hint = False

    if not rows and mixed_hint:
        mixed = parse_lny_mixed_pdf(str(pdf_path))
        for r in mixed:
            if r.kind != "pvrm":
                continue
            rows.append(
                {
                    "auction_date": source.date_iso,
                    "auction_date_label": source.date_label,
                    "session": source.session,
                    "single_line": clean_plate(r.single_line, preserve_newline=False),
                    "double_line": None,
                    "amount_hkd": r.amount_hkd,
                    "amount_raw": None,
                    "pdf_url": source.pdf_url,
                    "pdf_local": str(pdf_path),
                    "page": 1,
                }
            )

    return rows


def build() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    ISSUES_DIR.mkdir(parents=True, exist_ok=True)

    offline = "--offline" in sys.argv
    print("[1/3] 抓取拍賣 PDF 清單..." + (" (offline)" if offline else ""))
    pdfs: list[AuctionPdf] = []
    if offline:
        if not META_PATH.exists():
            raise SystemExit("offline 模式需要 data/auctions.json 作為輸入，但檔案不存在。")
        meta_in = json.loads(META_PATH.read_text(encoding="utf-8"))
        for m in meta_in:
            pdfs.append(
                AuctionPdf(
                    date_iso=m["auction_date"],
                    date_label=m.get("auction_date_label") or m["auction_date"],
                    session=m.get("session"),
                    pdf_url=m["pdf_url"],
                )
            )
        pdfs.sort(key=lambda x: (x.date_iso, x.pdf_url))
    else:
        try:
            pdfs = scrape_pdf_index()
        except Exception as exc:  # noqa: BLE001
            # Network can be flaky in sandbox; fall back to existing meta if present.
            if META_PATH.exists():
                meta_in = json.loads(META_PATH.read_text(encoding="utf-8"))
                for m in meta_in:
                    pdfs.append(
                        AuctionPdf(
                            date_iso=m["auction_date"],
                            date_label=m.get("auction_date_label") or m["auction_date"],
                            session=m.get("session"),
                            pdf_url=m["pdf_url"],
                        )
                    )
                pdfs.sort(key=lambda x: (x.date_iso, x.pdf_url))
                print(f"  抓取失敗，改用現有 {META_PATH} 重建: {exc}")
            else:
                raise

    print(f"找到 {len(pdfs)} 份拍賣結果 PDF")

    all_rows: list[dict] = []
    meta: list[dict] = []

    print("[2/3] 下載並解析 PDF...")
    for idx, pdf in enumerate(pdfs, start=1):
        fname = local_pdf_name(pdf)
        pdf_path = PDF_DIR / fname
        if not pdf_path.exists():
            try:
                pdf_path.write_bytes(request_bytes(pdf.pdf_url))
            except (subprocess.CalledProcessError, TimeoutError) as exc:
                print(f"  [{idx}/{len(pdfs)}] 下載失敗: {pdf.pdf_url} ({exc})")
                meta.append(
                    {
                        "auction_date": pdf.date_iso,
                        "auction_date_label": pdf.date_label,
                        "session": pdf.session,
                        "pdf_url": pdf.pdf_url,
                        "pdf_local": str(pdf_path),
                        "entry_count": 0,
                        "amount_missing": 0,
                        "total_sale_proceeds_hkd": None,
                        "total_sale_proceeds_raw": None,
                        "error": str(exc),
                    }
                )
                continue

        try:
            rows = parse_pdf_rows(pdf_path, pdf)
            total_proceeds_hkd, total_proceeds_raw = extract_total_sale_proceeds(pdf_path)
        except Exception as exc:  # noqa: BLE001
            print(f"  [{idx}/{len(pdfs)}] 解析失敗: {pdf_path.name} ({exc})")
            meta.append(
                {
                    "auction_date": pdf.date_iso,
                    "auction_date_label": pdf.date_label,
                    "session": pdf.session,
                    "pdf_url": pdf.pdf_url,
                    "pdf_local": str(pdf_path),
                        "entry_count": 0,
                        "amount_missing": 0,
                        "total_sale_proceeds_hkd": None,
                        "total_sale_proceeds_raw": None,
                        "error": str(exc),
                    }
                )
            continue

        is_lny = bool(is_lny_url(pdf.pdf_url))
        if not is_lny:
            try:
                first = pdfium.PdfDocument(str(pdf_path))[0].get_textpage().get_text_range() or ""
            except Exception:
                first = ""
            first_up = (first or "").upper()
            has_traditional_marks = "TRADITIONAL VEHICLE REGISTRATION MARKS" in first_up
            has_personalized_marks = "PERSONALIZED VEHICLE REGISTRATION MARKS" in first_up
            has_zh_traditional = "傳統車輛登記號碼" in (first or "")
            has_zh_personalized = "自訂車輛登記號碼" in (first or "")
            is_lny = bool(
                ("LUNAR NEW YEAR" in first_up)
                or (has_traditional_marks and has_personalized_marks)
                or (has_zh_traditional and has_zh_personalized)
            )

        amount_missing = sum(1 for r in rows if r["amount_hkd"] is None)
        meta.append(
            {
                "auction_date": pdf.date_iso,
                "auction_date_label": pdf.date_label,
                "session": pdf.session,
                "pdf_url": pdf.pdf_url,
                "pdf_local": str(pdf_path),
                "entry_count": len(rows),
                "amount_missing": amount_missing,
                "total_sale_proceeds_hkd": total_proceeds_hkd,
                "total_sale_proceeds_raw": total_proceeds_raw,
                "is_lny": is_lny,
                "error": None,
            }
        )
        all_rows.extend(rows)

        if idx % 10 == 0 or idx == len(pdfs):
            print(f"  進度: {idx}/{len(pdfs)}")

    all_rows.sort(
        key=lambda r: (
            r["auction_date"],
            0 if r.get("session") == "上午" else 1 if r.get("session") == "下午" else 2,
            r["single_line"],
        )
    )

    print("[3/3] 輸出 JSON...")
    # Full dataset (kept for debugging / audit)
    JSON_PATH.write_text(json.dumps(all_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Slim dataset for frontend runtime loading (smaller + faster)
    slim_rows = [
        {
            "auction_date": r["auction_date"],
            "single_line": r["single_line"],
            "double_line": r["double_line"],
            "amount_hkd": r["amount_hkd"],
            "pdf_url": r["pdf_url"],
        }
        for r in all_rows
    ]
    SLIM_JSON_PATH.write_text(json.dumps(slim_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Per-issue shards + manifest for progressive frontend loading.
    by_issue: dict[str, list[dict]] = {}
    for row in slim_rows:
        by_issue.setdefault(row["auction_date"], []).append(row)

    issue_dates_desc = sorted(by_issue.keys(), reverse=True)
    manifest_items = []
    for date_iso in issue_dates_desc:
        issue_rows = by_issue[date_iso]
        issue_path = ISSUES_DIR / f"{date_iso}.json"
        issue_path.write_text(json.dumps(issue_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        manifest_items.append(
            {
                "auction_date": date_iso,
                "count": len(issue_rows),
                "file": f"issues/{date_iso}.json",
            }
        )

    manifest = {
        "total_rows": len(slim_rows),
        "issue_count": len(manifest_items),
        "issues": manifest_items,
    }
    ISSUES_MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Precomputed top rows for fast first paint when default sort is amount desc.
    amount_desc_rows = sorted(
        slim_rows,
        key=lambda r: (
            -(r["amount_hkd"] if r["amount_hkd"] is not None else -1),
            r["auction_date"],
            r["single_line"] or "",
        ),
    )
    PRESET_AMOUNT_DESC_PATH.write_text(
        json.dumps(amount_desc_rows[:1000], ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    total_missing = sum(1 for r in all_rows if r["amount_hkd"] is None)
    print(f"完成: {len(all_rows)} 筆結果, 未解析金額 {total_missing} 筆")
    return 0


if __name__ == "__main__":
    sys.exit(build())
