#!/usr/bin/env python3
"""Render a curated set of source-verified auction rounds, without expanding it."""
from __future__ import annotations

import html
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlencode, urlparse

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'config' / 'auction_result_pages.json'
SITE = 'https://plate.hk'
LABELS = {
    'pvrm': ('自訂車牌', 'Personalized marks'),
    'tvrm_physical': ('傳統車牌實體拍賣', 'Traditional physical auction'),
    'tvrm_eauction': ('拍牌易網上拍賣', 'Online auction'),
}
STATUS = {
    'sold': ('拍賣售出', 'Auction sale'),
    'special_fee': ('特別費用分配（無人競投）', 'Special-fee allocation (no bidder)'),
    'unsold': ('未售出（U/S）', 'Unsold (U/S)'),
}


def load_rounds() -> list[dict]:
    payload = json.loads(CONFIG.read_text(encoding='utf-8'))
    if payload['schema_version'] != 1:
        raise ValueError('Unsupported auction page schema')
    rounds = payload['rounds']
    if not rounds or len({r['id'] for r in rounds}) != len(rounds):
        raise ValueError('Missing or duplicate auction rounds')
    for r in rounds:
        if r['dataset'] not in LABELS or r['id'] != f"{r['dataset']}-{r['start_date']}":
            raise ValueError('Invalid auction identity')
        if date.fromisoformat(r['start_date']) > date.fromisoformat(r['end_date']):
            raise ValueError('Reversed auction date range')
        if date.fromisoformat(r['verified_on']) < date.fromisoformat(r['end_date']):
            raise ValueError('Verification predates auction end')
        url = urlparse(r['source_url'])
        if url.scheme != 'https' or url.hostname != 'www.td.gov.hk' or not url.path.lower().endswith('.pdf'):
            raise ValueError('An official Transport Department result PDF is required')
        if not re.fullmatch(r'[a-f0-9]{64}', r['source_sha256']):
            raise ValueError('Missing source document hash')
        rows = r['rows']
        if not rows or len({re.sub(r'\s+', '', row['mark']) for row in rows}) != len(rows):
            raise ValueError('Missing or duplicate marks')
        for row in rows:
            if not re.fullmatch(r'[A-Z0-9 ]{1,16}', row['mark']) or row['status'] not in STATUS:
                raise ValueError('Invalid mark or disposition')
            if type(row['page']) is not int or not 1 <= row['page'] <= r['source_pages']:
                raise ValueError('Invalid source page')
            if type(row['special_mark']) is not bool:
                raise ValueError('Invalid special-mark flag')
            amount = row['amount_hkd']
            if row['status'] == 'unsold':
                if amount is not None:
                    raise ValueError('An unsold mark cannot have a sale amount')
            elif type(amount) is not int or amount <= 0:
                raise ValueError('A priced result must have a positive HKD amount')
            if row['status'] == 'special_fee' and amount != (5000 if r['dataset'] == 'pvrm' else 1000):
                raise ValueError('Special fee differs from the verified handout footnote')
        if sum(row['amount_hkd'] or 0 for row in rows) != r['official_proceeds_hkd']:
            raise ValueError(f"Source proceeds do not reconcile: {r['id']}")
    return sorted(rounds, key=lambda r: (r['start_date'], r['dataset']), reverse=True)


def public_path(r: dict | None = None, lang: str = 'zh') -> str:
    return f"/auction-results/{'en/' if lang == 'en' else ''}{r['id'] if r else 'index'}.html"


def sitemap_entries() -> list[dict]:
    rounds = load_rounds()
    entries = []
    for lang in ('zh', 'en'):
        entries.append({'href': public_path(lang=lang), 'lastmod': max(r['verified_on'] for r in rounds)})
        entries.extend({'href': public_path(r, lang), 'lastmod': r['verified_on']} for r in rounds)
    return entries


def choose(zh: str, en: str, lang: str) -> str:
    return en if lang == 'en' else zh


def date_label(r: dict, lang: str) -> str:
    start, end = date.fromisoformat(r['start_date']), date.fromisoformat(r['end_date'])
    if lang == 'en':
        first = f'{start.day} {start:%B %Y}'
        return first if start == end else f'{first} to {end.day} {end:%B %Y}'
    first = f'{start.year}年{start.month}月{start.day}日'
    return first if start == end else f'{first}至{end.year}年{end.month}月{end.day}日'


def title(r: dict, lang: str) -> str:
    label = LABELS[r['dataset']][lang == 'en']
    suffix = '拍賣結果' if r['dataset'] == 'pvrm' else '結果'
    return choose(f'{date_label(r, lang)} {label}{suffix}', f'{label} results: {date_label(r, lang)}', lang)


def money(value: int | None) -> str:
    return '—' if value is None else f'HK${value:,}'


def anchor(row: dict) -> str:
    return 'mark-' + re.sub(r'\s+', '', row['mark'])


def link(href: str, label: str, **attrs) -> str:
    extra = ''.join(f' {key.replace("_", "-")}="{html.escape(str(value), quote=True)}"' for key, value in attrs.items())
    return f'<a href="{html.escape(href, quote=True)}"{extra}>{html.escape(label)}</a>'


def shell(r: dict | None, lang: str, heading: str, description: str, body: str, schema: list[dict]) -> str:
    canonical = SITE + public_path(r, lang)
    alternates = ''.join(f'<link rel="alternate" hreflang="{code}" href="{SITE}{public_path(r, language)}">' for code, language in [('zh-HK', 'zh'), ('en', 'en')])
    legacy = '?lang=en' if lang == 'en' else ''
    navigation = ' '.join([
        link('/' + legacy, choose('搜尋車牌', 'Search plates', lang)),
        link('/auctions.html' + legacy, choose('拍賣日程', 'Auction calendar', lang)),
        link(public_path(lang=lang), choose('拍賣結果目錄', 'Results archive', lang)),
        link(public_path(r, 'zh' if lang == 'en' else 'en'), '繁體中文' if lang == 'en' else 'English', hreflang='zh-HK' if lang == 'en' else 'en'),
    ])
    graph = [{'@type': 'WebPage' if r else 'CollectionPage', '@id': canonical + '#page', 'url': canonical,
              'name': heading, 'description': description, 'inLanguage': 'en' if lang == 'en' else 'zh-HK',
              'dateModified': r['verified_on'] if r else max(x['verified_on'] for x in load_rounds()),
              'isPartOf': {'@id': SITE + '/#website'}, **({'isBasedOn': r['source_url']} if r else {})},
             {'@type': 'BreadcrumbList', 'itemListElement': [
                 {'@type': 'ListItem', 'position': 1, 'name': 'Plate.hk', 'item': SITE + '/'},
                 {'@type': 'ListItem', 'position': 2, 'name': choose('拍賣結果目錄', 'Results archive', lang), 'item': SITE + public_path(lang=lang)},
                 *([{'@type': 'ListItem', 'position': 3, 'name': heading, 'item': canonical}] if r else []),
             ]}, *schema]
    structured = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False).replace('<', '\\u003c')
    return f'''<!doctype html>
<html lang="{'en' if lang == 'en' else 'zh-HK'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(heading)} | Plate.hk</title>
<meta name="description" content="{html.escape(description, quote=True)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="{canonical}">{alternates}
<meta property="og:type" content="website"><meta property="og:title" content="{html.escape(heading, quote=True)} | Plate.hk">
<meta property="og:description" content="{html.escape(description, quote=True)}"><meta property="og:url" content="{canonical}">
<meta property="og:locale" content="{'en_HK' if lang == 'en' else 'zh_HK'}">
<link rel="stylesheet" href="/assets/ledger.css?v=20260915-01"><link rel="stylesheet" href="/assets/auction-results.css?v=20260926-01">
<script type="application/ld+json">{structured}</script>
<script defer src="/assets/analytics.js?v=20260915-01"></script>
</head><body class="auction-page">
<a class="auction-skip" href="#main-content">{choose('跳至內容', 'Skip to content', lang)}</a>
<header class="auction-header"><a class="auction-brand" href="/{legacy}"><img src="/assets/logo.svg?v=20260828-01" width="44" height="44" alt="Plate.hk">Plate.hk</a>
<nav aria-label="{choose('主選單與語言', 'Navigation and language', lang)}">{navigation}</nav></header>
<main id="main-content"><p class="auction-kicker">{choose('運輸署結果・Plate.hk 整理', 'Transport Department results · Compiled by Plate.hk', lang)}</p><h1>{html.escape(heading)}</h1>{body}</main>
<footer class="auction-footer">{link('/about.html' + legacy, choose('資料來源與限制', 'Sources and limitations', lang))} · {link('/terms.html' + legacy, choose('使用條款', 'Terms', lang))} · {link('https://github.com/heathermhuang/platehk', 'GitHub')}</footer>
</body></html>\n'''


def render_round(r: dict, lang: str) -> str:
    counts = Counter(row['status'] for row in r['rows'])
    sold = sorted((row for row in r['rows'] if row['status'] == 'sold'), key=lambda row: (-row['amount_hkd'], row['mark']))
    top = sold[0] if sold else None
    sale_total = sum(row['amount_hkd'] for row in sold)
    fee_total = sum(row['amount_hkd'] for row in r['rows'] if row['status'] == 'special_fee')
    summary = choose(
        f"共列 {len(r['rows'])} 個號碼：拍賣售出 {counts['sold']} 個、特別費用分配 {counts['special_fee']} 個、未售出 {counts['unsold']} 個。",
        f"The handout lists {len(r['rows'])} marks: {counts['sold']} auction sales, {counts['special_fee']} special-fee allocations and {counts['unsold']} unsold marks.", lang)
    highest = choose(f"最高拍賣成交為 {top['mark']}，{money(top['amount_hkd'])}。", f"The highest auction sale is {top['mark']} at {money(top['amount_hkd'])}.", lang) if top else choose('本場沒有拍賣售出紀錄。', 'There are no auction sales in this round.', lang)
    description = summary + ' ' + highest + choose('附完整官方來源表；不是現時估值。', ' Full source-linked table; not a current valuation.', lang)
    source = link(r['source_url'], choose('運輸署完整結果 PDF', 'Complete Transport Department result PDF', lang))
    metrics = ''.join(f'<div><dt>{label}</dt><dd>{value}</dd></div>' for label, value in [
        (choose('拍賣售出', 'Auction sales', lang), counts['sold']),
        (choose('特別費用分配', 'Special-fee allocations', lang), counts['special_fee']),
        (choose('未售出', 'Unsold', lang), counts['unsold']),
        (choose('官方公布款項', 'Official proceeds', lang), money(r['official_proceeds_hkd'])),
    ])
    top_items = ''.join(f'<li>{link("#" + anchor(row), row["mark"])} <strong>{money(row["amount_hkd"])}</strong></li>' for row in sold[:5])
    rows_html = []
    for row in sorted(r['rows'], key=lambda row: re.sub(r'\s+', '', row['mark'])):
        query = urlencode({'d': r['dataset'], 'issue': r['start_date'], 'q': re.sub(r'\s+', '', row['mark']), **({'lang': 'en'} if lang == 'en' else {})})
        # The historical search index omits unsold rows. Keep those on this complete handout table.
        search = '' if row['status'] == 'unsold' else ' · ' + link('/?' + query, choose('搜尋紀錄', 'Search record', lang))
        footnote = ' *' if row['special_mark'] else ''
        source_link = link(r['source_url'] + f"#page={row['page']}", choose(f"官方 PDF 第 {row['page']} 頁", f"Official PDF p. {row['page']}", lang))
        rows_html.append(f'<tr id="{anchor(row)}" data-status="{row["status"]}"><th scope="row">{html.escape(row["mark"])}{footnote}</th><td>{STATUS[row["status"]][lang == "en"]}</td><td>{money(row["amount_hkd"])}</td><td>{source_link}{search}</td></tr>')
    interpretation = choose(
        '「@」表示無人競投後以特別費用分配予原申請人，不列為競投成交；U/S 表示本次未售出，價錢留空。官方公布款項可包含特別費用，不能據此推算售出數目。',
        'An @ amount means allocation to the original applicant at a special fee after no bidder; it is excluded from auction-sale counts and rankings. U/S means unsold in this auction, with no sale amount. Official proceeds may include special fees and do not establish a sold-lot count.', lang)
    if r['dataset'] == 'tvrm_physical':
        interpretation += choose(' 表內 * 為官方標示的特殊車輛登記號碼，手冊註明不得轉讓。', ' A * identifies a Special Vehicle Registration Mark; the handout states it is not transferable.', lang)
    if r['dataset'] == 'pvrm':
        interpretation += choose(' 本表列單行號碼；可用的雙行排列及 n/a 標示請核對完整手冊。', ' This table lists the one-row mark; consult the complete handout for two-row arrangements and n/a labels.', lang)
    online = ''
    if r['dataset'] == 'tvrm_eauction':
        online = '<p>' + choose('本場涵蓋 2026年9月17日至21日。搜尋索引以 9月17日（開始日）為期數鍵，不代表各號碼的成交日或付款日。', 'This round covers 17–21 September 2026. The search index uses 17 September, the opening date, as its issue key; it is not an individual mark’s sale or payment date.', lang) + '</p>'
    limits = choose('這是歷史官方結果，不是現時估值、車主資料或可用／放售狀態。一般搜尋索引未保留所有結果標示，未售出號碼亦可能不在搜尋結果內；核對本表及完整手冊。如有差異，以運輸署原始文件為準。', 'These are historical official results, not current valuations, owner records or availability/listing status. The general search index does not retain every disposition and may omit unsold marks; check this table and the complete handout. The original Transport Department document prevails if anything differs.', lang)
    reconciliation = choose(f"拍賣售出金額合計 {money(sale_total)} ＋ 特別費用 {money(fee_total)} ＝ 官方公布款項 {money(r['official_proceeds_hkd'])}。", f"Auction-sale subtotal {money(sale_total)} + special fees {money(fee_total)} = official published proceeds {money(r['official_proceeds_hkd'])}.", lang)
    siblings = ' '.join(link(public_path(other, lang), title(other, lang)) for other in load_rounds() if other['id'] != r['id'])
    headings = [choose('號碼', 'Mark', lang), choose('本場結果', 'Round outcome', lang), choose('金額（港元）', 'Amount (HKD)', lang), choose('來源與查詢', 'Source and lookup', lang)]
    body = f'''<p class="auction-summary">{summary} {highest}</p>
<p>{choose('拍賣日期', 'Auction dates', lang)}: <time datetime="{r['start_date']}">{date_label(r, lang)}</time> · {choose('來源核對日期', 'Source verified', lang)}: <time datetime="{r['verified_on']}">{r['verified_on']}</time></p>
<p>{source}</p><dl class="auction-metrics">{metrics}</dl>
<section aria-labelledby="top-sales"><h2 id="top-sales">{choose('最高五筆拍賣成交', 'Five highest auction sales', lang)}</h2><ol class="auction-top">{top_items}</ol></section>
<section aria-labelledby="read-results"><h2 id="read-results">{choose('如何理解本場結果？', 'How to read this round', lang)}</h2><p>{interpretation}</p><p>{reconciliation}</p>{online}<p>{limits}</p></section>
<section aria-labelledby="complete-results"><h2 id="complete-results">{choose('完整結果', 'Complete results', lang)} ({len(r['rows'])})</h2><p>{choose('按號碼排序；可用瀏覽器尋找功能查詢。金額破折號代表未售出，並非零元成交。', 'Sorted by mark; use your browser’s find function to look up a mark. A dash means unsold, not a zero-price sale.', lang)}</p>
<div class="auction-table-wrap"><table><caption>{html.escape(title(r, lang))} — {choose('完整官方手冊紀錄', 'complete handout records', lang)}</caption><thead><tr>{''.join(f'<th scope="col">{h}</th>' for h in headings)}</tr></thead><tbody>{''.join(rows_html)}</tbody></table></div></section>
<section><h2>{choose('其他已核對拍賣場次', 'Other verified rounds', lang)}</h2><div class="auction-related">{siblings}</div><p>{link(public_path(lang=lang), choose('返回結果目錄', 'Back to results archive', lang))}</p></section>'''
    return shell(r, lang, title(r, lang), description, body, [])


def render_index(lang: str) -> str:
    rounds = load_rounds()
    heading = choose('香港車牌拍賣結果目錄', 'Hong Kong plate auction results archive', lang)
    description = choose('已核對官方手冊的香港車牌拍賣結果：完整號碼、成交金額、特別費用分配及未售出標示。', 'Source-verified Hong Kong plate auction results with complete mark tables, sale amounts, special-fee allocations and unsold labels.', lang)
    cards = []
    for r in rounds:
        count = Counter(row['status'] for row in r['rows'])
        summary = choose(
            f"{len(r['rows'])} 個號碼 · {count['sold']} 個拍賣售出 · {count['special_fee']} 個特別費用分配 · {count['unsold']} 個未售出",
            f"{len(r['rows'])} marks · {count['sold']} auction sales · {count['special_fee']} special-fee allocations · {count['unsold']} unsold", lang)
        cards.append(f'<article><h2>{link(public_path(r, lang), title(r, lang))}</h2><p>{summary}</p><p>{choose("官方公布款項", "Official proceeds", lang)}: <strong>{money(r["official_proceeds_hkd"])}</strong></p><p>{link(r["source_url"], choose("完整官方 PDF", "Complete official PDF", lang))}</p></article>')
    scope = choose('本目錄先收錄三個已核對完整手冊的場次，並非所有歷年拍賣。其他歷史已收錄金額可回到搜尋工具查詢。', 'This archive starts with three rounds verified against their complete handouts; it is not the entire historical auction archive. Use the search tool for other indexed historical amounts.', lang)
    limits = choose('拍賣售出、無人競投後的特別費用分配、以及 U/S 未售出，是不同結果。款項不能當作現時估價或可用狀態；運輸署是最終來源。', 'Auction sales, allocations at special fees after no bidder, and U/S unsold marks are distinct outcomes. Amounts do not establish current value or availability; the Transport Department is the final source authority.', lang)
    body = f'<p class="auction-summary">{description}</p><p>{scope}</p><div class="auction-rounds">{"".join(cards)}</div><section><h2>{choose("結果與價錢的限制", "Result and price limitations", lang)}</h2><p>{limits}</p>{link("/prices.html" + ("?lang=en" if lang == "en" else ""), choose("查詢車牌歷史價格", "Look up a plate’s price history", lang))}</section>'
    schema = [{'@type': 'ItemList', 'numberOfItems': len(rounds), 'itemListElement': [
        {'@type': 'ListItem', 'position': i, 'name': title(r, lang), 'url': SITE + public_path(r, lang)} for i, r in enumerate(rounds, 1)]}]
    return shell(None, lang, heading, description, body, schema)


def build(target: Path = ROOT) -> None:
    rounds = load_rounds()
    for lang in ('zh', 'en'):
        pages = [(None, render_index(lang)), *((r, render_round(r, lang)) for r in rounds)]
        for r, page in pages:
            path = target / public_path(r, lang).lstrip('/')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(page, encoding='utf-8')


if __name__ == '__main__':
    build()
