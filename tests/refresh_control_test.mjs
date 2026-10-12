import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {deployObserver,sourceRevision} from '../scripts/deploy_refresh_worker.mjs';

async function run(responses) {
  const dir=await mkdtemp(join(tmpdir(),'platehk-control-test-'));
  try {
    const hook=join(dir,'hook.mjs'),calls=join(dir,'calls.jsonl'),output=join(dir,'output');
    await writeFile(hook,`import {appendFileSync} from 'node:fs';let responses=${JSON.stringify(responses)};globalThis.fetch=async(url,options)=>{appendFileSync(${JSON.stringify(calls)},JSON.stringify({path:new URL(url).pathname,body:options.body&&JSON.parse(options.body)})+'\\n');const next=responses.shift();if(!next)throw Error('Unexpected request');return Response.json(next.payload,{status:next.status||200});};`);
    const result=spawnSync(process.execPath,['--import',hook,'scripts/refresh_control.mjs','plan'],{cwd:new URL('../',import.meta.url),env:{...process.env,REFRESH_CONTROL_URL:'https://control.test',REFRESH_CONTROL_TOKEN:'test-fixture',REFRESH_SCOPE:'check',REFRESH_FORCE:'false',REFRESH_RETRY_DELAY_MS:'0',GITHUB_OUTPUT:output},encoding:'utf8',timeout:10000});
    return {...result,calls:(await readFile(calls,'utf8')).trim().split('\n').map(JSON.parse),output:await readFile(output,'utf8')};
  } finally {await rm(dir,{recursive:true,force:true});}
}

test('partial source failure gets one fresh retry and fails before expensive steps',async()=>{
  const failure={payload:{run:false,outcome:'source_unavailable',source_error_count:1}};
  const result=await run([failure,failure]);assert.equal(result.status,1);
  assert.equal(result.calls.length,2);assert.equal(result.calls[1].body.refresh,true);assert.equal(result.calls[1].body.force,false);
  assert.match(result.output,/run=false/);assert.match(result.output,/outcome=source_unavailable/);assert.match(result.stderr,/SOURCE_OBSERVATION_UNAVAILABLE/);
});
test('a transient failure recovers through a fresh check without forcing a build',async()=>{
  const result=await run([{payload:{run:false,outcome:'source_unavailable',source_error_count:1}},{payload:{run:false,outcome:'unchanged',source_error_count:0}}]);
  assert.equal(result.status,0);assert.match(result.output,/run=false/);assert.match(result.output,/outcome=unchanged/);assert.equal(result.calls[1].body.force,false);
});
test('controller HTTP failure also receives a bounded retry and operator attention',async()=>{
  const result=await run([{status:503,payload:{error:'unavailable'}},{status:503,payload:{error:'unavailable'}}]);
  assert.equal(result.status,1);assert.equal(result.calls.length,2);assert.match(result.stderr,/SOURCE_OBSERVATION_UNAVAILABLE/);
});
test('an unchanged successful check does not retry',async()=>{
  const result=await run([{payload:{run:false,outcome:'unchanged',source_error_count:0}}]);
  assert.equal(result.status,0);assert.equal(result.calls.length,1);
});

async function deploymentFixture(check,{stale=false,dirty=false,advanced=false,dataOnly=false,timeout=false,confirm=true,healthy=false,tamper=false,oldFingerprint=false,settleChecks=0}={}) {
  const root=await mkdtemp(join(tmpdir(),'platehk-deploy-test-'));
  try {
    const files=['refresh-worker/src/index.mjs','refresh-worker/src/probe.mjs','refresh-worker/wrangler.jsonc','scripts/deploy_refresh_worker.mjs','package.json','package-lock.json'];
    for (const file of files) {await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),file);}
    const revision=sourceRevision(root,files),calls=[],pauses=[];
    let current=healthy,remoteCalls=0,healthChecks=0;
    const run=(command,args)=>{
      calls.push({command,args});
      if (command==='git') {
        if (args[0]==='ls-remote') return `${advanced && ++remoteCalls>1 ? 'b':'a'}`.repeat(40)+'\trefs/heads/main';
        if (args[0]==='rev-parse') return 'a'.repeat(40);
        if (args[0]==='status') return dirty ? ' M refresh-worker/src/probe.mjs' : '';
        if (args[0]==='diff') return stale || (advanced && !dataOnly && args[2]==='b'.repeat(40)) ? 'refresh-worker/src/probe.mjs' : '';
        if (args[0]==='ls-files') return files.join('\n');
      }
      if (command===process.execPath && args.includes('--dry-run')) {
        if (tamper) writeFileSync(join(root,'refresh-worker/src/probe.mjs'),'changed during bundling');
      } else if (command===process.execPath) {current=confirm;if(timeout)throw Error('Cloudflare activation timed out');}
      return '';
    };
    const fetcher=async()=>Response.json({ok:true,service:'platehk-refresh',observer_enabled:true,dispatch_enabled:false,...(current && ++healthChecks>settleChecks ? {source_revision:revision}:oldFingerprint ? {source_revision:'0'.repeat(64)}:{})});
    await check({root,files,revision,calls,pauses,options:{root,ensure:true,run,fetcher,pause:async(ms)=>pauses.push(ms)}});
  } finally {await rm(root,{recursive:true,force:true});}
}

test('stale or dirty observer inputs cannot reach deployment',async()=>{
  for (const condition of [{stale:true},{dirty:true}]) await deploymentFixture(async({options,calls})=>{
    await assert.rejects(deployObserver(options),/Stale or modified observer/);
    assert(calls.every(call=>call.command==='git'));
  },condition);
});
test('a healthy observer fingerprint skips installation and deployment',async()=>{
  await deploymentFixture(async({options,calls,revision})=>{
    assert.deepEqual(await deployObserver(options),{deployed:false,source_revision:revision});
    assert(calls.every(call=>call.command==='git'));
  },{healthy:true});
});
test('missing or stale deployment provenance restores current source and verifies it',async()=>{
  for (const oldFingerprint of [false,true]) await deploymentFixture(async({options,calls,revision})=>{
    assert.deepEqual(await deployObserver(options),{deployed:true,source_revision:revision});
    const build=calls.find(call=>call.command===process.execPath && call.args.includes('--dry-run'));
    const deployment=calls.find(call=>call.command===process.execPath && call.args.includes('--no-bundle'));
    assert(build.args.includes(`__REFRESH_SOURCE_REVISION__:${JSON.stringify(revision)}`));
    assert(deployment.args.includes('--keep-vars'));
    assert.equal(deployment.args[2],join(build.args[build.args.indexOf('--outdir')+1],'index.js'));
  },{oldFingerprint});
});
test('an activation timeout is accepted only when live provenance confirms success',async()=>{
  await deploymentFixture(async({options})=>assert.equal((await deployObserver(options)).deployed,true),{timeout:true});
  await deploymentFixture(async({options})=>assert.rejects(deployObserver(options),/activation timed out/),{timeout:true,confirm:false});
  await deploymentFixture(async({options})=>assert.rejects(deployObserver(options),/did not expose/),{confirm:false});
});
test('post-deploy settling retries remain bounded and require the exact live fingerprint',async()=>{
  await deploymentFixture(async({options,pauses})=>{
    assert.equal((await deployObserver(options)).deployed,true);
    assert.deepEqual(pauses,[5000,5000,5000,5000]);
  },{settleChecks:4});
  await deploymentFixture(async({options,pauses})=>{
    await assert.rejects(deployObserver(options),/revision_match.*false/);
    assert.equal(pauses.length,5);
  },{settleChecks:6});
});
test('a source release advancing during preparation blocks the older deployment',async()=>{
  await deploymentFixture(async({options,calls})=>{
    await assert.rejects(deployObserver(options),/main advanced/);
    assert(!calls.some(call=>call.command===process.execPath && call.args.includes('--no-bundle')));
  },{advanced:true});
});
test('an unrelated data commit advancing main does not block the verified observer',async()=>{
  await deploymentFixture(async({options})=>assert.equal((await deployObserver(options)).deployed,true),{advanced:true,dataOnly:true});
});
test('editing the source during bundling cannot publish a false fingerprint',async()=>{
  await deploymentFixture(async({options,calls})=>{
    await assert.rejects(deployObserver(options),/source changed during bundling/);
    assert(!calls.some(call=>call.command===process.execPath && call.args.includes('--no-bundle')));
  },{tamper:true});
});
test('the source fingerprint changes for runtime changes but excludes generated data',async()=>{
  await deploymentFixture(async({root,files,revision})=>{
    await mkdir(join(root,'data'));await writeFile(join(root,'data/events.json'),'new events');
    assert.equal(sourceRevision(root,files),revision);
    await writeFile(join(root,'refresh-worker/src/probe.mjs'),'changed source');
    assert.notEqual(sourceRevision(root,files),revision);
  });
});
