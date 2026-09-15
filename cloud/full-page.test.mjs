import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createOcrServer,googleVision} from './server.mjs';
test('more than 60 valid requests work without a per-minute application limit',async()=>{
 let calls=0;
 const server=createOcrServer({project:'test',accessCode:'test-credential-123456',annotate:async()=>{calls++;return 'text';}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 try {
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=';
  for(let i=0;i<65;i++) {
   const response=await fetch(url+'/api/ocr',{method:'POST',headers:{Authorization:'Bearer test-credential-123456','Content-Type':'application/json'},body:JSON.stringify({image})});
   assert.equal(response.status,200,'request '+(i+1)); await response.json();
  }
  assert.equal(calls,65);
  const health=await (await fetch(url+'/api/health')).json();
  assert.equal(health.appRateLimit,null);
 } finally {await new Promise(r=>server.close(r));}
});
test('Google upstream quota response still becomes retryable 429',async()=>{
 const fetcher=async url=>url.includes('metadata.google')?{ok:true,json:async()=>({access_token:'test'})}:{ok:false,status:429,json:async()=>({error:{code:429}})};
 await assert.rejects(googleVision('image',fetcher),e=>e.status===429 && e.retryAfterSeconds===61);
});
test('full PDF mode produces one image per page and uses only Google output',async()=>{
 let textCalls=0,renders=0,canvasCount=0;
 const page={getTextContent:async()=>{textCalls++;return {items:[]};},getViewport:()=>({width:100,height:200,scale:3}),render:()=>{renders++;return {promise:Promise.resolve()};}};
 const pdfjs={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:3,getPage:async()=>page})})};
 const context=vm.createContext({
  document:{
   querySelector:()=>({addEventListener(){},children:[]}),
   createElement:()=>{canvasCount++;return {getContext:()=>({}),toBlob:callback=>callback({size:10})};}
  },
  refreshCloudSetup(){},localStorage:{getItem:()=>null}
 });
 vm.runInContext(await readFile(new URL('../app.js',import.meta.url),'utf8'),context);
 const result=await context.collectSourceContent([{type:'application/pdf',name:'test.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}],'ocr',()=>{},async()=>pdfjs);
 assert.equal(result.images.length,3);
 assert.ok(result.images.every(job=>job.kind==='page'));
 assert.equal(renders,3); assert.equal(canvasCount,3); assert.equal(textCalls,0);
 assert.equal(context.chooseExtractionText('ocr','old text','Google OCR text'),'Google OCR text');
 assert.equal(context.chooseExtractionText('auto','direct','ocr'),'direct\nocr');
 const direct=await context.collectSourceContent([{type:'application/pdf',name:'test.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}],'direct',()=>{},async()=>pdfjs);
 assert.equal(direct.images.length,0);
 assert.equal(textCalls,3);
});
