import { normalize, validQuery, parseFilters, filterKeys, calendarEvent } from './decision-core.mjs';
const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
const text = (zh,en) => lang === 'en' ? en : zh;
const track = (name,data) => window.PlateAnalytics?.track(name,data);
const make = (tag,value,className) => { const el=document.createElement(tag); if(value!=null)el.textContent=value;if(className)el.className=className;return el; };
const add = (parent,...children) => { parent.append(...children);return parent; };
const notice = value => {const el=document.querySelector('#decisionNotice');if(el)el.textContent=value;};
const detailHref = plate => `/plate.html?q=${encodeURIComponent(plate)}&lang=${lang}`;
function link(label,href) { const a=make('a',label);a.href=href;return a; }
function sourceUrl(row) {
  for(const raw of [row.pdf_url,row.source_url])try { if(typeof raw!=='string'||!raw.trim())continue;const u=new URL(raw,'https://plate.hk/');
    if(u.protocol==='https:' && ['plate.hk','www.plate.hk','td.gov.hk','www.td.gov.hk'].includes(u.hostname))return u.href;
  }catch{}
  return null;
}
const plateOf = row => normalize(row.single_line || (row.double_line || []).join(''));
const priceOf = row => row.amount_hkd == null ? (row.result_text || text('沒有成交價','No sale price')) : 'HK$'+Number(row.amount_hkd).toLocaleString('en-HK');
const datasetName = key => ({pvrm:'PVRM',tvrm_physical:text('TVRM 實體拍賣','TVRM physical'),tvrm_eauction:text('拍牌易','E-auction'),tvrm_legacy:'TVRM 1973–2006'})[key] || key;
const storageKey='platehk.shortlist.v1';
let saved=[];
function readSaved() { try { const value=JSON.parse(localStorage.getItem(storageKey)||'[]');saved=Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&validQuery(v)).map(normalize))].slice(0,50):[]; }catch{} }
readSaved();
function refreshSaveButtons(){ for(const button of document.querySelectorAll('[data-save-plate]')){const has=saved.includes(button.dataset.savePlate);button.textContent=has?text('移除收藏','Remove saved'):text('收藏車牌','Save plate');button.setAttribute('aria-pressed',String(has));} }
function toggleSave(plate) {
  if(!validQuery(plate))return;
  const exists=saved.includes(plate);
  if(!exists&&saved.length>=50){notice(text('清單最多可儲存 50 個車牌。','Your shortlist can hold 50 plates.'));return;}
  saved=exists?saved.filter(p=>p!==plate):[...saved,plate];
  let persistent=true;try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{persistent=false;}
  notice(persistent?text('清單已更新，只儲存在這個瀏覽器。','Shortlist updated in this browser only.'):text('瀏覽器未能儲存；清單只保留至本頁關閉。','Browser storage unavailable; this list lasts only while this page is open.'));
  track(exists?'shortlist_remove':'shortlist_save',{plate});refreshSaveButtons();renderShortlist();comparisonVersion++;document.querySelector('#shortlistComparison')?.replaceChildren();
}
function saveButton(plate){const b=make('button');b.type='button';b.dataset.savePlate=plate;b.addEventListener('click',()=>toggleSave(plate));return b;}
function rowCard(row,reason='') {
  const plate=plateOf(row); const card=make('article',null,'decision-result');
  const heading=make('h3');const href=/^\/plates\/[A-Z0-9]+\.html$/.test(row.detail_path||'') ? row.detail_path+`?lang=${lang}` : detailHref(plate);const plateLink=link('',href);plateLink.append(make('span',row.single_line||plate,'plate'));add(heading,plateLink);card.append(heading);
  card.append(make('p',priceOf(row)),make('p',`${(lang==='zh' && row.auction_date_label) || row.year_range || row.auction_date || text('日期未提供','Date unavailable')} · ${datasetName(row.dataset_key)}`));
  if(reason)card.append(make('p',reason,'decision-note'));
  const actions=make('div',null,'decision-actions'); const source=sourceUrl(row);
  if(source)actions.append(link(text('核對來源','Check source'),source)); else actions.append(make('span',text('來源未連結','Source not linked')));
  actions.append(saveButton(plate));card.append(actions);return card;
}
async function getJson(path,signal) {
 const response=await fetch(path,{signal,headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('request_failed');
 const payload=await response.json();
 if(!payload || typeof payload!=='object')throw new Error('invalid_response');
 return payload;
}
function requestError(host,retry){host.replaceChildren(make('p',text('暫時未能讀取資料，這不是零筆結果。','Unable to load data. This is not a zero-result search.')));const b=make('button',text('重試','Retry'));b.type='button';b.addEventListener('click',retry);host.append(b);}
function noHistory(host){host.append(make('p',text('沒有收錄這個號碼的拍賣紀錄，不代表號碼未被分配或正在放售。','No indexed auction record for this mark. This does not establish availability or a current sale.')),link(text('查看官方可用號碼及申請服務','Official availability and application services'),`/availability.html?lang=${lang}`));}
for(const form of document.querySelectorAll('[data-query-form]')) {
  form.querySelector('[data-form-lang]').value=lang;
  const input=form.querySelector('[name=q]');input.value=new URLSearchParams(location.search).get('q')||'';
  form.addEventListener('submit',event=>{
    const q=normalize(input.value);
    if(!validQuery(q)){event.preventDefault();document.querySelector('#queryHelp').textContent=text('請輸入有效的英文字母及數字，不接受 Q。','Enter valid letters and numbers; Q is not allowed.');return;}
    input.value=q;
    if(document.body.dataset.decisionPage==='discover'){event.preventDefault();loadDiscovery(1);}
  });
}
let discoveryVersion=0, discoveryController;
const filtersForm=document.querySelector('#discoveryFilters');
if(filtersForm) {
 const params=new URLSearchParams(location.search);
 for(const key of [...filterKeys,'dataset']){const control=filtersForm.elements.namedItem(key);if(control&&params.has(key))control.value=params.get(key);}
 filtersForm.addEventListener('submit',event=>{event.preventDefault();loadDiscovery(1);});
 if(params.get('q'))loadDiscovery(Math.max(1,Number(params.get('page'))||1));
}
async function loadDiscovery(page=1) {
 const host=document.querySelector('#decisionResults');const q=normalize(document.querySelector('#decisionQuery').value);
 if(!validQuery(q)){document.querySelector('#queryHelp').textContent=text('先輸入至少一個有效車牌字元或號碼片段。','First enter at least one valid plate character or fragment.');return;}
 const params=new URLSearchParams(new FormData(filtersForm));params.set('q',q);params.set('dataset',params.get('dataset')||'all');params.set('page',String(page));params.set('page_size','24');params.set('sort','date_desc');
 try{parseFilters(params);}catch{host.replaceChildren(make('p',text('請核對價錢、日期、字首及尾數範圍。','Check the price, date, prefix and suffix filters.')));return;}
 const version=++discoveryVersion;discoveryController?.abort();discoveryController=new AbortController();const started=performance.now();
 document.querySelector('#decisionPrev').hidden=document.querySelector('#decisionNext').hidden=true;
 host.replaceChildren(make('p',text('搜尋中…','Searching…')));
 const state=new URLSearchParams(params);for(const [key,value] of [...state])if(!value)state.delete(key);state.delete('page_size');state.delete('sort');state.set('lang',lang);history.replaceState({},'',`?${state}`);
 try{
  const result=await getJson(`/api/search?${params}`,discoveryController.signal);if(version!==discoveryVersion)return;
  if(!Array.isArray(result.rows)||!Number.isFinite(result.total))throw new Error('invalid_response');
  host.replaceChildren(make('h2',text(`${result.total.toLocaleString()} 筆歷史紀錄 · 第 ${page} 頁`,`${result.total.toLocaleString()} historical records · page ${page}`)));
  if(!result.rows.length)noHistory(host);
  const list=make('div',null,'decision-results');result.rows.forEach(row=>list.append(rowCard(row)));host.append(list);refreshSaveButtons();
  const prev=document.querySelector('#decisionPrev'),next=document.querySelector('#decisionNext');prev.hidden=page<=1;next.hidden=page*24>=result.total;prev.onclick=()=>loadDiscovery(page-1);next.onclick=()=>loadDiscovery(page+1);
  track('discovery_search',{plate:q,action:params.get('pattern')||'any_pattern',result_count:result.total,duration_ms:performance.now()-started,dataset:params.get('dataset'),page_number:page});
 }catch(error){if(error.name==='AbortError'||version!==discoveryVersion)return;requestError(host,()=>loadDiscovery(page));track('search_error',{error_kind:'discovery_failed'});}
}
async function loadHistory(plate,host,page=1){
 host.replaceChildren(make('p',text('讀取紀錄中…','Loading history…')));
 try{
  const params=new URLSearchParams({dataset:'all',q:plate,mode:'exact',sort:'date_desc',page_size:'24',page:String(page)});
  const result=await getJson(`/api/search?${params}`);if(!Array.isArray(result.rows))throw new Error('invalid_response');
  host.replaceChildren(make('h2',text(`${plate} · ${result.total} 筆歷史紀錄`,`${plate} · ${result.total} historical record${result.total===1?'':'s'}`)));
  if(!result.rows.length)noHistory(host);
  const list=make('div',null,'decision-results');result.rows.forEach(row=>list.append(rowCard(row)));host.append(list);
  const nav=make('div',null,'decision-actions');for(const [n,label] of [[page-1,text('上一頁','Previous')],[page+1,text('下一頁','Next')]]){if(n<1||(n-1)*24>=result.total)continue;const b=make('button',label);b.addEventListener('click',()=>loadHistory(plate,host,n));nav.append(b);}host.append(nav);refreshSaveButtons();
 }catch{requestError(host,()=>loadHistory(plate,host,page));}
}
async function loadComparables(plate,host) {
 host.replaceChildren(make('h2',text('相似歷史成交','Comparable historical sales')));
 const content=make('div');host.append(content);
 try{const result=await getJson(`/api/comparables?q=${encodeURIComponent(plate)}`);if(!Array.isArray(result.rows))throw new Error('invalid_response');
  const traditionalPattern=result.cohort==='traditional_pattern_same_number_prefix_tier';
  content.append(make('p',traditionalPattern
    ? text('只比較完整相同數字、同字首級別的兩字母傳統形式車牌；每個其他車牌只取最近一次有價成交。這是結構比較，不代表官方分類、現時估價或放售證明。','Only two-letter traditional-pattern marks with the same full number and prefix tier are compared, using each other plate’s latest priced sale. This structural comparison is not an official classification, current valuation or listing.')
    : text('按相同資料集、字母／數字結構及號碼片段選取，按日期排序。並非估價、可轉讓性判斷或放售證明。','Selected by source dataset, letter/digit structure and a shared fragment, ordered by date. Not a valuation, transferability judgment or evidence of a current listing.')));
  if(traditionalPattern&&result.sample_size){
   content.append(make('p',text(`${result.sample_size} 個獨立比較車牌 · ${result.date_from} 至 ${result.date_to} · ${result.window==='recent_three_years'?'近三年':'所有具確實日期的紀錄'}`,`${result.sample_size} distinct comparable plates · ${result.date_from} to ${result.date_to} · ${result.window==='recent_three_years'?'last three years':'all records with exact dates'}`)));
   if(result.statistics){const stats=make('div',null,'decision-results');for(const [key,zh,en] of [['p25','第 25 百分位','25th percentile'],['median','中位數','Median'],['p75','第 75 百分位','75th percentile']]){const card=make('div',null,'decision-result');card.append(make('strong',text(zh,en)),make('p','HK$'+Number(result.statistics[key]).toLocaleString('en-HK')));stats.append(card);}content.append(stats);}
   else content.append(make('p',text('樣本不足五個，只列出個別成交，不提供價格區間。','Fewer than five qualifying plates; individual sales are shown without a price range.')));
  }
  if(!result.rows.length)content.append(make('p',text('沒有足夠相似的有價成交紀錄；不提供價格區間。','No sufficiently similar priced records found; no price range is offered.')));
  const list=make('div',null,'decision-results');
  const appendRows=rows=>{for(const row of rows)list.append(rowCard(row,traditionalPattern
   ? text('完整數字及字首級別相同；每個車牌只取最近一次有價成交。','Same complete number and prefix tier; latest priced sale per plate.')
   : text(`相同資料集及字數結構；包含「${row.match_text}」。每個車牌取最近一筆有價紀錄。`,`Same dataset and letter/digit shape; contains “${row.match_text}”. Latest priced record per plate.`)));refreshSaveButtons();};
  content.append(list);appendRows(result.rows);
  if(traditionalPattern&&result.sample_size>result.rows.length){
   let shown=result.rows.length,page=1;
   const more=make('button');more.type='button';more.textContent=text(`顯示更多比較成交（${shown}/${result.sample_size}）`,`Show more comparable sales (${shown}/${result.sample_size})`);
   more.addEventListener('click',async()=>{more.disabled=true;try{
    const next=await getJson(`/api/comparables?q=${encodeURIComponent(plate)}&page=${page+1}&page_size=8`);
    if(!Array.isArray(next.rows)||!next.rows.length)throw new Error('invalid_page');
    page++;shown+=next.rows.length;appendRows(next.rows);
    if(shown>=result.sample_size)more.remove();else more.textContent=text(`顯示更多比較成交（${shown}/${result.sample_size}）`,`Show more comparable sales (${shown}/${result.sample_size})`);
   }catch{more.textContent=text('未能載入更多成交，請重試。','Could not load more sales. Try again.');}finally{more.disabled=false;}});
   content.append(more);
  }
 }catch{requestError(content,()=>loadComparables(plate,host));}
}
const staticDetail=document.querySelector('[data-plate-detail]');
const query=normalize(staticDetail?.dataset.plateDetail || new URLSearchParams(location.search).get('q'));
if((staticDetail||document.body.dataset.decisionPage==='plate')&&validQuery(query)) {
 const historyHost=document.querySelector('#plateHistory');if(historyHost)loadHistory(query,historyHost);
 const host=staticDetail || document.querySelector('#plateComparables');
 if(host){const controls=make('div',null,'decision-actions');if(!historyHost)controls.append(saveButton(query));controls.append(link(text('我的清單及比較','My shortlist and comparison'),`/shortlist.html?lang=${lang}`));host.before(controls);loadComparables(query,host);refreshSaveButtons();}
 track('plate_detail',{plate:query});
}
function renderShortlist(){
 const host=document.querySelector('#shortlistItems');if(!host)return;
 const selected=new Set([...host.querySelectorAll('input:checked')].map(el=>el.value));host.replaceChildren();
 if(!saved.length)host.append(make('p',text('尚未收藏車牌。搜尋後按「收藏車牌」。','No saved plates yet. Search and choose Save plate.')),link(text('開始找車牌','Find a plate'),`/discover.html?lang=${lang}`));
 for(const plate of saved){const item=make('div',null,'decision-actions');const label=make('label');const input=make('input');input.type='checkbox';input.value=plate;input.checked=selected.has(plate);input.setAttribute('aria-label',text(`比較 ${plate}`,`Compare ${plate}`));add(label,input,document.createTextNode(' '+plate));add(item,label,link(text('查看紀錄','View history'),detailHref(plate)),saveButton(plate));host.append(item);}
 refreshSaveButtons();
}
renderShortlist();let comparisonVersion=0;
document.querySelector('#compareSelected')?.addEventListener('click',async()=>{
 const plates=[...document.querySelectorAll('#shortlistItems input:checked')].map(el=>el.value);const host=document.querySelector('#shortlistComparison');
 if(!plates.length||plates.length>4){host.replaceChildren(make('p',text('請選 1 至 4 個車牌。','Select one to four plates.')));return;}
 const version=++comparisonVersion;host.replaceChildren(make('p',text('讀取比較中…','Loading comparison…')));
 const records=await Promise.allSettled(plates.map(q=>getJson('/api/search?'+new URLSearchParams({dataset:'all',q,mode:'exact',sort:'date_desc',page_size:'1'}))));if(version!==comparisonVersion)return;
 host.replaceChildren(make('h2',text('最近一次歷史拍賣結果（不是現時估價）','Latest historical auction results (not current valuations)')));const list=make('div',null,'decision-results');
 records.forEach((record,i)=>{if(record.status==='fulfilled'&&record.value.rows?.length)list.append(rowCard(record.value.rows[0]));else list.append(make('p',plates[i]+' — '+(record.status==='rejected'?text('未能讀取，請重試比較。','Could not load; retry comparison.'):text('沒有收錄紀錄。','No indexed record.'))));});host.append(list);refreshSaveButtons();track('compare_view',{result_count:plates.length});
});
addEventListener('storage',event=>{if(event.key===storageKey){readSaved();renderShortlist();refreshSaveButtons();}});
for(const button of document.querySelectorAll('[data-calendar]'))button.addEventListener('click',async()=>{
 button.disabled=true;const status=document.querySelector('#calendarStatus');
 try{const data=await getJson('/data/events.json');const event=data.events?.find(item=>item.id===button.dataset.calendar);if(!event)throw new Error('event_changed');
 const source=event[`action_url_${lang}`]||event[`source_url_${lang}`]||'';const sourceParsed=new URL(source);if(sourceParsed.protocol!=='https:'||!['td.gov.hk','www.td.gov.hk','e-auction.td.gov.hk'].includes(sourceParsed.hostname))throw new Error('invalid_source');
 const title=button.closest('section').querySelector(`[data-lang-only=${lang}]`)?.textContent||'Plate.hk auction';
 const blob=new Blob([calendarEvent(event,title,source)],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=link('',url);a.download='platehk-auction.ics';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 status.textContent=text('日曆已下載。請在日曆程式確認提醒；此檔案不會自動更新。','Calendar downloaded. Confirm the reminder in your calendar app; this file does not update automatically.');track('calendar_save',{action:event.type});
 }catch{status.textContent=text('日程可能已更新或未能讀取，請重新載入並核對官方頁面。','The schedule may have changed or failed to load. Reload and check the official page.');}finally{button.disabled=false;}
});
