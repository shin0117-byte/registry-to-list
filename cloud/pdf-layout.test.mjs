import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('PDF uses 12pt A3 fixed columns and retains separate owners with shared cells',async()=>{
 let html='';
 const context=vm.createContext({
  document:{querySelector:()=>({value:'',children:[],addEventListener(){}})},
  refreshCloudSetup(){},localStorage:{getItem:()=>null},
  window:{open:()=>({document:{write:s=>html=s,close(){}}})}
 });
 vm.runInContext(await readFile(new URL('../app.js',import.meta.url),'utf8'),context);
 context.getData=()=>['甲','乙'].map(name=>({name,address:'測試住址'.repeat(20),numerator:'12345678901234567890',denominator:'98765432109876543210',commonGroup:'g'}));
 context.exportPdf();
 assert.match(html,/@page\{size:A3 landscape/);
 assert.match(html,/body\{[^}]*font-size:12pt/);
 assert.match(html,/table-layout:fixed/);
 assert.match(html,/overflow-wrap:anywhere/);
 assert.match(html,/thead\{display:table-header-group/);
 assert.doesNotMatch(html,/width:(7|15)em/);
 const cols=[...html.matchAll(/<col style="width:(\d+)%">/g)].map(m=>Number(m[1]));
 assert.equal(cols.length,8);
 assert.equal(cols.reduce((a,b)=>a+b,0),100);
 assert.equal((html.match(/rowspan="2"/g)||[]).length,2);
 assert.equal((html.match(/測試住址/g)||[]).length,40);
});