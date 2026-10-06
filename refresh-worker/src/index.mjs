import {timingSafeEqual} from 'node:crypto';
import {observe,boundedRead,officialUrl,digest} from './probe.mjs';

const LEASE_SECONDS = 7200;
const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(request,env) {
  const received = new TextEncoder().encode(request.headers.get('Authorization') || '');
  const expected = new TextEncoder().encode(`Bearer ${env.CONTROL_TOKEN || ''}`);
  return Boolean(env.CONTROL_TOKEN) && received.byteLength === expected.byteLength && timingSafeEqual(received,expected);
}
async function state(env) { return env.DB.prepare('SELECT * FROM refresh_control WHERE id = 1').first(); }
async function stored(env,key) { const object = await env.STORE.get(key); return object ? object.json() : null; }
async function body(request,limit=2*1024*1024) { return JSON.parse(new TextDecoder().decode(await boundedRead(request,limit))); }
function scopeFor(probe) { return probe.auction_changed ? 'official' : probe.calendar_changed || probe.events_expired ? 'events' : 'check'; }
const observationFresh = (record,revision) => record?.published_revision === revision && Date.parse(record.checked_at) >= Date.now()-90*60*1000 && Date.parse(record.checked_at) <= Date.now()+600000;
const sourceRevision = published => digest(JSON.stringify({sources:published.sources && Object.fromEntries(Object.entries(published.sources).map(([url,item])=>[url,{kind:item.kind,date:item.date,sha256:item.sha256,consumers:item.consumers}])),index_urls:published.index_urls,index_entries:published.index_entries}));
export function combineObservation(probe,previous,published,revision) {
  const updates=new Map((previous?.updates || []).filter(item=>item.sha256!==published.sources?.[item.url]?.sha256 && (!Object.hasOwn(item,'baseline_sha256') || item.baseline_sha256===(published.sources?.[item.url]?.sha256 || null))).map(item=>[item.url,item]));
  for (const [url,hash] of Object.entries(probe.observed_hashes || {})) if (hash===published.sources?.[url]?.sha256) updates.delete(url);
  for (const item of probe.updates) if (item.sha256 !== published.sources?.[item.url]?.sha256) updates.set(item.url,item);
  const indexesChanged=probe.index_urls ? JSON.stringify(probe.index_urls)!==JSON.stringify(published.index_urls || []) || JSON.stringify(probe.index_entries)!==JSON.stringify(published.index_entries || []) : probe.auction_changed;
  return {...probe,updates:[...updates.values()],auction_changed:!published.sources || indexesChanged || updates.size>0,calendar_changed:probe.calendar_digest!==published.calendar_digest,published_revision:revision};
}
async function pendingSources(env,legacy,published) {
  // Upgrade old R2-only observations without discarding unacknowledged work.
  const imports=(legacy?.updates || []).filter(item=>!item.observed_at && officialUrl(item.url)).map(item=>env.DB.prepare('INSERT OR IGNORE INTO refresh_pending_sources(url,kind,date,sha256,baseline_sha256,observed_at) VALUES(?,?,?,?,?,?)').bind(item.url,item.kind,item.date || '',item.sha256,published.sources?.[item.url]?.sha256 || null,legacy.checked_at || new Date().toISOString()));
  if (imports.length) await env.DB.batch(imports);
  return (await env.DB.prepare('SELECT * FROM refresh_pending_sources ORDER BY url').all()).results;
}
async function persistObservations(env,probe,published) {
  const statements=[];
  for (const item of probe.observations || []) {
    const baseline=published.sources?.[item.url]?.sha256 || null;
    if (item.sha256===baseline) statements.push(env.DB.prepare('DELETE FROM refresh_pending_sources WHERE url=? AND observed_at<=?').bind(item.url,item.observed_at));
    else statements.push(env.DB.prepare('INSERT INTO refresh_pending_sources(url,kind,date,sha256,baseline_sha256,observed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET kind=excluded.kind,date=excluded.date,sha256=excluded.sha256,baseline_sha256=excluded.baseline_sha256,observed_at=excluded.observed_at WHERE excluded.observed_at>=refresh_pending_sources.observed_at').bind(item.url,item.kind,item.date || '',item.sha256,baseline,item.observed_at));
  }
  if (statements.length) await env.DB.batch(statements);
}
export async function recordObservation(env,options={}) {
  const control=await state(env), published=await stored(env,'published.json') || {};
  const revision=await sourceRevision(published);
  const previous=await stored(env,'observed.json');
  const pending=await pendingSources(env,previous,published);
  const probe=await observe(published,{cursor:control.cursor,priority:[...pending,...(previous?.source_errors || [])],...options});
  const current=await stored(env,'published.json') || {};
  await persistObservations(env,probe,current);
  // Retain corrections found by earlier archive rotations until a real publication acknowledges them.
  const record=combineObservation({...probe,updates:[],observed_hashes:{}},{updates:await pendingSources(env)},current,revision);
  await env.STORE.put('observed.json',JSON.stringify(record));
  const outcome=scopeFor(record)!=='check' ? 'observed_changed' : record.source_errors.length ? 'source_unavailable' : 'unchanged';
  await env.DB.prepare('UPDATE refresh_control SET cursor=cursor+1,last_checked_at=?,last_outcome=CASE WHEN lease_until<=? THEN ? ELSE last_outcome END,last_error=?,no_change_count=no_change_count+? WHERE id=1').bind(record.checked_at,Math.floor(Date.now()/1000),outcome,record.source_errors.length ? JSON.stringify(record.source_errors) : null,outcome==='unchanged' ? 1 : 0).run();
  return {outcome,scope:scopeFor(record),source_error_count:record.source_errors.length,updates:record.updates.length};
}
export async function claim(env,{scope='check',force=false,refresh=false}={}) {
  if (!['check','official','events','market'].includes(scope)) throw new Error('invalid_scope');
  const control = await state(env), now = Math.floor(Date.now()/1000);
  if (control.lease_until > now) return {run:false,outcome:'pending',probe_id:control.pending_id};
  const published = await stored(env,'published.json') || {};
  const cached=scope!=='market' ? await stored(env,'observed.json') : null;
  const pending=scope==='market' ? [] : await pendingSources(env,cached,published);
  const revision=await sourceRevision(published);
  const fresh=scope!=='market' && !(scope==='check' && !force && !refresh && observationFresh(cached,revision));
  const observed=scope==='market' ? {updates:[],index_urls:published.index_urls || [],calendar_digest:published.calendar_digest,checked_at:new Date().toISOString(),source_errors:[]} : fresh ? await observe(published,{cursor:control.cursor,priority:[...pending,...(cached?.source_errors || [])]}) : cached;
  if (fresh) await persistObservations(env,observed,published);
  const probe=scope==='market' ? observed : combineObservation({...observed,updates:[],observed_hashes:{}},{updates:await pendingSources(env)},published,revision);
  if (fresh) await env.STORE.put('observed.json',JSON.stringify(probe));
  if (scope !== 'market') {
    const response = await fetch(`${env.PRODUCTION_URL}/data/events.json`,{signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('production_events_unavailable');
    const events = JSON.parse(new TextDecoder().decode(await boundedRead(response,1024*1024)));
    probe.events_expired = (events.events || []).some(event => event.end_at && Date.parse(event.end_at) < Date.now());
  }
  let selected = scope === 'check' ? scopeFor(probe) : scope;
  if (probe.source_errors.length) selected='check';
  if (!force && selected !== 'market' && selected !== 'check' && !probe.auction_changed && !probe.calendar_changed && !probe.events_expired) selected = 'check';
  if (selected === 'check') {
    const outcome = probe.source_errors.length ? 'source_unavailable' : 'unchanged';
    await env.DB.prepare('UPDATE refresh_control SET cursor=cursor+1,last_checked_at=?,last_outcome=?,last_error=?,no_change_count=no_change_count+? WHERE id=1').bind(probe.checked_at,outcome,probe.source_errors.length ? JSON.stringify(probe.source_errors) : null,outcome === 'unchanged' ? 1 : 0).run();
    return {run:false,outcome,sources_observed:probe.sources_observed,source_error_count:probe.source_errors.length};
  }
  const id = crypto.randomUUID();
  const acquired = await env.DB.prepare('UPDATE refresh_control SET pending_id=?,pending_scope=?,lease_until=?,cursor=cursor+1,last_checked_at=?,last_outcome=?,last_error=NULL WHERE id=1 AND lease_until<=?').bind(id,selected,now+LEASE_SECONDS,probe.checked_at,'claimed',now).run();
  if (!acquired.meta.changes) return {run:false,outcome:'pending'};
  if (control.pending_id) await env.STORE.delete(`probes/${control.pending_id}.json`);
  const record = {...probe,scope:selected,probe_id:id};
  await env.STORE.put(`probes/${id}.json`,JSON.stringify(record));
  return {run:true,scope:selected,probe_id:id,outcome:'changed',source_error_count:probe.source_errors.length};
}
async function release(env,id,outcome,error=null) {
  const result=await env.DB.prepare('UPDATE refresh_control SET pending_id=NULL,pending_scope=NULL,lease_until=0,last_outcome=?,last_error=? WHERE id=1 AND pending_id=?').bind(outcome,error,id).run();
  if (result.meta.changes) await env.STORE.delete(`probes/${id}.json`);
}
async function dispatch(env,decision) {
  if (!env.GITHUB_DISPATCH_TOKEN) throw new Error('github_dispatch_token_missing');
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/auto-update.yml/dispatches`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.GITHUB_DISPATCH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'PlateHKRefreshWorker','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{scope:decision.scope,probe_id:decision.probe_id,deploy:true,force:false}})});
  if (response.status !== 204) throw new Error(`github_dispatch_http_${response.status}`);
  await env.DB.prepare('UPDATE refresh_control SET last_outcome=?,dispatch_count=dispatch_count+1 WHERE id=1 AND pending_id=?').bind('dispatched',decision.probe_id).run();
}
async function acknowledge(env,payload) {
  const control = await state(env);
  if (!payload.probe_id || payload.probe_id !== control.pending_id || control.lease_until <= Math.floor(Date.now()/1000)) return json({error:'stale_receipt'},409);
  if (!/^\d+$/.test(String(payload.run_id)) || !/^[a-f0-9]{40}$/.test(payload.commit_sha || '')) return json({error:'invalid_receipt'},400);
  const probe = await stored(env,`probes/${payload.probe_id}.json`);
  if (!probe) return json({error:'missing_probe'},409);
  const published = await stored(env,'published.json') || {};
  if (probe.scope === 'official') {
    if (!payload.sources || !Object.keys(payload.sources).length) return json({error:'source_catalog_required'},400);
    for (const [url,item] of Object.entries(payload.sources)) if (!officialUrl(url) || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !['pvrm','physical','eauction'].includes(item.kind) || (item.consumers && (!Array.isArray(item.consumers) || item.consumers.some(kind=>!['pvrm','physical','eauction'].includes(kind))))) return json({error:'invalid_source_catalog'},400);
    for (const update of probe.updates) if (payload.sources[update.url]?.sha256 !== update.sha256) return json({error:'source_hash_mismatch'},409);
    for (const update of probe.updates) {
      const item=payload.sources[update.url],kinds=new Set([update.kind,...(item.consumers || [])]);
      if ([...kinds].some(kind=>!Number.isSafeInteger(item.parsed?.[kind]) || item.parsed[kind]<=0)) return json({error:'source_parse_unverified'},409);
    }
    published.sources = payload.sources;
    published.index_urls = probe.index_urls;
    published.index_entries = probe.index_entries;
  }
  if (['official','events'].includes(probe.scope)) published.calendar_digest = probe.calendar_digest;
  published.published_at = new Date().toISOString(); published.run_id = String(payload.run_id); published.commit_sha = payload.commit_sha;
  await env.STORE.put('published.json',JSON.stringify(published));
  if (probe.scope==='official') await env.DB.prepare("DELETE FROM refresh_pending_sources WHERE (url,sha256) IN (SELECT key,json_extract(value,'$.sha256') FROM json_each(?))").bind(JSON.stringify(payload.sources)).run();
  await env.DB.prepare('UPDATE refresh_control SET last_published_at=?,last_run_id=? WHERE id=1 AND pending_id=?').bind(published.published_at,published.run_id,payload.probe_id).run();
  await release(env,payload.probe_id,'published');
  return json({published:true});
}
function validMarket(payload) {
  if (payload.schema_version !== 1 || payload.source !== '28car' || payload.coverage?.complete !== true || typeof payload.signals !== 'object' || !payload.signals || !Object.keys(payload.signals).length) return false;
  const hours = Math.max(1,Math.min(168,Number(payload.fresh_for_hours || 72))), timestamp=Date.parse(payload.scraped_at);
  if (!Number.isFinite(timestamp) || timestamp < Date.now()-hours*3600000 || timestamp > Date.now()+600000) return false;
  const allowed = ['listing_id','source_url','price_type','asking_price_hkd','first_seen_at','last_seen_at'];
  return Object.entries(payload.signals).every(([plate,offers]) => /^[A-Z0-9]{1,8}$/.test(plate) && Array.isArray(offers) && offers.every(offer => offer && Object.keys(offer).sort().join() === [...allowed].sort().join() && /^https:\/\/m\.28car\.com\//.test(offer.source_url)));
}
export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ok:true,service:'platehk-refresh',observer_enabled:env.OBSERVER_ENABLED === 'true',dispatch_enabled:env.DISPATCH_ENABLED === 'true'});
    if (!await authorized(request,env)) return json({error:'not_found'},404);
    try {
      if (url.pathname === '/v1/status' && request.method === 'GET') return json({...await state(env),pending_source_count:(await env.DB.prepare('SELECT COUNT(*) AS count FROM refresh_pending_sources').first()).count});
      if (url.pathname === '/v1/claim' && request.method === 'POST') return json(await claim(env,await body(request,8192)));
      if (url.pathname === '/v1/probe' && request.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!/^[a-f0-9-]{36}$/.test(id || '')) return json({error:'invalid_probe'},400);
        const control = await state(env);
        if (control.pending_id !== id || control.lease_until <= Math.floor(Date.now()/1000)) return json({error:'stale_probe'},409);
        return json(await stored(env,`probes/${id}.json`));
      }
      if (url.pathname === '/v1/ack' && request.method === 'POST') return acknowledge(env,await body(request));
      if (url.pathname === '/v1/release' && request.method === 'POST') {
        const payload = await body(request,8192);
        await release(env,payload.probe_id,'failed','workflow_failed');
        return json({released:true});
      }
      if (url.pathname === '/v1/market' && request.method === 'GET') {
        const object = await env.STORE.get('market/28car.active.json');
        if (!object) return json({error:'market_snapshot_missing'},404);
        return new Response(object.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      }
      if (url.pathname === '/v1/market' && request.method === 'PUT') {
        const payload = await body(request,32*1024*1024);
        if (!validMarket(payload)) return json({error:'invalid_market_snapshot'},400);
        const serialized = JSON.stringify(payload);
        await env.STORE.put('market/28car.active.json',serialized);
        return json({stored:true});
      }
      return json({error:'not_found'},404);
    } catch (error) {
      await env.DB.prepare('UPDATE refresh_control SET last_checked_at=?,last_outcome=?,last_error=? WHERE id=1').bind(new Date().toISOString(),'failed',error.message).run();
      console.error(JSON.stringify({event:'refresh_request_failed',error:error.message}));
      return json({error:'refresh_failed'},503);
    }
  },
  async scheduled(controller,env,ctx) {
    ctx.waitUntil((async () => {
      if (env.OBSERVER_ENABLED !== 'true') { console.log(JSON.stringify({event:'refresh_shadow',observer_enabled:false})); return; }
      let decision;
      try {
        const observation=await recordObservation(env);
        if (env.DISPATCH_ENABLED !== 'true') { console.log(JSON.stringify({event:'refresh_observed',...observation,scheduled_time:controller.scheduledTime})); return; }
        decision = await claim(env);
        if (decision.run) await dispatch(env,decision);
        console.log(JSON.stringify({event:'refresh_check',...decision,scheduled_time:controller.scheduledTime}));
      } catch (error) {
        if (decision?.probe_id) await release(env,decision.probe_id,'dispatch_failed',error.message);
        await env.DB.prepare('UPDATE refresh_control SET last_checked_at=?,last_outcome=?,last_error=? WHERE id=1').bind(new Date().toISOString(),'failed',error.message).run();
        console.error(JSON.stringify({event:'refresh_check_failed',error:error.message}));
        throw error;
      }
    })());
  },
};
