#!/usr/bin/env python3
"""Build the bounded, bilingual decision-tool entry pages from official calendar data."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
 'prices': ('香港車牌價錢查詢', 'Hong Kong plate price history'),
 'auctions': ('香港車牌拍賣日程及結果', 'Hong Kong plate auctions and results'),
 'availability': ('車牌可用號碼與申請指南', 'Plate availability and application guide'),
 'discover': ('按預算及號碼找車牌', 'Find plates by budget and pattern'),
 'plate': ('車牌紀錄及相似成交', 'Plate history and comparable sales'),
 'shortlist': ('我的車牌清單及比較', 'My plate shortlist and comparison'),
}

def bilingual(zh, en, tag='p'):
 return f'<{tag} data-lang-only="zh">{zh}</{tag}><{tag} data-lang-only="en" hidden>{en}</{tag}>'

def link(url, zh, en):
 return f'<a {"data-preserve-lang" if url.startswith("/") else ""} href="{html.escape(url,quote=True)}">'+bilingual(zh,en,'span')+'</a>'

def query_form(action='/plate.html'):
 return f'''<form action="{action}" class="decision-form" data-query-form>
 <label for="decisionQuery">{bilingual('車牌片段' if action=='/discover.html' else '完整車牌號碼','Plate fragment' if action=='/discover.html' else 'Exact plate number','span')}</label>
 <input id="decisionQuery" name="q" maxlength="32" autocomplete="off" required placeholder="AA88" aria-describedby="queryHelp">
 <input type="hidden" name="lang" value="zh" data-form-lang>
 <button type="submit">{bilingual('搜尋','Search','span')}</button></form>
 {bilingual('可輸入半形或全形字元；I / O 視為 1 / 0，不接受 Q。','Full-width input is supported; I / O are treated as 1 / 0. Q is not allowed.')}
 <p id="queryHelp" role="status" aria-live="polite"></p>'''

def body_for(page):
 if page=='prices':
  return (
   bilingual('先查完整車牌的歷史公開拍賣結果，再看有來源可核對的相近成交。','Look up the exact plate’s public auction history, then inspect comparable sales with verifiable sources.')
   +query_form()
   +bilingual('如何選取相近成交？','How are comparable sales selected?','h2')
   +bilingual('兩字母加數字的傳統形式車牌，只比較完整相同數字和相同字首級別；HK／XX、自訂車牌及純數字車牌不會混入。這是結構比較，不代表官方普通或特殊類別。每個其他車牌只取最近一次有價、具確實日期的成交。近三年有至少五個獨立樣本時顯示第 25 百分位、中位數及第 75 百分位；不足時擴大歷史日期，仍不足五個便只列個別紀錄。','Two-letter, numeral-ending traditional-pattern marks are compared only with the same complete number and prefix tier. HK/XX, personalized and number-only marks stay separate. This structural group does not establish the official ordinary or special category. Each other plate contributes its latest priced sale with an exact date. We show the 25th percentile, median and 75th percentile when at least five distinct plates qualify within three years; otherwise we widen the historical window and show individual sales without a range if fewer than five qualify.')
   +bilingual('這些數字能代表現時車牌價值嗎？','Do these numbers establish current value?','h2')
   +bilingual('不能。這是已發生的公開拍賣成交分布，不是現時估價、放售價或未來成交預測。沒有拍賣紀錄亦不代表號碼可供申請。請逐筆核對日期、來源及選樣條件。','No. These are distributions of past public-auction sales, not a current valuation, asking price or future-price prediction. No auction record does not establish availability. Check each date, source and selection rule.')
   +link('/availability.html','前往官方可用號碼及申請指引','Check official availability and applications')
   +' · '+link('/discover.html','按預算及號碼篩選','Filter by budget and pattern')
  )
 if page=='availability':
  return bilingual('沒有拍賣紀錄，不代表號碼未被分配。Plate.hk 不提供車主查冊或即時分配狀態；請使用運輸署官方服務。','No auction record does not mean a mark is unassigned. Plate.hk does not provide owner lookup or live allocation status; use the official Transport Department service.')+''.join([
  bilingual('1. 你想查過往價格？','1. Looking for historical prices?','h2'),link('/prices.html','搜尋歷史成交紀錄','Search historical results'),
  bilingual('2. 你想申請傳統號碼？','2. Applying for a traditional mark?','h2'),link('https://www.gov.hk/tc/residents/transport/vehicle/regmarks.htm','官方可用號碼查詢及預留服務','Official availability and reservation services'),
  bilingual('3. 你想申請自訂組合？','3. Applying for a personalized combination?','h2'),link('https://www.td.gov.hk/en/public_services/vehicle_registration_mark/pvrm_application/index.html','官方自訂車牌申請及組合規定','Official PVRM application and combination requirements'),
  bilingual('4. 你想保留、套用或轉讓已有號碼？','4. Retaining, assigning or transferring a mark?','h2'),
  bilingual('先確認號碼的官方類別及是否已配予車輛。自訂、普通及特殊登記號碼的規則不同，不能只憑字樣推斷。投得號碼後亦有指定配車期限；未有車輛時，應先向運輸署核對。','First confirm the official mark type and whether it is assigned to a vehicle. Personalized, ordinary and special marks have different rules; lettering alone is not a legal classification. Auctioned marks also have assignment deadlines; check with TD before bidding if you do not have a vehicle.'),
  link('https://www.1823.gov.hk/en/faq/what-vehicle-registration-marks-are-available-through-auction','官方類別及流程說明','Official types and process guide'),
  ' · '+link('https://www.1823.gov.hk/en/faq/knowing-how-to-change-the-id-of-your-vehicle','官方更改車輛登記號碼指南','Official registration-mark change guide'),
  bilingual('申請前清單：核對號碼類別、官方可用狀態、申請窗口及拍賣方式、所需身分及車輛文件、官方費用與限期。直接在官方服務提交文件。','Before applying: check mark type, official availability, application window and auction method, identity/vehicle documents, official fees and deadlines. Submit documents directly to the official service.'),
  link('/auctions.html','查看拍賣日程及儲存提醒','View auction dates and save a reminder'),
 ])
 if page=='auctions':
  events=json.loads((ROOT/'data/events.json').read_text()).get('events',[])
  titles={'pvrm_registration':('自訂車牌申請窗口','PVRM application window'),'tvrm_eauction':('拍牌易網上拍賣','Online ordinary-mark auction'),'tvrm_physical':('傳統車牌實體拍賣','Traditional-mark physical auction'),'pvrm_physical':('自訂車牌實體拍賣','Personalized-mark physical auction')}
  out=bilingual('官方申請、網上及實體拍賣日程。日曆檔案含提前一天的提醒；下載後不會自動更新，請再次核對官方公告。','Official application, online and physical auction dates. Calendar downloads include a one-day reminder; downloaded events do not update automatically. Recheck official notices.')
  out+='<section class="decision-event">'+bilingual('已核對的完整拍賣結果','Verified complete auction results','h2')
  out+=bilingual('查閱完整號碼表、拍賣售出、特別費用分配及未售出標示，並核對運輸署手冊。','Read complete mark tables with auction sales, special-fee allocations and unsold labels, checked against Transport Department handouts.')
  out+='<p data-lang-only="zh"><a href="/auction-results/index.html">拍賣結果目錄</a></p><p data-lang-only="en" hidden><a href="/auction-results/en/index.html">Auction results archive</a></p></section>'
  for event in events:
   zh,en=titles.get(event['type'],('官方活動','Official event'))
   url=event.get('action_url_en') or event.get('source_url_en') or ''
   out+='<section class="decision-event">'+bilingual(zh,en,'h2')+bilingual(html.escape(event.get('date_label_zh','')),html.escape(event.get('date_label_en','')))
   if event.get('meta',{}).get('source')=='computed_recurring_window_from_td_main_page':out+=bilingual('按一般申請月份整理，並非個別活動開放確認。','Based on the usual application months; not confirmation of an individual opening.')
   out+=link(url,'官方詳情','Official details')+f' <button type="button" data-calendar="{html.escape(event["id"],quote=True)}">'+bilingual('加入日曆','Add to calendar','span')+'</button></section>'
  return out+'<p id="calendarStatus" role="status"></p>'+link('/?sort=date_desc','最新拍賣結果','Latest auction results')
 if page=='discover':
  return r'''<p data-lang-only="zh">先輸入預算或選擇號碼模式，查看歷史拍賣成交。這不是現時估價或可供購買的車牌清單。</p><p data-lang-only="en" hidden>Start with a budget or number pattern to explore historical auction sales. These are not current valuations or available stock.</p>
<div class="decision-actions" aria-label="Budget examples"><button type="button" data-budget="5000">HK$5,000</button><button type="button" data-budget="20000">HK$20,000</button><button type="button" data-budget="100000">HK$100,000</button></div>
<form id="discoveryFilters"><div class="decision-filters ux-basic-filters">
<label><span data-lang-only="zh">最高歷史成交價 HKD</span><span data-lang-only="en" hidden>Maximum historical price HKD</span><input name="max_amount" type="number" min="0" max="1000000000" step="1" inputmode="numeric" placeholder="20000"></label>
<label><span data-lang-only="zh">數字模式</span><span data-lang-only="en" hidden>Number pattern</span><select name="pattern"><option value="" data-copy-zh="任何模式" data-copy-en="Any pattern">任何模式</option><option value="repeated" data-copy-zh="重複數字（888）" data-copy-en="Repeated digits (888)">重複數字（888）</option><option value="palindrome" data-copy-zh="回文（1221）" data-copy-en="Palindrome (1221)">回文（1221）</option></select></label>
<label for="decisionQuery"><span data-lang-only="zh">車牌片段（選填）</span><span data-lang-only="en" hidden>Plate fragment (optional)</span><input id="decisionQuery" name="q" maxlength="16" autocomplete="off" placeholder="AA88" aria-describedby="queryHelp"></label></div>
<details class="ux-more-filters"><summary><span data-lang-only="zh">更多篩選</span><span data-lang-only="en" hidden>More filters</span></summary><div class="decision-filters">
<label><span data-lang-only="zh">最低歷史成交價 HKD</span><span data-lang-only="en" hidden>Minimum historical price HKD</span><input name="min_amount" type="number" min="0" max="1000000000" step="1"></label>
<label><span data-lang-only="zh">字首</span><span data-lang-only="en" hidden>Prefix</span><input name="prefix" maxlength="8"></label><label><span data-lang-only="zh">尾數</span><span data-lang-only="en" hidden>Suffix</span><input name="suffix" maxlength="8"></label>
<label><span data-lang-only="zh">數字個數</span><span data-lang-only="en" hidden>Number of digits</span><input name="digits" type="number" min="0" max="8" step="1"></label>
<label><span data-lang-only="zh">日期由（不含粗略年份）</span><span data-lang-only="en" hidden>Date from (excludes coarse years)</span><input name="from" type="date"></label><label><span data-lang-only="zh">日期至</span><span data-lang-only="en" hidden>Date to</span><input name="to" type="date"></label>
<label><span data-lang-only="zh">資料集</span><span data-lang-only="en" hidden>Dataset</span><select name="dataset"><option value="all" data-copy-zh="全部資料集" data-copy-en="All datasets">全部資料集</option><option value="pvrm">PVRM</option><option value="tvrm_physical" data-copy-zh="TVRM 實體拍賣" data-copy-en="TVRM physical">TVRM 實體拍賣</option><option value="tvrm_eauction" data-copy-zh="拍牌易" data-copy-en="E-auction">拍牌易</option><option value="tvrm_legacy">1973–2006</option></select></label>
</div></details><div class="decision-actions"><button type="submit"><span data-lang-only="zh">套用篩選</span><span data-lang-only="en" hidden>Apply filters</span></button><button type="reset"><span data-lang-only="zh">清除篩選</span><span data-lang-only="en" hidden>Reset filters</span></button></div></form>
<p id="queryHelp" role="status" aria-live="polite"></p><div id="decisionResults" aria-live="polite"></div><div class="decision-actions"><button id="decisionPrev" hidden>上一頁 / Previous</button><button id="decisionNext" hidden>下一頁 / Next</button></div>'''
 if page=='plate':return query_form()+'<div id="plateHistory" aria-live="polite"></div><div id="plateComparables" aria-live="polite"></div>'
 return bilingual('清單只儲存在這個瀏覽器，最多 50 個車牌。可選最多 4 個作比較。清除瀏覽器資料亦會清除清單。','Your shortlist stays in this browser, with up to 50 plates. Select up to four to compare. Clearing browser data also removes the shortlist.')+'<div id="shortlistItems"></div><button id="compareSelected" type="button" disabled data-copy-zh="比較所選" data-copy-en="Compare selected">比較所選</button><div id="shortlistComparison" aria-live="polite"></div>'

def render(page):
 zh,en=PAGES[page]
 robots='<meta name="robots" content="noindex,follow">' if page in ['plate','shortlist'] else ''
 desc=zh+'：歷史拍賣證據、官方來源及下一步。不是現時估價或放售保證。'
 return f'''<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>{zh} | Plate.hk</title><meta name="description" content="{desc}">{robots}
 <link rel="canonical" href="https://plate.hk/{page}.html">
 <link rel="alternate" hreflang="zh-HK" href="https://plate.hk/{page}.html"><link rel="alternate" hreflang="en" href="https://plate.hk/{page}.html?lang=en">
 <link rel="stylesheet" href="/assets/ledger.css?v=20260915-01"><link rel="stylesheet" href="/assets/decision.css?v=20260915-01">
 <script defer src="/assets/analytics.js?v=20260915-01"></script><link rel="stylesheet" href="/assets/ux.css?v=20260928-01"><script defer src="/assets/ux.js?v=20260928-01"></script></head>
 <body data-info-page="{page}" data-decision-page="{page}" data-title-zh="{zh} | Plate.hk" data-title-en="{en} | Plate.hk"><div data-info-shell-header></div><main id="main-content" class="decision-main">{bilingual(zh,en,'h1')}
 <nav class="decision-actions" aria-label="Decision tools">{link('/prices.html','價格資料說明','Price guide')} {link('/availability.html','官方可用號碼及申請','Official availability and applications')}</nav>
 {body_for(page)}<p id="decisionNotice" role="status"></p></main><div data-info-shell-footer></div>
 <script src="/assets/info-locale.js?v=20260825-01"></script><script src="/assets/info-shell.js?v=20260928-01"></script><script type="module" src="/assets/decision.js?v=20260928-01"></script></body></html>'''

def build(target=ROOT):
 for page in PAGES:(target/f'{page}.html').write_text(render(page),encoding='utf-8')

if __name__=='__main__':build()
