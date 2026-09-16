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
test('matching owner fills missing image address and share; conflicts prefer OCR and retain text in notes',()=>{
 const c=setup();
 const result=c.reconcileOwners([base],[{...base,name:'休＊＊',address:'新北市三芝區測試路1號',numerator:'1',denominator:'3',shareAvailable:true}]);
 assert.equal(result.length,1);assert.equal(result[0].name,'休＊＊');
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
test('land heading and labeled designation fields follow transcript example',()=>{
 const c=setup();
 const r=c.extractLandFields('土地登記第二類謄本（地號全部） 恆春鎮頂水泉段 0691-0000地號 列印時間：民國111年07月14日 土地標示部 登記日期：民國107年11月09日 面積：****2,511.18平方公尺 使用分區：國家公園區 使用地類別：（空白） 民國111年01月 公告土地現值：****8,200元／平方公尺 土地所有權部 住址：臺北市中山區測試路');
 assert.equal(r.district,'恆春鎮');assert.equal(r.section,'頂水泉段');assert.equal(r.parcel,'0691-0000');
 assert.equal(r.area,'2511.18');assert.equal(r.value,'8200');assert.equal(r.valuePeriod,'民國111年01月');
 assert.equal(r.zoning,'國家公園區');assert.equal(r.landCategory,'（空白）');
});
test('land fields do not borrow dates or classifications from owners',()=>{
 const c=setup();
 const r=c.extractLandFields('新北市三芝區土地公埔段埔尾小段0155-0000地號 土地標示部 民國110年02月01日 面積：5092平方公尺 使用分區：山坡地保育區 使用地類別：農牧用地 公告土地現值：4000 土地所有權部 民國111年01月公告土地現值：8000');
 assert.equal(r.district,'新北市三芝區');assert.equal(r.section,'土地公埔段埔尾小段');
 assert.equal(r.valuePeriod,'');assert.equal(r.value,'4000');assert.equal(r.landCategory,'農牧用地');
});
test('county comes from jurisdiction authority, never issuer or owner address',()=>{
 const c=setup();
 const text='恆春鎮頂水泉段0691-0000地號 資 料 管 轄 機 關：屏 東 縣恆春地政事務所 謄本核發機關：臺北市某地政事務所 土地標示部 土地所有權部 住址：高雄市左營區';
 assert.equal(c.extractLandFields(text).district,'屏東縣恆春鎮');
 assert.equal(c.extractLandFields(text.replace('資料','資料')).section,'頂水泉段');
 assert.equal(c.extractLandFields('竹北市測試段0001-0000地號 資料管轄機關：新竹縣竹北地政事務所 土地標示部').district,'新竹縣竹北市');
 assert.equal(c.extractLandFields('屏東縣恆春鎮頂水泉段0691-0000地號 資料管轄機關：屏東縣恆春地政事務所 土地標示部').district,'屏東縣恆春鎮');
 assert.equal(c.extractLandFields('恆春鎮頂水泉段0691-0000地號 謄本核發機關：臺北市某地政事務所 土地標示部 土地所有權部 住址：高雄市').district,'恆春鎮');
});
test('OCR conflicts replace owner fields and retain both values for review',()=>{
 const c=setup(),direct={...base,shareAvailable:true,numerator:'1',denominator:'2',common:true,address:'舊路1號',date:'民國110.01.01',reason:'買賣'};
 const scan={...direct,name:'李＊＊',address:'新路2號',numerator:'3',denominator:'4',common:false,date:'民國111.01.01',reason:'繼承'};
 const result=c.reconcileOwners([direct],[scan])[0];
 for(const key of ['name','address','date','numerator','denominator','common'])assert.equal(result[key],scan[key]);
 assert.ok(result.review.some(x=>x.includes('文字：舊路1號；採用OCR：新路2號')));
 assert.ok(result.review.some(x=>x.includes('文字：1／2；採用OCR：3／4')));
 const missing=c.reconcileOwners([direct],[{...scan,address:'',shareAvailable:false}])[0];
 assert.equal(missing.address,direct.address);assert.equal(missing.denominator,'2');
});
test('land conflicts prefer OCR and preserve original in supplemental notes',()=>{
 const c=setup();
 const r=c.reconcileLandFields('恆春鎮頂水泉段0691-0000地號 土地標示部 公告土地現值：8000 使用分區：一般農業區','恆春鎮頂水泉段0691-0000地號 土地標示部 公告土地現值：8200 使用分區：國家公園區');
 assert.equal(r.fields.value,'8200');assert.equal(r.fields.zoning,'國家公園區');
 assert.ok(r.review.some(x=>x.includes('文字：8000；採用OCR：8200')));
});
test('red watermark fading preserves black, gray, blue and dark overlapping strokes',()=>{
 const c=setup();
 const pixels=new Uint8ClampedArray([255,70,70,255, 0,0,0,255, 120,120,120,255, 30,30,240,255, 90,15,15,255, 255,240,240,255]);
 assert.equal(c.fadeRedWatermarkPixels(pixels),1);
 assert.deepEqual(Array.from(pixels),[255,255,255,255,0,0,0,255,120,120,120,255,30,30,240,255,90,15,15,255,255,240,240,255]);
});
test('watermark decode failures safely retain original image and do not call OCR',async()=>{
 const c=setup({createImageBitmap:async()=>{throw new Error('unsupported');}});
 const blob={size:100};
 assert.equal(await c.fadeRedWatermarkBlob(blob),blob);
 const jobs=[{blob,pageKey:'one'},{blob,pageKey:'two'}];
 await c.prepareWatermarkImages(jobs,()=>{});
 assert.equal(jobs.length,2);assert.equal(jobs[0].blob,blob);assert.equal(jobs[1].pageKey,'two');
});
test('invalid ID is not recorded, trailing name digits removed, reason prefers text',()=>{
 const c=setup();
 const direct={...base,name:'林＊＊',id:'A123****89',reason:'買賣'};
 const scan={...base,name:'林＊＊123',id:'A123****891',reason:'繼承'};
 const r=c.reconcileOwners([direct],[scan])[0];
 assert.equal(r.id,direct.id);assert.equal(r.name,'林＊＊');assert.equal(r.reason,'買賣');
 assert.ok(r.review.some(x=>x.includes('採用文字：買賣；OCR：繼承')));
 assert.ok(r.review.some(x=>x.includes('非10碼')));
 assert.equal(c.validateOwnerIdentity(scan).id,'');
 assert.equal(c.validateOwnerIdentity({name:'王＊＊１２',id:'A12'}).name,'王＊＊');
 assert.equal(c.genderFromId('A123****891'),'—');
 assert.equal(c.reconcileOwners([{...direct,reason:''}],[scan])[0].reason,'繼承');
});