import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../registry-model.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../pdf-export.js',import.meta.url),'utf8'),context);
test('PDF uses A3 portrait, wraps content and preserves all owner cells',()=>{
 const fields={district:'屏東縣恆春鎮',section:'頂水泉段',parcel:'0691-0000',area:'2511.18',value:'8200',valuePeriod:'民國111年01月',zoning:'國家公園區',landCategory:'（空白）',building:'有其他登記事項：（測試內容）'};
 const rows=['甲','乙'].map(name=>({name,address:'測試住址'.repeat(20),numerator:'12345678901234567890',denominator:'98765432109876543210',commonGroup:'g',note:'有其他登記事項：（保留）'}));
 const doc=context.RegistryPdf.definition({fields,rows});
 assert.equal(doc.pageSize,'A3');assert.equal(doc.pageOrientation,'portrait');assert.equal(doc.defaultStyle.fontSize,10.5);
 const table=doc.content.find(x=>x.table).table;
 assert.equal(table.headerRows,1);assert.equal(table.widths.length,8);assert.ok(table.widths.every(w=>w>0));
 assert.ok(table.widths.reduce((a,b)=>a+b,0)+64+4.5<=841.89-48+.001);
 assert.equal(table.body.length,3);
 assert.equal(table.body[1].length,8);assert.equal(table.body[2].length,8);
 assert.equal(typeof table.body[2][3],'string');
 assert.ok(table.body[1][3].includes('\n'));
 assert.ok(doc.content.some(item=>item.text==='共有組別合計'));
 assert.match(JSON.stringify(doc),/使用地類別/);
});
test('PDF UI downloads a file without print window',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function exportPdf'),source.indexOf('function captureSnapshot'));
 assert.match(fn,/RegistryPdf.download/);assert.doesNotMatch(fn,/window.open|document.write|window.print/);
});