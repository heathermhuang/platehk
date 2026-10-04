import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../assets/analytics.js',import.meta.url),'utf8');
function analytics({host='plate.hk',dnt='0',gpc=false,optOut=false,search=''}={}) {
  const handlers={};
  let now=0,nextTimer=0;const timers=new Map();
  const context={location:{hostname:host,origin:`https://${host}`,pathname:'/',search},navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},localStorage:{getItem:()=>optOut?'off':null},
    document:{referrer:'https://example.test/from?private=secret',head:{appendChild(){}},createElement:()=>({}),addEventListener(name,fn){(handlers[name]??=[]).push(fn);}},URL,URLSearchParams,Date,Set,
    setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
  context.window=context;vm.runInNewContext(code,context);
  const advance=ms=>{const end=now+ms;for(;;){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);now=next[1].at;next[1].fn();}now=end;};
  return {api:context.PlateAnalytics,events:()=>Array.from(context.dataLayer||[]).filter(item=>item[0]==='event'),config:()=>Array.from(context.dataLayer||[]).find(item=>item[0]==='config')?.[2],handlers,advance};
}
const lookup={plate:'AA88',result_count:2,exact_match:true,action:'main_lookup',dataset:'all',page_number:1};

test('only valid first-page outcomes enter the lookup denominator',()=>{
  const a=analytics();
  for(const changed of [{plate:''},{plate:'Q'},{page_number:2},{result_count:-1},{result_count:undefined},{result_count:1.5}])assert.equal(a.api.lookup({...lookup,...changed}),false);
  assert.equal(a.api.lookup(lookup),true);
  a.advance(1500);
  assert.deepEqual(a.events().map(event=>event[1]),['page_view','lookup_complete','lookup_success','lookup_exact_match']);
  assert.equal(a.api.lookup(lookup),false);
  assert.equal(a.events().length,4);
  assert.equal(a.api.lookup({...lookup,plate:'AB1234',result_count:0,exact_match:false}),true);
  a.advance(1500);
  assert.equal(a.events().at(-1)[1],'lookup_no_result');
  assert.equal(a.events().at(-1)[2].result_outcome,'empty');
});

test('failures remain errors and a recovery can produce a new visible outcome',()=>{
  const a=analytics();a.api.lookup(lookup);a.advance(1500);
  assert.equal(a.api.lookupError({...lookup,error_kind:'request_failed'}),true);
  assert.equal(a.events().at(-1)[1],'lookup_error');
  assert.equal(a.api.lookup(lookup),true);
  a.advance(1500);
  assert.equal(a.events().at(-1)[1],'lookup_exact_match');
  assert.equal(a.api.lookupError({...lookup,page_number:2}),false);
});

test('intentional input can reset consecutive-render suppression',()=>{
  const a=analytics();a.api.lookup(lookup);a.advance(1500);
  for(const handler of a.handlers.input)handler({target:{matches:()=>true}});
  assert.equal(a.api.lookup(lookup),true);
  a.advance(1500);
});

test('outcome and feed events retain privacy and opt-out boundaries',()=>{
  for(const options of [{host:'localhost'},{dnt:'1'},{gpc:true},{optOut:true}]) {
    const a=analytics(options);a.api.lookup(lookup);a.api.lookupError(lookup);a.api.track('results_feed_copy',{action:'en'});assert.equal(a.events().length,0);
  }
  const a=analytics();a.api.lookup({...lookup,phone:'private',email:'private',issue:'2026-09-12'});a.advance(1500);
  const event=a.events().at(-1)[2];assert.equal(event.phone,undefined);assert.equal(event.email,undefined);assert.equal(event.issue,'2026-09-12');assert.equal(event.page_location,'https://plate.hk/');
  assert.equal(a.events()[0][2].page_referrer,'https://example.test/from');
});

test('campaign attribution retains only bounded public source, medium and campaign slugs',()=>{
  const a=analytics({search:'?utm_source=threads&utm_medium=social&utm_campaign=auction-sep&q=AA88&email=private%40example.test&utm_term=private'});
  const config=a.config();
  assert.equal(config.campaign_source,'threads');
  assert.equal(config.campaign_medium,'social');
  assert.equal(config.campaign_name,'auction-sep');
  assert.equal(config.campaign_term,undefined);
  assert.equal(config.page_location,'https://plate.hk/');
  for(const search of ['?utm_source=private%40example.test&utm_medium=email','?utm_source=https%3A%2F%2Fexample.test&utm_medium=social','?utm_source=1234567890&utm_medium=email','?utm_source=threads&utm_medium=social&utm_campaign='+ 'x'.repeat(61)]) {
    const config=analytics({search}).config();
    assert.equal(config.campaign_name,undefined);
    if(!search.includes('utm_source=threads'))assert.equal(config.campaign_source,undefined);
  }
});

test('typing replaces a pending result and emits only the settled visible query',()=>{
  const a=analytics();a.api.lookup({...lookup,plate:'A',exact_match:false});a.advance(500);
  for(const fn of a.handlers.input)fn({target:{matches:()=>true}});
  a.api.lookup(lookup);a.advance(1499);
  assert.deepEqual(a.events().map(event=>event[1]),['page_view']);
  a.advance(1);
  assert.equal(a.events().filter(event=>event[1]==='lookup_complete').length,1);
  assert.equal(a.events().at(-1)[2].plate,'AA88');
  assert.equal(a.events().at(-1)[2].measurement_version,'settled_v2');
});

test('a new input cancels the old visible outcome before a replacement request resolves',()=>{
  const a=analytics();a.api.lookup(lookup);
  for(const fn of a.handlers.input)fn({target:{matches:()=>true}});
  a.advance(3000);
  assert.deepEqual(a.events().map(event=>event[1]),['page_view']);
});

test('Enter or leaving the input commits a visible pending result without a duplicate',()=>{
  for(const name of ['keydown','focusout']) {
    const a=analytics();a.api.lookup(lookup);
    assert.deepEqual(a.events().map(event=>event[1]),['page_view']);
    for(const fn of a.handlers[name]||[])fn({key:'Enter',target:{matches:()=>true}});
    assert.equal(a.events().filter(event=>event[1]==='lookup_complete').length,1);
    a.advance(3000);
    assert.equal(a.events().filter(event=>event[1]==='lookup_complete').length,1);
  }
});

test('positive partial matches remain distinct from exact plate matches',()=>{
  const a=analytics();a.api.lookup({...lookup,exact_match:false,match_mode:'contains'});a.advance(1500);
  assert.equal(a.events().some(event=>event[1]==='lookup_success'),true);
  assert.equal(a.events().some(event=>event[1]==='lookup_exact_match'),false);
  assert.equal(a.events().at(-1)[2].match_mode,'contains');
});

test('history navigation is immediate and lookup errors cancel a pending success',()=>{
  const a=analytics();a.api.lookup({...lookup,action:'plate_history'});
  assert.equal(a.events().at(-1)[1],'lookup_exact_match');
  const b=analytics();b.api.lookup(lookup);b.api.lookupError({...lookup,error_kind:'request_failed'});b.advance(3000);
  assert.equal(b.events().some(event=>event[1]==='lookup_success'),false);
});
