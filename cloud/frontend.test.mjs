import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('cloud OCR requires consent and separates image addresses from page text',async()=>{
 const fields={'#cloudConsent':{checked:false},'#cloudAccessCode':{value:'test-access-code-123456'}};
 let calls=0;
 const context=vm.createContext({window:{},document:{querySelector:s=>fields[s]},URL,AbortSignal,
  blobToBase64:async()=> 'AAAA',fetch:async()=>({ok:true,json:async()=>({text:++calls===1?'頁面文字':'圖片住址'})})});
 vm.runInContext(await readFile(new URL('../cloud-ocr.js',import.meta.url),'utf8'),context);
 const jobs=[{kind:'page',blob:{size:10}},{kind:'address',blob:{size:10}}];
 await assert.rejects(context.runGoogleOcr(jobs,()=>{}),/同意/);
 assert.equal(calls,0);
 fields['#cloudConsent'].checked=true;
 const result=await context.runGoogleOcr(jobs,()=>{});
 assert.equal(result.ocrText,'\n頁面文字');
 assert.equal(result.addressTexts[0],'圖片住址');
 assert.equal(calls,2);
});
test('app loads without missing functions or element references',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const elements=new Map();
 const context=vm.createContext({document:{querySelector:s=>{
  assert.ok(html.includes('id="'+s.slice(1)+'"'),'missing element '+s);
  if(!elements.has(s)) elements.set(s,{addEventListener(){},children:[]});
  return elements.get(s);
 }},refreshCloudSetup(){},localStorage:{getItem:()=>null}});
 vm.runInContext(await readFile(new URL('../app.js',import.meta.url),'utf8'),context);
 assert.equal(typeof context.autoGrowField,'function');
});
