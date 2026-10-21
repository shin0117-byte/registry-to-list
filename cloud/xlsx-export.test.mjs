import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Excel=require('../vendor/exceljs.min.js');
require('../registry-model.js');require('../xlsx-export.js');const c={RegistryExcel:globalThis.RegistryExcel};
const fields={district:'測試縣測試鄉',section:'測試段',parcel:'0503-0000',area:'100',value:'2600',valuePeriod:'民國114年01月'};
const owner=(name,extra={})=>({name,address:'測試縣測試鄉測試路1號',numerator:'1',denominator:'2',date:'民國114.03.07',reason:'繼承',note:'',...extra});
const build=rows=>c.RegistryExcel.build({fields,rows},Excel);
test('XLSX round trip preserves actual workbook, typed area and A3 print setup',async()=>{
 const book=build([owner('甲'),owner('乙')]),data=await book.xlsx.writeBuffer();assert.equal(String.fromCharCode(...data.subarray(0,2)),'PK');
 const loaded=new Excel.Workbook();await loaded.xlsx.load(data);const s=loaded.worksheets[0];
 assert.equal(s.name,'清冊');assert.equal(s.pageSetup.paperSize,8);assert.equal(s.pageSetup.orientation,'portrait');assert.equal(s.pageSetup.fitToWidth,1);assert.equal(s.pageSetup.fitToHeight,0);
 assert.equal(s.getCell('A1').alignment.horizontal,'center');assert.equal(s.getCell('F7').value,'114.03.07');assert.equal(s.getCell('F7').numFmt,'@');
 assert.equal(typeof s.getCell('E7').value,'number');assert.equal(s.getCell('E7').value,15.13);assert.equal(s.getCell('A8').value,2);
});
test('adjacent shared fields merge independently and owners remain separate',()=>{
 const common={commonGroup:'g',groupVerified:true,commonRefs:['0142','0158']};
 const s=build([owner('甲',{...common,registrationSequence:'0142'}),owner('乙',{...common,registrationSequence:'0158',date:'114.03.08'})]).worksheets[0];
 assert.equal(s.getCell('D8').master.address,'D7');assert.equal(s.getCell('E8').master.address,'E7');assert.equal(s.getCell('G8').master.address,'G7');
 assert.equal(s.getCell('F8').master.address,'F8');assert.equal(s.getCell('B8').value,'乙');assert.equal(s.getCell('A8').value,2);
});
test('long fractions and literal formula-looking text remain text',async()=>{
 const s=build([owner('=1+1',{numerator:'90071992547409931234567890',denominator:'98765432109876543210987654'})]).worksheets[0];
 assert.equal(s.getCell('D7').value,'90071992547409931234567890／98765432109876543210987654');assert.equal(s.getCell('D7').numFmt,'@');
 assert.equal(s.getCell('B7').value,'=1+1');assert.equal(s.getCell('B7').formula,undefined);
 assert.equal(s.getCell('C7').alignment.wrapText,true);assert.ok(s.getRow(7).height>=27);
});
test('Excel button uses native XLSX download rather than HTML disguised as XLS',()=>{
 const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),fn=source.slice(source.indexOf('async function exportExcel'),source.indexOf('async function exportPdf'));
 assert.match(fn,/RegistryExcel.download/);assert.match(fn,/\.xlsx/);assert.doesNotMatch(fn,/text\/html|application\/vnd.ms-excel|<!doctype/);
});
