import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Excel=require('../vendor/exceljs.min.js');
require('../registry-model.js');require('../xlsx-export.js');
const c=vm.createContext({document:{querySelector:()=>({children:[],addEventListener(){}})},localStorage:{getItem:()=>null},refreshCloudSetup(){}});
for(const file of ['registry-model.js','scan-history.js','app.js','pdf-export.js','xlsx-export.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
const M=c.RegistryModel;
const raw=`土地所有權部\n（0001）登記次序：0002\n所有權人：測試＊＊\n權利範圍：1/1\n相關他項權利登記次序：0002-000\n其他登記事項：（空白）\n土地他項權利部\n（0001）登記次序：0002-000 權利種類：最高限額抵押權\n收件年期：民國115年\n權 利 人：測試銀行股份有限公司 務\n統一編號：12345678\n債權額比例：全部 ***1分之1***\n所\n擔保債權總金額：本金最高限額新台幣*****4,000,000元正\n存續期間：自民國110年01月01日至民國150年12月31日\n清償日期：另依契約約定\n標的登記次序：0002\n證明書字號：115測他字第1號\n共同擔保地號：測試段 0242-0000 0251-0000\n地\n0251-0001 0254-0000 0255-0000\n其他登記事項：（空白）`;
const details=M.parseOtherRights(raw);
const snapshot={fields:{district:'測試縣測試鄉',section:'測試段',parcel:'0251-0000',area:'100'},rows:[{name:'測試先生',address:'測試路1號',numerator:'1',denominator:'1',note:'原本備註；抵押權（登記次序：0002-000；金額：新臺幣4,000,000元）'}],otherRights:details};
test('detail parser returns creditor, ratio, total amount, term and all collateral parcels without duplicated owners',()=>{
 assert.equal(details.length,1);const item=details[0];assert.equal(item.registrationSequence,'0002-000');assert.equal(item.holder,'測試銀行股份有限公司');assert.equal(item.creditRatio,'全部 1／1');
 assert.equal(item.amount,'本金最高限額新臺幣4,000,000元');assert.equal(item.duration,'自民國110年01月01日至民國150年12月31日');
 assert.equal(item.collateralParcels.split('\n').length,5);assert.match(item.collateralParcels,/測試段 0255-0000/);
 assert.equal(M.parseOwners(raw).length,1);
 assert.equal(M.parseOtherRights(raw.replace('權 利 人：測試銀行股份有限公司 務','權 利 人：王＊＊'))[0].holder,'王＊＊');
});
test('detail fallback fills only missing fields and preserves type and PDF values',()=>{
 const image=[{...details[0],holder:'錯誤銀行',amount:'新臺幣9元'}];
 assert.equal(M.reconcileOtherRights(details,image)[0].holder,details[0].holder);
 assert.equal(M.reconcileOtherRights([{...details[0],holder:''}],image)[0].holder,'錯誤銀行');
 assert.equal(M.reconcileOtherRights([{...details[0],amount:'',kind:'地上權'}],image)[0].amount,'');
});
test('multi-page details are kept once per document while equal IDs in other documents remain separate',()=>{
 const pages=[{fileKey:'a',pageKey:'a1',directText:raw.split('土地他項權利部')[0]},{fileKey:'a',pageKey:'a2',directText:'土地他項權利部'+raw.split('土地他項權利部')[1]},{fileKey:'b',pageKey:'b1',directText:raw.replace('測試銀行','另一銀行')}];
 const all=c.reconcileDocumentRights(pages,[{pageKey:'a2',text:pages[1].directText}]);assert.equal(all.length,2);assert.notEqual(all[0].documentKey,all[1].documentKey);assert.notEqual(all[0].holder,all[1].holder);
});
test('current draft and scan history keep details, and old snapshots default to no details',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const store=c.RegistryScanHistory.createStore(storage,()=> 'id',()=> 1);store.saveCurrent(snapshot,'');store.add(snapshot);
 assert.equal(store.current().otherRights[0].holder,details[0].holder);assert.equal(store.list()[0].snapshot.otherRights[0].collateralParcels,details[0].collateralParcels);
 assert.equal(c.RegistryScanHistory.sanitize({...snapshot,otherRights:undefined}).otherRights.length,0);
});
test('system table has exactly six requested columns and escapes holder text',()=>{
 const html=c.otherRightsHtml([{...details[0],holder:'<img src=x>'}]);assert.equal((html.match(/<th>/g)||[]).length,6);assert.match(html,/他項登記權利人/);assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(!html.includes('<img'));
});
test('PDF places six-column details below owners, keeps original remarks and stays within A3 width',()=>{
 const doc=c.RegistryPdf.definition(snapshot),tables=doc.content.filter(item=>item.table).map(item=>item.table);
 assert.equal(tables[0].body[1][7],snapshot.rows[0].note);assert.equal(tables[1].widths.length,6);assert.equal(tables[1].body.length,2);
 assert.equal(tables[1].body[0][1].text,'他項登記權利人');assert.equal(tables[1].body[1][1].text,details[0].holder);
 assert.ok(tables[1].widths.reduce((sum,n)=>sum+n,0)+48+3.5<=841.89-48+.01);
});
test('XLSX details survive round trip below owner list, with text values and wrapped collateral',async()=>{
 const book=globalThis.RegistryExcel.build(snapshot,Excel),bytes=await book.xlsx.writeBuffer(),loaded=new Excel.Workbook();await loaded.xlsx.load(bytes);const sheet=loaded.worksheets[0];
 let heading;sheet.eachRow(row=>{if(row.getCell(1).value==='他項權利明細')heading=row.number;});assert.ok(heading>7);
 assert.equal(sheet.getCell('H7').value,snapshot.rows[0].note);
 assert.equal(sheet.getRow(heading+1).getCell(3).value,'他項登記權利人');
 const r=sheet.getRow(heading+2);assert.equal(r.getCell(1).value,'0002-000');assert.equal(r.getCell(3).value,details[0].holder);assert.equal(r.getCell(5).value.replace(/\n/g,''),details[0].amount);assert.equal(r.getCell(8).value,details[0].collateralParcels);assert.equal(r.getCell(8).alignment.wrapText,true);assert.ok(r.height>=5*15+8);assert.equal(sheet.pageSetup.orientation,'portrait');
});
