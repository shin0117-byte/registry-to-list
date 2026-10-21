import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Billing,normalizeCustomerCode} from './billing.mjs';
import {createOcrServer} from './server.mjs';
class MemoryStore {
 constructor(){this.docs=new Map();this.version=0;}
 async read(path){const d=this.docs.get(path);return {path,data:d?structuredClone(d.data):null,version:d?.version||null};}
 async commit(writes){
  for(const w of writes)if((this.docs.get(w.path)?.version||null)!==w.version)throw Object.assign(new Error('Conflict'),{conflict:true});
  for(const w of writes)this.docs.set(w.path,{version:String(++this.version),data:structuredClone(w.data)});
 }
 async list(path){return {items:[...this.docs].filter(([p])=>p.startsWith(path+'/')&&!p.slice(path.length+1).includes('/')).map(([p,v])=>({path:p,...structuredClone(v)})).sort((a,b)=>b.data.createdAt-a.data.createdAt),nextCursor:''};}
}

const short='ABCD2345EFGH6789',grouped='abcd-2345-efgh-6789',legacy='ocr_'+'a'.repeat(64);
test('short code canonicalization preserves legacy codes and rejects ambiguous characters',()=>{
 for(const input of [short,grouped,' abcd 2345 efgh 6789 '])assert.equal(normalizeCustomerCode(input),short);
 assert.equal(normalizeCustomerCode(legacy),legacy);
 for(const input of ['',null,{},'ABCD2345EFGH6780','ABCD2345EFGH678I','ABCD2345EFGH678O','ＡBCD2345EFGH6789',short+'X'])assert.equal(normalizeCustomerCode(input),'');
});
test('short and old codes retain separate encrypted accounts; spelling variants share identity and trial',async()=>{
 const store=new MemoryStore(),billing=new Billing(store,{codeKey:'1'.repeat(64)});
 const a=await billing.create({customerRef:'short',name:'短碼',code:grouped});
 const b=await billing.create({customerRef:'old',name:'舊碼',code:legacy});
 assert.equal((await billing.lookup(short)).id,a.id);assert.equal((await billing.lookup(grouped)).id,a.id);
 assert.notEqual(a.id,b.id);
 await billing.create({customerRef:'short',name:'短碼',code:short});
 assert.equal((await billing.account(grouped)).balance,10);
 assert.equal((await billing.reveal({accountId:a.id,requestId:'request-id-00000001'})).code,short);
 assert.equal((await billing.reveal({accountId:b.id,requestId:'request-id-00000002'})).code,legacy);
 assert.ok(!JSON.stringify([...store.docs]).includes(short));assert.ok(!JSON.stringify([...store.docs]).includes(legacy));
 let calls=0;const input={image:'image',requestId:'request-id-00000003'};
 await billing.recognize(grouped,input,async()=>{calls++;return '結果';});
 await billing.recognize(short,input,async()=>{calls++;return '結果';});
 assert.equal(calls,1);assert.equal((await billing.account(short)).balance,9);assert.equal((await billing.account(legacy)).balance,10);
});
test('HTTP preflight accepts short variants and legacy; capability is advertised to admin',async t=>{
 const billing=new Billing(new MemoryStore(),{codeKey:'1'.repeat(64)});
 for(const [i,code] of [short,legacy].entries())await billing.create({customerRef:String(i),name:'測試',code});
 const server=createOcrServer({billing,billingActive:true,project:'test',adminCode:'A'.repeat(32)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 for(const code of [short,grouped,legacy])assert.equal((await fetch(base+'/api/ocr/check',{headers:{Authorization:'Bearer '+code}})).status,200);
 assert.equal((await fetch(base+'/api/ocr/check',{headers:{Authorization:'Bearer BAD'}})).status,401);
 const response=await fetch(base+'/api/admin/accounts',{headers:{Authorization:'Bearer '+'A'.repeat(32)}});
 assert.equal(response.status,200);assert.equal((await response.json()).customerCodeFormat,'short16-v1');
 assert.equal((await (await fetch(base+'/api/health')).json()).customerCodeFormat,'short16-v1');
});
test('admin generates legacy codes until backend capability confirms short support',async()=>{
 const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='adminCode'?'secret':'',addEventListener(){},replaceChildren(){}});return nodes.get(id);};
 let capability;
 const c=vm.createContext({document:{getElementById:node},window:{REGISTRY_OCR_URL:'https://test.example'},URL,AbortSignal,crypto:webcrypto,fetch:async()=>({ok:true,json:async()=>({items:[],nextCursor:'',customerCodeFormat:capability})})});
 vm.runInContext(source,c);assert.match(vm.runInContext('randomCode()',c),/^ocr_[a-f0-9]{64}$/);
 capability='short16-v1';await c.load();
 const codes=new Set();for(let i=0;i<100;i++){const code=vm.runInContext('randomCode()',c);assert.match(code,/^[A-HJ-NP-Z2-9]{16}$/);codes.add(code);}assert.equal(codes.size,100);
 capability=undefined;await c.load();assert.match(vm.runInContext('randomCode()',c),/^ocr_[a-f0-9]{64}$/);
});
test('changing short code case or separators resumes original paid batch request IDs',async()=>{
 const source=await readFile(new URL('../billing-client.js',import.meta.url),'utf8'),storage=new Map();
 async function prepare(code){
  const node=()=>({value:code,addEventListener(){}}),window={};
  const c=vm.createContext({window,document:{getElementById:node},crypto:webcrypto,TextEncoder,AbortSignal,setTimeout,cloudBaseUrl:()=> 'https://test.example',ocrAuthHeaders:code=>({Authorization:'Bearer '+code}),confirm:()=>true,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async url=>({ok:true,json:async()=>url.endsWith('/api/health')?{billingEnabled:true}:{balance:10,used:0,active:true}})});
  vm.runInContext(source,c);
  await window.prepaid.prepare([{blob:{size:2,arrayBuffer:async()=>new Uint8Array([1,2]).buffer}}],code);
  return JSON.parse(storage.get('registry-prepaid-pending-v1'));
 }
 const first=await prepare(short),second=await prepare(grouped);
 assert.deepEqual(second.ids,first.ids);assert.equal(second.signature,first.signature);
});
