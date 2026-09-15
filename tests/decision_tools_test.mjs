import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalize, validQuery, parseFilters, matchesFilters, comparableRows, calendarEvent } from '../assets/decision-core.mjs';
import { normalizeSearchQuery, normalizeQuery } from '../cloudflare-worker/src/lib.mjs';
import worker from '../cloudflare-worker/src/index.mjs';
globalThis.caches = { default: { async match(){return undefined;}, async put(){} } };

test('full-width and spaced input share a key; invalid characters are not silently discarded',()=>{
 for(const input of ['AA88','aa 88','ＡＡ８８']){assert.equal(normalize(input),'AA88');assert.equal(normalizeSearchQuery(input),'AA88');}
 for(const input of ['Q','ＡＱ８８','AB!88','車牌',''])assert.equal(validQuery(input),false);
 assert.equal(normalizeSearchQuery('Q'),'Q');assert.equal(normalizeQuery('Q'),''); // OCR normalization stays compatible.
 assert.equal(normalize('I LOVE U'),'1L0VEU');
});
test('price, shape, pattern and precise date filters exclude missing and coarse values',()=>{
 const f=parseFilters(new URLSearchParams('prefix=AA&suffix=88&digits=4&pattern=palindrome&max_amount=50000&from=2020-01-01'));
 const row={single_line:'AA 8888',amount_hkd:20000,auction_date:'2026-01-01',date_precision:'day'};
 assert.ok(matchesFilters(row,f));
 for(const changes of [{amount_hkd:null},{amount_hkd:60000},{year_range:'2020-2026'},{single_line:'BB8888'},{single_line:'AA1888'},{auction_date:'2010-01-01'}])assert.equal(matchesFilters({...row,...changes},f),false);
 for(const raw of ['max_amount=-1','min_amount=20&max_amount=10','digits=99','pattern=unknown','from=2026-02-30','prefix=Q'])assert.throws(()=>parseFilters(new URLSearchParams(raw)));
});
const meta={schema_version:1,row_metadata:[['pvrm','pvrm::2026-01-03','2026-01-03','2026-01-03','day',null,false,'https://www.td.gov.hk/example.pdf',null,null,null,null]],result_states:[['sold','sold']],char_counts:{8:126,A:126},bigram_counts:{AA:1,A8:126,88:126}};
const rows=[ [0,'AA88',null,150000,0], ...Array.from({length:125},(_,i)=>[0,`A88${String(i).padStart(3,'0')}`,null,100000-i,0]) ];
const env={ASSETS:{async fetch(request){const p=new URL(request.url).pathname;if(p.endsWith('/search-index/meta.json'))return Response.json(meta);if(p.includes('/search-index/'))return Response.json({rows});if(p.includes('overlap'))return Response.json({keys:[],exact_keys:[]});return new Response('not found',{status:404});}}};
let ip=1;async function api(query){const req=new Request('https://decision-tests.invalid/api/search?'+query,{headers:{'cf-connecting-ip':`192.0.2.${ip++}`}});return worker.fetch(req,env,{waitUntil(){}});}
test('Worker applies filters to complete candidate set before pagination',async()=>{
 const response=await api('dataset=all&q=88&max_amount=99880&page_size=2&page=2');assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.total,5);assert.equal(data.rows.length,2);assert.equal(data.rows[0].amount_hkd,99878);
});
test('Worker exact mode and full-width query preserve exact results; Q gives an explicit 400',async()=>{
 const response=await api('dataset=all&q='+encodeURIComponent('ＡＡ８８')+'&mode=exact');const data=await response.json();assert.equal(response.status,200);assert.equal(data.total,1);assert.equal(data.rows[0].single_line,'AA88');
 assert.equal((await api('dataset=all&q=Q')).status,400);
 assert.equal((await api('dataset=all&q=88&min_amount=10&max_amount=1')).status,400);
});
test('comparables stay in the same dataset and shape, exclude null and duplicate plate observations',()=>{
 const target={single_line:'AA88',dataset_key:'tvrm_physical'};
 const candidate={single_line:'BB88',dataset_key:'tvrm_physical',amount_hkd:20000,auction_date:'2025-01-01'};
 const out=comparableRows(target,[candidate,{...candidate,auction_date:'2026-01-01'},{...candidate,single_line:'CC88',dataset_key:'pvrm'},{...candidate,single_line:'B888'},{...candidate,single_line:'DD88',amount_hkd:null},{...candidate,single_line:'EE88',year_range:'1990-1999'}],'88');
 assert.equal(out.length,1);assert.equal(out[0].auction_date,'2026-01-01');assert.equal(out[0].match_text,'88');
});
test('calendar downloads use UTC, stable UID, escaped text, UTF-8 folding and one-day reminder',()=>{
 const event={id:'eauction-2026-09-17',start_at:'2026-09-17T12:00:00+08:00',end_at:'2026-09-21T12:00:00+08:00'};
 const ics=calendarEvent(event,'拍賣'.repeat(50)+'\nInjected, text','https://www.td.gov.hk/',new Date('2026-09-15T00:00:00Z'));
 assert.ok(ics.includes('DTSTART:20260917T040000Z'));assert.ok(ics.includes('TRIGGER:-P1D'));assert.ok(ics.includes('UID:eauction-2026-09-17@plate.hk'));
 assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75));assert.ok(!ics.includes('\nInjected'));
 assert.throws(()=>calendarEvent({...event,end_at:event.start_at},'Auction','https://www.td.gov.hk/'));
});
test('analytics honors non-production/DNT and only emits allowlisted parameters',()=>{
 const code=readFileSync(new URL('../assets/analytics.js',import.meta.url),'utf8');
 const run=(hostname,dnt)=>{const context={location:{hostname,origin:`https://${hostname}`,pathname:'/'},navigator:{doNotTrack:dnt},localStorage:{getItem:()=>null},document:{referrer:'https://example.test/?private=secret',head:{appendChild(){}},createElement:()=>({}),addEventListener(){}},URL,Date,Set};context.window=context;vm.runInNewContext(code,context);return context;};
 for(const c of [run('localhost','0'),run('plate.hk','1')]){c.PlateAnalytics.track('search_complete',{result_count:2});assert.equal(c.dataLayer,undefined);}
 const c=run('plate.hk','0');c.PlateAnalytics.track('search_complete',{result_count:5,phone:'private',message:'private',plate:'AA88'});
 const event=c.dataLayer.at(-1);assert.equal(event[1],'search_complete');assert.equal(event[2].result_count,5);assert.equal(event[2].phone,undefined);assert.equal(event[2].message,undefined);assert.equal(c.dataLayer[2][2].page_location,'https://plate.hk/');
});
