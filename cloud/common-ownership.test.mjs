import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js',import.meta.url),'utf8');
function setup() {
 const elements = new Map();
 const context = vm.createContext({
  document:{querySelector(s){if(!elements.has(s)) elements.set(s,{value:'100',children:[],addEventListener(){}});return elements.get(s);}},
  refreshCloudSetup(){},localStorage:{getItem(){return null;},setItem(){}},setTimeout(){}
 });
 vm.runInContext(source,context);
 return {context,elements,rows:elements.get('#rows')};
}
const owner = (name, extra={}) => ({name,id:'A123****89',address:name+'的完整住址',numerator:1,denominator:3,date:'110.01.01',reason:'繼承',note:'',common:true,...extra});
function mockRow(data) {
 const fields = Object.fromEntries(Object.entries(data).map(([key,value])=>[key,{value:String(value),dataset:{key}}]));
 const cells=Array.from({length:12},()=>({style:{},classList:{toggle(){}},rowSpan:1}));
 const misc={};
 return {dataset:{commonGroup:data.commonGroup||'',sequence:'1',ocrImported:'true'},children:cells,
 querySelector(s){const key=s.match(/data-key="([^"]+)"/)?.[1];return key?fields[key]:(misc[s]||= {});}};
}
test('common ownership preserves every person, identity, address and original order',()=>{
 const {context:c}=setup();
 const original=[owner('甲'),owner('乙'),owner('丙',{common:false}),owner('丁')];
 const output=c.groupCommonOwnership(original);
 assert.equal(output.length,4);
 output.forEach((r,i)=>{for(const key of ['name','id','address','numerator','denominator','date','reason']) assert.equal(r[key],original[i][key]);});
 assert.equal(output[0].commonGroup,output[1].commonGroup);
 assert.equal(output[2].commonGroup,'');
 assert.notEqual(output[3].commonGroup,output[0].commonGroup);
});
test('different group, share or registration event cannot be silently merged',()=>{
 const {context:c}=setup();
 const output=c.groupCommonOwnership([owner('甲'),owner('乙',{date:'111.01.01'}),owner('丙',{commonGroup:'explicit'})]);
 assert.equal(new Set(output.map(r=>r.commonGroup)).size,3);
 assert.deepEqual(Array.from(c.commonSpans([owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g',denominator:5})])),[1,1]);
});
test('screen merges only fraction and area; editing and deleting lead keep owners separate',()=>{
 const {context:c,rows}=setup();
 rows.children=c.groupCommonOwnership([owner('甲'),owner('乙')]).map(mockRow);
 c.updateAll();
 assert.equal(rows.children[0].children[4].rowSpan,2);
 assert.deepEqual(rows.children[1].children.map((cell,i)=>cell.style.display==='none'?i:null).filter(i=>i!==null),[4,5,6,7]);
 const target=rows.children[0].querySelector('[data-key="numerator"]');
 target.value='2';
 c.updateRow({currentTarget:rows.children[0],target});
 assert.equal(c.getData()[1].numerator,'2');
 assert.equal(c.getData()[1].address,'乙的完整住址');
 rows.children.shift();
 c.updateAll();
 for(const index of [4,5,6,7]) {assert.equal(rows.children[0].children[index].style.display,'');assert.equal(rows.children[0].children[index].rowSpan,1);}
});
test('PDF and Excel rows occupy exactly eight columns with only two shared cells',()=>{
 const {context:c}=setup();
 const items=c.groupCommonOwnership([owner('甲'),owner('乙'),owner('丙',{common:false}),owner('丁'),owner('戊')]);
 const html=c.buildExportRows(items,100);
 const trs=[...html.matchAll(/<tr>(.*?)<\/tr>/gs)];
 assert.equal(trs.length,5);
 const occupied=Array(8).fill(0);
 trs.forEach(([_,body],rowIndex)=>{
  let col=0;
  for(const cell of body.matchAll(/<td([^>]*)>(.*?)<\/td>/gs)) {
   while(occupied[col]>0)col++;
   assert.ok(col<8,'unexpected overlapping/extra cell');
   const span=Number(cell[1].match(/rowspan="(\d+)"/)?.[1]||1);
   if(span>1) assert.ok(col===3||col===4,'only share and area may span');
   occupied[col]=span;col++;
  }
  assert.ok(occupied.every(v=>v>0),'missing column at row '+rowIndex);
  occupied.forEach((v,i)=>occupied[i]=v-1);
 });
 assert.ok(occupied.every(v=>v===0));
 for(const item of items)assert.ok(html.includes(item.address));
 assert.match(source,/@page\{size:A3 landscape/);
});
test('draft restoration retains common group metadata',()=>{
 const {context:c,rows}=setup();
 rows.children=[mockRow(owner('甲',{commonGroup:'group-a'})),mockRow(owner('乙',{commonGroup:'group-a'}))];
 const data=JSON.parse(JSON.stringify(c.getData()));
 const restored=[];
 c.localStorage.getItem=()=>JSON.stringify({fields:{},rows:data});
 c.addRow=(values,metadata)=>restored.push({values,metadata});
 c.restoreDraft();
 assert.equal(restored.length,2);
 assert.equal(restored[1].metadata.commonGroup,'group-a');
 assert.equal(restored[1].values[2],'乙的完整住址');
});
test('moving inserted owners preserves data, renumbers and recomputes shared cells',()=>{
 const {context:c,rows}=setup();
 rows.children=[owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g'}),owner('補入')].map(mockRow);
 rows.insertBefore=(row,before)=>{rows.children.splice(rows.children.indexOf(row),1);const i=before?rows.children.indexOf(before):rows.children.length;rows.children.splice(i,0,row);};
 const added=rows.children[2],original=JSON.stringify(c.getData()[2]);
 assert.equal(c.moveOwnerRow(added,2),true);
 assert.deepEqual(Array.from(c.getData(),r=>r.name),['甲','補入','乙']);
 assert.equal(JSON.stringify(c.getData()[1]),original);
 assert.deepEqual(rows.children.map(r=>r.querySelector('.serial').textContent),[1,2,3]);
 assert.equal(rows.children[0].children[4].rowSpan,1);
 assert.equal(c.moveOwnerRow(added,3),true);
 assert.equal(rows.children[0].children[4].rowSpan,2);
 assert.equal(c.moveOwnerRow(added,0),false);assert.equal(c.moveOwnerRow(added,4),false);
 assert.equal(c.moveOwnerRow(added,1),true);
 assert.equal(c.getData()[0].name,'補入');
 const html=c.buildExportRows(c.getData(),100);
 assert.ok(html.indexOf('補入')<html.indexOf('甲'));
});