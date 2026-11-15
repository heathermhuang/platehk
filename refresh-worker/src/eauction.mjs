// Public result downloads used by TD's E-Auction history page. No account is used.
export const HISTORY_URL = 'https://e-auction.td.gov.hk/en/auctions/history';
const QUEUE_HOST = 'roomq-ticket-issuer-lrc3oohpsa-df.a.run.app';
const MAX_BYTES = 8 * 1024 * 1024;
const validDate = value => /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function resultReference(value) {
  try {
    const url = new URL(value);
    const id = url.searchParams.get('result'), date = url.searchParams.get('date');
    if (url.origin !== new URL(HISTORY_URL).origin || url.pathname !== '/en/auctions/history' || url.username || url.password || url.hash || url.port || !/^[1-9]\d{0,8}$/.test(id || '') || !validDate(date || '') || [...url.searchParams].length !== 2) return null;
    return `${HISTORY_URL}?result=${id}&date=${date}`;
  } catch { return null; }
}
export function historyEntries(html) {
  const fragments=[];
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    const value=JSON.parse(match[1]);
    if (value[0] === 1 && typeof value[1] === 'string') fragments.push(value[1]);
  }
  const entries=new Map();
  for (const match of fragments.join('').matchAll(/"id":([1-9]\d{0,8}),"period":"(20\d{2}-\d{2}-\d{2}) - (20\d{2}-\d{2}-\d{2})"/g)) {
    const [,id,date,end_date]=match;
    if (!validDate(date) || !validDate(end_date) || date>end_date || Date.parse(end_date)-Date.parse(date)>7*86400000) throw Error('eauction_invalid_period');
    const item={id:Number(id),date,end_date,kind:'eauction',url:`${HISTORY_URL}?result=${id}&date=${date}`};
    if (entries.has(id) && JSON.stringify(entries.get(id)) !== JSON.stringify(item)) throw Error('eauction_conflicting_period');
    entries.set(id,item);
  }
  if (!entries.size || entries.size>12 || new Set([...entries.values()].map(item=>item.date)).size !== entries.size) throw Error('eauction_history_unverified');
  return [...entries.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
export async function limitedRead(response, limit=MAX_BYTES) {
  if (Number(response.headers.get('content-length') || 0)>limit) {await response.body?.cancel();throw Error('eauction_response_too_large');}
  const reader=response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks=[];let size=0;
  try {
    for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('eauction_response_too_large');chunks.push(value);}
  } finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
export function decodeDownload(bytes) {
  // React Flight text chunks use a hexadecimal UTF-8 byte length, not a newline.
  const decoder=new TextDecoder(), texts=new Map(), records=[];let offset=0;
  while (offset<bytes.length) {
    let colon=offset;while(colon<bytes.length && bytes[colon]!==58)colon++;
    const id=decoder.decode(bytes.slice(offset,colon));
    if (!/^[a-f0-9]+$/.test(id)) throw Error('eauction_invalid_download');
    offset=colon+1;
    if (bytes[offset]===84) {
      let comma=offset;while(comma<bytes.length && bytes[comma]!==44)comma++;
      const size=Number.parseInt(decoder.decode(bytes.slice(offset+1,comma)),16);
      if (!Number.isSafeInteger(size) || size<0 || comma+1+size>bytes.length) throw Error('eauction_invalid_download');
      texts.set(id,decoder.decode(bytes.slice(comma+1,comma+1+size)));offset=comma+1+size;
    } else {
      let end=offset;while(end<bytes.length && bytes[end]!==10)end++;
      try {records.push(JSON.parse(decoder.decode(bytes.slice(offset,end))));} catch {}
      offset=end+1;
    }
  }
  const payloads=records.filter(item=>item?.action===0 && item?.data && typeof item.data.fileName==='string' && typeof item.data.base64==='string');
  if (payloads.length!==1) throw Error('eauction_invalid_download');
  const data=payloads[0].data, encoded=data.base64.startsWith('$') ? texts.get(data.base64.slice(1)) : data.base64;
  if (!/^Online_Auction_Result_NSRM-[\w-]+\.pdf$/.test(data.fileName) || !encoded || encoded.length%4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('eauction_invalid_download');
  const raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  if (decoder.decode(raw.slice(0,5))!=='%PDF-' || raw.length>MAX_BYTES) throw Error('eauction_invalid_pdf');
  return {bytes:raw,file_name:data.fileName};
}
export function createEauctionClient(fetcher=fetch) {
  // Request-local, host-scoped cookies follow the site's normal public queue.
  const cookies=new Map();let listing,action;
  async function request(initial,options={}) {
    let url=new URL(initial), method=options.method || 'GET';
    for (let hop=0;hop<7;hop++) {
      const site=url.origin===new URL(HISTORY_URL).origin;
      if (url.protocol!=='https:' || url.username || url.password || url.port || (!site && !(url.hostname===QUEUE_HOST && url.pathname==='/tickets')) || (!site && method!=='GET')) throw Error('eauction_untrusted_redirect');
      const headers=new Headers(options.headers);
      if (!site) {headers.delete('Next-Action');headers.delete('Origin');}
      const jar=cookies.get(url.hostname) || new Map();
      if (jar.size) headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
      const response=await fetcher(url.href,{...options,method,body:method==='GET' ? undefined : options.body,headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
      for (const cookie of response.headers.getSetCookie()) {
        const pair=cookie.split(';',1)[0], split=pair.indexOf('=');
        if (split>0 && pair.slice(0,split)!=='Path') jar.set(pair.slice(0,split),pair.slice(split+1));
      }
      cookies.set(url.hostname,jar);
      if (response.status>=300 && response.status<400) {
        const next=response.headers.get('location');await response.body?.cancel().catch(()=>{});
        if (!next) throw Error('eauction_invalid_redirect');
        if (method!=='GET') throw Error('eauction_download_redirect');
        url=new URL(next,url);continue;
      }
      if (!response.ok) {await response.body?.cancel().catch(()=>{});throw Error(`eauction_http_${response.status}`);}
      return response;
    }
    throw Error('eauction_redirect_limit');
  }
  async function list() {
    if (!listing) {
      const html=new TextDecoder().decode(await limitedRead(await request(HISTORY_URL),2*1024*1024));
      const entries=historyEntries(html);
      const scripts=[...html.matchAll(/<script\b[^>]*src="([^"<>]+)"/g)].map(match=>match[1]).filter(path=>/^\/_next\/static\/chunks\/app\/%5Blang%5D\/auctions\/history\/page-[a-f0-9]+\.js$/.test(path));
      if (scripts.length!==1) throw Error('eauction_download_action_unverified');
      listing={entries,script:new URL(scripts[0],HISTORY_URL).href};
    }
    return listing.entries;
  }
  async function download(reference) {
    const canonical=resultReference(reference);
    if (!canonical) throw Error('eauction_invalid_reference');
    const entries=await list(), item=entries.find(entry=>entry.url===canonical);
    if (!item) throw Error('eauction_result_not_listed');
    if (!action) {
      const script=new TextDecoder().decode(await limitedRead(await request(listing.script),1024*1024));
      const actions=[...script.matchAll(/,\w+=\(0,\w+\.\$\)\("([a-f0-9]{40,64})"\)/g)].map(match=>match[1]);
      if (actions.length!==1) throw Error('eauction_download_action_unverified');
      action=actions[0];
    }
    const response=await request(HISTORY_URL,{method:'POST',headers:{'Next-Action':action,'Content-Type':'text/plain;charset=UTF-8','Accept':'text/x-component','Origin':new URL(HISTORY_URL).origin},body:JSON.stringify([item.id])});
    return {...decodeDownload(await limitedRead(response)),...item};
  }
  return {list,download};
}
