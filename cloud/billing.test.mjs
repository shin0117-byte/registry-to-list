import test from 'node:test';
import assert from 'node:assert/strict';
import {Billing} from './billing.mjs';
import {FirestoreStore} from './firestore-store.mjs';
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
const code='ocr_'+'a'.repeat(64),otherCode='ocr_'+'b'.repeat(64);
const rid='request-id-00000001';
async function setup(balance=1){
 const store=new MemoryStore();let now=1000000;
 const billing=new Billing(store,{now:()=>now,lease:1000,codeKey:'1'.repeat(64)});
 const account=await billing.create({customerRef:'C1',name:'測試客戶',code});
 const p='ocrAccounts/'+account.id,s=await store.read(p);await store.commit([{...s,data:{...s.data,balance}}]);
 return {billing,store,id:account.id,tick:ms=>now+=ms};
}
test('create stores no plaintext secret and grants trial only once per customer reference',async()=>{
 const {billing,store}=await setup(10);
 await billing.create({customerRef:'c1',name:'測試客戶',code});
 assert.equal((await billing.account(code)).balance,10);
 await assert.rejects(billing.create({customerRef:'C1',name:'另一組',code:otherCode}),e=>e.status===409);
 assert.ok(!JSON.stringify([...store.docs]).includes(code));
});
test('manual credit is atomic and idempotent, changed payload is rejected',async()=>{
 const {billing,id}=await setup(0);
 const input={accountId:id,plan:'standard',requestId:rid,note:'收款001'};
 await Promise.all([billing.credit(input),billing.credit(input)]);
 assert.equal((await billing.account(code)).balance,500);
 await assert.rejects(billing.credit({...input,plan:'bulk'}),e=>e.status===409);
 await assert.rejects(billing.credit({...input,plan:'__proto__'}),e=>e.status===400);
});
test('successful response replay uses cached text, charges once and binds image',async()=>{
 const {billing}=await setup(1);let calls=0;
 const run=()=>billing.recognize(code,{image:'image-one',requestId:rid},async()=>{calls++;return '辨識結果';});
 assert.equal((await run()).text,'辨識結果');
 assert.equal((await run()).text,'辨識結果');
 assert.equal(calls,1);
 const a=await billing.account(code);assert.equal(a.balance,0);assert.equal(a.used,1);
 await assert.rejects(billing.recognize(code,{image:'another',requestId:rid},async()=>''),e=>e.status===409);
});
test('two server instances and simultaneous requests cannot overspend or call OCR twice',async()=>{
 const {billing,store}=await setup(1),second=new Billing(store,{now:()=>1000000});
 let release,started;const ready=new Promise(r=>started=r);let calls=0;
 const first=billing.recognize(code,{image:'x',requestId:rid},async()=>{calls++;started();return new Promise(r=>release=r);});
 await ready;
 assert.equal((await second.recognize(code,{image:'x',requestId:rid},async()=>{calls++;return 'wrong';})).pending,true);
 await assert.rejects(second.recognize(code,{image:'y',requestId:'another-request-001'},async()=>{calls++;return 'wrong';}),e=>e.status===409);
 release('文字');await first;
 assert.equal(calls,1);assert.equal((await billing.account(code)).balance,0);
 await assert.rejects(second.recognize(code,{image:'y',requestId:'another-request-001'},async()=>''),e=>e.status===402);
});
test('failure and empty output refund; retryable quota errors retry the same operation safely',async()=>{
 const {billing,tick}=await setup(1);
 const input={image:'x',requestId:rid};
 await assert.rejects(billing.recognize(code,input,async()=>{throw Object.assign(new Error('quota'),{status:429});}));
 assert.equal((await billing.account(code)).balance,1);
 await assert.rejects(billing.recognize(code,input,async()=>''),e=>e.status===429);
 tick(61000);await billing.recognize(code,input,async()=>'文字');
 assert.equal((await billing.account(code)).used,1);
 const s=await setup(1);
 await assert.rejects(s.billing.recognize(code,input,async()=>''),e=>e.status===422);
 assert.equal((await s.billing.account(code)).balance,1);
 await assert.rejects(s.billing.recognize(code,input,async()=>'文字'),e=>e.status===409);
});
test('crashed worker reservations are refunded once and late completion cannot charge',async()=>{
 const {billing,id,tick}=await setup(1);
 await billing.reserve(id,rid,'fingerprint');
 tick(1001);
 await Promise.all([billing.account(code),billing.account(code)]);
 assert.equal((await billing.account(code)).balance,1);
 await assert.rejects(billing.finish(id,rid,'too late'),e=>e.status===409);
 assert.equal((await billing.account(code)).used,0);
});
test('lost completion response can recover result without refunding or charging twice',async()=>{
 const {billing,store}=await setup(1);const commit=store.commit.bind(store);
 store.commit=async writes=>{await commit(writes);if(writes.some(w=>w.data.status==='completed'))throw new Error('connection lost');};
 await assert.rejects(billing.recognize(code,{image:'x',requestId:rid},async()=>'結果'));
 store.commit=commit;
 assert.equal((await billing.recognize(code,{image:'x',requestId:rid},async()=>{throw new Error('must not call');})).text,'結果');
 assert.equal((await billing.account(code)).balance,0);assert.equal((await billing.account(code)).used,1);
});
test('expired cached result is not charged again; disabled code cannot start work',async()=>{
 const {billing,tick,id}=await setup(1);
 await billing.recognize(code,{image:'x',requestId:rid},async()=>'結果');tick(86400001);
 await assert.rejects(billing.recognize(code,{image:'x',requestId:rid},async()=>'wrong'),e=>e.status===409);
 assert.equal((await billing.account(code)).used,1);
 await billing.status({accountId:id,active:false,requestId:'status-change-0001'});
 await assert.rejects(billing.recognize(code,{image:'x',requestId:'another-request-01'},async()=>'wrong'),e=>e.status===403);
});
test('REST adapter sends atomic version preconditions and timestamp TTL; conflicts surface',async()=>{
 const calls=[];
 const store=new FirestoreStore('project-test',{tokenProvider:async()=>'not-a-real-token',fetcher:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({})};}});
 await store.commit([{path:'a/b',version:'v1',data:{balance:1,active:true,pending:null,expiresAt:new Date(0)}},{path:'a/c',version:null,data:{name:'測試'}}]);
 const body=JSON.parse(calls[0].opts.body);
 assert.deepEqual(body.writes[0].currentDocument,{updateTime:'v1'});
 assert.deepEqual(body.writes[1].currentDocument,{exists:false});
 assert.equal(body.writes[0].update.fields.expiresAt.timestampValue,'1970-01-01T00:00:00.000Z');
 store.fetcher=async()=>({ok:false,status:409,json:async()=>({error:{status:'ABORTED'}})});
 await assert.rejects(store.commit([]),e=>e.conflict===true);
});
test('HTTP billing rejects legacy/admin/customer privilege crossover and malformed input before charging',async()=>{
 const {billing,id}=await setup(1);let calls=0;
 const adminCode='admin-test-secret-'.repeat(3),legacy='legacy-test-code-123456';
 const server=createOcrServer({billing,adminCode,accessCode:legacy,project:'test',annotate:async()=>{calls++;return 'test';}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const get=(path,secret)=>fetch(base+path,{headers:{Authorization:'Bearer '+secret}});
 const post=(path,secret,body)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await get('/api/admin/accounts',code)).status,401);
  assert.equal((await get('/api/usage',code)).status,401);
  assert.equal((await get('/api/account',legacy)).status,401);
  assert.equal((await get('/api/account',adminCode)).status,401);
  assert.equal((await get('/api/admin/accounts',adminCode)).status,200);
  assert.equal((await post('/api/ocr',code,{image:'???',requestId:rid})).status,400);
  assert.equal((await billing.account(code)).balance,1);assert.equal(calls,0);
  assert.equal((await post('/api/admin/credit',adminCode,{accountId:id,plan:'light',requestId:rid,note:'訂單'})).status,200);
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=';
  assert.equal((await post('/api/ocr',code,{image,requestId:rid})).status,200);
  assert.equal((await post('/api/ocr',code,{image,requestId:rid})).status,200);
  assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});
test('admin-only mode preserves legacy OCR while allowing setup without charging',async()=>{
 const {billing}=await setup(10);let calls=0;
 const legacy='legacy-test-code-123456',adminCode='admin-test-secret-'.repeat(3);
 const server=createOcrServer({billing,billingActive:false,adminCode,accessCode:legacy,project:'test',annotate:async()=>{calls++;return '文字';}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await (await fetch(base+'/api/health')).json()).billingEnabled,false);
  assert.equal((await fetch(base+'/api/admin/accounts',{headers:{Authorization:'Bearer '+adminCode}})).status,200);
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=';
  assert.equal((await fetch(base+'/api/ocr',{method:'POST',headers:{Authorization:'Bearer '+legacy,'Content-Type':'application/json'},body:JSON.stringify({image})})).status,200);
  assert.equal(calls,1);assert.equal((await billing.account(code)).balance,10);
 }finally{await new Promise(r=>server.close(r));}
});
test('same payment reference with another request ID does not credit twice',async()=>{
 const {billing,id}=await setup(0);
 await billing.credit({accountId:id,plan:'light',requestId:'payment-request-001',note:'訂單001'});
 const result=await billing.credit({accountId:id,plan:'light',requestId:'payment-request-002',note:'訂單001'});
 assert.equal(result.alreadyApplied,true);
 assert.equal((await billing.account(code)).balance,100);
});
test('encrypted codes survive restart, audit access and reject wrong keys',async()=>{
 const {billing,store,id}=await setup();
 const second=new Billing(store,{codeKey:'1'.repeat(64)});
 assert.equal((await second.reveal({accountId:id,requestId:rid})).code,code);
 await second.reveal({accountId:id,requestId:rid});
 const entries=await store.list('ocrAccounts/'+id+'/ledger');
 assert.equal(entries.items.filter(x=>x.data.type==='code_view').length,1);
 assert.ok(!JSON.stringify([...store.docs]).includes(code));
 assert.ok(!JSON.stringify(await billing.list()).includes('sealedCode'));
 const wrong=new Billing(store,{codeKey:'2'.repeat(64)});
 await assert.rejects(wrong.reveal({accountId:id,requestId:rid}),e=>e.status===503);
 assert.equal((await wrong.account(code)).balance,1);
});
test('legacy codes backfill only on valid authentication, missing key fails new creation',async()=>{
 const {billing,store,id}=await setup();
 const doc=await store.read('ocrAccounts/'+id);delete doc.data.sealedCode;await store.commit([doc]);
 await assert.rejects(billing.reveal({accountId:id,requestId:rid}),e=>e.status===409);
 const noKey=new Billing(store,{codeKey:''});
 assert.equal((await noKey.account(code)).balance,1);
 assert.equal((await store.read(doc.path)).data.sealedCode,undefined);
 await billing.account(code);
 assert.equal((await billing.reveal({accountId:id,requestId:rid})).code,code);
 await assert.rejects(noKey.create({customerRef:'C2',name:'new',code:otherCode}),e=>e.status===503);
});
test('code reveal endpoint requires admin authentication and prevents caching',async()=>{
 const {billing,id}=await setup();
 const admin='z'.repeat(32),server=createOcrServer({billing,adminCode:admin,accessCode:'x'.repeat(16)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/admin/code';
  for(const secret of ['',code]){
   const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({accountId:id,requestId:rid})});
   assert.equal(r.status,401);
  }
  const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:JSON.stringify({accountId:id,requestId:rid})});
  assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.json()).code,code);
 }finally{await new Promise(r=>server.close(r));}
});