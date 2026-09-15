import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function setup(extra={}) {
 const ctx=vm.createContext({document:{querySelector:()=>({children:[],addEventListener(){}})},localStorage:{getItem:()=>null},refreshCloudSetup(){},...extra});
 vm.runInContext(source,ctx);return ctx;
}
const base={name:'林＊＊',id:'A123****89',address:'',sequence:'0001',registrationSequence:'0010',numerator:'1',denominator:'1',shareAvailable:false,common:false,date:'',reason:''};
const record=(seq,name,address,share='3分之1')=>'土地所有權部\n（0001）登記次序：'+seq+'\n所有權人：'+name+'\n統一編號：A123****89\n住址：'+address+'\n權利範圍：'+share+'\n登記原因：繼承';
test('hybrid mode gets PDF text but sends exactly one full-page image even with many owners',async()=>{
 let renders=0,texts=0;
 const text='土地所有權部 統一編號 '.repeat(20);
 const page={getTextContent:async()=>{texts++;return {items:[{str:text,transform:[1,0,0,1,0,100]}]};},getViewport:()=>({width:100,height:200}),render:()=>{renders++;return {promise:Promise.resolve()};}};
 const pdfjs={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:4,getPage:async()=>page})})};
 const c=setup({document:{querySelector:()=>({children:[],addEventListener(){}}),createElement:()=>({getContext:()=>({}),toBlob:f=>f({size:10})})}});
 const r=await c.collectSourceContent([{type:'application/pdf',name:'test.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}],'auto',()=>{},async()=>pdfjs);
 assert.equal(renders,4);assert.equal(texts,4);assert.equal(r.images.length,4);
 assert.ok(r.images.every(x=>x.kind==='page'));
 assert.equal(new Set(r.images.map(x=>x.pageKey)).size,4);
 assert.ok(r.pages.every(x=>x.directText===text.trim()));
});
test('matching owner fills missing image address and share; conflicts preserve text and flag alternative',()=>{
 const c=setup();
 const result=c.reconcileOwners([base],[{...base,name:'休＊＊',address:'新北市三芝區測試路1號',numerator:'1',denominator:'3',shareAvailable:true}]);
 assert.equal(result.length,1);assert.equal(result[0].name,'林＊＊');
 assert.equal(result[0].address,'新北市三芝區測試路1號');
 assert.equal(result[0].denominator,'3');
 assert.ok(result[0].review.some(x=>x.includes('姓名不一致')));
});
test('document scope and registration order prevent address misalignment across files',()=>{
 const c=setup();
 const pages=[{fileKey:'a',pageKey:'a1',directText:record('0010','林＊＊','')},{fileKey:'b',pageKey:'b1',directText:record('0010','王＊＊','')}];
 const result=c.reconcileDocumentPages(pages,[{pageKey:'b1',text:record('0010','王＊＊','乙市乙路2號')},{pageKey:'a1',text:record('0010','林＊＊','甲市甲路1號')}]);
 assert.equal(result.length,2);
 assert.equal(result[0].address,'甲市甲路1號');
 assert.equal(result[1].address,'乙市乙路2號');
 assert.notEqual(result[0].sequence,result[1].sequence);
});
test('unknown matches are not paired by position or masked surname; missing share is not 1/1',()=>{
 const c=setup();
 const result=c.reconcileOwners([{...base,sequence:'',registrationSequence:''}],[{...base,sequence:'',registrationSequence:'',address:'別人的住址'}]);
 assert.equal(result.length,2);assert.equal(result[0].address,'');
 assert.equal(result[0].numerator,'');
 assert.ok(result[1].review.some(x=>x.includes('是否為遺漏或重複')));
});
test('multiline image address is retained and duplicate registration headings do not split records',()=>{
 const c=setup();
 const r=c.parsedOwners(record('0010','林＊＊','新北市三芝區測試路\n123巷45號6樓'));
 assert.equal(r.length,1);assert.equal(r[0].sequence,'0001');
 assert.equal(r[0].registrationSequence,'0010');
 assert.equal(r[0].address,'新北市三芝區測試路123巷45號6樓');
});
test('simple UI hides provider setup and usage but keeps code, consent and neutral progress',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<input id="readMode" type="hidden" value="auto">/);
 assert.match(html,/<section hidden class="paddle-setup"/);
 assert.match(html,/<section hidden id="ocrUsage"/);
 const visible=html.replace(/<section hidden[\s\S]*?<\/section>/g,'');
 assert.doesNotMatch(visible,/Google|PaddleOCR|Cloud Vision/);
 assert.match(visible,/id="cloudAccessCode"/);
 assert.match(visible,/id="cloudConsent"/);
 const c=setup();let status='';
 c.document.querySelector=()=>({set textContent(v){status=v;}});
 c.setOcrEngine('Google Cloud Vision');c.setProgress(50,'進行中');
 assert.equal(status,'OCR：進行中');
});
test('OCR response retains page identifiers for reconciliation and neutralizes provider errors',async()=>{
 const fields={'#cloudConsent':{checked:true},'#cloudAccessCode':{value:'test-only-code'}};
 const c=vm.createContext({window:{},document:{querySelector:s=>fields[s]},URL,AbortSignal,blobToBase64:async()=> 'AAAA',
 fetch:async()=>({ok:true,json:async()=>({text:'test result'})})});
 vm.runInContext(await readFile(new URL('../cloud-ocr.js',import.meta.url),'utf8'),c);
 const jobs=[{kind:'page',pageKey:'pdf-0-2',blob:{size:1}}];
 const r=await c.runGoogleOcr(jobs,()=>{});
 assert.equal(r.pageResults[0].pageKey,'pdf-0-2');
 assert.equal(r.pageResults[0].text,'test result');
 c.fetch=async()=>({ok:false,status:502,json:async()=>({error:'Google OCR 請求失敗'})});
 await assert.rejects(c.runGoogleOcr(jobs,()=>{}),error=>error.message==='辨識服務 請求失敗');
});