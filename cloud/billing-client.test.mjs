import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../billing-client.js',import.meta.url),'utf8');
function setup({storage=new Map(),paid=true,balance=10}={}){
 const nodes=new Map(),requests=[],confirms=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'test-customer-code',textContent:'',hidden:true,addEventListener(){}});return nodes.get(id);};
 const ctx=vm.createContext({window:{},document:{getElementById:node},crypto:webcrypto,TextEncoder,AbortSignal,setTimeout:f=>f(),
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  cloudBaseUrl:()=> 'https://test.example',confirm:s=>{confirms.push(s);return true;},
  fetch:async(url,opts)=>{
   requests.push({url,opts});
   if(url.endsWith('/api/health'))return {ok:true,json:async()=>({billingEnabled:paid})};
   if(url.endsWith('/api/account'))return {ok:true,json:async()=>({balance,used:0,active:true})};
   throw new Error('Unexpected request');
  }
 });
 vm.runInContext(source,ctx);return {ctx,api:ctx.window.prepaid,nodes,node,requests,confirms,storage};
}
const jobs=()=>[{blob:{size:2,arrayBuffer:async()=>new Uint8Array([1,2]).buffer}}];
test('old backend is left unmetered without asking for payment',async()=>{
 const s=setup({paid:false});await s.api.prepare(jobs(),'test-customer-code');
 assert.equal(s.api.active,false);assert.equal(s.confirms.length,0);
 assert.equal(s.requests.length,1);
});
test('insufficient balance stops before submitting OCR',async()=>{
 const s=setup({balance:0});
 await assert.rejects(s.api.prepare(jobs(),'test-customer-code'),/點/);
 assert.equal(s.requests.filter(r=>r.url.endsWith('/api/ocr')).length,0);
});
test('reload resumes same request ID; completion clears checkpoint; neither code nor OCR text is stored',async()=>{
 const s=setup();await s.api.prepare(jobs(),'test-customer-code');
 const stored=JSON.parse([...s.storage.values()][0]),requestId=stored.ids[0];
 assert.ok(!JSON.stringify(stored).includes('test-customer-code'));
 const t=setup({storage:s.storage,balance:0});await t.api.prepare(jobs(),'test-customer-code');
 let body;
 t.ctx.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {status:200,ok:true,json:async()=>({text:'敏感文字',requestId})};};
 await t.api.request(0,'image','test-customer-code',()=>{});
 assert.equal(body.requestId,requestId);
 t.api.record(0,{requestId,text:'敏感文字'});
 assert.ok(![...s.storage.values()][0].includes('敏感文字'));
 t.api.finish();assert.equal(s.storage.size,0);
});
test('uncertain network response polls same operation instead of starting a new charge',async()=>{
 const s=setup();await s.api.prepare(jobs(),'test-customer-code');
 let posts=0,polls=0,postedId;
 s.ctx.fetch=async(url,opts)=>{
  if(url.endsWith('/api/ocr')){posts++;postedId=JSON.parse(opts.body).requestId;throw new TypeError('lost response');}
  assert.ok(url.includes('/api/ocr/result?requestId='+postedId));polls++;
  return {status:200,ok:true,json:async()=>({text:'恢復結果',requestId:postedId})};
 };
 const response=await s.api.request(0,'image','test-customer-code',()=>{});
 assert.equal((await response.json()).text,'恢復結果');assert.equal(posts,1);assert.equal(polls,1);
});
test('user rejects price confirmation: no OCR request or checkpoint is created',async()=>{
 const s=setup();s.ctx.confirm=()=>false;
 await assert.rejects(s.api.prepare(jobs(),'test-customer-code'),/取消/);
 assert.equal(s.storage.size,0);
 assert.equal(s.requests.filter(r=>r.url.endsWith('/api/ocr')).length,0);
});
test('refunded page retries with a fresh ID without resetting already successful pages',async()=>{
 const s=setup();
 const two=[...jobs(),{blob:{size:1,arrayBuffer:async()=>new Uint8Array([3]).buffer}}];
 await s.api.prepare(two,'test-customer-code');
 const before=JSON.parse([...s.storage.values()][0]);
 s.api.record(0,{requestId:before.ids[0]});
 s.api.release(1);
 const after=JSON.parse([...s.storage.values()][0]);
 assert.equal(after.ids[0],before.ids[0]);
 assert.notEqual(after.ids[1],before.ids[1]);
 assert.equal(after.done[0],true);
});