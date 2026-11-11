import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Excel=require('../vendor/exceljs.min.js');
require('../registry-model.js');require('../multi-registry.js');require('../xlsx-export.js');
const c=vm.createContext({document:{querySelector:()=>({value:'',children:[],addEventListener(){}})},localStorage:{getItem:()=>null,setItem(){}},refreshCloudSetup(){}});
for(const file of ['registry-model.js','multi-registry.js','scan-history.js','pdf-export.js','app.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
const M=c.RegistryMulti;
const row=(extra={})=>({name:'測試先生',id:'A123456789',address:'測試縣測試鄉測試路1號',numerator:'1',denominator:'2',date:'115.01.01',reason:'買賣',note:'原備註',...extra});
const land=(parcel,rows=[row()],area='100')=>({schemaVersion:2,fields:{district:'測試縣測試鄉',section:'測試段',parcel,area},rows,otherRights:[{registrationSequence:'0001-000',holder:'測試銀行',amount:'新臺幣300,000元'}],sourceFiles:[parcel+'.pdf']});
const project=(snapshots)=>M.upsert(M.empty(),snapshots);
test('project keeps separate land records, upserts only the same parcel, and saves edits in the active land',()=>{
 const p=project([land('0001-0000'),land('0002-0000')]);assert.equal(p.lands.length,2);
 const edited=land('0001-0000',[row({address:'修改路9號'})]);const synced=M.sync(p,edited);assert.equal(synced.lands[0].snapshot.rows[0].address,'修改路9號');assert.equal(synced.lands[1].snapshot.rows[0].address,'測試縣測試鄉測試路1號');
 assert.equal(M.upsert(synced,[land('0002-0000',[], '300')]).lands.length,2);
});
test('same names merge when address or ID matches; same-name-only and unnamed rows stay separate',()=>{
 const p=project([land('0001-0000',[row(),row({id:'B223456789',name:'同名'})]),land('0002-0000',[row({address:'另一住址9號'}),row({id:'C123456789',name:'同名'})])]);
 const report=M.matrix(p);assert.equal(report.people.length,2);assert.equal(report.people[0].cells.length,2);assert.equal(report.people[0].total,'30.25');assert.match(report.people[0].address,/另一住址/);
 const masked=project([land('1',[row({id:'A123****89'})]),land('2',[row({id:'A123****89'})])]);assert.equal(M.matrix(masked).people.length,1);assert.equal(M.matrix(masked).unnamed,0);
 const noId=project([land('1',[row({id:''})]),land('2',[row({id:''})])]);assert.equal(M.matrix(noId).people.length,1);
 const differentIds=project([land('1',[row({id:'A123456789',address:'甲路1號'})]),land('2',[row({id:'B223456789',address:'乙路2號'})])]);assert.equal(M.matrix(differentIds).people.length,2);
 const sameId=project([land('1',[row({address:'甲路1號'})]),land('2',[row({address:'乙路2號'})])]);assert.equal(M.matrix(sameId).people.length,1);assert.match(M.matrix(sameId).people[0].address,/甲路1號\n乙路2號/);
 const absent=project([land('1',[row({id:'',address:''})]),land('2',[row({id:'',address:''})])]);assert.equal(M.matrix(absent).people.length,2);
 const differentName=project([land('1',[row({name:'甲先生'})]),land('2',[row({name:'乙先生'})])]);assert.equal(M.matrix(differentName).people.length,2);
 const bridge=project([land('1',[row({address:'甲路1號',id:'A123456789'})]),land('2',[row({address:'乙路2號',id:'B223456789'})]),land('3',[row({address:'甲路1號',id:'B223456789'})])]);assert.equal(M.matrix(bridge).people.length,1);
 const blank=project([land('1',[row({name:'',id:''})]),land('2',[row({name:'',id:''})])]);assert.equal(M.matrix(blank).people.length,2);
 const noisy=project([land('1',[row({name:'李木榮'})]),land('2',[row({name:'李木榮住******608.0元/平方公尺前次移轉現值或原規定地價址:測試地址'})])]);assert.equal(M.matrix(noisy).people.length,1);assert.equal(M.matrix(noisy).people[0].name,'李木榮');
});
test('one person ordinary and common shares stay separate, and common area is not assigned as a personal total',()=>{
 const p=project([land('1',[row({numerator:'1',denominator:'4'}),row({numerator:'1',denominator:'10',commonGroup:'g',commonGroupLabel:'共1'})]),land('2')]);
 const item=M.matrix(p).people[0];assert.match(item.cells[0].share,/1／4\n1／10（共1）/);assert.match(item.cells[0].area,/共同/);assert.equal(item.total,'含公同共有');
 assert.equal(p.lands[0].snapshot.rows.length,2);
});
test('missing share and missing land area never become a false zero or NaN',()=>{
 const invalid=M.matrix(project([land('1',[row({denominator:'0'})])])).people[0];assert.equal(invalid.cells[0].area,'持分待確認');assert.equal(invalid.total,'持分待確認');
 assert.equal(M.matrix(project([land('1',[row()], '')])).people[0].total,'面積待確認');
});
test('all selected parcels stay in the same comparison block, including three and five parcels',()=>{
 for(const count of [1,2,3,5]){const report=M.blocks(project(Array.from({length:count},(_,i)=>land(String(i)))));assert.equal(report.blocks.length,1);assert.equal(report.blocks[0].headers.length,4+count*2);assert.equal(report.blocks[0].rows[0].length,4+count*2);assert.ok(Math.abs(report.blocks[0].widths.reduce((a,b)=>a+b,0)-100)<.00001);}
});

test('draft and scan history retain all land snapshots and views without recursive projects or secrets',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};const p=project([land('1'),land('2')]);p.view='multi';
 const snapshot={...p.lands[0].snapshot,project:p,cloudAccessCode:'must-not-store'};const store=c.RegistryScanHistory.createStore(storage,()=> 'revision',()=>1);store.saveCurrent(snapshot,'');store.add(snapshot);
 assert.equal(store.current().project.lands.length,2);assert.equal(store.list()[0].snapshot.project.view,'multi');assert.equal(store.current().project.lands[0].snapshot.project,undefined);assert.ok(!data.get('registry-draft').includes('must-not-store'));
});
test('PDF exports comparison then all land details, including rights, without exporting identity numbers',()=>{
 const p=project([land('0001-0000'),land('0002-0000')]),doc=c.RegistryPdf.projectDefinition(p);assert.equal(doc.pageSize,'A3');assert.equal(doc.pageOrientation,'portrait');
 assert.equal(doc.content.filter(item=>item.pageBreak==='before').length,0);assert.ok(JSON.stringify(doc).includes('他項權利明細'));assert.ok(!JSON.stringify(doc).includes('A123456789'));
});
test('XLSX contains summary and separate A3 land sheets, keeping remarks and rights in native cells',async()=>{
 const p=project([land('0001-0000'),land('0002-0000')]),book=globalThis.RegistryExcel.buildProject(p,Excel),loaded=new Excel.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());
 assert.equal(loaded.worksheets.length,3);assert.equal(loaded.worksheets[0].name,'共有人總表');assert.equal(loaded.worksheets[1].getCell('H7').value,'原備註');
 for(const sheet of loaded.worksheets){assert.equal(sheet.pageSetup.orientation,'portrait');assert.equal(sheet.pageSetup.paperSize,8);}
 const larger=globalThis.RegistryExcel.buildProject(project(Array.from({length:5},(_,i)=>land(String(i)))),Excel);assert.equal(larger.worksheets.length,6);assert.match(larger.worksheets[0].pageSetup.printArea,/N/);
 const three=project([land('0001-0000'),land('0002-0000'),land('0003-0000')]);const doc=c.RegistryPdf.projectDefinition(three),table=doc.content.find(item=>item.table).table;assert.equal(table.widths.length,10);assert.ok(table.body[0].some(cell=>cell.text.includes('0003-0000')));assert.equal(doc.content.filter(item=>item.pageBreak==='before').length,0);
});
test('multi-file import prepares each parcel independently, persists once, and rejects mixed parcels within one PDF',async()=>{
 const transcript=(parcel,area)=>`測試縣測試鄉測試段${parcel}地號\n土地標示部\n面積：${area}平方公尺\n土地所有權部\n（0001）登記次序：0001\n所有權人：測試＊＊\n統一編號：A123456789\n住址：測試縣測試鄉測試路1號\n權利範圍：1/1\n登記原因：買賣\n原因發生日期：民國115年01月01日`;
 const pages=[{fileKey:'pdf-0',pageKey:'p0',directText:transcript('0001-0000',100)},{fileKey:'pdf-1',pageKey:'p1',directText:transcript('0002-0000',200)}];
 c.testPages=pages;
 vm.runInContext(`var current={fields:{},rows:[],otherRights:[]},saves=0;captureSingleSnapshot=()=>current;loadSingleLand=s=>{current=s};persistCurrentDraft=()=>{saves++};toast=()=>{};loadLocalities=async()=>({localities:[],aliases:{}});loadRoads=async()=>({sites:{}});lookupDistrict=async()=>'';state.files=[{name:'a.pdf',type:'application/pdf'},{name:'b.pdf',type:'application/pdf'}];state.project=null;`,c);
 await c.applyProjectDocuments(pages,[],c.reconcileDocumentPages(pages,[]),'auto');const result=vm.runInContext('state.project',c);
 assert.equal(result.lands.length,2);assert.equal(result.lands[0].snapshot.fields.area,'100');assert.equal(result.lands[1].snapshot.fields.area,'200');assert.equal(result.lands[0].snapshot.rows.length,1);assert.equal(vm.runInContext('saves',c),1);
 assert.throws(()=>c.validateProjectSource([{...pages[0]},{...pages[1],fileKey:'pdf-0'}]),/每地號一份/);
});

test('address stamp cleanup allows the correct name-and-address consolidation without changing raw records',()=>{
 const clean='苗栗縣通霄鎮測試路105號';
 const p=project([land('1',[row({id:'',address:clean+'苗栗縣通霄地政事務所謄本用紙'})]),land('2',[row({id:'',address:clean})])]);
 const report=M.matrix(p);assert.equal(report.people.length,1);assert.equal(report.people[0].address,clean);
 assert.ok(p.lands[0].snapshot.rows[0].address.includes('謄本用紙'));
});

test('identical masked IDs never merge same-name owners with different addresses',()=>{
 for(const id of ['L100*****4','A123****89','A123XXXX89','＊＊＊＊＊＊＊＊＊＊']){
  const p=project([land('1',[row({name:'李先生',id,address:'臺中市北屯區測試路8號'})]),land('2',[row({name:'李先生',id,address:'美國德州維多利亞市櫻桃石圓環505號'})])]);
  const report=M.matrix(p);assert.equal(report.people.length,2,id);assert.equal(report.people[0].cells[1].share,'—');assert.equal(report.people[1].cells[0].share,'—');
 }
 const sameAddress=project([land('1',[row({id:'L100*****4',address:'測試路8號'})]),land('2',[row({id:'L100*****4',address:'測試路8號'})])]);assert.equal(M.matrix(sameAddress).people.length,1);
 const fullId=project([land('1',[row({id:'A123456789',address:'甲路1號'})]),land('2',[row({id:'A123456789',address:'乙路2號'})])]);assert.equal(M.matrix(fullId).people.length,1);assert.match(M.matrix(fullId).people[0].address,/甲路1號\n乙路2號/);
});

test('multi registry names use the first parcel, parcel count and Taiwan Gregorian export date',()=>{
 const p=project([land('0595-0000'),land('0595-0002')]);p.lands[0].snapshot.fields={...p.lands[0].snapshot.fields,district:'台東縣台東縣卑南鄉',section:'東興段'};
 const expected='台東縣卑南鄉東興段0595-0000地號等2筆清冊20261111';
 assert.equal(M.projectTitle(p,new Date('2026-11-11T00:00:00+08:00')),expected);
 assert.equal(M.projectTitle(p,new Date('2026-11-10T16:00:00Z')),expected);
 const doc=c.RegistryPdf.projectDefinition(p);assert.match(doc.content[0].text,/東興段0595-0000地號等2筆清冊\d{8}$/);assert.equal(doc.info.title,doc.content[0].text);
 assert.equal(doc.pageBreakBefore({headlineLevel:1},[],[{}]),true);assert.equal(doc.pageBreakBefore({headlineLevel:1},[{}],[{}]),false);
 const book=globalThis.RegistryExcel.buildProject(p,Excel);assert.equal(book.worksheets[0].getCell('A1').value,book.title);assert.match(book.title,/東興段0595-0000地號等2筆清冊\d{8}$/);
});
