import {createEauctionClient} from '../refresh-worker/src/eauction.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {CONTROL_URL} from './deploy_refresh_worker.mjs';

// TD sends folded response headers rejected by Node fetch. curl follows the
// same ordinary public queue; credentials and signed URLs stay on stdin.
function curlFetch(url,options={}) {
  const dir=mkdtempSync(join(tmpdir(),'platehk-public-source-'));
  const quoted=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','').replaceAll('\r','')+'"';
  try {
    const config=[`url = ${quoted(url)}`,`request = ${quoted(options.method || 'GET')}`];
    for (const [name,value] of options.headers || []) config.push(`header = ${quoted(name+': '+value)}`);
    if (options.body) config.push(`data-binary = ${quoted(options.body)}`);
    execFileSync('curl',['--silent','--show-error','--max-time','25','--max-filesize',String(8*1024*1024),'--config','-','--dump-header',join(dir,'headers'),'--output',join(dir,'body')],{input:config.join('\n'),stdio:['pipe','pipe','pipe'],timeout:30000});
    const blocks=readFileSync(join(dir,'headers'),'latin1').trim().split(/\r?\n\r?\n/);
    const lines=blocks.at(-1).replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/);
    const status=Number(/^HTTP\/[^ ]+ (\d{3})/.exec(lines.shift())?.[1]);
    const headers=new Headers();
    for (const line of lines) {const split=line.indexOf(':');if(split>0)headers.append(line.slice(0,split),line.slice(split+1).trim());}
    return new Response([204,304].includes(status) ? null : readFileSync(join(dir,'body')),{status,headers});
  } finally {rmSync(dir,{recursive:true,force:true});}
}
const client=createEauctionClient(curlFetch);
try {
  if (process.argv[2]==='list') console.log(JSON.stringify(await client.list()));
  else if (process.argv[2]==='download' && process.argv[3]) process.stdout.write((await client.download(process.argv[3])).bytes);
  else if (process.argv[2]==='observe') {
    const sources=[];
    mkdirSync('.tmp/eauction-pdfs',{recursive:true});
    for (const item of await client.list()) {
      const pdf=await client.download(item.url);
      const sha256=createHash('sha256').update(pdf.bytes).digest('hex');
      writeFileSync(`.tmp/eauction-pdfs/${item.id}.pdf`,pdf.bytes);
      const content_sha256=execFileSync(process.env.PYTHON_BIN || 'python3',['scripts/eauction_pdf.py',`.tmp/eauction-pdfs/${item.id}.pdf`],{encoding:'utf8',timeout:30000}).trim();
      if (!/^[a-f0-9]{64}$/.test(content_sha256)) throw Error('eauction_content_unverified');
      sources.push({...item,sha256,content_sha256,file_name:pdf.file_name});
    }
    const observation={checked_at:new Date().toISOString(),sources};
    writeFileSync('.tmp/eauction-observed.json',JSON.stringify(observation));
    if (process.env.REFRESH_CONTROL_TOKEN) {
      const response=await fetch(`${CONTROL_URL}/v1/eauction`,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${process.env.REFRESH_CONTROL_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(observation)});
      if (!response.ok) throw Error(`eauction_control_http_${response.status}`);
      await response.body?.cancel();
    }
    console.log(JSON.stringify({sources_observed:sources.length,latest_round:sources[0].date,checked_at:observation.checked_at}));
  } else throw Error('eauction_invalid_command');
} catch (error) {
  console.error('::error::SOURCE_OBSERVATION_UNAVAILABLE: '+(/^eauction_[a-z0-9_]+$/.test(error.message) ? error.message : 'eauction_source_unavailable'));
  process.exitCode=1;
}
