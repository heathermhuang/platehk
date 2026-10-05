import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {boundedRead} from '../refresh-worker/src/probe.mjs';

const command = process.argv[2];
const base = process.env.REFRESH_CONTROL_URL || '';
const token = process.env.REFRESH_CONTROL_TOKEN || '';
if (!base.startsWith('https://') || !token) throw new Error('Configure REFRESH_CONTROL_URL and REFRESH_CONTROL_TOKEN');
async function request(path,method='GET',payload) {
  const response = await fetch(new URL(path,base),{method,redirect:'error',signal:AbortSignal.timeout(240000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:payload === undefined ? undefined : JSON.stringify(payload)});
  if (!response.ok) throw new Error(`Refresh control ${path.split('?')[0]} returned HTTP ${response.status}`);
  return JSON.parse(new TextDecoder().decode(await boundedRead(response,32*1024*1024)));
}
if (command === 'plan') {
  const scope = process.env.REFRESH_SCOPE || 'official', probeId = process.env.REFRESH_PROBE_ID || '';
  let decision;
  if (probeId) {
    if (!/^[a-f0-9-]{36}$/.test(probeId)) throw new Error('Invalid probe ID');
    const probe = await request(`/v1/probe?id=${probeId}`);
    if (probe.scope !== scope) throw new Error('Probe scope does not match workflow input');
    decision = {run:true,scope:probe.scope,probe_id:probeId};
  } else decision = await request('/v1/claim','POST',{scope,force:process.env.REFRESH_FORCE === 'true' || process.env.REFRESH_MODE === 'full'});
  if (decision.run) {
    const probe = await request(`/v1/probe?id=${decision.probe_id}`);
    await fs.mkdir('.tmp',{recursive:true});
    await fs.writeFile('.tmp/source-probe.json',JSON.stringify(probe));
  }
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT,`run=${decision.run ? 'true':'false'}\nscope=${decision.scope || 'check'}\nprobe_id=${decision.probe_id || ''}\noutcome=${decision.outcome || 'changed'}\n`);
  console.log(JSON.stringify(decision));
} else if (command === 'restore-market') {
  const snapshot = await request('/v1/market');
  if (snapshot.source !== '28car' || snapshot.schema_version !== 1 || snapshot.coverage?.complete !== true) throw new Error('Invalid stored market snapshot');
  await fs.mkdir('data/market',{recursive:true});
  await fs.writeFile('data/market/28car.active.json',JSON.stringify(snapshot));
  console.log(`Restored complete private market snapshot, observed ${snapshot.scraped_at}`);
} else if (command === 'store-market') {
  const snapshot = JSON.parse(await fs.readFile('data/market/28car.active.json','utf8'));
  console.log(JSON.stringify(await request('/v1/market','PUT',snapshot)));
} else if (command === 'ack') {
  const probe = JSON.parse(await fs.readFile('.tmp/source-probe.json','utf8'));
  const payload = {probe_id:probe.probe_id,run_id:process.env.GITHUB_RUN_ID,commit_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
  if (probe.scope === 'official') payload.sources = JSON.parse(await fs.readFile('.tmp/source-catalog.json','utf8'));
  console.log(JSON.stringify(await request('/v1/ack','POST',payload)));
} else if (command === 'release') {
  const probeId = process.env.REFRESH_PROBE_ID || '';
  if (probeId) {
    console.log(JSON.stringify(await request('/v1/release','POST',{probe_id:probeId})));
    try {
      const probe=JSON.parse(await fs.readFile('.tmp/source-probe.json','utf8'));
      if (probe.probe_id===probeId) await fs.unlink('.tmp/source-probe.json');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
} else if (command === 'status') console.log(JSON.stringify(await request('/v1/status'),null,2));
else throw new Error('Unknown refresh control command');
