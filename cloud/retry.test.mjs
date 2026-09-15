import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../cloud-ocr.js',import.meta.url),'utf8');
function harness(fetcher) {
 const delays=[],sent=[],labels=[];
 const fields={'#cloudConsent':{checked:true},'#cloudAccessCode':{value:'test-credential-123456'}};
 const context=vm.createContext({
  window:{},document:{querySelector:s=>fields[s]},URL,AbortSignal,
  setTimeout:(callback,ms)=>{delays.push(ms);callback();},
  blobToBase64:async blob=>blob.image,
  fetch:async(url,options)=>{sent.push(JSON.parse(options.body).image);return fetcher(sent.length);}
 });
 vm.runInContext(source,context);
 return {context,delays,sent,labels,run:jobs=>context.runGoogleOcr(jobs,(_,label)=>labels.push(label))};
}
const response=(status,body,header=null)=>({status,ok:status===200,json:async()=>body,headers:{get:()=>header}});
const jobs=[{kind:'page',blob:{size:1,image:'page-one'}},{kind:'address',blob:{size:1,image:'address-two'}}];
test('old backend 429 waits 61 seconds; retries same image and retains previous results',async()=>{
 const h=harness(n=>n===2?response(429,{error:'使用頻率過高'}):response(200,{text:n===1?'page text':'address text'}));
 const result=await h.run(jobs);
 assert.deepEqual(h.sent,['page-one','address-two','address-two']);
 assert.equal(h.delays.length,61);
 assert.ok(h.delays.every(ms=>ms===1000));
 assert.equal(result.ocrText,'\npage text');
 assert.equal(result.addressTexts.length,1);
 assert.equal(result.addressTexts[0],'address text');
 assert.ok(h.labels.some(s=>s.includes('已完成 1 項')));
});
test('honors Retry-After and gives up after three waits',async()=>{
 const h=harness(()=>response(429,{},'2'));
 await assert.rejects(h.run([jobs[0]]),/重試 3 次/);
 assert.equal(h.sent.length,4);
 assert.equal(h.delays.length,6);
});
test('authorization, server errors and uncertain network failures are not retried',async()=>{
 for(const status of [401,403,502]){
  const h=harness(()=>response(status,{error:'blocked'}));
  await assert.rejects(h.run(jobs),/blocked/);
  assert.equal(h.sent.length,1);
  assert.equal(h.delays.length,0);
 }
 const h=harness(()=>{throw new Error('network lost');});
 await assert.rejects(h.run(jobs),/network lost/);
 assert.equal(h.sent.length,1);
});
test('retry metadata handles HTTP dates and invalid values',()=>{
 const h=harness(()=>{});
 assert.equal(h.context.ocrRetrySeconds(response(429,{},'bad'),{}),61);
 assert.equal(h.context.ocrRetrySeconds(response(429,{}),{retryAfterSeconds:3}),3);
 assert.ok(h.context.ocrRetrySeconds(response(429,{},new Date(Date.now()+30000).toUTCString()),{})<=30);
});
