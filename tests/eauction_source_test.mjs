import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEauctionClient,historyEntries,resultReference,decodeDownload,HISTORY_URL} from '../refresh-worker/src/eauction.mjs';
const reference=`${HISTORY_URL}?result=78&date=2026-11-05`;
const entries=[{id:78,period:'2026-11-05 - 2026-11-09'},{id:76,period:'2026-10-22 - 2026-10-26'},{id:74,period:'2026-10-08 - 2026-10-12'}];
const script='/_next/static/chunks/app/%5Blang%5D/auctions/history/page-5ba4c5e46de11c10.js';
function page(items=entries) {return `<html><script src="${script}"></script><script>self.__next_f.push(${JSON.stringify([1,JSON.stringify(items)])})</script></html>`;}
function download(raw='%PDF-fixture') {const base64=btoa(raw);return new TextEncoder().encode(`0:["$@1"]\na:T${base64.length.toString(16)},${base64}1:${JSON.stringify({action:0,data:{base64:'$a',fileName:'Online_Auction_Result_NSRM-26-11-01_en.pdf'}})}\n`);}
test('real published history shape identifies every newer round and rejects partial or conflicting data',()=>{
 assert.deepEqual(historyEntries(page()).map(item=>item.date),['2026-11-05','2026-10-22','2026-10-08']);
 assert.throws(()=>historyEntries('<html>Queue</html>'),/unverified/);
 assert.throws(()=>historyEntries(page([{id:78,period:'2026-02-30 - 2026-03-02'}])),/invalid_period/);
 assert.throws(()=>historyEntries(page([...entries,{id:78,period:'2026-11-06 - 2026-11-09'}])),/conflicting/);
});
test('references are limited to the public result page and exact round identity',()=>{
 assert.equal(resultReference(reference),reference);
 for(const value of [reference+'&x=1',reference+'#secret',reference.replace('https:','http:'),reference.replace('td.gov.hk','evil.test'),reference.replace('78','0'),reference.replace('2026-11-05','2026-02-30')]) assert.equal(resultReference(value),null);
});
test('length-delimited Flight payload returns original PDF bytes; malformed and non-PDF output is held',()=>{
 assert.equal(new TextDecoder().decode(decodeDownload(download()).bytes),'%PDF-fixture');
 for(const bytes of [download('not a PDF'),download().slice(0,40),new TextEncoder().encode('1:{"data":{"base64":"foo"}}\n')]) assert.throws(()=>decodeDownload(bytes));
});
test('normal queue, host-scoped cookies and the discovered download action work without login',async()=>{
 const calls=[];let history=0;
 const client=createEauctionClient(async(url,options)=>{
  calls.push({url,options});
  if(url===HISTORY_URL && options.method==='GET' && history++===0) return new Response(null,{status:302,headers:{'set-cookie':'public_ticket=fixture; Path=/; Secure','location':'https://roomq-ticket-issuer-lrc3oohpsa-df.a.run.app/tickets?fixture=1'}});
  if(url.includes('/tickets?')) {assert.equal(options.headers.has('Cookie'),false);return new Response(null,{status:302,headers:{location:HISTORY_URL}});}
  if(url===HISTORY_URL && options.method==='GET') {assert.equal(options.headers.get('Cookie'),'public_ticket=fixture');return new Response(page());}
  if(url.endsWith('.js')) return new Response(`var r=n(12119),i=(0,r.$)("${'a'.repeat(40)}");(0,r.$)("${'b'.repeat(40)}");`);
  assert.equal(url,HISTORY_URL);assert.equal(options.method,'POST');assert.equal(options.headers.get('Next-Action'),'a'.repeat(40));assert.equal(options.body,'[78]');return new Response(download());
 });
 assert.equal((await client.list()).length,3);assert.equal((await client.download(reference)).date,'2026-11-05');assert.equal(calls.length,5);
 await assert.rejects(client.download(reference.replace('78','99')),/not_listed/);
});
test('a redirect or changed download contract is an explicit source failure',async()=>{
 const hostile=createEauctionClient(async()=>new Response(null,{status:302,headers:{location:'https://evil.test/tickets'}}));
 await assert.rejects(hostile.list(),/untrusted_redirect/);
 const changed=createEauctionClient(async(url)=>new Response(url===HISTORY_URL ? page() : 'changed code'));
 await assert.rejects(changed.download(reference),/action_unverified/);
});

test('a new official platform round triggers an import even when all PDF links are unchanged',async()=>{
 const {observe,digest,INDEXES}=await import('../refresh-worker/src/probe.mjs');
 const pdf='https://www.td.gov.hk/filemanager/tc/content_4804/tvrm_auction_result_20261107_chi.pdf';
 const fetcher=async(url,options={})=>options.method==='HEAD' ? new Response(null,{status:404}) : INDEXES.includes(url) ? new Response(`<html><a href="${pdf}">7 November 2026</a></html>`) : new Response('%PDF-fixture');
 const now=new Date('2026-11-15T04:00:00Z'),source={...historyEntries(page())[0],sha256:'a'.repeat(64),content_sha256:'c'.repeat(64)};
 const first=await observe({}, {fetcher,now,eauction:{checked_at:now.toISOString(),sources:[source]}});
 const published={sources:{[pdf]:{kind:'physical',date:'2026-11-07',sha256:await digest('%PDF-fixture')},[source.url]:{...source,consumers:['eauction']}},index_urls:first.index_urls,index_entries:first.index_entries,calendar_digest:first.calendar_digest};
 const unchanged=await observe(published,{fetcher,now,eauction:{checked_at:now.toISOString(),sources:[{...source,sha256:'b'.repeat(64)}]}});
 assert.equal(unchanged.auction_changed,false);assert.deepEqual(unchanged.updates,[]);assert.deepEqual(unchanged.source_errors,[]);
 const corrected=await observe(published,{fetcher,now,eauction:{checked_at:now.toISOString(),sources:[{...source,sha256:'b'.repeat(64),content_sha256:'d'.repeat(64)}]}});
 assert.equal(corrected.updates.length,1);assert.equal(corrected.updates[0].sha256,'b'.repeat(64));
 const next=historyEntries(page())[1];
 const missing=await observe(published,{fetcher,now,eauction:{checked_at:now.toISOString(),sources:[source,{...next,sha256:'e'.repeat(64),content_sha256:'f'.repeat(64)}]}});
 assert(missing.updates.some(item=>item.url===next.url));assert.equal(missing.auction_changed,true);
 for(const observation of [null,{checked_at:'2026-11-14T00:00:00Z',sources:[source]},{checked_at:now.toISOString(),sources:[]}]) {
  const result=await observe(published,{fetcher,now,eauction:observation});
  assert(result.source_errors.some(item=>item.error==='eauction_observation_overdue'));
 }
});
