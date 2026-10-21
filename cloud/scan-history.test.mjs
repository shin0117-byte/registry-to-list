import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const c=vm.createContext({});vm.runInContext(await readFile(new URL('../scan-history.js',import.meta.url),'utf8'),c);
const sample=n=>({fields:{district:'測試區',parcel:String(n),building:'其他登記事項'},rows:[{name:'測試先生',address:'測試路1號',commonGroup:'g',numerator:'1',denominator:'3',note:'校對',ocrImported:true}],accessCode:'must-not-store'});
function setup(){const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};let seq=0;return {storage,data,store:c.RegistryScanHistory.createStore(storage,()=>String(++seq),()=>100)};}
test('last five completed snapshots survive reload and never include access code',()=>{
 const {storage,data,store}=setup();
 for(let n=1;n<=6;n++)store.add(sample(n));
 const entries=c.RegistryScanHistory.createStore(storage).list();
 assert.deepEqual(Array.from(entries,e=>e.snapshot.fields.parcel),['6','5','4','3','2']);
 assert.equal(entries[0].snapshot.rows[0].commonGroup,'g');
 assert.ok(![...data.values()][0].includes('must-not-store'));
 entries[0].snapshot.rows[0].name='changed';assert.equal(store.list()[0].snapshot.rows[0].name,'測試先生');
 store.remove(entries[0].id);assert.equal(store.list().length,4);
});
test('storage quota error preserves previous snapshots',()=>{
 const {store,storage}=setup();store.add(sample(1));storage.setItem=()=>{throw new Error('quota');};
 assert.throws(()=>store.add(sample(2)),/quota/);assert.equal(store.list()[0].snapshot.fields.parcel,'1');
});
test('invalid record cannot poison UI fields or execute HTML',()=>{
 const clean=c.RegistryScanHistory.sanitize({fields:{district:'<script>bad</script>',cloudAccessCode:'secret'},rows:[]});
 assert.equal(clean.fields.cloudAccessCode,undefined);assert.equal(clean.fields.district,'<script>bad</script>');
});
test('current draft survives reload with group provenance, source files and latest edits',()=>{
 const {storage,store}=setup();
 const snapshot={...sample(2),schemaVersion:2,needsSourceRebuild:true,sourceFiles:['new.pdf']};
 snapshot.rows[0]={...snapshot.rows[0],registrationSequence:'0142',commonRefs:['0142','0158'],groupVerified:true,addressExplicitBlank:true};
 const first=store.saveCurrent(snapshot,'');const next=c.RegistryScanHistory.createStore(storage,()=> 'next',()=>200);
 assert.equal(next.current().fields.parcel,'2');assert.equal(next.current().schemaVersion,2);
 assert.equal(next.current().needsSourceRebuild,true);assert.equal(next.current().sourceFiles[0],'new.pdf');
 assert.equal(next.current().rows[0].commonRefs.length,2);assert.equal(next.current().rows[0].groupVerified,true);
 const edited=next.current();edited.rows[0].address='修改後住址';next.saveCurrent(edited,first.revision);
 assert.equal(next.current().rows[0].address,'修改後住址');assert.equal(next.current().savedAt,200);
});
test('old open tabs cannot overwrite a newer saved draft',()=>{
 const {store}=setup();const first=store.saveCurrent(sample(1),'');store.saveCurrent(sample(2),first.revision);
 assert.throws(()=>store.saveCurrent(sample(1),first.revision),/另一個分頁/);assert.equal(store.current().fields.parcel,'2');
});
test('saving failure leaves the last complete draft intact',()=>{
 const {store,storage}=setup();const first=store.saveCurrent(sample(1),'');
 storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>store.saveCurrent(sample(2),first.revision),/quota/);
 assert.equal(store.current().fields.parcel,'1');
});
test('latest legacy save is read from the existing key during an upgrade',()=>{
 const {data,store}=setup();data.set('registry-draft',JSON.stringify(sample(9)));
 assert.equal(store.current().fields.parcel,'9');const saved=store.saveCurrent(store.current(),'');
 assert.equal(saved.fields.parcel,'9');assert.equal(saved.revision,'1');
});
