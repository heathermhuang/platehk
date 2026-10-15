import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker,{recordObservation,claim,combineObservation} from '../refresh-worker/src/index.mjs';
import {observe,digest,officialUrl,boundedRead,sourceFetch,discoveryCandidates,INDEXES,resultKind} from '../refresh-worker/src/probe.mjs';

// Miniflare 5 requires the complete source graph, even through its v4 converter.
const refreshModules=['index.mjs','probe.mjs'].map(name=>({type:'ESModule',path:new URL(`../refresh-worker/src/${name}`,import.meta.url).pathname}));

const pvrm='https://www.td.gov.hk/filemanager/tc/content_4806/pvrm_result_20261003_chi.pdf';
const physical='https://www.td.gov.hk/filemanager/tc/content_4804/tvrm_auction_result_20261003_chi.pdf';
const bytes=new TextEncoder().encode('%PDF-fixture');
function upstream({extra='',changed=null,physicalChanged=false,indexStatus=200,pdfStatus=200}={}) {
  return async (url,options={}) => {
    if (options.method==='HEAD') return new Response(null,{status:404});
    if (INDEXES.includes(url)) {
      if (indexStatus!==200) return new Response('unavailable',{status:indexStatus});
      const link=url.includes('/ar/index.html')?physical:INDEXES.indexOf(url)<INDEXES.length-2?pvrm:'https://www.td.gov.hk/filemanager/tc/content_4802/auction.pdf';
      return new Response(`<html><a href="${link}">3 October 2026</a>${url===INDEXES[0]?extra:''}</html>`);
    }
    return new Response(changed && url===pvrm ? '%PDF-correction' : physicalChanged && url===physical ? '%PDF-physical-correction' : bytes,{status:pdfStatus});
  };
}
async function migrate(db) {
  const dir=new URL('../refresh-worker/migrations/',import.meta.url);
  for (const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()) {
    const schema=await readFile(new URL(name,dir),'utf8');
    for (const statement of schema.split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
}
async function baseline() {
  const now=new Date();
  const first=await observe({}, {fetcher:upstream(),now});
  return {now,published:{sources:{[pvrm]:{kind:'pvrm',date:'2026-10-03',sha256:await digest(bytes)},[physical]:{kind:'physical',date:'2026-10-03',sha256:await digest(bytes)}},index_urls:first.index_urls,index_entries:first.index_entries,calendar_digest:first.calendar_digest}};
}

test('unchanged sources do not require an auction or calendar import',async()=>{
  const {now,published}=await baseline();const result=await observe(published,{fetcher:upstream(),now});
  assert.equal(result.auction_changed,false);assert.equal(result.calendar_changed,false);assert.deepEqual(result.updates,[]);assert.deepEqual(result.source_errors,[]);
});
test('a new PDF and a same-URL correction both trigger verified inputs',async()=>{
  const {now,published}=await baseline();
  const correction=await observe(published,{fetcher:upstream({changed:true}),now});
  assert.equal(correction.auction_changed,true);assert.equal(correction.updates.length,1);assert.equal(correction.updates[0].sha256,await digest('%PDF-correction'));
  const added='https://www.td.gov.hk/filemanager/tc/content_4806/pvrm_result_20261004_chi.pdf';
  const result=await observe(published,{fetcher:upstream({extra:`<a href="${added}">4 October 2026</a>`}),now});
  assert.equal(result.auction_changed,true);assert(result.updates.some(item=>item.url===added));
});
test('network failures and malformed PDFs cannot become an unchanged success',async()=>{
  const {now,published}=await baseline();
  await assert.rejects(observe(published,{fetcher:upstream({indexStatus:503}),now}),/index_http_503/);
  const result=await observe(published,{fetcher:upstream({pdfStatus:503}),now});
  assert(result.source_errors.length>0);assert.equal(result.updates.length,0);
});
test('removed historical PDFs retain their published data without blocking current sources',async()=>{
  const {now,published}=await baseline();
  const retired='https://www.td.gov.hk/filemanager/tc/content_4804/tvrm_auction_result_20260912_chi.pdf';
  const source={kind:'physical',date:'2026-09-12',sha256:await digest(bytes),consumers:['physical']};
  published.sources[retired]=source;
  for (const status of [404,410]) {
    const fetcher=async(url,options)=>url===retired ? new Response('removed',{status}) : upstream()(url,options);
    const result=await observe(published,{fetcher,now,priority:[{url:retired}]});
    assert.deepEqual(result.source_errors,[]);assert.deepEqual(result.updates,[]);
    assert.equal(result.auction_changed,false);
    assert.deepEqual(result.retired_sources,[{url:retired,sha256:source.sha256,status,observed_at:now.toISOString()}]);
    assert.deepEqual(published.sources[retired],source);
    assert.equal(result.observed_hashes[retired],undefined);
  }
});
test('retirement never masks linked PDFs, new inputs, server errors or invalid content',async()=>{
  const {now,published}=await baseline();
  const archived='https://www.td.gov.hk/filemanager/tc/content_4804/tvrm_auction_result_20260912_chi.pdf';
  published.sources[archived]={kind:'physical',date:'2026-09-12',sha256:await digest(bytes),consumers:['physical']};
  const cases=[{url:physical,status:404},{url:physical,status:410},{url:archived,status:503},{url:archived,status:200,body:'not a PDF'},
    {url:archived,status:404,unpublished:true}];
  for (const item of cases) {
    const input=item.unpublished ? {...published,sources:{...published.sources,[archived]:undefined}} : published;
    if (item.unpublished) delete input.sources[archived];
    const fetcher=async(url,options)=>url===item.url ? new Response(item.body || 'unavailable',{status:item.status}) : upstream()(url,options);
    const result=await observe(input,{fetcher,now,priority:[{url:archived,kind:'physical',date:'2026-09-12'}]});
    assert(result.source_errors.some(error=>error.url===item.url),JSON.stringify(item));
    assert.deepEqual(result.retired_sources,[]);
  }
  for (const source of [{kind:'physical',date:'2026-09-12',sha256:'invalid',consumers:['physical']},
    {kind:'physical',date:'2026-09-12',sha256:await digest(bytes),consumers:[]}]) {
    const input={...published,sources:{...published.sources,[archived]:source}};
    const fetcher=async(url,options)=>url===archived ? new Response('removed',{status:404}) : upstream()(url,options);
    const result=await observe(input,{fetcher,now});
    assert(result.source_errors.some(error=>error.url===archived));assert.deepEqual(result.retired_sources,[]);
  }
});
test('calendar-only changes and registration month rollover stay independent',async()=>{
  const {now,published}=await baseline();
  const hkNow=new Date(now.getTime()+8*3600000);
  const rollover=new Date(Date.UTC(hkNow.getUTCFullYear(),hkNow.getUTCMonth()+1,1)-8*3600000);
  const result=await observe(published,{fetcher:upstream(),now:rollover});
  assert.equal(result.auction_changed,false);assert.equal(result.calendar_changed,true);
});
test('source URLs, redirects and oversized responses are bounded',async()=>{
  assert.equal(officialUrl('https://www.td.gov.hk@evil.test/a'),null);
  assert.equal(officialUrl('http://www.td.gov.hk/a'),null);
  await assert.rejects(sourceFetch(pvrm,async()=>new Response(null,{status:302,headers:{location:'https://evil.test/a'}})),/untrusted_source_redirect/);
  await assert.rejects(boundedRead(new Response('12345'),4),/source_too_large/);
  assert.equal(resultKind('https://www.td.gov.hk/filemanager/common/access%20maps%20of%20auction%20venue.pdf',INDEXES[0]),null);
  assert.equal(officialUrl('https://www.td.gov.hk/filemanager/common/result%20(2026).pdf'),'https://www.td.gov.hk/filemanager/common/result%20%282026%29.pdf');
});
test('calendar date changes in surrounding list text are detected even with unchanged links',async()=>{
  const {now,published}=await baseline();
  const fetcher=async(url,options)=>{
    if (INDEXES.slice(-2).includes(url)) return new Response('<html><li>12 October 2026 <a href="https://www.td.gov.hk/filemanager/tc/content_4802/auction.pdf">Handout</a></li></html>');
    return upstream()(url,options);
  };
  const result=await observe(published,{fetcher,now});assert.equal(result.calendar_changed,true);assert.equal(result.auction_changed,false);
});
// Minimized from TD's English/Chinese Coming Auction pages on 2026-10-14.
// The only action links use e-auction.td.gov.hk; there are no www.td.gov.hk PDF links.
const calendarTables = [
  '<table><tr><th>Date</th><th>Auction List</th></tr><tr><td>22 October noon to 26 October noon 2026</td><td>Please visit <a href="https://e-auction.td.gov.hk/en">E-Auction</a></td></tr></table>',
  '<table><tr><th>日期</th><th>⾞輛登記號碼拍賣名單</th></tr><tr><td>2026年10月22日中午至10月26日中午</td><td>參與網上拍賣詳情請瀏覽「<a href="https://e-auction.td.gov.hk/tc">拍牌易</a>」網頁</td></tr></table>',
];
const calendarPage = content => `<html><!-- CONTENT START -->${content}<!-- CONTENT END --></html>`;
test('linkless bilingual auction tables are observed and date changes trigger only calendar work',async()=>{
  const {now,published}=await baseline();
  const fetcher=async(url,options)=>INDEXES.slice(-2).includes(url)
    ? new Response(calendarPage(calendarTables[INDEXES.indexOf(url)-4])) : upstream()(url,options);
  const result=await observe(published,{fetcher,now});
  assert.equal(result.calendar_changed,true);assert.equal(result.auction_changed,false);
  assert.deepEqual(result.source_errors,[]);assert.deepEqual(result.updates,[]);
  const current={...published,calendar_digest:result.calendar_digest};
  assert.equal((await observe(current,{fetcher,now})).calendar_changed,false);
  const changed=async(url,options)=>url===INDEXES[4]
    ? new Response(calendarPage(calendarTables[0].replace('22 October','29 October'))) : fetcher(url,options);
  assert.equal((await observe(current,{fetcher:changed,now})).calendar_changed,true);
  const physical=calendarTables[0].replace('22 October noon to 26 October noon 2026','7 November 2026 (Sat)').replace(/<a.*?<\/a>/,'To be confirmed');
  assert.equal((await observe(published,{fetcher:async(url,options)=>url===INDEXES[4] ? new Response(calendarPage(physical)) : fetcher(url,options),now})).calendar_changed,true);
});
test('linkless calendar validation rejects missing content, dates and auction headers',async()=>{
  const {now,published}=await baseline();
  for (const html of ['<html>temporarily unavailable</html>',`<html>${calendarTables[0]}</html>`,
    calendarPage(calendarTables[0].replace('22 October noon to 26 October noon 2026','To be confirmed')),
    calendarPage(calendarTables[0].replace('22 October noon to 26 October noon 2026','99 October 2026')),
    calendarPage(calendarTables[0].replace('Auction List','Status')),
    calendarPage('<p>Coming Auction 22 October 2026</p>')]) {
    await assert.rejects(observe(published,{fetcher:async(url,options)=>url===INDEXES[4] ? new Response(html) : upstream()(url,options),now}),/calendar_index_empty/);
  }
});
test('authenticated source failures include a bounded cause and the failing official page',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'calendar-error'},r2Buckets:{STORE:'calendar-error'}}));
  const originalFetch=globalThis.fetch;
  try {
    const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');await migrate(DB);
    const env={DB,STORE,CONTROL_TOKEN:'fixture-control',PRODUCTION_URL:'https://production.test'};
    globalThis.fetch=async(url,options)=>url===INDEXES[4] ? new Response(calendarPage('<p>No schedule</p>')) : upstream()(url,options);
    const request=()=>new Request('https://refresh.test/v1/claim',{method:'POST',headers:{Authorization:'Bearer fixture-control'},body:JSON.stringify({scope:'check'})});
    const response=await worker.fetch(request(),env);
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'refresh_failed',cause:'calendar_index_empty',source_url:INDEXES[4]});
    globalThis.fetch=async()=>{throw new Error('internal diagnostic must stay private');};
    assert.deepEqual(await (await worker.fetch(request(),env)).json(),{error:'refresh_failed'});
  } finally {globalThis.fetch=originalFetch;await mf.dispose();}
});
test('discovery keeps cross-month filename variants and rotates a bounded batch',()=>{
  const candidates=discoveryCandidates({},new Date('2026-10-05T01:00:00Z'));
  assert(candidates.some(item=>decodeURIComponent(item.url).includes('24-28 September 2026')));
  assert(candidates.some(item=>decodeURIComponent(item.url).includes('E-Auction Result Handout 1-5 October 2026')));
});
test('private control and snapshot routes require authentication',async()=>{
  for(const path of ['/v1/status','/v1/market','/v1/market-contacts','/v1/ack']) {
    const response=await worker.fetch(new Request(`https://test.invalid${path}`),{CONTROL_TOKEN:'test-token'});
    assert.equal(response.status,404);
  }
  const health=await worker.fetch(new Request('https://test.invalid/health'),{DISPATCH_ENABLED:'false'});
  assert.deepEqual(await health.json(),{ok:true,service:'platehk-refresh',observer_enabled:false,dispatch_enabled:false,source_revision:'unversioned'});
});

test('unrelated publications retain corrections; acknowledgement, supersession and reversions clear them',()=>{
  const published={sources:{[pvrm]:{sha256:'original'}}};
  const previous={published_revision:'one',updates:[{url:pvrm,sha256:'corrected',baseline_sha256:'original'}]};
  const probe={updates:[],observed_hashes:{},auction_changed:false};
  assert.equal(combineObservation(probe,previous,published,'one').updates.length,1);
  assert.equal(combineObservation({...probe,observed_hashes:{[pvrm]:'original'}},previous,published,'one').updates.length,0);
  assert.equal(combineObservation(probe,previous,published,'two').updates.length,1);
  assert.equal(combineObservation(probe,previous,{sources:{[pvrm]:{sha256:'corrected'}}},'two').updates.length,0);
  assert.equal(combineObservation(probe,previous,{sources:{[pvrm]:{sha256:'newer'}}},'two').updates.length,0);
});

test('credential-free observation stores a fresh plan that collection reuses without another TD scan',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'observe-test'},r2Buckets:{STORE:'observe-test'}}));
  const originalFetch=globalThis.fetch;
  try {
    const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');
    await migrate(DB);
    const {published}=await baseline();
    await STORE.put('published.json',JSON.stringify(published));
    const env={DB,STORE,PRODUCTION_URL:'https://production.test',CONTROL_TOKEN:'fixture-control'};
    const result=await recordObservation(env,{fetcher:upstream()});
    assert.equal(result.outcome,'unchanged');
    globalThis.fetch=async(url)=>{
      assert.equal(url,'https://production.test/data/events.json');
      return Response.json({events:[]});
    };
    assert.equal((await claim(env)).outcome,'unchanged');
    await recordObservation(env,{fetcher:upstream({changed:true})});
    const market=await claim(env,{scope:'market',force:true});
    const receipt=await worker.fetch(new Request('https://refresh.test/v1/ack',{method:'POST',headers:{Authorization:'Bearer fixture-control'},body:JSON.stringify({probe_id:market.probe_id,run_id:'123',commit_sha:'a'.repeat(40)})}),env);
    assert.equal(receipt.status,200);
    const decision=await claim(env);
    assert.equal(decision.run,true);assert.equal(decision.scope,'official');
    const probe=await (await STORE.get(`probes/${decision.probe_id}.json`)).json();
    assert.equal(probe.updates[0].sha256,await digest('%PDF-correction'));
    assert.equal((await DB.prepare('SELECT dispatch_count FROM refresh_control WHERE id=1').first()).dispatch_count,0);
  } finally {globalThis.fetch=originalFetch;await mf.dispose();}
});

test('retirement is recorded for operators while a fresh claim clears the incident without publication',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'retirement-test'},r2Buckets:{STORE:'retirement-test'}}));
  const originalFetch=globalThis.fetch;
  try {
    const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');
    await migrate(DB);
    const {published}=await baseline();
    const retired='https://www.td.gov.hk/filemanager/tc/content_4804/tvrm_auction_result_20260912_chi.pdf';
    published.sources[retired]={kind:'physical',date:'2026-09-12',sha256:await digest(bytes),consumers:['physical']};
    const serialized=JSON.stringify(published);
    await STORE.put('published.json',serialized);
    await DB.prepare("UPDATE refresh_control SET last_outcome='source_unavailable',last_error='pdf_http_404' WHERE id=1").run();
    const env={DB,STORE,PRODUCTION_URL:'https://production.test'};
    globalThis.fetch=async(url,options)=>url==='https://production.test/data/events.json' ? Response.json({events:[]}) : url===retired ? new Response('removed',{status:404}) : upstream()(url,options);
    const result=await claim(env,{refresh:true});
    assert.equal(result.run,false);assert.equal(result.outcome,'unchanged');assert.equal(result.source_retired_count,1);
    assert.equal(result.source_error_count,0);
    const record=await (await STORE.get('observed.json')).json();
    assert.equal(record.retired_sources[0].url,retired);assert.equal(record.updates.length,0);
    assert.equal(await (await STORE.get('published.json')).text(),serialized);
    const state=await DB.prepare('SELECT last_error,pending_id,lease_until FROM refresh_control WHERE id=1').first();
    assert.deepEqual(state,{last_error:null,pending_id:null,lease_until:0});
  } finally {globalThis.fetch=originalFetch;await mf.dispose();}
});

test('D1 leases coalesce jobs, reject stale receipts, and release after acknowledgement',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-03-17',compatibilityFlags:['nodejs_compat'],bindings:{CONTROL_TOKEN:'fixture-control-token',DISPATCH_ENABLED:'false'},d1Databases:{DB:'refresh-test'},r2Buckets:{STORE:'refresh-test'}}));
  try {
    const db=await mf.getD1Database('DB');
    await migrate(db);
    const call=async(path,method='GET',data)=>mf.dispatchFetch(`https://refresh.test${path}`,{method,headers:{Authorization:'Bearer fixture-control-token','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    const first=await (await call('/v1/claim','POST',{scope:'market',force:true})).json();
    assert.equal(first.run,true);
    const duplicate=await (await call('/v1/claim','POST',{scope:'market',force:true})).json();
    assert.equal(duplicate.run,false);assert.equal(duplicate.outcome,'pending');
    const stale=await call('/v1/ack','POST',{probe_id:crypto.randomUUID(),run_id:'123',commit_sha:'a'.repeat(40)});
    assert.equal(stale.status,409);
    const accepted=await call('/v1/ack','POST',{probe_id:first.probe_id,run_id:'123',commit_sha:'a'.repeat(40)});
    assert.equal(accepted.status,200);
    assert.equal((await (await call('/v1/status')).json()).lease_until,0);
    assert.equal((await call('/v1/ack','POST',{probe_id:first.probe_id,run_id:'123',commit_sha:'a'.repeat(40)})).status,409);
    assert.equal((await call('/v1/market','PUT',{schema_version:1,source:'28car',coverage:{complete:false},signals:{}})).status,400);
    assert.equal((await call('/v1/market')).status,404);
    assert.equal((await call('/v1/market-contacts')).status,404);
    const observed=new Date().toISOString();
    const contacts={schema_version:1,source:'28car',scraped_at:observed,coverage:{complete:true},contacts:{n100001:{plate:'TEST8',whatsapp_number:'85261112222',observed_at:observed}}};
    assert.equal((await call('/v1/market-contacts','PUT',contacts)).status,200);
    const restored=await call('/v1/market-contacts');
    assert.equal(restored.headers.get('cache-control'),'no-store');
    assert.deepEqual(await restored.json(),contacts);
    contacts.contacts.n100001.whatsapp_number='not-a-number';
    assert.equal((await call('/v1/market-contacts','PUT',contacts)).status,400);
    contacts.contacts={}; contacts.coverage.complete=false;
    assert.equal((await call('/v1/market-contacts','PUT',contacts)).status,400);
  } finally { await mf.dispose(); }
});

test('D1 retains correction B observed while publication A holds its lease',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'concurrent-publish'},r2Buckets:{STORE:'concurrent-publish'}}));
  const originalFetch=globalThis.fetch;
  try {
    const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');await migrate(DB);
    const {published}=await baseline();await STORE.put('published.json',JSON.stringify(published));
    const env={DB,STORE,PRODUCTION_URL:'https://production.test',CONTROL_TOKEN:'fixture-control'};
    globalThis.fetch=async(url,options)=>url==='https://production.test/data/events.json' ? Response.json({events:[]}) : upstream({changed:true,physicalChanged:true})(url,options);
    await recordObservation(env,{fetcher:upstream({changed:true})});
    const A=await claim(env);
    await recordObservation(env,{fetcher:upstream({changed:true,physicalChanged:true})});
    const ack=async(id,sources)=>worker.fetch(new Request('https://refresh.test/v1/ack',{method:'POST',headers:{Authorization:'Bearer fixture-control'},body:JSON.stringify({probe_id:id,run_id:'123',commit_sha:'a'.repeat(40),sources})}),env);
    const sourcesA={...published.sources,[pvrm]:{...published.sources[pvrm],sha256:await digest('%PDF-correction'),consumers:['pvrm'],parsed:{pvrm:1}}};
    assert.equal((await ack(A.probe_id,sourcesA)).status,200);
    const remaining=(await DB.prepare('SELECT url,sha256 FROM refresh_pending_sources').all()).results;
    assert.deepEqual(remaining,[{url:physical,sha256:await digest('%PDF-physical-correction')}]);
    const B=await claim(env);assert.equal(B.run,true);
    const probe=await (await STORE.get(`probes/${B.probe_id}.json`)).json();
    assert.equal(probe.updates.length,1);assert.equal(probe.updates[0].url,physical);
    const sourcesB={...sourcesA,[physical]:{...published.sources[physical],sha256:await digest('%PDF-physical-correction'),consumers:['physical']}};
    assert.equal((await ack(B.probe_id,sourcesB)).status,409);
    sourcesB[physical].parsed={physical:1};assert.equal((await ack(B.probe_id,sourcesB)).status,200);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM refresh_pending_sources').first()).count,0);
  } finally {globalThis.fetch=originalFetch;await mf.dispose();}
});

test('partial source failures hold publication and retain verified changes for a fresh retry',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'partial-failure'},r2Buckets:{STORE:'partial-failure'}}));
  const originalFetch=globalThis.fetch;
  try {
    const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');await migrate(DB);
    const {published}=await baseline();await STORE.put('published.json',JSON.stringify(published));
    const env={DB,STORE,PRODUCTION_URL:'https://production.test'};
    const failed=async(url,options)=>url===physical && options?.method!=='HEAD' ? new Response('unavailable',{status:503}) : upstream({changed:true})(url,options);
    await recordObservation(env,{fetcher:failed});
    globalThis.fetch=async(url,options)=>url==='https://production.test/data/events.json' ? Response.json({events:[]}) : upstream({changed:true})(url,options);
    globalThis.fetch=async(url,options)=>url==='https://production.test/data/events.json' ? Response.json({events:[]}) : failed(url,options);
    const first=await claim(env,{scope:'official',force:true});assert.equal(first.run,false);assert.equal(first.outcome,'source_unavailable');
    const held=await claim(env);assert.equal(held.run,false);assert.equal(held.outcome,'source_unavailable');
    assert.equal((await DB.prepare('SELECT lease_until FROM refresh_control WHERE id=1').first()).lease_until,0);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM refresh_pending_sources').first()).count,1);
    globalThis.fetch=async(url,options)=>url==='https://production.test/data/events.json' ? Response.json({events:[]}) : upstream({changed:true})(url,options);
    const recovered=await claim(env,{refresh:true});assert.equal(recovered.run,true);assert.equal(recovered.source_error_count,0);
  } finally {globalThis.fetch=originalFetch;await mf.dispose();}
});

test('pending archive corrections receive bounded priority even outside the normal rotation',async()=>{
  const {published}=await baseline();const target='https://www.td.gov.hk/filemanager/tc/content_4804/archive_00.pdf';
  for (let i=0;i<40;i++) published.sources[`https://www.td.gov.hk/filemanager/tc/content_4804/archive_${String(i).padStart(2,'0')}.pdf`]={kind:'physical',date:'2010-01-01',sha256:await digest(bytes)};
  const fetcher=async(url,options)=>url===target ? new Response('%PDF-correction') : upstream()(url,options);
  const ordinary=await observe(published,{fetcher,cursor:3});assert(!ordinary.updates.some(x=>x.url===target));
  const prioritized=await observe(published,{fetcher,cursor:3,priority:[{url:target}]});
  assert(prioritized.updates.some(x=>x.url===target));assert(prioritized.sources_observed<=16);
});
test('rotation retains failed sources until that exact source recovers or is qualified as retired',async()=>{
  const {now,published}=await baseline();
  const archive=i=>`https://www.td.gov.hk/filemanager/tc/content_4804/archive_${String(i).padStart(2,'0')}.pdf`;
  for (let i=0;i<40;i++) published.sources[archive(i)]={kind:'physical',date:'2010-01-01',sha256:await digest(bytes),consumers:['physical']};
  const priority=[35,36,37,38,39].map(i=>({url:archive(i),error:'pdf_http_503'}));
  const visited=[];
  const fetcher=async(url,options)=>{visited.push(url);return upstream()(url,options);};
  const held=await observe(published,{fetcher,now,cursor:0,priority});
  assert(!visited.includes(archive(39)));
  assert.deepEqual(held.source_errors,[priority[4]]);
  for (const status of [503,200,404,410]) {
    const retry=await observe(published,{now,cursor:1,priority:held.source_errors,fetcher:async(url,options)=>url===archive(39) ? new Response(status===200 ? bytes : 'unavailable',{status}) : upstream()(url,options)});
    assert.equal(retry.source_errors.length,status===503 ? 1 : 0);
    if ([404,410].includes(status)) assert.equal(retry.retired_sources[0].url,archive(39));
  }
});
test('discarded redirect, HTTP-error and oversized bodies release their source connection',async()=>{
  let cancelled=0;
  const response=(status,headers={})=>new Response(new ReadableStream({cancel(){cancelled++;}}),{status,headers});
  await assert.rejects(sourceFetch(pvrm,async()=>response(302,{location:'https://evil.test/'})),/untrusted_source_redirect/);
  assert.equal(cancelled,1);
  await assert.rejects(boundedRead(response(200,{'content-length':'9'}),8),/source_too_large/);
  assert.equal(cancelled,2);
  await assert.rejects(observe({}, {fetcher:async()=>response(503)}),/index_http_503/);
  assert.equal(cancelled,3);
});
test('an absent optional discovery candidate clears its previous HEAD error',async()=>{
  const {now,published}=await baseline();
  const candidate=discoveryCandidates(published.sources,now)[0];
  let heads=0;
  const result=await observe(published,{fetcher:async(url,options)=>{if(options?.method==='HEAD') heads++;return upstream()(url,options);},now,cursor:3,priority:[{url:candidate.url,error:'discovery_http_503'}]});
  assert.equal(heads,12);
  assert.deepEqual(result.source_errors,[]);
  assert(!result.updates.some(item=>item.url===candidate.url));
});
test('cached observations from a different observer version are refreshed before a claim',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'observation-version'},r2Buckets:{STORE:'observation-version'}}));
  const originalFetch=globalThis.fetch;
  try {
    const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');await migrate(DB);
    const {published}=await baseline();await STORE.put('published.json',JSON.stringify(published));
    const env={DB,STORE,PRODUCTION_URL:'https://production.test',CONTROL_TOKEN:'fixture-control'};
    await recordObservation(env,{fetcher:upstream()});
    const cached=await (await STORE.get('observed.json')).json();
    cached.observer_source_revision='older-observer';await STORE.put('observed.json',JSON.stringify(cached));
    let indexCalls=0;
    globalThis.fetch=async(url,options)=>{
      if (url==='https://production.test/data/events.json') return Response.json({events:[]});
      if (INDEXES.includes(url)) indexCalls++;
      return upstream()(url,options);
    };
    assert.equal((await claim(env)).outcome,'unchanged');assert.equal(indexCalls,6);
    const response=await worker.fetch(new Request('https://refresh.test/v1/status',{headers:{Authorization:'Bearer fixture-control'}}),env);
    const status=await response.json();
    assert.equal(status.source_observation.source_revision,status.source_revision);
    assert.equal(status.source_observation.source_error_count,0);
    assert.equal(status.last_error,null);
  } finally {globalThis.fetch=originalFetch;await mf.dispose();}
});
test('unchanged source checks remain unchanged in later months and years',async(context)=>{
  const originalFetch=globalThis.fetch;
  try {
    for (const date of ['2026-11-02T10:00:00Z','2027-01-02T10:00:00Z','2030-01-02T10:00:00Z']) {
      context.mock.timers.enable({apis:['Date'],now:Date.parse(date)});
      const mf=new Miniflare(convertV4MiniflareOptions({modules:refreshModules,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'future-month'},r2Buckets:{STORE:'future-month'}}));
      try {
        const DB=await mf.getD1Database('DB'),STORE=await mf.getR2Bucket('STORE');await migrate(DB);
        const {published}=await baseline();await STORE.put('published.json',JSON.stringify(published));
        const env={DB,STORE,PRODUCTION_URL:'https://production.test'};
        assert.equal((await recordObservation(env,{fetcher:upstream()})).outcome,'unchanged',date);
        globalThis.fetch=async(url)=>{assert.equal(url,'https://production.test/data/events.json');return Response.json({events:[]});};
        const decision=await claim(env);
        assert.equal(decision.run,false,date);assert.equal(decision.outcome,'unchanged',date);
      } finally {await mf.dispose();context.mock.timers.reset();}
    }
  } finally {globalThis.fetch=originalFetch;}
});

test('revamped TD indexes distinguish datasets and observe dates in adjacent table cells',async()=>{
  assert(INDEXES.every(url=>url.includes('/vehicle_registration_mark_n/')));
  const personal='https://www.td.gov.hk/filemanager/tc/content_5436/pvrm_result_20261003_chi.pdf';
  const traditional='https://www.td.gov.hk/filemanager/tc/content_5416/TVRMs%20Auction%20Result%20Handout%203%20Oct%202026.pdf';
  assert.equal(resultKind(traditional,INDEXES[0]),'physical');
  assert.equal(resultKind(personal,INDEXES[0]),'pvrm');
  assert.equal(resultKind('https://www.td.gov.hk/filemanager/tc/content_5438/20080223ret.pdf',`${INDEXES[0].split('/ar/')[0]}/ar/lnyar/index.html`),'pvrm');
  const makeFetcher=date=>async(url,options={})=>{
    if(options.method==='HEAD') return new Response(null,{status:404});
    if(!INDEXES.includes(url)) return new Response(bytes);
    if(url.includes('/ca/')) return new Response(`<html><!-- CONTENT START --><table><tr><td>${date}</td><td><a href="https://www.td.gov.hk/filemanager/tc/content_5419/PVRM%20Auction%20Handout%20for%2010.10.2026.Chi.pdf">Auction List (morning)</a></td></tr><tr><td>22 October noon to 26 October noon 2026</td></tr></table><!-- CONTENT END --></html>`);
    return new Response(`<html><a href="${url.includes('/ar/index')?traditional:personal}">3 October 2026</a></html>`);
  };
  const first=await observe({}, {fetcher:makeFetcher('10 October 2026'),now:new Date('2026-10-09T07:00:00Z')});
  assert(first.updates.some(x=>x.kind==='pvrm'));
  assert(first.updates.some(x=>x.kind==='physical' && x.date==='2026-10-03'));
  const second=await observe({sources:Object.fromEntries(first.updates.map(x=>[x.url,x])),index_urls:first.index_urls,index_entries:first.index_entries,calendar_digest:first.calendar_digest},{fetcher:makeFetcher('11 October 2026'),now:new Date('2026-10-09T07:00:00Z')});
  assert.equal(second.calendar_changed,true);
});
