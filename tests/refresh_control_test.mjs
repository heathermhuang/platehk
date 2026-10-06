import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

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
