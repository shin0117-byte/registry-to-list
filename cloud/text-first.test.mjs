import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function parser(){
 const context=vm.createContext({document:{querySelector:()=>({children:[],addEventListener(){}})},localStorage:{getItem:()=>null},refreshCloudSetup(){}});
 vm.runInContext(source,context);
 return context;
}
function transcript(share='1/96',sequence='0010',common=''){
 return `恆春鎮頂水泉段0691-0000地號\n土地標示部\n面積：960平方公尺\n土地所有權部\n（0001）登記次序：${sequence}\n所有權人：林＊＊\n統一編號：A123****89\n住址：屏東縣恆春鎮測試路1號\n權利範圍：${common}${share}\n原因發生日期：民國110年01月01日\n登記原因：繼承`;
}
test('page noise is removed without erasing the parcel heading or real fields',()=>{
 const c=parser();
 const text=transcript().replace('地號\n','地號 列印時間：民國113年08月01日\n')+'\n頁次:2\n(續次頁)\n1C\nEG\n41\nA3\nTF\n06\n其他登記事項：（空白）（空白）';
 const clean=c.cleanTranscriptText(text);
 assert.doesNotMatch(clean,/列印時間|頁次|續次頁|^1C$|^06$/m);
 assert.equal(c.extractLandFields(clean).parcel,'0691-0000');
 assert.equal(c.parsedOwners(clean)[0].denominator,'96');
 assert.deepEqual(Array.from(c.registrationNotes(clean)),[]);
});
test('OCR 1/06 cannot replace PDF text 1/96, and invalid OCR-only share stays empty',()=>{
 const c=parser();
 const direct=c.parsedOwners(transcript('1/96'));
 const scanned=c.parsedOwners(transcript('1/06'));
 const merged=c.reconcileOwners(direct,scanned);
 assert.equal(merged.length,1);
 assert.equal(merged[0].numerator,'1');assert.equal(merged[0].denominator,'96');
 const invalid=c.reconcileOwners([],scanned);
 assert.equal(invalid[0].numerator,'');assert.equal(invalid[0].denominator,'');
 assert.equal(c.validShare({numerator:'1',denominator:'0'}),null);
});
test('complete text layer does not request OCR; missing fields do',()=>{
 const c=parser();
 const complete=transcript();
 assert.equal(c.needsOcrForDocument([{pageKey:'p1',fileKey:'doc',directText:complete}],'p1'),false);
 assert.equal(c.needsOcrForDocument([{pageKey:'p1',fileKey:'doc',directText:complete.replace('登記原因：繼承','')}],'p1'),true);
 assert.equal(c.needsOcrForDocument([{pageKey:'i1',fileKey:'image',directText:''}],'i1'),true);
});
test('one person keeps separate ordinary and common shares with a relation marker',()=>{
 const c=parser();
 const direct=[
  {name:'林＊＊',id:'A123****89',sequence:'0001',registrationSequence:'0010',numerator:'1',denominator:'4',shareAvailable:true,common:false,date:'110.01.01',reason:'繼承',address:'甲路'},
  {name:'林＊＊',id:'A123****89',sequence:'0002',registrationSequence:'0020',numerator:'1',denominator:'8',shareAvailable:true,common:true,date:'111.01.01',reason:'繼承',address:'甲路'}
 ];
 const scanned=direct.map(row=>({...row}));
 const merged=c.reconcileOwners(direct,scanned);
 assert.equal(merged.length,2);
 assert.deepEqual(Array.from(merged[0].relatedShareTypes),['一般持分','公同共有']);
 assert.deepEqual(Array.from(merged[1].relatedShareTypes),['一般持分','公同共有']);
 assert.ok(merged.every(row=>!row.review.some(note=>/影像補入|請校對/.test(note))));
});
test('complete electronic PDF skips rasterization and OCR jobs',async()=>{
 const c=parser(),text=transcript();
 let renders=0,creates=0;
 const page={getTextContent:async()=>({items:text.split('\n').map((str,index)=>({str,transform:[1,0,0,1,0,200-index*10]}))}),getViewport:()=>({width:100,height:100}),render:()=>{renders++;return {promise:Promise.resolve()};}};
 const pdfjs={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>page})})};
 c.document.createElement=()=>{creates++;return {getContext:()=>({}),toBlob:callback=>callback({size:1})};};
 const result=await c.collectSourceContent([{type:'application/pdf',name:'clean.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}],'auto',()=>{},async()=>pdfjs);
 assert.equal(result.images.length,0);assert.equal(renders,0);assert.equal(creates,0);
});
test('fullwidth shares normalize, and masked identity plus identical event matches the right share type',()=>{
 const c=parser();
 const normalized=c.validShare({numerator:'１',denominator:'９６'});
 assert.equal(normalized.numerator,'1');assert.equal(normalized.denominator,'96');
 const direct=[
  {name:'林＊＊',id:'A123****89',sequence:'0001',registrationSequence:'0010',numerator:'1',denominator:'4',shareAvailable:true,common:false,date:'110.01.01',reason:'繼承'},
  {name:'林＊＊',id:'A123****89',sequence:'0002',registrationSequence:'0020',numerator:'1',denominator:'8',shareAvailable:true,common:true,date:'111.01.01',reason:'繼承'}
 ];
 const ocr=[{...direct[1],registrationSequence:'O020',sequence:'',address:'補入的住址'}];
 const merged=c.reconcileOwners(direct,ocr);
 assert.equal(merged.length,2);assert.equal(merged[1].address,'補入的住址');
 assert.equal(merged[0].denominator,'4');assert.equal(merged[1].denominator,'8');
});
test('unlabelled inheritance warning and labelled restriction remain in business notes',()=>{
 const c=parser();
 const notes=c.registrationNotes('所有權人：林＊＊\n未辦繼承列冊管理\n備註：查封，債權人甲\n其他登記事項：（空白）');
 assert.ok(notes.some(value=>value.includes('未辦繼承')));
 assert.ok(notes.some(value=>value.includes('查封')));
 assert.ok(notes.every(value=>!/空白|所有權人/.test(value)));
});
