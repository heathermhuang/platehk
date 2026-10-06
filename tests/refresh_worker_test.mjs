import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import worker,{recordObservation,claim,combineObservation} from '../refresh-worker/src/index.mjs';
import {observe,digest,officialUrl,boundedRead,sourceFetch,discoveryCandidates,INDEXES,resultKind} from '../refresh-worker/src/probe.mjs';

const pvrm='https://www.td.gov.hk/filemanager/tc/content_4806/pvrm_result_20261003_chi.pdf';
const physical='https://www.td.gov.hk/filemanager/tc/content_4804/tvrm_auction_result_20261003_chi.pdf';
const bytes=new TextEncoder().encode('%PDF-fixture');
function upstream({extra='',changed=null,physicalChanged=false,indexStatus=200,pdfStatus=200}={}) {
  return async (url,options={}) => {
    if (options.method==='HEAD') return new Response(null,{status:404});
    if (INDEXES.includes(url)) {
      if (indexStatus!==200) return new Response('unavailable',{status:indexStatus});
      const link=url===INDEXES[0]?pvrm:url===INDEXES[1]?physical:'https://www.td.gov.hk/filemanager/tc/content_4802/auction.pdf';
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
  const now=new Date('2026-10-05T10:00:00Z');
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
test('calendar-only changes and registration month rollover stay independent',async()=>{
  const {now,published}=await baseline();
  const result=await observe(published,{fetcher:upstream(),now:new Date('2026-11-01T01:00:00Z')});
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
    if ([INDEXES[2],INDEXES[3]].includes(url)) return new Response('<html><li>12 October 2026 <a href="https://www.td.gov.hk/filemanager/tc/content_4802/auction.pdf">Handout</a></li></html>');
    return upstream()(url,options);
  };
  const result=await observe(published,{fetcher,now});assert.equal(result.calendar_changed,true);assert.equal(result.auction_changed,false);
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
  assert.deepEqual(await health.json(),{ok:true,service:'platehk-refresh',observer_enabled:false,dispatch_enabled:false});
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
  const mf=new Miniflare({modules:true,scriptPath:new URL('../refresh-worker/src/index.mjs',import.meta.url).pathname,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'observe-test'},r2Buckets:{STORE:'observe-test'}});
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

test('D1 leases coalesce jobs, reject stale receipts, and release after acknowledgement',async()=>{
  const mf=new Miniflare({modules:true,scriptPath:new URL('../refresh-worker/src/index.mjs',import.meta.url).pathname,compatibilityDate:'2026-03-17',compatibilityFlags:['nodejs_compat'],bindings:{CONTROL_TOKEN:'fixture-control-token',DISPATCH_ENABLED:'false'},d1Databases:{DB:'refresh-test'},r2Buckets:{STORE:'refresh-test'}});
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
  const mf=new Miniflare({modules:true,scriptPath:new URL('../refresh-worker/src/index.mjs',import.meta.url).pathname,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'concurrent-publish'},r2Buckets:{STORE:'concurrent-publish'}});
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
  const mf=new Miniflare({modules:true,scriptPath:new URL('../refresh-worker/src/index.mjs',import.meta.url).pathname,compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'partial-failure'},r2Buckets:{STORE:'partial-failure'}});
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
