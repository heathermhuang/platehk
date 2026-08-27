#!/usr/bin/env python3
from __future__ import annotations

import html
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "plates"
TODAY = date.today().isoformat()
MAX_PAGES = 800
INDEX_LINKS = 420
TABLE_ROWS = 18
LEDGER_CSS_VERSION = "20260812-11"
INFO_CSS_VERSION = "20260825-02"
INFO_SHELL_VERSION = "20260825-01"
INFO_LOCALE_VERSION = "20260825-01"
POPULAR_INDEX_VERSION = "20260825-01"
MARKET_SIGNALS_PATH = DATA / "market" / "28car.active.json"
_MARKET_SIGNALS: dict | None = None
_DATASET_STATS: dict[str, dict] = {}

SITE_URL = "https://plate.hk"
SITE_NAME = "Plate.hk"
SITE_ORGANIZATION_ID = f"{SITE_URL}/#organization"
SITE_WEBSITE_ID = f"{SITE_URL}/#website"
TD_URL = "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/"
TD_HISTORY_URL = (
    "https://www.td.gov.hk/en/about_us/history_of_transport_department/"
    "licensing_services/auction_of_vehicle_registration_marks__/index.html"
)
TD_PVRM_URL = "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/pvrm_auction/index.html"
TD_TVRM_APPLICATION_URL = "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/tvrm_application/index.html"
TD_EAUCTION_URL = "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/tvrm_auction/"

DATASETS = {
    "pvrm": {
        "label_zh": "自訂車牌 PVRM",
        "label_en": "PVRM",
        "results": DATA / "results.slim.json",
    },
    "tvrm_physical": {
        "label_zh": "傳統車牌：實體拍賣",
        "label_en": "TVRM Physical",
        "results": DATA / "tvrm_physical" / "results.slim.json",
    },
    "tvrm_eauction": {
        "label_zh": "傳統車牌：拍牌易",
        "label_en": "TVRM E-Auction",
        "results": DATA / "tvrm_eauction" / "results.slim.json",
    },
    "tvrm_legacy": {
        "label_zh": "傳統車牌：1973-2006 年",
        "label_en": "TVRM 1973-2006",
        "results": DATA / "tvrm_legacy" / "results.slim.json",
    },
}

STATIC_PAGES = [
    "https://plate.hk/",
    "https://plate.hk/landing.html",
    "https://plate.hk/about.html",
    "https://plate.hk/api.html",
    "https://plate.hk/audit.html",
    "https://plate.hk/camera.html",
    "https://plate.hk/changelog.html",
    "https://plate.hk/mcp.html",
    "https://plate.hk/terms.html",
    "https://plate.hk/privacy.html",
    "https://plate.hk/plates/index.html",
]


def load_json(path: Path):
    return json.loads(path.read_text())


def source_url(row: dict) -> str:
    raw = str(row.get("pdf_url") or "").strip()
    if raw.startswith("./"):
        return f"{SITE_URL}/{raw[2:]}"
    parsed = urlparse(raw)
    if parsed.scheme in {"http", "https"} and parsed.hostname in {"td.gov.hk", "www.td.gov.hk"}:
        return raw
    return ""


def source_link_html(row: dict) -> str:
    url = source_url(row)
    if not url:
        return '<span data-copy-zh="來源未連結" data-copy-en="Source unavailable">來源未連結</span>'
    is_workbook = urlparse(url).path.lower().endswith((".xls", ".xlsx"))
    label_zh = "來源檔案" if is_workbook else "官方 PDF"
    label_en = "Source file" if is_workbook else "Official source"
    page = row.get("page")
    if page not in (None, ""):
        label_zh += f"（第 {html.escape(str(page))} 頁）"
        label_en += f" (p.{html.escape(str(page))})"
    return (
        f'<a href="{html.escape(url, quote=True)}" target="_blank" '
        f'rel="noopener noreferrer"><span data-lang-only="zh">{label_zh}</span>'
        f'<span data-lang-only="en" hidden>{label_en}</span></a>'
    )


def source_urls_for(rows: list[dict]) -> list[str]:
    urls = set()
    for row in rows:
        url = source_url(row)
        if url:
            urls.add(url)
    return sorted(urls)


def load_active_market_signals() -> dict:
    global _MARKET_SIGNALS
    if _MARKET_SIGNALS is not None:
        return _MARKET_SIGNALS
    if not MARKET_SIGNALS_PATH.exists():
        _MARKET_SIGNALS = {}
        return _MARKET_SIGNALS
    try:
        payload = load_json(MARKET_SIGNALS_PATH)
    except (OSError, json.JSONDecodeError):
        _MARKET_SIGNALS = {}
        return _MARKET_SIGNALS
    if payload.get("schema_version") != 1 or payload.get("source") != "28car":
        _MARKET_SIGNALS = {}
        return _MARKET_SIGNALS
    fresh_hours = max(1, min(168, int(payload.get("fresh_for_hours") or 72)))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=fresh_hours)
    active: dict[str, list[dict]] = {}
    for plate_norm, offers in (payload.get("signals") or {}).items():
        if not isinstance(offers, list):
            continue
        kept = []
        for offer in offers:
            if not isinstance(offer, dict):
                continue
            try:
                last_seen = datetime.fromisoformat(str(offer.get("last_seen_at") or "").replace("Z", "+00:00"))
            except ValueError:
                continue
            parsed_url = urlparse(str(offer.get("source_url") or ""))
            if last_seen < cutoff or parsed_url.scheme != "https" or parsed_url.hostname != "m.28car.com":
                continue
            kept.append(offer)
        if kept:
            active[str(plate_norm)] = kept
    _MARKET_SIGNALS = active
    return _MARKET_SIGNALS


def market_signal_html(plate_norm: str) -> str:
    offers = load_active_market_signals().get(plate_norm) or []
    if not offers:
        return ""
    return (
        f'      <section class="market-card" data-market-card data-plate="{html.escape(plate_norm, quote=True)}" '
        'hidden aria-live="polite"></section>'
    )


def norm(text: str | None) -> str:
    raw = (text or "").upper().replace(" ", "")
    raw = "".join(ch for ch in raw if ch.isalnum())
    return raw.replace("I", "1").replace("O", "0").replace("Q", "")


def plate_display(row: dict) -> str:
    if row.get("single_line"):
        return str(row["single_line"])
    double = row.get("double_line")
    if isinstance(double, list):
        return " / ".join(str(x) for x in double if x)
    return ""


def duplicate_key(row: dict) -> str:
    amount = row.get("amount_hkd")
    value = [norm(plate_display(row)), None if amount is None else int(amount)]
    if row.get("date_precision") == "day" and row.get("auction_date"):
        value.append(str(row.get("auction_date")))
    return json.dumps(value, ensure_ascii=False)


def money(amount) -> str:
    if amount is None:
        return "未能自動解析"
    return f"HK${int(amount):,}"


def money_en(amount) -> str:
    if amount is None:
        return "Unable to parse"
    return f"HK${int(amount):,}"


def copy_attrs(zh: str, en: str) -> str:
    return f'data-copy-zh="{html.escape(zh, quote=True)}" data-copy-en="{html.escape(en, quote=True)}"'


def format_date_zh(iso: str) -> str:
    parts = str(iso or "").split("-")
    if len(parts) != 3:
        return str(iso or "")
    try:
        y, m, d = (int(part) for part in parts)
    except ValueError:
        return str(iso or "")
    return f"{y}年{m}月{d}日"


def date_label(row: dict) -> str:
    label = str(row.get("auction_date_label") or row.get("year_range") or "").strip()
    if row.get("date_precision") == "year_range" or (label and len(label) == 9 and label[4] == "-" and label[:4].isdigit()):
        return label
    if label and "年" in label and "月" in label and "日" in label:
        return label
    iso = label if len(label) == 10 and label[4] == "-" else str(row.get("auction_date") or "").strip()
    if iso:
        return format_date_zh(iso)
    return label


def date_label_en(row: dict) -> str:
    label = str(row.get("auction_date_label") or row.get("year_range") or "").strip()
    if row.get("date_precision") == "year_range" or (label and len(label) == 9 and label[4] == "-" and label[:4].isdigit()):
        return label
    iso = str(row.get("auction_date") or "").strip()
    try:
        parsed = date.fromisoformat(iso)
    except ValueError:
        return iso or label
    return f"{parsed.day} {parsed.strftime('%b %Y')}"


def overlap_lookup() -> tuple[set[str], set[str]]:
    obj = load_json(DATA / "all.tvrm_legacy_overlap.json")
    return set(obj.get("exact_keys") or []), set(obj.get("keys") or [])


def row_sort_key(row: dict):
    amount = row.get("amount_hkd")
    amount_key = -1 if amount is None else int(amount)
    return (-amount_key, str(row.get("auction_date") or ""), str(row.get("dataset_key") or ""))


def classify_plate(plate_norm: str) -> tuple[str, str]:
    if len(plate_norm) == 1:
        if plate_norm.isdigit():
            return ("單數字車牌", "Single-digit plate")
        return ("單字母車牌", "Single-letter plate")
    if plate_norm.startswith("HK"):
        return ("HK 經典字首", "HK prefix classic")
    if plate_norm.startswith("XX"):
        return ("XX 經典字首", "XX prefix classic")
    if plate_norm.isdigit():
        return ("純數字車牌", "Numeric")
    if plate_norm.isalpha():
        return ("純字母車牌", "Alphabetic")
    if any(ch.isdigit() for ch in plate_norm) and any(ch.isalpha() for ch in plate_norm):
        return ("字母數字混合車牌", "Alpha-numeric")
    return ("熱門車牌", "Popular plate")


def plate_interest_bonus(plate_norm: str, count: int) -> int:
    bonus = 0
    if len(plate_norm) <= 2:
        bonus += 6_000_000
    elif len(plate_norm) <= 4:
        bonus += 2_000_000
    if len(set(plate_norm)) == 1:
        bonus += 4_000_000
    if plate_norm.startswith("HK") or plate_norm.startswith("XX"):
        bonus += 2_500_000
    if plate_norm.isalpha():
        bonus += 1_200_000
    if plate_norm.isdigit():
        bonus += 1_000_000
    bonus += min(count, 10) * 200_000
    return bonus


def build_plate_data():
    global _DATASET_STATS
    overlap_exact, overlap_coarse = overlap_lookup()
    rows_by_plate: dict[str, list[dict]] = defaultdict(list)
    stats: dict[str, dict] = {}
    dataset_stats: dict[str, dict] = {}

    for dataset_key, meta in DATASETS.items():
        rows = load_json(meta["results"])
        dated_rows = [
            str(row.get("auction_date") or "")
            for row in rows
            if str(row.get("auction_date") or "")
        ]
        issue_keys = {
            str(row.get("auction_key") or row.get("year_range") or row.get("auction_date") or "")
            for row in rows
            if str(row.get("auction_key") or row.get("year_range") or row.get("auction_date") or "")
        }
        source_urls = source_urls_for(rows)
        dataset_stats[dataset_key] = {
            "rows": len(rows),
            "issues": len(issue_keys),
            "sources": len(source_urls),
            "first_date": min(dated_rows) if dated_rows else "",
            "latest_date": max(dated_rows) if dated_rows else "",
        }
        for row in rows:
            display = plate_display(row)
            plate_norm = norm(display)
            if not plate_norm:
                continue
            tagged = {**row, "dataset_key": dataset_key, "plate_display": display}
            if dataset_key == "tvrm_legacy":
                overlap = overlap_exact if tagged.get("date_precision") == "day" else overlap_coarse
                if duplicate_key(tagged) in overlap:
                    continue

            rows_by_plate[plate_norm].append(tagged)
            amount = tagged.get("amount_hkd")
            amount_score = -1 if amount is None else int(amount)
            stat = stats.get(plate_norm)
            if stat is None:
                stat = {
                    "plate_norm": plate_norm,
                    "plate_display": display,
                    "max_amount": amount_score,
                    "sample": tagged,
                    "count": 0,
                    "dataset_keys": set(),
                    "first_row": tagged,
                    "latest_row": tagged,
                }
                stats[plate_norm] = stat
            stat["count"] += 1
            stat["dataset_keys"].add(dataset_key)
            if amount_score > stat["max_amount"]:
                stat["max_amount"] = amount_score
                stat["sample"] = tagged
                stat["plate_display"] = display
            auction_date = str(tagged.get("auction_date") or "")
            if auction_date < str(stat["first_row"].get("auction_date") or ""):
                stat["first_row"] = tagged
            if auction_date > str(stat["latest_row"].get("auction_date") or ""):
                stat["latest_row"] = tagged

    for plate_norm, rows in rows_by_plate.items():
        rows.sort(key=row_sort_key)
        stat = stats[plate_norm]
        stat["dataset_keys"] = sorted(stat["dataset_keys"])
        stat["rows"] = rows
        stat["top_row"] = rows[0] if rows else stat["sample"]
        stat["score"] = max(stat["max_amount"], 0) + plate_interest_bonus(plate_norm, stat["count"])

    ordered = sorted(
        stats.values(),
        key=lambda item: (-item["score"], -max(item["max_amount"], 0), -item["count"], len(item["plate_norm"]), item["plate_norm"]),
    )
    _DATASET_STATS = dataset_stats
    return ordered[:MAX_PAGES]


def summary_sentence(entry: dict) -> str:
    plate = entry["plate_display"]
    top = entry["top_row"]
    first_row = entry["first_row"]
    latest_row = entry["latest_row"]
    dataset_names = "、".join(DATASETS[key]["label_zh"] for key in entry["dataset_keys"])
    return (
        f"{plate} 車牌目前收錄 {entry['count']} 筆公開拍賣紀錄，"
        f"最高成交 {money(top.get('amount_hkd'))}，"
        f"最早紀錄為 {date_label(first_row)}，最近紀錄為 {date_label(latest_row)}。"
        f" 涵蓋來源包括 {dataset_names or 'Plate.hk'}。"
    )


def summary_sentence_en(entry: dict) -> str:
    plate = entry["plate_display"]
    top = entry["top_row"]
    first_row = entry["first_row"]
    latest_row = entry["latest_row"]
    dataset_names = ", ".join(DATASETS[key]["label_en"] for key in entry["dataset_keys"])
    return (
        f"Plate.hk indexes {entry['count']} historical public-auction record(s) for {plate}. "
        f"The highest result is {money_en(top.get('amount_hkd'))}; "
        f"the first indexed record is {date_label_en(first_row)} and the latest is {date_label_en(latest_row)}. "
        f"Sources include {dataset_names or 'Plate.hk'}."
    )


def answer_summary_html(entry: dict) -> str:
    plate = html.escape(entry["plate_display"])
    top = entry["top_row"]
    top_price = html.escape(money(top.get("amount_hkd")))
    top_date = html.escape(date_label(top))
    top_date_en = html.escape(date_label_en(top))
    latest_date = html.escape(date_label(entry["latest_row"]))
    latest_date_en = html.escape(date_label_en(entry["latest_row"]))
    dataset_names = ", ".join(DATASETS[key]["label_en"] for key in entry["dataset_keys"])
    top_source = source_link_html(top)
    return f"""
              <div class="answer-item">
                <h3 {copy_attrs(f'{plate} 有哪些香港公開拍賣紀錄？', f'What public auction records exist for Hong Kong plate {plate}?')}>{plate} 有哪些香港公開拍賣紀錄？</h3>
                <p data-lang-only="zh">Plate.hk 目前收錄 <strong>{entry['count']}</strong> 筆 {plate} 歷史公開拍賣紀錄；最高一筆是 <strong>{top_price}</strong>，日期為 <strong>{top_date}</strong>。這是獨立搜尋索引，不是政府網站；請用表內的運輸署來源核對。 {top_source}</p>
                <p data-lang-only="en" hidden>Plate.hk indexes <strong>{entry['count']}</strong> historical public-auction record(s) for {plate}. The highest result is <strong>{top_price}</strong> on <strong>{top_date_en}</strong>. This is an independent index, not a government website; verify it against the linked Transport Department source. {top_source}</p>
              </div>
              <div class="answer-item">
                <h3 {copy_attrs(f'{plate} 車牌最高成交價是多少？', 'What is the highest recorded auction price?')}>{plate} 車牌最高成交價是多少？</h3>
                <p data-lang-only="zh">Plate.hk 收錄的最高公開拍賣成交紀錄是 <strong>{top_price}</strong>，日期為 <strong>{top_date}</strong>。 {top_source}</p>
                <p data-lang-only="en" hidden>The highest public-auction result indexed by Plate.hk is <strong>{top_price}</strong> on <strong>{top_date_en}</strong>. {top_source}</p>
              </div>
              <div class="answer-item">
                <h3 {copy_attrs('有多少筆紀錄？', 'How many records are included?')}>有多少筆紀錄？</h3>
                <p data-lang-only="zh">目前有 <strong>{entry['count']}</strong> 筆去重後紀錄，最近一筆為 <strong>{latest_date}</strong>；涵蓋 {html.escape(dataset_names)}。</p>
                <p data-lang-only="en" hidden>There are <strong>{entry['count']}</strong> deduplicated records. The latest is <strong>{latest_date_en}</strong>; datasets include {html.escape(dataset_names)}.</p>
              </div>
              <div class="answer-item">
                <h3 {copy_attrs('成交價是否代表現時市值？', 'Is this a current valuation?')}>成交價是否代表現時市值？</h3>
                <p data-lang-only="zh">不是。這些數字是歷史公開拍賣成交結果，不是估價、放售價或對未來成交價的保證。</p>
                <p data-lang-only="en" hidden>No. These are historical public-auction results, not valuations, asking prices, or guarantees of future prices.</p>
              </div>
              <div class="answer-item">
                <h3 {copy_attrs('如何核對資料？', 'How can the record be verified?')}>如何核對資料？</h3>
                <p data-lang-only="zh">使用下表每一列的官方 PDF 或來源檔案核對車牌、日期和成交價；如有差異，以官方來源為準。<a data-preserve-lang href="../about.html">查看資料方法與限制</a>。</p>
                <p data-lang-only="en" hidden>Check the plate, date, and price against each row's official PDF or source file. The official source prevails if anything differs. <a data-preserve-lang href="../about.html">Read the data method and limits</a>.</p>
              </div>"""


def dataset_breakdown_html(entry: dict) -> str:
    counts = []
    for key in entry["dataset_keys"]:
        c = sum(1 for row in entry["rows"] if row["dataset_key"] == key)
        counts.append(
            f'<div class="dataset-chip"><strong {copy_attrs(DATASETS[key]["label_zh"], DATASETS[key]["label_en"])}>{html.escape(DATASETS[key]["label_zh"])}</strong>'
            f'<span {copy_attrs(f"{c} 筆紀錄", f"{c} records")}>{c} 筆紀錄</span></div>'
        )
    return "".join(counts)


def render_page(entries_by_norm: dict[str, dict], entry: dict, related: list[dict]) -> str:
    plate = entry["plate_display"]
    plate_norm = entry["plate_norm"]
    top = entry["top_row"]
    first_row = entry["first_row"]
    latest_row = entry["latest_row"]
    highest_price = money(top.get("amount_hkd"))
    highest_price_en = money_en(top.get("amount_hkd"))
    highest_date = date_label(top)
    highest_date_en = date_label_en(top)
    first_date = date_label(first_row)
    first_date_en = date_label_en(first_row)
    latest_date = date_label(latest_row)
    latest_date_en = date_label_en(latest_row)
    category_zh, category_en = classify_plate(plate_norm)
    desc = summary_sentence(entry)
    desc_en = summary_sentence_en(entry)
    og_title = f"{plate} 車牌拍賣結果 | Plate.hk"
    canonical = f"https://plate.hk/plates/{plate_norm}.html"
    rows_html = "".join(
        f"""
        <tr>
          <td data-label-zh="日期" data-label-en="Date"><span data-lang-only="zh">{html.escape(date_label(row))}</span><span data-lang-only="en" hidden>{html.escape(date_label_en(row))}</span></td>
          <td data-label-zh="分類" data-label-en="Dataset"><span data-lang-only="zh">{html.escape(DATASETS[row['dataset_key']]['label_zh'])}</span><span data-lang-only="en" hidden>{html.escape(DATASETS[row['dataset_key']]['label_en'])}</span></td>
          <td data-label-zh="成交價" data-label-en="Price"><span data-lang-only="zh">{html.escape(money(row.get('amount_hkd')))}</span><span data-lang-only="en" hidden>{html.escape(money_en(row.get('amount_hkd')))}</span></td>
          <td data-label-zh="來源" data-label-en="Source">{source_link_html(row)}<br><a data-preserve-lang href="../index.html?q={plate_norm}" {copy_attrs('完整站內紀錄', 'Full search')}>完整站內紀錄</a></td>
        </tr>
        """
        for row in entry["rows"][:TABLE_ROWS]
    )
    related_html = "".join(
        f'<a class="pill" data-preserve-lang href="./{item["plate_norm"]}.html">{html.escape(item["plate_display"])}</a>'
        for item in related
    )
    answer_summary = answer_summary_html(entry)
    dataset_breakdown = dataset_breakdown_html(entry)
    market_card = market_signal_html(plate_norm)
    market_style = ""
    market_script = ""
    market_grid_selector = ""
    market_media_style = ""
    market_section = ""
    if market_card:
        market_style = """      .market-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:center; margin-top:14px; padding:18px; border:1px solid #c7a84d; border-left:5px solid #a87808; border-radius:4px; background:#fff9df; }
      .market-card[hidden] { display:none; }
      .market-card h2 { margin:7px 0 9px; font-size:22px; }
      .market-card p { margin:8px 0 0; color:#665b45; line-height:1.6; max-width:72ch; }
      .market-kicker { color:#725208; font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
      .market-title { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
      .market-card .plate { width:auto; max-width:100%; min-width:92px; min-height:34px; padding:4px 12px; font-size:16px; line-height:1; letter-spacing:0; }
      .market-price { color:#554214; }
      .market-actions { display:flex; flex-direction:column; gap:9px; min-width:210px; text-align:center; font-size:12px; }
      .whatsapp-action { border-color:#0b6f63 !important; background:#075e54 !important; color:#fff !important; display:inline-flex; align-items:center; justify-content:center; gap:9px; }
      .whatsapp-action:hover { background:#064c45 !important; }
      .whatsapp-icon { width:20px; height:20px; flex:0 0 auto; fill:currentColor; }
"""
        market_script = '      <script src="../assets/plate.market.js?v=20260825-01"></script>\n'
        market_grid_selector = ", .market-card"
        market_media_style = "        .market-actions { min-width:0; }\n"
        market_section = f"{market_card}\n\n"

    page_id = f"{canonical}#webpage"
    dataset_id = f"{canonical}#dataset"
    source_urls = source_urls_for(entry["rows"][:TABLE_ROWS])
    first_iso = str(first_row.get("auction_date") or "")
    latest_iso = str(latest_row.get("auction_date") or "")
    temporal_coverage = f"{first_iso}/{latest_iso}" if first_iso and latest_iso else ""
    dataset_schema = {
        "@type": "Dataset",
        "@id": dataset_id,
        "name": f"{plate} Hong Kong vehicle registration mark auction records",
        "alternateName": f"{plate} 車牌拍賣紀錄",
        "description": desc,
        "url": canonical,
        "mainEntityOfPage": {"@id": page_id},
        "creator": {"@id": SITE_ORGANIZATION_ID},
        "provider": {"@id": SITE_ORGANIZATION_ID},
        "dateModified": TODAY,
        "spatialCoverage": {"@type": "Place", "name": "Hong Kong"},
        "variableMeasured": ["auction date", "vehicle registration mark", "sale price in HKD", "auction dataset"],
        "inLanguage": ["zh-HK", "en"],
    }
    if temporal_coverage:
        dataset_schema["temporalCoverage"] = temporal_coverage
    if source_urls:
        dataset_schema["isBasedOn"] = source_urls

    ld_json = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": SITE_ORGANIZATION_ID,
                "name": SITE_NAME,
                "url": f"{SITE_URL}/",
                "logo": f"{SITE_URL}/assets/logo.svg",
            },
            {
                "@type": "WebPage",
                "@id": page_id,
                "url": canonical,
                "name": og_title,
                "description": desc,
                "dateModified": TODAY,
                "inLanguage": ["zh-HK", "en"],
                "isPartOf": {"@id": SITE_WEBSITE_ID},
                "mainEntity": {"@id": dataset_id},
            },
            dataset_schema,
            {
                "@type": "FAQPage",
                "@id": f"{canonical}#faq",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": f"What public auction records exist for Hong Kong plate {plate}?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": (
                                f"Plate.hk indexes {entry['count']} historical public-auction record(s) for {plate}. "
                                f"The highest indexed result is {highest_price} on {highest_date}. "
                                "Verify each material claim against the linked Hong Kong Transport Department source."
                            ),
                        },
                    },
                    {
                        "@type": "Question",
                        "name": f"Is the historical auction price for {plate} a current valuation?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "No. A historical public-auction result is not a current valuation, owner record, sale listing, or future-price guarantee.",
                        },
                    },
                    {
                        "@type": "Question",
                        "name": f"How can the auction records for {plate} be verified?",
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": "Match the plate display, auction date, price, dataset, and source link against the original Hong Kong Transport Department document.",
                        },
                    },
                ],
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Plate.hk", "item": f"{SITE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Popular plates", "item": f"{SITE_URL}/plates/index.html"},
                    {"@type": "ListItem", "position": 3, "name": f"{plate} auction records", "item": canonical},
                ],
            },
        ],
    }

    return f"""<!doctype html>
<html lang="zh-HK">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{html.escape(og_title)}</title>
    <meta name="description" content="{html.escape(desc)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <meta name="theme-color" content="#f4f1e8" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{html.escape(og_title)}" />
    <meta property="og:description" content="{html.escape(desc)}" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:site_name" content="Plate.hk" />
    <meta property="og:image" content="https://plate.hk/assets/logo.svg" />
    <meta property="og:image:alt" content="Plate.hk Hong Kong vehicle registration marks database logo" />
    <meta property="og:locale" content="zh_HK" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{html.escape(og_title)}" />
    <meta name="twitter:description" content="{html.escape(desc)}" />
    <meta name="twitter:image" content="https://plate.hk/assets/logo.svg" />
    <meta name="twitter:image:alt" content="Plate.hk Hong Kong vehicle registration marks database logo" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg?v=20260827-05" />
    <link rel="alternate" type="application/json" href="https://plate.hk/api/search?dataset=all&amp;q={plate_norm}&amp;sort=amount_desc&amp;page=1&amp;page_size=200" title="{html.escape(plate)} auction records as JSON" />
    <script type="application/ld+json">{json.dumps(ld_json, ensure_ascii=False)}</script>
    <link rel="stylesheet" href="../assets/ledger.css?v={INFO_CSS_VERSION}" />
    <style>
      :root {{
        --bg:#f4f1e8; --panel:#fffaf0; --line:#c9c0ad; --ink:#1d1b17; --muted:#5f594d; --accent:#3a5d4b;
      }}
      * {{ box-sizing:border-box; }}
      body {{ margin:0; color:var(--ink); font-family:"Space Grotesk","Noto Sans HK",sans-serif; }}
      .wrap {{ max-width: 1080px; margin: 0 auto; padding: 28px 18px 56px; }}
      .hero, .card {{ padding:18px; }}
      .hero h1 {{ margin: 12px 0 0; font-size: clamp(28px, 4vw, 44px) !important; }}
      .lede {{ color: var(--muted); line-height: 1.75; margin-top: 10px; font-size: 15px; max-width: 74ch; }}
      .plate {{
        display:inline-flex; align-items:center; justify-content:center; min-width: 220px; min-height: 82px;
        padding: 12px 20px; font-size: 34px; font-weight: 900; color:#171717;
      }}
      .meta {{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; margin-top:16px; }}
      .metric {{ background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:14px; }}
      .metric .k {{ color:var(--muted); font-size:12px; text-transform:uppercase; font-weight:800; }}
      .metric .v {{ margin-top:6px; font-size:20px; font-weight:800; }}
      .grid {{ display:grid; grid-template-columns: 1.25fr .75fr; gap:14px; margin-top:14px; }}
      .stack {{ display:grid; gap:14px; }}
      .grid > *, .stack, .card {{ min-width:0; }}
      table {{ width:100%; border-collapse: collapse; margin-top: 10px; }}
      th, td {{ text-align:left; padding: 12px 10px; border-top:1px solid var(--line); vertical-align: top; }}
      td span {{ color:var(--muted); font-size:12px; }}
      .actions {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }}
      .btn, .pill {{ display:inline-flex; align-items:center; justify-content:center; text-decoration:none; border-radius:4px !important; border:1px solid var(--line-strong) !important; }}
      .btn {{ padding:11px 14px; font-weight:800; background:var(--surface) !important; color:var(--ink) !important; }}
      .btn.primary {{ background:var(--accent) !important; color:var(--accent-ink) !important; border-color:var(--accent) !important; }}
      .pills {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }}
      .pill {{ padding:8px 11px; background:var(--surface) !important; color:var(--accent) !important; }}
      .answer-list {{ display:grid; gap:12px; margin-top:12px; }}
      .answer-item {{ border-top:1px solid var(--line); padding-top:12px; }}
      .answer-item:first-child {{ border-top:0; padding-top:0; }}
      .answer-item h3 {{ margin:0; font-size:16px; line-height:1.45; }}
      .answer-item p {{ margin:6px 0 0; color:var(--muted); line-height:1.65; }}
      .dataset-breakdown {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }}
      .dataset-chip {{
        display:flex; flex-direction:column; gap:4px; background:var(--surface); border:1px solid var(--line);
        border-radius:4px; padding:10px 12px; min-width: 160px;
      }}
      .dataset-chip span {{ color:var(--muted); font-size:12px; }}
{market_style}      a {{ color:var(--accent); }}
      @media (max-width: 860px) {{
        .meta, .grid{market_grid_selector} {{ grid-template-columns: 1fr; }}
{market_media_style}        .plate {{ min-width: 0; width: 100%; font-size: 28px; }}
      }}
      @media (max-width: 620px) {{
        .responsive-table, .responsive-table tbody, .responsive-table tr, .responsive-table td {{ display:block; width:100%; }}
        .responsive-table thead {{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }}
        .responsive-table tr {{ border-top:1px solid var(--line); padding:8px 0; }}
        .responsive-table tbody tr:first-child {{ margin-top:10px; }}
        .responsive-table td {{ display:grid; grid-template-columns:minmax(104px,.8fr) minmax(0,1.7fr); gap:10px; border-top:0; padding:6px 0; overflow-wrap:anywhere; }}
        .responsive-table td::before {{ content:attr(data-label); color:var(--muted); font-size:11px; font-weight:800; line-height:1.35; text-transform:uppercase; }}
      }}
    </style>
  </head>
  <body class="info-page info-page--plate" data-info-page="plates" data-title-zh="{html.escape(og_title, quote=True)}" data-title-en="{html.escape(f'{plate} Plate Auction Results | Plate.hk', quote=True)}">
    <div data-info-shell-header></div>
    <main class="wrap" id="main-content">
      <div class="hero">
        <a data-preserve-lang href="../plates/index.html" {copy_attrs('← 熱門車牌索引', '← Popular Plates')}>← 熱門車牌索引</a>
        <h1 {copy_attrs(f'{plate} 車牌拍賣結果', f'{plate} Plate Auction Results')}>{html.escape(plate)} 車牌拍賣結果</h1>
        <div style="margin-top:12px;"><span class="plate">{html.escape(plate)}</span></div>
        <div class="lede" data-lang-only="zh">{html.escape(summary_sentence(entry))}</div>
        <div class="lede" data-lang-only="en" hidden>{html.escape(desc_en)} Category: {html.escape(category_en)}.</div>
        <div class="actions">
          <a class="btn primary" data-preserve-lang href="../index.html?q={plate_norm}" {copy_attrs('在 Plate.hk 搜尋', 'Search on Plate.hk')}>在 Plate.hk 搜尋</a>
        </div>
        <div class="meta">
          <div class="metric"><div class="k" {copy_attrs('最高成交', 'Top Sale')}>最高成交</div><div class="v"><span data-lang-only="zh">{html.escape(highest_price)}</span><span data-lang-only="en" hidden>{html.escape(highest_price_en)}</span></div></div>
          <div class="metric"><div class="k" {copy_attrs('紀錄數', 'Records')}>紀錄數</div><div class="v">{entry['count']}</div></div>
          <div class="metric"><div class="k" {copy_attrs('首次紀錄', 'First Seen')}>首次紀錄</div><div class="v"><span data-lang-only="zh">{html.escape(first_date)}</span><span data-lang-only="en" hidden>{html.escape(first_date_en)}</span></div></div>
          <div class="metric"><div class="k" {copy_attrs('最近紀錄', 'Latest Seen')}>最近紀錄</div><div class="v"><span data-lang-only="zh">{html.escape(latest_date)}</span><span data-lang-only="en" hidden>{html.escape(latest_date_en)}</span></div></div>
        </div>
      </div>

{market_section}      <div class="grid">
        <div class="stack">
          <div class="card">
            <h2 {copy_attrs('成交紀錄', 'Auction Records')}>成交紀錄</h2>
            <div class="lede" data-lang-only="zh">最高成交出現在 {html.escape(highest_date)}。以下列出目前最重要的歷史紀錄，並可直接回站內搜尋完整結果。</div>
            <div class="lede" data-lang-only="en" hidden>The highest result was recorded on {html.escape(highest_date_en)}. The table lists the most relevant historical records with direct source and full-search links.</div>
            <table class="responsive-table">
              <thead>
                <tr><th {copy_attrs('日期', 'Date')}>日期</th><th {copy_attrs('分類', 'Dataset')}>分類</th><th {copy_attrs('成交價', 'Price')}>成交價</th><th {copy_attrs('來源', 'Source')}>來源</th></tr>
              </thead>
              <tbody>{rows_html}</tbody>
            </table>
          </div>
          <div class="card">
            <h2 {copy_attrs('直接答案', 'Direct Answers')}>直接答案</h2>
            <div class="answer-list">{answer_summary}</div>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <h2 {copy_attrs('資料概覽', 'Coverage')}>資料概覽</h2>
            <div class="lede" data-lang-only="zh">{html.escape(plate)} 目前歸類為 {html.escape(category_zh)}。資料由 Plate.hk 整理自香港運輸署公開拍賣結果；以下是它在不同資料集中的出現情況。</div>
            <div class="lede" data-lang-only="en" hidden>{html.escape(plate)} is classified as {html.escape(category_en)}. Plate.hk compiles these records from public Hong Kong Transport Department auction results; the breakdown shows where the plate appears.</div>
            <div class="dataset-breakdown">{dataset_breakdown}</div>
          </div>
          <div class="card">
            <h2 {copy_attrs('延伸瀏覽', 'Related Plates')}>延伸瀏覽</h2>
            <div class="lede" data-lang-only="zh">如果你是搜尋熱門單字母、短字首、品牌或經典號碼，下面這些車牌通常也有相近的搜尋意圖。</div>
            <div class="lede" data-lang-only="en" hidden>These related marks cover similar single-letter, short-prefix, brand, or classic-number searches.</div>
            <div class="pills">{related_html}</div>
          </div>
        </div>
      </div>
{market_script}    </main>
    <div data-info-shell-footer></div>
    <script src="../assets/info-locale.js?v={INFO_LOCALE_VERSION}"></script>
    <script src="../assets/info-shell.js?v={INFO_SHELL_VERSION}"></script>
  </body>
</html>
"""


def render_index(entries: list[dict]) -> str:
    top_cards = "\n".join(
        f"""\
        <a class="card" data-popular-card data-preserve-lang href="./{item['plate_norm']}.html">
          <div class="plate">{html.escape(item['plate_display'])}</div>
          <div class="price"><span data-lang-only="zh">{html.escape(money(item['top_row'].get('amount_hkd')))}</span><span data-lang-only="en" hidden>{html.escape(money_en(item['top_row'].get('amount_hkd')))}</span></div>
          <div class="meta" {copy_attrs(f"{item['count']} 筆紀錄 · {classify_plate(item['plate_norm'])[0]}", f"{item['count']} records · {classify_plate(item['plate_norm'])[1]}")}>{item['count']} 筆紀錄 · {html.escape(classify_plate(item['plate_norm'])[0])}</div>
        </a>"""
        for item in entries[:INDEX_LINKS]
    )
    canonical = f"{SITE_URL}/plates/index.html"
    ld_json = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": f"{canonical}#webpage",
                "url": canonical,
                "name": "Popular Hong Kong vehicle registration mark auction records",
                "description": "A browsable index of notable Hong Kong registration marks selected from public auction records by sale price, record count, and memorable plate patterns.",
                "dateModified": TODAY,
                "inLanguage": ["zh-HK", "en"],
                "isPartOf": {"@id": SITE_WEBSITE_ID},
                "about": {"@id": f"{SITE_URL}/about.html#dataset"},
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Plate.hk", "item": f"{SITE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Popular plates", "item": canonical},
                ],
            },
        ],
    }
    return f"""<!doctype html>
<html lang="zh-HK">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>熱門車牌拍賣結果索引 | Plate.hk</title>
    <meta name="description" content="熱門香港車牌拍賣結果索引頁，快速進入高價、高搜尋意圖與代表性車牌的 Plate.hk 落地頁。" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="https://plate.hk/plates/index.html" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="熱門車牌拍賣結果索引 | Plate.hk" />
    <meta property="og:description" content="快速進入熱門香港車牌的靜態搜尋落地頁。" />
    <meta property="og:url" content="https://plate.hk/plates/index.html" />
    <meta property="og:site_name" content="Plate.hk" />
    <meta property="og:image" content="https://plate.hk/assets/logo.svg" />
    <meta property="og:image:alt" content="Plate.hk Hong Kong vehicle registration marks database logo" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="熱門車牌拍賣結果索引 | Plate.hk" />
    <meta name="twitter:description" content="快速瀏覽熱門香港車牌的歷史公開拍賣成交結果與官方來源。" />
    <meta name="twitter:image" content="https://plate.hk/assets/logo.svg" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg?v=20260827-05" />
    <script type="application/ld+json">{json.dumps(ld_json, ensure_ascii=False)}</script>
    <meta name="theme-color" content="#f4f1e8" />
    <link rel="stylesheet" href="../assets/ledger.css?v={INFO_CSS_VERSION}" />
    <style>
      :root {{ --bg:#f4f1e8; --panel:#fffaf0; --line:#c9c0ad; --ink:#1d1b17; --muted:#5f594d; --accent:#3a5d4b; }}
      * {{ box-sizing:border-box; }}
      body {{ margin:0; color:var(--ink); font-family:"Space Grotesk","Noto Sans HK",sans-serif; }}
      .wrap {{ max-width: 1120px; margin:0 auto; padding:28px 18px 56px; }}
      .hero {{ padding:18px; }}
      .hero h1 {{ margin:12px 0 0; font-size:clamp(24px, 3vw, 34px) !important; }}
      .hero a {{ display:inline-flex; align-items:center; font-size:14px; }}
      .lede {{ color:var(--muted); line-height:1.72; margin-top:12px; max-width:78ch; }}
      .hub-actions {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }}
      .hub-actions a {{ display:inline-flex; padding:9px 12px; border:1px solid var(--line); border-radius:4px; text-decoration:none; font-weight:800; }}
      .popular-tools {{ display:none; grid-template-columns:minmax(220px,1fr) auto auto; gap:10px; align-items:end; margin-top:14px; padding:14px; border:1px solid var(--line-strong); border-radius:4px; background:var(--surface); }}
      .popular-ready .popular-tools {{ display:grid; }}
      .popular-snapshot {{ margin-top:12px; color:var(--muted); font-size:12px; font-weight:700; }}
      .popular-tools label {{ display:grid; gap:6px; color:var(--muted); font-size:12px; font-weight:800; }}
      .popular-tools input {{ width:100%; min-height:44px; }}
      .popular-count {{ min-height:44px; display:inline-flex; align-items:center; color:var(--muted); font-size:13px; font-weight:700; }}
      .popular-tools button {{ min-height:44px; }}
      .grid {{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; margin-top:14px; }}
      .card {{
        display:flex; min-height:112px; flex-direction:column; align-items:flex-start; gap:8px;
        text-decoration:none; color:inherit; padding:12px;
      }}
      .card:hover {{ background:var(--surface-muted) !important; }}
      [data-popular-card][hidden] {{ display:none !important; }}
      .card .plate {{
        display:inline-flex; width:auto; min-width:58px; max-width:100%; height:34px;
        align-items:center; justify-content:center; padding:0 10px;
        font-size:22px; line-height:1; overflow:hidden;
      }}
      .card .price {{ color:var(--ink); font-weight:800; font-size:14px; line-height:1.2; margin:0; }}
      .card .meta {{ color:var(--muted); font-size:12px; line-height:1.4; margin:0; }}
      @media (max-width: 980px) {{ .grid {{ grid-template-columns: repeat(3, minmax(0,1fr)); }} }}
      @media (max-width: 760px) {{ .grid {{ grid-template-columns: repeat(2, minmax(0,1fr)); }} }}
      @media (max-width: 620px) {{ .popular-ready .popular-tools {{ grid-template-columns:1fr; align-items:stretch; }} .grid {{ grid-template-columns: 1fr; }} }}
    </style>
  </head>
  <body class="info-page info-page--plates" data-info-page="plates" data-title-zh="熱門車牌拍賣結果索引 | Plate.hk" data-title-en="Popular Plate Auction Results | Plate.hk">
    <div data-info-shell-header></div>
    <main class="wrap" id="main-content">
      <div class="hero">
        <a data-preserve-lang href="../index.html" {copy_attrs('← 返回首頁', '← Back to Search')}>← 返回首頁</a>
        <h1 {copy_attrs('熱門車牌拍賣結果索引', 'Popular Plate Auction Results')}>熱門車牌拍賣結果索引</h1>
        <div class="lede" data-lang-only="zh">這裡列出 {min(len(entries), INDEX_LINKS)} 個具代表性的香港車牌歷史成交頁。排序綜合最高公開拍賣成交價、收錄紀錄數、短號碼及常見字首；價格只代表歷史成交，不是現時估值。</div>
        <div class="lede" data-lang-only="en" hidden>Browse {min(len(entries), INDEX_LINKS)} notable Hong Kong plate-auction pages ranked by public sale results, record coverage, and memorable plate patterns. Historical prices are not current valuations.</div>
        <div class="hub-actions"><a data-preserve-lang href="../about.html" {copy_attrs('資料方法與限制', 'Data Guide')}>資料方法與限制</a><a data-preserve-lang href="../index.html" {copy_attrs('搜尋全部紀錄', 'Search All Records')}>搜尋全部紀錄</a></div>
        <div class="popular-snapshot"><span {copy_attrs('資料快照', 'Data snapshot')}>資料快照</span>: <time datetime="{TODAY}">{TODAY}</time></div>
      </div>
      <div class="popular-tools">
        <label for="popularQuery"><span {copy_attrs('篩選車牌', 'Filter plates')}>篩選車牌</span><input id="popularQuery" type="search" inputmode="search" data-placeholder-zh="例如 88、HK、XX" data-placeholder-en="For example: 88, HK, XX" placeholder="例如 88、HK、XX" autocomplete="off" /></label>
        <span class="popular-count" id="popularCount" aria-live="polite"></span>
        <button type="button" id="popularShowAll" {copy_attrs('顯示全部', 'Show all')}>顯示全部</button>
      </div>
      <div class="grid" id="popularGrid">{top_cards}</div>
    </main>
    <div data-info-shell-footer></div>
    <script src="../assets/info-locale.js?v={INFO_LOCALE_VERSION}"></script>
    <script src="../assets/popular-index.js?v={POPULAR_INDEX_VERSION}"></script>
    <script src="../assets/info-shell.js?v={INFO_SHELL_VERSION}"></script>
  </body>
</html>
"""


def render_about() -> str:
    canonical = f"{SITE_URL}/about.html"
    stats = _DATASET_STATS
    total_rows = sum(int(item.get("rows") or 0) for item in stats.values())
    total_issues = sum(int(item.get("issues") or 0) for item in stats.values())
    first_dates = [str(item.get("first_date") or "") for item in stats.values() if item.get("first_date")]
    latest_dates = [str(item.get("latest_date") or "") for item in stats.values() if item.get("latest_date")]
    first_date = min(first_dates) if first_dates else ""
    latest_date = max(latest_dates) if latest_dates else ""
    descriptions = {
        "pvrm": ("自訂車牌實體拍賣", "Personalized registration mark physical auctions"),
        "tvrm_physical": ("傳統及特殊車牌實體拍賣", "Traditional and special-mark physical auctions"),
        "tvrm_eauction": ("普通傳統車牌拍牌易結果", "Ordinary traditional marks sold by E-Auction"),
        "tvrm_legacy": ("1973-2006 官方工作簿年份區段", "Official workbook-backed historical year ranges, 1973-2006"),
    }
    coverage_rows = "".join(
        f"""
              <tr>
                <th scope="row" data-label-zh="資料集" data-label-en="Dataset" {copy_attrs(DATASETS[key]['label_zh'], DATASETS[key]['label_en'])}>{html.escape(DATASETS[key]['label_zh'])}</th>
                <td data-label-zh="資料列" data-label-en="Rows">{int(stats.get(key, {}).get('rows') or 0):,}</td>
                <td data-label-zh="期數" data-label-en="Issues">{int(stats.get(key, {}).get('issues') or 0):,}</td>
                <td data-label-zh="最新日期" data-label-en="Latest"><span data-lang-only="zh">{html.escape(format_date_zh(str(stats.get(key, {}).get('latest_date') or '')))}</span><span data-lang-only="en" hidden>{html.escape(str(stats.get(key, {}).get('latest_date') or ''))}</span></td>
                <td data-label-zh="範圍" data-label-en="Scope" {copy_attrs(descriptions[key][0], descriptions[key][1])}>{html.escape(descriptions[key][0])}</td>
              </tr>"""
        for key in DATASETS
    )
    description = (
        "Plate.hk is an independent, read-only index of historical Hong Kong vehicle registration mark auction "
        "results compiled from Transport Department PDF handouts and official workbook exports, with source links "
        "for verification."
    )
    dataset_schema = {
        "@type": "Dataset",
        "@id": f"{canonical}#dataset",
        "name": "Plate.hk Hong Kong vehicle registration mark auction results",
        "alternateName": ["香港車牌拍賣資料庫", "Hong Kong PVRM and TVRM auction results"],
        "description": description,
        "url": canonical,
        "creator": {"@id": SITE_ORGANIZATION_ID},
        "provider": {"@id": SITE_ORGANIZATION_ID},
        "dateModified": TODAY,
        "spatialCoverage": {"@type": "Place", "name": "Hong Kong"},
        "variableMeasured": ["auction date", "vehicle registration mark", "sale price in HKD", "auction type", "source document"],
        "measurementTechnique": "Source-document extraction, normalized search indexing, cross-dataset overlap checks, and automated integrity auditing.",
        "isBasedOn": [TD_URL, TD_HISTORY_URL, TD_PVRM_URL, TD_TVRM_APPLICATION_URL, TD_EAUCTION_URL],
        "subjectOf": [
            f"{SITE_URL}/audit.html",
            f"{SITE_URL}/api.html",
            f"{SITE_URL}/api/v1/index.json",
        ],
        "inLanguage": ["zh-HK", "en"],
    }
    if first_date and latest_date:
        dataset_schema["temporalCoverage"] = f"{first_date}/{latest_date}"
    faq_schema = {
        "@type": "FAQPage",
        "@id": f"{canonical}#faq",
        "mainEntity": [
            {
                "@type": "Question",
                "name": "Where can I check official Hong Kong vehicle registration mark auction results?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Use the Hong Kong Transport Department vehicle registration mark service and auction history as the authority. Plate.hk is an independent search index that links to official sources where available.",
                },
            },
            {
                "@type": "Question",
                "name": "What is the difference between PVRM, TVRM physical auctions, and E-Auction?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "PVRMs are approved personalized combinations sold at physical auctions. Ordinary traditional marks other than HK or XX prefixes use E-Auction; HK or XX prefixes and special traditional marks use physical auctions.",
                },
            },
            {
                "@type": "Question",
                "name": "Does an auction record prove the current owner or that a plate is for sale?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "No. It proves only a historical public-auction result. It does not prove current holdership, vehicle assignment, transferability, or sale availability.",
                },
            },
            {
                "@type": "Question",
                "name": "How can I search Hong Kong plate auction data through JSON or an API?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Use the public Plate.hk JSON search endpoint at /api/search or the static dataset index at /api/v1/index.json. Plate.hk is not an official government API.",
                },
            },
        ],
    }
    ld_json = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": SITE_ORGANIZATION_ID,
                "name": SITE_NAME,
                "url": f"{SITE_URL}/",
                "logo": f"{SITE_URL}/assets/logo.svg",
                "sameAs": ["https://github.com/heathermhuang/platehk"],
            },
            {
                "@type": "WebPage",
                "@id": f"{canonical}#webpage",
                "url": canonical,
                "name": "Plate.hk data guide and methodology",
                "description": description,
                "dateModified": TODAY,
                "inLanguage": ["zh-HK", "en"],
                "isPartOf": {"@id": SITE_WEBSITE_ID},
                "mainEntity": {"@id": f"{canonical}#dataset"},
            },
            dataset_schema,
            faq_schema,
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Plate.hk", "item": f"{SITE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Data guide", "item": canonical},
                ],
            },
        ],
    }

    return f"""<!doctype html>
<html lang="zh-HK">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>香港車牌拍賣資料說明與方法 | Plate.hk</title>
    <meta name="description" content="了解 Plate.hk 香港車牌拍賣資料的官方來源、PVRM/TVRM 覆蓋範圍、更新與核對方法，以及歷史成交價的限制。" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <meta name="theme-color" content="#f4f1e8" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Plate.hk" />
    <meta property="og:title" content="香港車牌拍賣資料說明與方法 | Plate.hk" />
    <meta property="og:description" content="資料來源、覆蓋範圍、核對方法與歷史成交價限制。" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:image" content="https://plate.hk/assets/logo.svg" />
    <meta property="og:image:alt" content="Plate.hk Hong Kong vehicle registration marks database logo" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Plate.hk data guide and methodology" />
    <meta name="twitter:description" content="Sources, coverage, verification method, and limits of Hong Kong plate auction data." />
    <meta name="twitter:image" content="https://plate.hk/assets/logo.svg" />
    <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg?v=20260827-05" />
    <link rel="alternate" type="application/json" href="https://plate.hk/api/v1/index.json" title="Plate.hk public API dataset index" />
    <script type="application/ld+json">{json.dumps(ld_json, ensure_ascii=False)}</script>
    <link rel="stylesheet" href="./assets/ledger.css?v={INFO_CSS_VERSION}" />
    <style>
      :root {{ --bg:#f4f1e8; --panel:#fffaf0; --line:#c9c0ad; --ink:#1d1b17; --muted:#5f594d; --accent:#3a5d4b; }}
      * {{ box-sizing:border-box; }}
      body {{ margin:0; color:var(--ink); font-family:"Space Grotesk","Noto Sans HK",sans-serif; }}
      .wrap {{ max-width:1060px; margin:0 auto; padding:28px 18px 56px; }}
      .hero, .card {{ padding:20px; }}
      .hero h1 {{ margin:12px 0 0; font-size:clamp(28px,4vw,44px); }}
      .lede, .card p, .card li {{ color:var(--muted); line-height:1.75; }}
      .lede {{ margin-top:12px; max-width:80ch; }}
      .summary {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:16px; }}
      .metric {{ border:1px solid var(--line); background:var(--panel); padding:14px; }}
      .metric span {{ display:block; color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; }}
      .metric strong {{ display:block; margin-top:6px; font-size:22px; }}
      .grid {{ display:grid; grid-template-columns:1.1fr .9fr; gap:14px; margin-top:14px; }}
      .stack {{ display:grid; gap:14px; align-content:start; }}
      .grid > *, .stack, .card {{ min-width:0; }}
      h2 {{ margin:0; font-size:22px; }}
      h3 {{ margin:18px 0 0; font-size:17px; }}
      p {{ margin:8px 0 0; }}
      table {{ width:100%; border-collapse:collapse; margin-top:14px; }}
      th, td {{ border-top:1px solid var(--line); padding:11px 9px; text-align:left; vertical-align:top; }}
      th span {{ color:var(--muted); font-size:12px; }}
      .steps {{ margin:12px 0 0; padding-left:22px; }}
      .links {{ display:flex; gap:9px; flex-wrap:wrap; margin-top:14px; }}
      .links a {{ display:inline-flex; padding:9px 11px; border:1px solid var(--line); border-radius:4px; text-decoration:none; font-weight:800; }}
      a {{ color:var(--accent); }}
      @media (max-width:800px) {{ .summary, .grid {{ grid-template-columns:1fr; }} }}
      @media (max-width:620px) {{
        .responsive-table, .responsive-table tbody, .responsive-table tr, .responsive-table td, .responsive-table th[scope="row"] {{ display:block; width:100%; }}
        .responsive-table thead {{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }}
        .responsive-table tr {{ border-top:1px solid var(--line); padding:9px 0; }}
        .responsive-table tbody tr:first-child {{ margin-top:12px; }}
        .responsive-table td, .responsive-table th[scope="row"] {{ display:grid; grid-template-columns:minmax(104px,.8fr) minmax(0,1.7fr); gap:10px; border-top:0; padding:6px 0; overflow-wrap:anywhere; }}
        .responsive-table td::before, .responsive-table th[scope="row"]::before {{ content:attr(data-label); color:var(--muted); font-size:11px; font-weight:800; line-height:1.35; text-transform:uppercase; }}
      }}
    </style>
  </head>
  <body class="info-page info-page--about" data-info-page="about" data-title-zh="香港車牌拍賣資料說明與方法 | Plate.hk" data-title-en="Hong Kong Plate Auction Data Guide | Plate.hk">
    <div data-info-shell-header></div>
    <main class="wrap" id="main-content">
      <header class="hero">
        <a href="./index.html" data-preserve-lang {copy_attrs('← 返回搜尋', '← Back to Search')}>← 返回搜尋</a>
        <h1 {copy_attrs('香港車牌拍賣資料說明與方法', 'Hong Kong Plate Auction Data Guide')}>香港車牌拍賣資料說明與方法</h1>
        <p class="lede" data-lang-only="zh">Plate.hk 是獨立、唯讀的香港車牌歷史拍賣資料索引，整理香港運輸署公開 PDF 結果及官方工作簿匯出。它不是政府網站；如資料有差異，以官方文件為準。</p>
        <p class="lede" data-lang-only="en" hidden>Plate.hk is an independent, read-only index compiled from Hong Kong Transport Department auction-result PDFs and official workbook exports. It is not a government website; official source documents prevail.</p>
        <div class="summary">
          <div class="metric"><span {copy_attrs('來源資料列', 'Source rows')}>來源資料列</span><strong>{total_rows:,}</strong></div>
          <div class="metric"><span {copy_attrs('拍賣期數／年份區段', 'Auction issues / ranges')}>拍賣期數／年份區段</span><strong>{total_issues:,}</strong></div>
          <div class="metric"><span {copy_attrs('最新收錄日期', 'Latest covered date')}>最新收錄日期</span><strong><span data-lang-only="zh">{html.escape(format_date_zh(latest_date))}</span><span data-lang-only="en" hidden>{html.escape(latest_date)}</span></strong></div>
        </div>
      </header>

      <section class="card" style="margin-top:14px;" aria-labelledby="coverage-title">
        <h2 id="coverage-title" {copy_attrs('收錄範圍', 'Coverage')}>收錄範圍</h2>
        <p data-lang-only="zh">下表是四個來源資料集的建置快照。「來源資料列」是去除跨資料集重複前的列數；「全部車牌」搜尋會隱藏已識別的舊工作簿重複紀錄。</p>
        <p data-lang-only="en" hidden>The table is a build snapshot of four source datasets. Source rows are counted before cross-dataset deduplication; the All Plates search hides identified legacy workbook duplicates.</p>
        <table class="responsive-table">
          <thead><tr><th {copy_attrs('資料集', 'Dataset')}>資料集</th><th {copy_attrs('資料列', 'Rows')}>資料列</th><th {copy_attrs('期數', 'Issues')}>期數</th><th {copy_attrs('最新日期', 'Latest')}>最新日期</th><th {copy_attrs('範圍', 'Scope')}>範圍</th></tr></thead>
          <tbody>{coverage_rows}</tbody>
        </table>
      </section>

      <div class="grid">
        <div class="stack">
          <section class="card" aria-labelledby="answers-title">
            <h2 id="answers-title" {copy_attrs('常見問題與直接答案', 'Direct Answers')}>常見問題與直接答案</h2>
            <h3 id="official-results-answer" {copy_attrs('在哪裡可以查到香港車牌的官方拍賣成交紀錄？', 'Where can I check official Hong Kong vehicle registration mark auction results?')}>在哪裡可以查到香港車牌的官方拍賣成交紀錄？</h3>
            <p data-lang-only="zh">最終權威紀錄請查閱<a href="{TD_URL}" target="_blank" rel="noopener noreferrer">香港運輸署車牌服務</a>及<a href="{TD_HISTORY_URL}" target="_blank" rel="noopener noreferrer">運輸署拍賣歷史</a>。Plate.hk 不是政府網站，而是把 PVRM、TVRM 實體拍賣、拍牌易及官方工作簿歷史資料整理成<a href="./index.html" data-preserve-lang>可搜尋索引</a>；每筆結果在可用時會連回官方來源，方便核對。</p>
            <p data-lang-only="en" hidden>For the authoritative record, use the <a href="{TD_URL}" target="_blank" rel="noopener noreferrer">Hong Kong Transport Department vehicle registration mark service</a> and its <a href="{TD_HISTORY_URL}" target="_blank" rel="noopener noreferrer">auction history</a>. Plate.hk is an independent, non-government <a href="./index.html" data-preserve-lang>search index</a> across PVRM, TVRM physical auctions, E-Auction, and official workbook-backed history; each result links to the official source when available.</p>
            <h3 {copy_attrs('Plate.hk 的資料來自哪裡？', 'Where does Plate.hk get its data?')}>Plate.hk 的資料來自哪裡？</h3>
            <p data-lang-only="zh">主要來自香港運輸署發布的 PVRM、TVRM 實體拍賣及拍牌易結果 PDF；1973-2006 歷史區段來自官方工作簿匯出。每個車牌頁會在可用時直接連回相應來源。</p>
            <p data-lang-only="en" hidden>Most records come from PVRM, TVRM physical-auction, and E-Auction result PDFs published by the Hong Kong Transport Department. Historical ranges from 1973 to 2006 come from official workbook exports. Each plate page links directly to its source when available.</p>
            <h3 {copy_attrs('PVRM、TVRM 實體拍賣及拍牌易有甚麼分別？', 'What is the difference between PVRM, TVRM physical auctions, and E-Auction?')}>PVRM、TVRM 實體拍賣及拍牌易有甚麼分別？</h3>
            <p data-lang-only="zh"><a href="{TD_PVRM_URL}" target="_blank" rel="noopener noreferrer">PVRM</a> 是獲運輸署批准、最多八個英文字母（不包括 I、O、Q）及／或數字的自訂組合，於實體場地拍賣。一般傳統車牌（不包括 HK／XX 字首）自 2025 年起使用<a href="{TD_EAUCTION_URL}" target="_blank" rel="noopener noreferrer">「拍牌易」</a>；HK／XX 字首及特殊傳統車牌繼續實體拍賣。按<a href="{TD_TVRM_APPLICATION_URL}" target="_blank" rel="noopener noreferrer">傳統車牌規則</a>，普通傳統車牌可隨所屬車輛轉讓，特殊傳統車牌不可轉讓；PVRM 所屬車輛過戶時須一併向運輸署提交分配證明書。以運輸署現行規則為準。</p>
            <p data-lang-only="en" hidden><a href="{TD_PVRM_URL}" target="_blank" rel="noopener noreferrer">PVRMs</a> are approved custom combinations of up to eight letters (excluding I, O and Q) and/or numerals, sold at physical auctions. Ordinary traditional marks other than HK/XX prefixes use <a href="{TD_EAUCTION_URL}" target="_blank" rel="noopener noreferrer">E-Auction</a>; HK/XX-prefix and special traditional marks use physical auctions. Under the <a href="{TD_TVRM_APPLICATION_URL}" target="_blank" rel="noopener noreferrer">traditional-mark rules</a>, ordinary traditional marks may transfer with the vehicle and special traditional marks are non-transferable; a PVRM Certificate of Allocation must accompany a transfer of the vehicle bearing that mark. Current Transport Department rules prevail.</p>
            <h3 {copy_attrs('歷史成交價等於現時估值、車主資料或放售狀態嗎？', 'Does an auction record prove current value, owner, or sale status?')}>歷史成交價等於現時估值、車主資料或放售狀態嗎？</h3>
            <p data-lang-only="zh">不等於，也不能證明。成交價只描述某次公開拍賣的歷史結果，不是現時估值、車主或持有人紀錄、即時放售證明或未來成交保證。車牌或車輛其後可能已轉讓、取消分配或不再放售。</p>
            <p data-lang-only="en" hidden>No. An auction result is a historical transaction record, not a current valuation, owner or holder record, active sale listing, or future-price guarantee. The mark or vehicle may later have been transferred, cancelled, or withdrawn from sale.</p>
            <h3 {copy_attrs('如何用 JSON 或 API 搜尋？', 'How can I search through JSON or an API?')}>如何用 JSON 或 API 搜尋？</h3>
            <p data-lang-only="zh">使用公開的 <a href="./api.html" data-preserve-lang>Plate.hk API 文檔</a>及 <code>GET /api/search?dataset=all&amp;q=88</code>，或從 <a href="./api/v1/index.json">資料集索引</a>取得靜態資料入口。這是 Plate.hk 的獨立 API，不是香港政府或運輸署 API。</p>
            <p data-lang-only="en" hidden>Use the public <a href="./api.html" data-preserve-lang>Plate.hk API documentation</a> and <code>GET /api/search?dataset=all&amp;q=88</code>, or use the <a href="./api/v1/index.json">dataset index</a> for static data entry points. This is Plate.hk's independent API, not a Hong Kong government or Transport Department API.</p>
            <h3 {copy_attrs('Plate.hk 是香港政府或運輸署網站嗎？', 'Is Plate.hk a Hong Kong government or Transport Department website?')}>Plate.hk 是香港政府或運輸署網站嗎？</h3>
            <p data-lang-only="zh">不是。Plate.hk 是獨立資料工具；官方文件和運輸署網站始終是最終權威來源。</p>
            <p data-lang-only="en" hidden>No. Plate.hk is an independent data tool. Official documents and the Transport Department website remain the final authority.</p>
            <h3 {copy_attrs('應如何引用一筆結果？', 'How should I cite a result?')}>應如何引用一筆結果？</h3>
            <p data-lang-only="zh">同時列出車牌顯示方式、拍賣日期、成交價、資料集名稱和來源連結。若版面空格或雙行排列有意義，應保留官方文件中的表示方式。</p>
            <p data-lang-only="en" hidden>Include the displayed plate, auction date, sale price, dataset name, and source link. Preserve the official document's spacing or two-line layout when it carries meaning.</p>
          </section>
          <section class="card" aria-labelledby="method-title">
            <h2 id="method-title" {copy_attrs('資料流程', 'Method')}>資料流程</h2>
            <ol class="steps" data-lang-only="zh">
              <li>從公開的官方拍賣結果文件建立期數清單。</li>
              <li>提取車牌顯示、拍賣日期、成交價、來源 URL 及頁碼。</li>
              <li>保留原始顯示方式；另建標準化搜尋鍵，方便忽略版面空格搜尋。</li>
              <li>檢查格式、空值、期數列數及 legacy 跨資料集重疊。</li>
              <li>發布靜態搜尋資料、公開 API、審核報告及可核對來源的車牌頁。</li>
            </ol>
            <ol class="steps" data-lang-only="en" hidden>
              <li>Build an issue list from publicly available official auction-result documents.</li>
              <li>Extract the displayed plate, auction date, sale price, source URL, and page number.</li>
              <li>Preserve the original display while creating a normalized search key that ignores layout spaces.</li>
              <li>Check formats, missing values, issue row counts, and legacy overlap across datasets.</li>
              <li>Publish static search data, the public API, audit reports, and source-verifiable plate pages.</li>
            </ol>
          </section>
        </div>
        <div class="stack">
          <section class="card" aria-labelledby="limits-title">
            <h2 id="limits-title" {copy_attrs('限制', 'Limits')}>限制</h2>
            <ul class="steps" data-lang-only="zh">
              <li>最新資料取決於官方文件是否已發布及排程更新是否成功。</li>
              <li>舊工作簿資料部分只能準確到年份區段，不代表單一拍賣日。</li>
              <li>自動提取可能有錯漏；高風險用途必須回看來源文件。</li>
              <li>外部放售訊號與官方拍賣結果是不同資料層，不應混作官方成交。</li>
            </ul>
            <ul class="steps" data-lang-only="en" hidden>
              <li>Freshness depends on official publication and successful scheduled updates.</li>
              <li>Some older workbook records are precise only to a year range, not a single auction date.</li>
              <li>Automated extraction can contain errors; high-stakes use requires checking the source document.</li>
              <li>External sale signals and official auction results are separate data layers and must not be presented as the same evidence.</li>
            </ul>
          </section>
          <section class="card" aria-labelledby="sources-title">
            <h2 id="sources-title" {copy_attrs('官方來源與機器入口', 'Official Sources and Machine Access')}>官方來源與機器入口</h2>
            <div class="links">
              <a href="{TD_URL}" target="_blank" rel="noopener noreferrer" {copy_attrs('運輸署車牌服務', 'Transport Department Plate Service')}>運輸署車牌服務</a>
              <a href="{TD_HISTORY_URL}" target="_blank" rel="noopener noreferrer" {copy_attrs('運輸署拍賣歷史', 'Transport Department Auction History')}>運輸署拍賣歷史</a>
              <a href="./audit.html" data-preserve-lang {copy_attrs('資料審核', 'Data Audit')}>資料審核</a>
              <a href="./api.html" data-preserve-lang {copy_attrs('API 文檔', 'API Documentation')}>API 文檔</a>
              <a href="./api/v1/index.json" {copy_attrs('API 資料集索引', 'API Dataset Index')}>API 資料集索引</a>
              <a href="./llms.txt">llms.txt</a>
              <a href="./agent.md" {copy_attrs('智能代理指南', 'Agent Guide')}>智能代理指南</a>
            </div>
          </section>
          <section class="card" aria-labelledby="updated-title">
            <h2 id="updated-title" {copy_attrs('頁面狀態', 'Page Status')}>頁面狀態</h2>
            <p data-lang-only="zh">此說明頁於 <time datetime="{TODAY}">{TODAY}</time> 建置；資料時間範圍為 {html.escape(format_date_zh(first_date))} 至 {html.escape(format_date_zh(latest_date))}。這是建置證據，不等於官方已發布當日新拍賣結果。</p>
            <p data-lang-only="en" hidden>This guide was built on <time datetime="{TODAY}">{TODAY}</time>. The dataset covers {html.escape(first_date)} to {html.escape(latest_date)}. This is build evidence, not proof that the authority published a new auction result that day.</p>
          </section>
        </div>
      </div>
    </main>
    <div data-info-shell-footer></div>
    <script src="./assets/info-locale.js?v={INFO_LOCALE_VERSION}"></script>
    <script src="./assets/info-shell.js?v={INFO_SHELL_VERSION}"></script>
  </body>
</html>
"""


def build():
    entries = build_plate_data()
    entries_by_norm = {entry["plate_norm"]: entry for entry in entries}

    OUT.mkdir(parents=True, exist_ok=True)
    for old_page in OUT.glob("*.html"):
        if " " in old_page.name:
            continue
        old_page.unlink()

    manifest = []
    for idx, entry in enumerate(entries):
        related = entries[max(0, idx - 4): idx] + entries[idx + 1: idx + 5]
        page = render_page(entries_by_norm, entry, related)
        filename = f"{entry['plate_norm']}.html"
        (OUT / filename).write_text(page)
        manifest.append(
            {
                "plate_norm": entry["plate_norm"],
                "plate_display": entry["plate_display"],
                "href": f"/plates/{filename}",
                "top_amount_hkd": entry["top_row"].get("amount_hkd"),
                "record_count": entry["count"],
                "first_seen": date_label(entry["first_row"]),
                "latest_seen": date_label(entry["latest_row"]),
            }
        )

    (OUT / "index.html").write_text(render_index(entries))
    (ROOT / "about.html").write_text(render_about())
    (DATA / "popular_plates_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    )

    sitemap_rows = [f'  <url><loc>{loc}</loc><lastmod>{TODAY}</lastmod></url>' for loc in STATIC_PAGES]
    sitemap_rows.extend(
        f'  <url><loc>https://plate.hk{item["href"]}</loc><lastmod>{TODAY}</lastmod></url>'
        for item in manifest
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(sitemap_rows)
        + "\n</urlset>\n"
    )

    print(f"Built {len(manifest)} popular plate pages into {OUT}")


if __name__ == "__main__":
    build()
