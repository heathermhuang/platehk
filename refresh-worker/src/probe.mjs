// The same bounded source observer is exercised by Node tests and the Cron Worker.
const TD = 'https://www.td.gov.hk';
export const INDEXES = [
  `${TD}/tc/public_services/vehicle_registration_mark/pvrm_auction/index.html`,
  `${TD}/tc/public_services/vehicle_registration_mark/tvrm_auction/index.html`,
  `${TD}/en/public_services/vehicle_registration_mark/index.html`,
  `${TD}/tc/public_services/vehicle_registration_mark/index.html`,
];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function officialUrl(value) {
  try {
    const url = new URL(value, TD);
    if (url.protocol !== 'https:' || url.hostname !== 'www.td.gov.hk' || url.port || url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.split('/').map(part => encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
    return url.href;
  } catch { return null; }
}
function text(value) { return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim(); }
export function anchors(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => {
      let context=text(match[2]);
      for (const tag of ['li','td','p']) {
        const start=html.lastIndexOf(`<${tag}`,match.index), closed=html.lastIndexOf(`</${tag}>`,match.index);
        const end=html.indexOf(`</${tag}>`,match.index+match[0].length);
        if (start>closed && end>=0 && end-start<8000) {context=text(html.slice(start,end));break;}
      }
      return [officialUrl(match[1].replace(/&amp;/g, '&')),text(match[2]),context];
    }).filter(item => item[0]);
}
export function resultKind(url, index = '') {
  const decoded = decodeURIComponent(url);
  if (!/\.pdf$/i.test(decoded) || /Notes|重要事項|須知|\bmaps?\b|路線|指示圖/i.test(decoded)) return null;
  if (/E-Auction.*Result|Online_Auction_Result_NSRM/i.test(decoded)) return 'eauction';
  if (/tvrm_auction_result_|TVRMs?\s+Auction\s+Result/i.test(decoded)) return 'physical';
  if (/pvrm_auction/.test(index) || /pvrm.*result|LNY.*Auction/i.test(decoded)) return 'pvrm';
  return null;
}
export function dateFromUrl(url) {
  const value = decodeURIComponent(url);
  const numeric = /(20\d{2})(\d{2})(\d{2})/.exec(value);
  if (numeric) return `${numeric[1]}-${numeric[2]}-${numeric[3]}`;
  const named = new RegExp(`(?:^|\\D)(\\d{1,2})(?:-\\d{1,2})?\\s+(${MONTHS.join('|')})\\s+(20\\d{2})`, 'i').exec(value);
  if (named) return `${named[3]}-${String(MONTHS.findIndex(m => m.toLowerCase() === named[2].toLowerCase()) + 1).padStart(2,'0')}-${named[1].padStart(2,'0')}`;
  const range = new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})-\\d{1,2}\\s+(${MONTHS.join('|')})\\s+(20\\d{2})`, 'i').exec(value);
  if (range) return `${range[4]}-${String(MONTHS.findIndex(m => m.toLowerCase() === range[2].toLowerCase()) + 1).padStart(2,'0')}-${range[1].padStart(2,'0')}`;
  return '';
}
export async function boundedRead(response, limit) {
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('source_too_large');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error('source_too_large');
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function sourceFetch(url, fetcher = fetch, method = 'GET') {
  if (!officialUrl(url)) throw new Error('untrusted_source');
  const response = await fetcher(url, {method, redirect:'manual', signal:AbortSignal.timeout(15000), headers:{'User-Agent':'PlateHKSourceMonitor/1.0'}});
  if (response.status >= 300 && response.status < 400) {
    const next = officialUrl(new URL(response.headers.get('location') || '', url).href);
    if (!next) throw new Error('untrusted_source_redirect');
    const redirected = await fetcher(next, {method, redirect:'error', signal:AbortSignal.timeout(15000)});
    return redirected;
  }
  return response;
}
export function discoveryCandidates(sources, now) {
  const dates = {physical:'',eauction:''};
  for (const [url, item] of Object.entries(sources)) if (item.kind in dates) dates[item.kind] = [dates[item.kind], item.date || dateFromUrl(url)].sort().at(-1);
  const candidates = [];
  for (let days = 0; days <= 35; days++) {
    const d = new Date(now.getTime() - days * 86400000), iso = d.toISOString().slice(0,10);
    if ([0,6].includes(d.getUTCDay()) && iso > dates.physical) candidates.push({kind:'physical', date:iso, url:`${TD}/filemanager/tc/content_4804/tvrm_auction_result_${iso.replaceAll('-','')}_chi.pdf`});
    if (d.getUTCDay() !== 4 || iso <= dates.eauction) continue;
    const end = new Date(d.getTime() + 4 * 86400000);
    const names = new Set([`${d.getUTCDate()}-${end.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,`${d.getUTCDate()}-${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`]);
    if (d.getUTCMonth() !== end.getUTCMonth()) for (const space of [' ', '  ']) names.add(`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}-${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}${space}${end.getUTCFullYear()}`);
    for (const name of names) for (const [folder, suffixes] of [['tc',['.Chin.pdf','_ch.pdf','_chi.pdf']],['sc',['.Chin.pdf','_ch.pdf','_chi.pdf']],['en',['.Eng.pdf','_en.pdf']]]) for (const suffix of suffixes) candidates.push({kind:'eauction',date:iso,url:officialUrl(`${TD}/filemanager/${folder}/content_4804/E-Auction Result Handout ${name}${suffix}`)});
  }
  return candidates.filter(item => !sources[item.url]).sort((a,b) => a.url.localeCompare(b.url));
}
function rotated(items, size, cursor) {
  if (items.length <= size) return items;
  return Array.from({length:size}, (_,i) => items[(cursor * size + i) % items.length]);
}
export async function observe(published = {}, {fetcher = fetch, now = new Date(), cursor = 0} = {}) {
  const known = published.sources || {};
  const results = new Map(); const calendar = []; const indexEntries=[];
  for (const [i, url] of INDEXES.entries()) {
    const response = await sourceFetch(url, fetcher);
    if (!response.ok) throw new Error(`index_http_${response.status}`);
    const html = new TextDecoder().decode(await boundedRead(response, 4 * 1024 * 1024));
    if (!/<html\b/i.test(html)) throw new Error('index_not_html');
    const links = anchors(html);
    if (i < 2) {
      const before = results.size;
      for (const item of links) { const href=item[0],kind = resultKind(href,url); if (kind) {results.set(href,{url:href,kind,date:dateFromUrl(href)});indexEntries.push(item);} }
      if (results.size === before) throw new Error('result_index_empty');
    } else {
      // The official auction/application links carry the calendar semantics; navigation and page timestamps do not.
      const relevant = links.filter(([href]) => /content_4802|pvrm|tvrm|E-Auction|auction|application/i.test(decodeURIComponent(href)));
      if (!relevant.length) throw new Error('calendar_index_empty');
      calendar.push(...relevant.map(item => [url,...item]));
    }
  }
  const indexUrls = [...results.keys()].sort();
  indexEntries.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const candidates = rotated(discoveryCandidates(known,now),12,cursor);
  const errors = [];
  for (const item of candidates) {
    try {
      const response = await sourceFetch(item.url,fetcher,'HEAD');
      if (response.ok) results.set(item.url,item);
      else if (![404,410].includes(response.status)) errors.push({url:item.url,error:`discovery_http_${response.status}`});
    } catch { errors.push({url:item.url,error:'discovery_unavailable'}); }
  }
  const linked = [...results.keys()].sort();
  const combined = new Map(Object.entries(known).map(([url,item]) => [url,{url,...item}]));
  for (const [url,item] of results) combined.set(url,{...combined.get(url),...item});
  const all = [...combined.values()].sort((a,b) => a.url.localeCompare(b.url));
  const recent = all.filter(item => item.date >= new Date(now.getTime()-35*86400000).toISOString().slice(0,10));
  const archive = all.filter(item => !recent.includes(item));
  const selected = [...rotated(recent,8,cursor),...rotated(archive,4,cursor)];
  // New links outside a recent window are still observed in bounded subsequent polls.
  const newLinks = [...results.values()].filter(item => !known[item.url]);
  for (const item of rotated(newLinks,4,cursor)) if (!selected.some(x => x.url === item.url)) selected.push(item);
  const updates = [];
  for (const item of selected) {
    try {
      const response = await sourceFetch(item.url,fetcher);
      if (!response.ok) throw new Error(`pdf_http_${response.status}`);
      const bytes = await boundedRead(response,8*1024*1024);
      if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('source_not_pdf');
      const sha256 = await digest(bytes);
      if (sha256 !== known[item.url]?.sha256) updates.push({...item,sha256});
    } catch (error) { errors.push({url:item.url,error:error.message}); }
  }
  const indexesChanged = JSON.stringify(indexUrls) !== JSON.stringify(published.index_urls || []) || JSON.stringify(indexEntries) !== JSON.stringify(published.index_entries || []);
  const calendarDigest = await digest(JSON.stringify({links:calendar.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),month:new Date(now.getTime()+8*3600000).toISOString().slice(0,7)}));
  const auctionChanged = !published.sources || indexesChanged || updates.length > 0;
  return {index_urls:indexUrls,index_entries:indexEntries,updates,source_errors:errors,calendar_digest:calendarDigest,auction_changed:auctionChanged,calendar_changed:calendarDigest !== published.calendar_digest,digest:await digest(JSON.stringify({indexEntries,updates,calendarDigest})),checked_at:now.toISOString(),sources_observed:selected.length};
}
