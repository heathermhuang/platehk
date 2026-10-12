import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const SOURCE_PATHS=['refresh-worker/src','refresh-worker/wrangler.jsonc','scripts/deploy_refresh_worker.mjs','package.json','package-lock.json'];
const CONTROL_URL='https://platehk-refresh.measurable.workers.dev';
const REPOSITORY='https://github.com/heathermhuang/platehk.git';

export function sourceRevision(root,files) {
  const hash=createHash('sha256');
  for (const file of [...files].sort()) hash.update(file+'\0').update(readFileSync(resolve(root,file))).update('\0');
  return hash.digest('hex');
}

export async function deployObserver({root=ROOT,ensure=false,run,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  run ||= (file,args,capture=false)=>execFileSync(file,args,{cwd:root,encoding:'utf8',stdio:capture ? 'pipe':'inherit',timeout:300000})?.trim() || '';
  const git=args=>run('git',args,true);
  const remote=git(['ls-remote',REPOSITORY,'refs/heads/main']).split(/\s/)[0];
  if (!/^[a-f0-9]{40}$/.test(remote)) throw new Error('Cannot verify canonical main; observer deployment blocked.');
  if (git(['rev-parse','HEAD'])!==remote) git(['fetch','--depth','1',REPOSITORY,remote]);
  if (git(['status','--porcelain','--',...SOURCE_PATHS]) || git(['diff','--name-only',remote,'--',...SOURCE_PATHS])) {
    throw new Error('Stale or modified observer source: use the clean current-main files before deployment.');
  }
  const files=git(['ls-files','--',...SOURCE_PATHS]).split('\n').filter(Boolean);
  if (!files.includes('refresh-worker/src/index.mjs') || !files.includes('refresh-worker/src/probe.mjs')) throw new Error('Incomplete observer source checkout.');
  const revision=sourceRevision(root,files);
  const health=async()=>{
    try {
      const response=await fetcher(`${CONTROL_URL}/health`,{redirect:'error',signal:AbortSignal.timeout(10000)});
      if (!response.ok) return false;
      const value=await response.json();
      return value.ok===true && value.service==='platehk-refresh' && value.observer_enabled===true && value.dispatch_enabled===false && value.source_revision===revision;
    } catch {return false;}
  };
  if (ensure && await health()) return {deployed:false,source_revision:revision};
  const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
  if (!existsSync(wrangler)) run('npm',['ci']);
  const directory=mkdtempSync(join(tmpdir(),'platehk-observer-release-'));
  try {
    const bundle=join(directory,'index.js');
    run(process.execPath,[wrangler,'deploy','--dry-run','--outdir',directory,'--config','refresh-worker/wrangler.jsonc','--define',`__REFRESH_SOURCE_REVISION__:${JSON.stringify(revision)}`]);
    // Publish the frozen bundle, not a working tree another process can edit.
    if (git(['status','--porcelain','--',...SOURCE_PATHS]) || sourceRevision(root,files)!==revision) throw new Error('Observer source changed during bundling; deployment blocked.');
    const latest=git(['ls-remote',REPOSITORY,'refs/heads/main']).split(/\s/)[0];
    if (!/^[a-f0-9]{40}$/.test(latest)) throw new Error('Cannot verify canonical main before publication.');
    if (latest!==remote) {
      git(['fetch','--depth','1',REPOSITORY,latest]);
      if (git(['diff','--name-only',latest,'--',...SOURCE_PATHS])) throw new Error('Observer source on main advanced during preparation; retry from current main.');
    }
    let failure;
    try {run(process.execPath,[wrangler,'deploy',bundle,'--no-bundle','--config','refresh-worker/wrangler.jsonc','--keep-vars','--message',`Verified observer source ${revision}`]);}
    catch (error) {failure=error;}
    for (let attempt=0;attempt<3;attempt++) {
      if (await health()) return {deployed:true,source_revision:revision};
      if (attempt<2) await pause(1000);
    }
    throw failure || new Error('Observer deployment did not expose the expected source revision.');
  } finally {
    rmSync(directory,{recursive:true,force:true});
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if (process.argv.slice(2).some(arg=>arg!=='--ensure-current')) throw new Error('Unknown observer deployment option');
  try {console.log(JSON.stringify(await deployObserver({ensure:process.argv.includes('--ensure-current')})));}
  catch (error) {
    console.error('::error::SOURCE_OBSERVATION_UNAVAILABLE: observer release verification failed before source collection; publication held.');
    throw error;
  }
}
