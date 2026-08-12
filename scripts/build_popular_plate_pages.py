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
MARKET_SIGNALS_PATH = DATA / "market" / "28car.active.json"
_MARKET_SIGNALS: dict | None = None

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
    "https://plate.hk/api.html",
    "https://plate.hk/audit.html",
    "https://plate.hk/changelog.html",
    "https://plate.hk/terms.html",
    "https://plate.hk/privacy.html",
    "https://plate.hk/plates/index.html",
]


def load_json(path: Path):
    return json.loads(path.read_text())


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
        return "未能自動解析 / Unable to parse"
    return f"HK${int(amount):,}"


def money_en(amount) -> str:
    if amount is None:
        return "unparsed"
    return f"HK${int(amount):,}"


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
            return ("單數字 / Single-digit", "Single-digit plate")
        return ("單字母 / Single-letter", "Single-letter plate")
    if plate_norm.startswith("HK"):
        return ("HK 經典字首 / HK classic", "HK prefix classic")
    if plate_norm.startswith("XX"):
        return ("XX 經典字首 / XX classic", "XX prefix classic")
    if plate_norm.isdigit():
        return ("純數字 / Numeric", "Numeric")
    if plate_norm.isalpha():
        return ("純字母 / Alphabetic", "Alphabetic")
    if any(ch.isdigit() for ch in plate_norm) and any(ch.isalpha() for ch in plate_norm):
        return ("字母數字混合 / Alpha-numeric", "Alpha-numeric")
    return ("熱門車牌 / Popular plate", "Popular plate")


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
    overlap_exact, overlap_coarse = overlap_lookup()
    rows_by_plate: dict[str, list[dict]] = defaultdict(list)
    stats: dict[str, dict] = {}

    for dataset_key, meta in DATASETS.items():
        rows = load_json(meta["results"])
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
    return ordered[:MAX_PAGES]


def summary_sentence(entry: dict) -> str:
    plate = entry["plate_display"]
    top = entry["top_row"]
    first_row = entry["first_row"]
    latest_row = entry["latest_row"]
    dataset_names = ", ".join(DATASETS[key]["label_en"] for key in entry["dataset_keys"])
    return (
        f"{plate} 車牌目前收錄 {entry['count']} 筆公開拍賣紀錄，"
        f"最高成交 {money(top.get('amount_hkd'))}，"
        f"最早紀錄為 {date_label(first_row)}，最近紀錄為 {date_label(latest_row)}。"
        f" 涵蓋來源包括 {dataset_names or 'Plate.hk'}。"
    )


def search_intent_lines(entry: dict) -> list[str]:
    plate = entry["plate_display"]
    plate_norm = entry["plate_norm"]
    category_zh, category_en = classify_plate(plate_norm)
    return [
        f"{plate} 屬於 {category_zh}，通常會被搜尋「{plate} 車牌價格」、「{plate} auction result」或「{plate} plate hk」。",
        f"If users search for {plate} plate price, {plate} auction result, or {plate} HK plate, this page should be a direct landing page.",
        f"目前 Plate.hk 已整理 {entry['count']} 筆相關紀錄，並可一鍵回到站內查詢 {plate_norm} 的完整結果。",
    ]


def dataset_breakdown_html(entry: dict) -> str:
    counts = []
    for key in entry["dataset_keys"]:
        c = sum(1 for row in entry["rows"] if row["dataset_key"] == key)
        counts.append(
            f'<div class="dataset-chip"><strong>{html.escape(DATASETS[key]["label_zh"])}</strong><span>{c} records</span></div>'
        )
    return "".join(counts)


def render_page(entries_by_norm: dict[str, dict], entry: dict, related: list[dict]) -> str:
    plate = entry["plate_display"]
    plate_norm = entry["plate_norm"]
    top = entry["top_row"]
    first_row = entry["first_row"]
    latest_row = entry["latest_row"]
    highest_price = money(top.get("amount_hkd"))
    highest_date = date_label(top)
    first_date = date_label(first_row)
    latest_date = date_label(latest_row)
    category_zh, category_en = classify_plate(plate_norm)
    desc = summary_sentence(entry)
    og_title = f"{plate} 車牌拍賣結果 | Plate.hk"
    canonical = f"https://plate.hk/plates/{plate_norm}.html"
    rows_html = "".join(
        f"""
        <tr>
          <td>{html.escape(date_label(row))}</td>
          <td>{html.escape(DATASETS[row['dataset_key']]['label_zh'])}<br><span>{html.escape(DATASETS[row['dataset_key']]['label_en'])}</span></td>
          <td>{html.escape(money(row.get('amount_hkd')))}</td>
          <td><a href="https://plate.hk/?lang=zh&q={plate_norm}" rel="noopener">站內搜尋</a></td>
        </tr>
        """
        for row in entry["rows"][:TABLE_ROWS]
    )
    related_html = "".join(
        f'<a class="pill" href="./{item["plate_norm"]}.html">{html.escape(item["plate_display"])}</a>'
        for item in related
    )
    search_lines = "".join(f"<li>{html.escape(line)}</li>" for line in search_intent_lines(entry))
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
        market_script = '      <script src="../assets/plate.market.js?v=20260812-03"></script>\n'
        market_grid_selector = ", .market-card"
        market_media_style = "        .market-actions { min-width:0; }\n"
        market_section = f"{market_card}\n\n"

    ld_json = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": og_title,
        "description": desc,
        "mainEntityOfPage": canonical,
        "dateModified": TODAY,
        "about": {"@type": "Thing", "name": plate},
        "publisher": {"@type": "Organization", "name": "Plate.hk", "url": "https://plate.hk/"},
        "mentions": [
            {"@type": "Thing", "name": category_en},
            {"@type": "Thing", "name": money_en(top.get("amount_hkd"))},
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
    <meta property="og:type" content="article" />
    <meta property="og:title" content="{html.escape(og_title)}" />
    <meta property="og:description" content="{html.escape(desc)}" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:site_name" content="Plate.hk" />
    <meta property="og:image" content="https://plate.hk/assets/logo.svg" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{html.escape(og_title)}" />
    <meta name="twitter:description" content="{html.escape(desc)}" />
    <meta name="twitter:image" content="https://plate.hk/assets/logo.svg" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
    <script type="application/ld+json">{json.dumps(ld_json, ensure_ascii=False)}</script>
    <link rel="stylesheet" href="../assets/ledger.css?v={LEDGER_CSS_VERSION}" />
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
      table {{ width:100%; border-collapse: collapse; margin-top: 10px; }}
      th, td {{ text-align:left; padding: 12px 10px; border-top:1px solid var(--line); vertical-align: top; }}
      td span {{ color:var(--muted); font-size:12px; }}
      .actions {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }}
      .btn, .pill {{ display:inline-flex; align-items:center; justify-content:center; text-decoration:none; border-radius:4px !important; border:1px solid var(--line-strong) !important; }}
      .btn {{ padding:11px 14px; font-weight:800; background:var(--surface) !important; color:var(--ink) !important; }}
      .btn.primary {{ background:var(--accent) !important; color:var(--accent-ink) !important; border-color:var(--accent) !important; }}
      .pills {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }}
      .pill {{ padding:8px 11px; background:var(--surface) !important; color:var(--accent) !important; }}
      .facts {{ margin-top:12px; padding-left: 20px; color: var(--muted); line-height: 1.7; }}
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
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <a href="../plates/index.html">← 熱門車牌索引 / Popular Plates</a>
        <h1>{html.escape(plate)} 車牌拍賣結果</h1>
        <div style="margin-top:12px;"><span class="plate">{html.escape(plate)}</span></div>
        <div class="lede">
          {html.escape(summary_sentence(entry))}<br />
          Category: {html.escape(category_en)}. This page is built to answer direct searches such as "{html.escape(plate)} plate price", "{html.escape(plate)} auction result", and "{html.escape(plate)} Hong Kong plate".
        </div>
        <div class="actions">
          <a class="btn primary" href="https://plate.hk/?lang=zh&q={plate_norm}">在 Plate.hk 搜尋</a>
          <a class="btn ghost" href="https://plate.hk/?lang=en&q={plate_norm}">Search in English</a>
        </div>
        <div class="meta">
          <div class="metric"><div class="k">最高成交 / Top Sale</div><div class="v">{html.escape(highest_price)}</div></div>
          <div class="metric"><div class="k">紀錄數 / Records</div><div class="v">{entry['count']}</div></div>
          <div class="metric"><div class="k">首次紀錄 / First Seen</div><div class="v">{html.escape(first_date)}</div></div>
          <div class="metric"><div class="k">最近紀錄 / Latest Seen</div><div class="v">{html.escape(latest_date)}</div></div>
        </div>
      </div>

{market_section}      <div class="grid">
        <div class="stack">
          <div class="card">
            <h2>成交紀錄 / Auction Records</h2>
            <div class="lede">最高成交出現在 {html.escape(highest_date)}。以下列出目前最重要的歷史紀錄，並可直接回站內搜尋完整結果。</div>
            <table>
              <thead>
                <tr><th>日期 / Date</th><th>分類 / Dataset</th><th>成交價 / Price</th><th>操作 / Action</th></tr>
              </thead>
              <tbody>{rows_html}</tbody>
            </table>
          </div>
          <div class="card">
            <h2>這個車牌為什麼常被搜尋？</h2>
            <ul class="facts">{search_lines}</ul>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <h2>資料概覽 / Coverage</h2>
            <div class="lede">{html.escape(plate)} 目前歸類為 {html.escape(category_zh)}。以下是它在不同資料集中的出現情況。</div>
            <div class="dataset-breakdown">{dataset_breakdown}</div>
          </div>
          <div class="card">
            <h2>延伸瀏覽 / Related Plates</h2>
            <div class="lede">如果你是搜尋熱門單字母、短字首、品牌或經典號碼，下面這些車牌通常也有相近的搜尋意圖。</div>
            <div class="pills">{related_html}</div>
          </div>
        </div>
      </div>
{market_script}    </div>
  </body>
</html>
"""


def render_index(entries: list[dict]) -> str:
    top_cards = "\n".join(
        f"""\
        <a class="card" href="./{item['plate_norm']}.html">
          <div class="plate">{html.escape(item['plate_display'])}</div>
          <div class="price">{html.escape(money(item['top_row'].get('amount_hkd')))}</div>
          <div class="meta">{item['count']} records · {html.escape(classify_plate(item['plate_norm'])[1])}</div>
        </a>"""
        for item in entries[:INDEX_LINKS]
    )
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
    <meta property="og:image" content="https://plate.hk/assets/logo.svg" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
    <link rel="stylesheet" href="../assets/ledger.css?v={LEDGER_CSS_VERSION}" />
    <style>
      :root {{ --bg:#f4f1e8; --panel:#fffaf0; --line:#c9c0ad; --ink:#1d1b17; --muted:#5f594d; --accent:#3a5d4b; }}
      * {{ box-sizing:border-box; }}
      body {{ margin:0; color:var(--ink); font-family:"Space Grotesk","Noto Sans HK",sans-serif; }}
      .wrap {{ max-width: 1120px; margin:0 auto; padding:28px 18px 56px; }}
      .hero {{ padding:18px; }}
      .hero h1 {{ margin:12px 0 0; font-size:clamp(24px, 3vw, 34px) !important; }}
      .hero a {{ display:inline-flex; align-items:center; font-size:14px; }}
      .lede {{ color:var(--muted); line-height:1.72; margin-top:12px; max-width:78ch; }}
      .grid {{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; margin-top:14px; }}
      .card {{
        display:flex; min-height:112px; flex-direction:column; align-items:flex-start; gap:8px;
        text-decoration:none; color:inherit; padding:12px;
      }}
      .card:hover {{ background:var(--surface-muted) !important; }}
      .card .plate {{
        display:inline-flex; width:auto; min-width:58px; max-width:100%; height:34px;
        align-items:center; justify-content:center; padding:0 10px;
        font-size:22px; line-height:1; overflow:hidden;
      }}
      .card .price {{ color:var(--ink); font-weight:800; font-size:14px; line-height:1.2; margin:0; }}
      .card .meta {{ color:var(--muted); font-size:12px; line-height:1.4; margin:0; }}
      @media (max-width: 980px) {{ .grid {{ grid-template-columns: repeat(3, minmax(0,1fr)); }} }}
      @media (max-width: 760px) {{ .grid {{ grid-template-columns: repeat(2, minmax(0,1fr)); }} }}
      @media (max-width: 620px) {{ .grid {{ grid-template-columns: 1fr; }} }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <a href="../index.html">← 返回首頁 / Back to Search</a>
        <h1>熱門車牌拍賣結果索引</h1>
        <div class="lede">
          這裡列出 Plate.hk 目前最值得被 Google 直接收錄的一批熱門車牌頁面。排序不只看最高成交，也會納入出現次數、字型記憶度與熱門搜尋意圖。<br />
          This hub links to high-value and high-intent Hong Kong plate pages, so search engines can land directly on a specific plate instead of only the homepage.
        </div>
      </div>
      <div class="grid">{top_cards}</div>
    </div>
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
