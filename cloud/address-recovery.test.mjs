import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(readings){
 let calls=0,terminated=0,rendered=0,workers=0;
 const context=vm.createContext({URL,Uint8ClampedArray,document:{baseURI:'https://test.example/',querySelector:()=>({checked:true}),createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([255,50,50,255])}),putImageData(){}})})},Tesseract:{createWorker:async()=>{workers++;return {setParameters:async()=>{},recognize:async()=>({data:readings[calls++]}),terminate:async()=>{terminated++;}};}}});
 for(const file of ['registry-model.js','address-recovery.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
 const directText='（0060）登記次序：0134\n所有權人：測試甲\n統一編號：A123****89\n權利範圍：1/1';
 const item=(str,y)=>({str,transform:[1,0,0,1,56,y],height:12});
 const page={fileKey:'doc',directText,textItems:[item('（0060）登記次序：0134',498),item('統一編號：A123****89',450),item('權利範圍：1/1',426)],pdfPage:{getViewport:()=>({width:1785,height:2526}),render:()=>{rendered++;return {promise:Promise.resolve()};}}};
 const owner={...context.RegistryModel.parseOwners(directText)[0],documentKey:'doc'};
 return {M:context.RegistryAddressRecovery,owner,page,stats:()=>({calls,terminated,rendered,workers})};
}
const address='高雄市三民區測試里測試二路318之3號七樓';
const readings=[{text:address,confidence:93},{text:address.replaceAll('',' '),confidence:92}];
test('local recovery fills only a missing address and terminates its worker',async()=>{
 const s=setup(readings),before=JSON.stringify({...s.owner,address:''});
 await s.M.recover([s.owner],[s.page]);
 assert.equal(s.owner.address,address);assert.equal(JSON.stringify({...s.owner,address:''}),before);
 assert.deepEqual(s.stats(),{calls:2,terminated:1,rendered:1,workers:1});
});
test('different road names or low confidence do not fill the address',async()=>{
 for(const pair of [[readings[0],{text:address.replace('二路','一路'),confidence:95}],[readings[0],{text:address,confidence:89}]]){
  const s=setup(pair);await s.M.recover([s.owner],[s.page]);assert.equal(s.owner.address,'');assert.equal(s.stats().terminated,1);
 }
});
test('existing text and explicitly blank addresses never load the local model',async()=>{
 for(const extra of [{address:'原文字地址'},{addressExplicitBlank:true}]){
  const s=setup(readings);Object.assign(s.owner,extra);await s.M.recover([s.owner],[s.page]);assert.equal(s.stats().workers,0);
 }
});
test('source registration, document and unique identity anchors are required',()=>{
 const s=setup(readings);assert.ok(s.M.locate(s.owner,[s.page]));
 assert.equal(s.M.locate({...s.owner,documentKey:'other'},[s.page]),null);
 assert.equal(s.M.locate({...s.owner,registrationSequence:'0135'},[s.page]),null);
 assert.equal(s.M.locate({...s.owner,id:'A999****99'},[s.page]),null);
 const duplicated={...s.page,textItems:s.page.textItems.concat({...s.page.textItems[1],transform:[1,0,0,1,56,440]})};
 assert.equal(s.M.locate(s.owner,[duplicated]),null);
 assert.equal(s.M.locate(s.owner,[{...s.page,pdfPage:{...s.page.pdfPage,rotate:90}}]),null);
});
test('failed PDF rendering leaves the address empty and releases the worker',async()=>{
 const s=setup(readings);s.page.pdfPage.render=()=>({promise:Promise.reject(new Error('failed'))});
 await s.M.recover([s.owner],[s.page]);assert.equal(s.owner.address,'');assert.equal(s.stats().terminated,1);
});
test('address consensus rejects parcel headers, incomplete and conflicting output',()=>{
 const s=setup(readings);
 for(const value of ['佳冬鄉石光段0503-0000地號','高雄市三民區測試路318','非地址'])assert.equal(s.M.consensus([{text:value,confidence:99},{text:value,confidence:99}]),'');
 assert.equal(s.M.consensus([readings[0]]),'');
});
