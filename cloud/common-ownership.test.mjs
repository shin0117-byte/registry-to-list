import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../registry-model.js',import.meta.url),'utf8'))+'\n'+(await readFile(new URL('../app.js',import.meta.url),'utf8'));
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
 const cells=Array.from({length:12},()=>({style:{},dataset:{},classList:{toggle(){}},rowSpan:1}));
 for(const [key,field] of Object.entries(fields))field.closest=()=>cells[({numerator:4,denominator:6,date:8,reason:9})[key]??1];
 const misc={};
 return {dataset:{commonGroup:data.commonGroup||'',sequence:'1',ocrImported:'true'},children:cells,
 querySelector(s){const key=s.match(/data-key="([^"]+)"/)?.[1];return key?fields[key]:(misc[s]||= {});}};
}
test('common ownership preserves people and order without inferring a group from date or share',()=>{
 const {context:c}=setup();
 const original=[owner('甲'),owner('乙'),owner('丙',{common:false}),owner('丁')];
 const output=c.groupCommonOwnership(original);
 assert.equal(output.length,4);
 output.forEach((r,i)=>{for(const key of ['name','id','address','numerator','denominator','date','reason']) assert.equal(r[key],original[i][key]);});
 assert.notEqual(output[0].commonGroup,output[1].commonGroup);assert.equal(output[0].groupVerified,false);
 assert.equal(output[2].commonGroup,'');
 assert.notEqual(output[3].commonGroup,output[0].commonGroup);
});
test('different group, share or registration event cannot be silently merged',()=>{
 const {context:c}=setup();
 const output=c.groupCommonOwnership([owner('甲'),owner('乙',{date:'111.01.01'}),owner('丙',{commonGroup:'explicit'})]);
 assert.equal(new Set(output.map(r=>r.commonGroup)).size,3);
 assert.deepEqual(Array.from(c.commonSpans([owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g',denominator:5})])),[1,1]);
});
test('screen merges equal adjacent fields while keeping every owner and address',()=>{
 const {context:c,rows}=setup();
 rows.children=c.groupCommonOwnership([owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g'})]).map(mockRow);
 c.updateAll();
 assert.equal(rows.children[0].children[4].rowSpan,2);
 assert.deepEqual(rows.children[1].children.map((cell,i)=>cell.style.display==='none'?i:null).filter(i=>i!==null),[4,5,6,7,8,9]);
 const target=rows.children[0].querySelector('[data-key="numerator"]');
 target.value='2';
 c.updateRow({currentTarget:rows.children[0],target});
 assert.equal(c.getData()[1].numerator,'2');
 assert.equal(c.getData()[1].address,'乙的完整住址');
 rows.children.shift();
 c.updateAll();
 for(const index of [4,5,6,7]) {assert.equal(rows.children[0].children[index].style.display,'');assert.equal(rows.children[0].children[index].rowSpan,1);}
});
test('PDF and Excel retain eight columns on every original owner row',()=>{
 const {context:c}=setup();
 const items=c.groupCommonOwnership([owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g'}),owner('丙',{common:false}),owner('丁',{commonGroup:'g'}),owner('戊',{commonGroup:'g'})]);
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
   if(span>1) assert.ok([3,4,5,6].includes(col),'only requested shared fields may span');
   occupied[col]=span;col++;
  }
  assert.ok(occupied.every(v=>v>0),'missing column at row '+rowIndex);
  occupied.forEach((v,i)=>occupied[i]=v-1);
 });
 assert.ok(occupied.every(v=>v===0));
 for(const item of items)assert.ok(html.includes(item.address));
 assert.match(source,/RegistryPdf.download/);
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
test('editing merged date/reason updates its contiguous members only',()=>{
 const {context:c,rows}=setup();
 rows.children=[owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g'}),owner('丙'),owner('丁',{commonGroup:'g'})].map(mockRow);
 c.updateAll();
 for(const [key,value] of [['date','114.03.07'],['reason','買賣']]){
  const target=rows.children[0].querySelector('[data-key="'+key+'"]');target.value=value;
  c.updateRow({currentTarget:rows.children[0],target});
  assert.equal(c.getData()[1][key],value);assert.notEqual(c.getData()[3][key],value);
 }
 const html=c.buildExportRows(c.getData(),100);
 assert.match(html,/rowspan="2" class="date-cell">114.03.07/);
 assert.doesNotMatch(html,/民國114/);
});

test('typing an incomplete date does not detach the rest of a merged cell',()=>{
 const {context:c,rows}=setup();
 rows.children=[owner('甲',{commonGroup:'g'}),owner('乙',{commonGroup:'g'})].map(mockRow);c.updateAll();
 const target=rows.children[0].querySelector('[data-key="date"]');
 for(const value of ['','1','114.03.07']){
  target.value=value;c.updateRow({currentTarget:rows.children[0],target});
  assert.equal(c.getData()[1].date,value);
 }
 assert.equal(rows.children[0].children[8].rowSpan,2);
});

test('old draft recovery is marked and reimport backs it up before replacing old rows',()=>{
 const {context:c,rows}=setup(),saved=new Map();
 const old={fields:{},rows:[owner('舊甲',{commonGroup:'共-old-66'}),owner('舊乙',{commonGroup:'共-old-81'})]};
 c.localStorage.getItem=()=>JSON.stringify(old);c.localStorage.setItem=(k,v)=>saved.set(k,v);
 const loaded=[];c.addRow=(values,metadata)=>loaded.push(metadata);c.restoreDraft();
 assert.equal(c.captureSnapshot().needsSourceRebuild,true);
 assert.match(c.summaryHtml(c.RegistryModel.summary(old.rows,100)),/舊版草稿/);
 rows.children=loaded.map(mockRow);rows.children.forEach(r=>{r.remove=()=>rows.children.splice(rows.children.indexOf(r),1);});
 c.replaceRecognizedRows();
 assert.equal(rows.children.length,0);assert.equal(c.captureSnapshot().needsSourceRebuild,false);
 const backup=JSON.parse(saved.get('registry-draft-before-reimport'));
 assert.equal(backup.rows.length,2);assert.equal(backup.needsSourceRebuild,true);
});
test('failed backup cannot clear old recognized rows',()=>{
 const {context:c,rows}=setup();rows.children=[mockRow(owner('保留甲',{commonGroup:'g'}))];
 c.localStorage.setItem=()=>{throw new Error('quota');};
 assert.throws(()=>c.replaceRecognizedRows(),/quota/);assert.equal(rows.children.length,1);
});
