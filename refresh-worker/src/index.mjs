import {timingSafeEqual} from 'node:crypto';
import {observe,boundedRead,officialUrl} from './probe.mjs';

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
export async function claim(env,{scope='check',force=false}={}) {
  if (!['check','official','events','market'].includes(scope)) throw new Error('invalid_scope');
  const control = await state(env), now = Math.floor(Date.now()/1000);
  if (control.lease_until > now) return {run:false,outcome:'pending',probe_id:control.pending_id};
  const published = await stored(env,'published.json') || {};
  const probe = scope === 'market' ? {updates:[],index_urls:published.index_urls || [],calendar_digest:published.calendar_digest,checked_at:new Date().toISOString(),source_errors:[]} : await observe(published,{cursor:control.cursor});
  if (scope !== 'market') {
    const response = await fetch(`${env.PRODUCTION_URL}/data/events.json`,{signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('production_events_unavailable');
    const events = JSON.parse(new TextDecoder().decode(await boundedRead(response,1024*1024)));
    probe.events_expired = (events.events || []).some(event => event.end_at && Date.parse(event.end_at) < Date.now());
  }
  let selected = scope === 'check' ? scopeFor(probe) : scope;
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
    for (const [url,item] of Object.entries(payload.sources)) if (!officialUrl(url) || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !['pvrm','physical','eauction'].includes(item.kind)) return json({error:'invalid_source_catalog'},400);
    for (const update of probe.updates) if (payload.sources[update.url]?.sha256 !== update.sha256) return json({error:'source_hash_mismatch'},409);
    published.sources = payload.sources;
    published.index_urls = probe.index_urls;
    published.index_entries = probe.index_entries;
  }
  if (['official','events'].includes(probe.scope)) published.calendar_digest = probe.calendar_digest;
  published.published_at = new Date().toISOString(); published.run_id = String(payload.run_id); published.commit_sha = payload.commit_sha;
  await env.STORE.put('published.json',JSON.stringify(published));
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
    if (url.pathname === '/health' && request.method === 'GET') return json({ok:true,service:'platehk-refresh',dispatch_enabled:env.DISPATCH_ENABLED === 'true'});
    if (!await authorized(request,env)) return json({error:'not_found'},404);
    try {
      if (url.pathname === '/v1/status' && request.method === 'GET') return json(await state(env));
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
      if (env.DISPATCH_ENABLED !== 'true') { console.log(JSON.stringify({event:'refresh_shadow',dispatch_enabled:false})); return; }
      let decision;
      try {
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
