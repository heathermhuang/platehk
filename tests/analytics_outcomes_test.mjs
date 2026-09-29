import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../assets/analytics.js',import.meta.url),'utf8');
function analytics({host='plate.hk',dnt='0',gpc=false,optOut=false}={}) {
  const handlers={};
  const context={location:{hostname:host,origin:`https://${host}`,pathname:'/'},navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},localStorage:{getItem:()=>optOut?'off':null},
    document:{referrer:'https://example.test/from?private=secret',head:{appendChild(){}},createElement:()=>({}),addEventListener(name,fn){(handlers[name]??=[]).push(fn);}},URL,Date,Set};
  context.window=context;vm.runInNewContext(code,context);
  return {api:context.PlateAnalytics,events:()=>Array.from(context.dataLayer||[]).filter(item=>item[0]==='event'),handlers};
}
const lookup={plate:'AA88',result_count:2,exact_match:true,action:'main_lookup',dataset:'all',page_number:1};

test('only valid first-page outcomes enter the lookup denominator',()=>{
  const a=analytics();
  for(const changed of [{plate:''},{plate:'Q'},{page_number:2},{result_count:-1},{result_count:undefined},{result_count:1.5}])assert.equal(a.api.lookup({...lookup,...changed}),false);
  assert.equal(a.api.lookup(lookup),true);
  assert.deepEqual(a.events().map(event=>event[1]),['page_view','lookup_complete','lookup_success']);
  assert.equal(a.api.lookup(lookup),false);
  assert.equal(a.events().length,3);
  assert.equal(a.api.lookup({...lookup,plate:'AB1234',result_count:0,exact_match:false}),true);
  assert.equal(a.events().at(-1)[1],'lookup_no_result');
  assert.equal(a.events().at(-1)[2].result_outcome,'empty');
});

test('failures remain errors and a recovery can produce a new visible outcome',()=>{
  const a=analytics();a.api.lookup(lookup);
  assert.equal(a.api.lookupError({...lookup,error_kind:'request_failed'}),true);
  assert.equal(a.events().at(-1)[1],'lookup_error');
  assert.equal(a.api.lookup(lookup),true);
  assert.equal(a.events().at(-1)[1],'lookup_success');
  assert.equal(a.api.lookupError({...lookup,page_number:2}),false);
});

test('intentional input can reset consecutive-render suppression',()=>{
  const a=analytics();a.api.lookup(lookup);
  for(const handler of a.handlers.input)handler({target:{matches:()=>true}});
  assert.equal(a.api.lookup(lookup),true);
});

test('outcome and feed events retain privacy and opt-out boundaries',()=>{
  for(const options of [{host:'localhost'},{dnt:'1'},{gpc:true},{optOut:true}]) {
    const a=analytics(options);a.api.lookup(lookup);a.api.lookupError(lookup);a.api.track('results_feed_copy',{action:'en'});assert.equal(a.events().length,0);
  }
  const a=analytics();a.api.lookup({...lookup,phone:'private',email:'private',issue:'2026-09-12'});
  const event=a.events().at(-1)[2];assert.equal(event.phone,undefined);assert.equal(event.email,undefined);assert.equal(event.issue,'2026-09-12');assert.equal(event.page_location,'https://plate.hk/');
  assert.equal(a.events()[0][2].page_referrer,'https://example.test/from');
});
