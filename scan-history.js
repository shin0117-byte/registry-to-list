(function(root){
 'use strict';
 const key='registry-scan-history-v1',currentKey='registry-draft';
 const fields=['district','section','parcel','area','value','valuePeriod','zoning','landCategory','building'];
 const rowKeys=['name','id','address','numerator','denominator','date','reason','note','commonGroup','sequence','registrationSequence','documentKey','sourceOrder','sourceRecordCount','commonGroupLabel','manager','managerAddress'];
 function sanitize(snapshot){
  if(!snapshot||!snapshot.fields||!Array.isArray(snapshot.rows))throw new Error('清冊紀錄格式錯誤');
  return {schemaVersion:snapshot.schemaVersion===2?2:undefined,needsSourceRebuild:snapshot.needsSourceRebuild===true,sourceFiles:Array.isArray(snapshot.sourceFiles)?snapshot.sourceFiles.map(String):[],fields:Object.fromEntries(fields.map(k=>[k,String(snapshot.fields[k]??'')])),
   rows:snapshot.rows.map(r=>({...Object.fromEntries(rowKeys.map(k=>[k,String(r[k]??'')])),relatedShareTypes:Array.isArray(r.relatedShareTypes)?r.relatedShareTypes.map(String):[],addressExplicitBlank:r.addressExplicitBlank===true,commonRefs:Array.isArray(r.commonRefs)?r.commonRefs.map(String):[],issues:Array.isArray(r.issues)?r.issues.map(String):[],groupVerified:r.groupVerified===true,ocrImported:r.ocrImported===true}))};
 }
 function createStore(storage,makeId=()=>crypto.randomUUID(),now=()=>Date.now()){
  function list(){
   const raw=storage.getItem(key);if(!raw)return [];
   const entries=JSON.parse(raw);
   if(!Array.isArray(entries))throw new Error('掃描紀錄無法讀取，請勿清除網站資料');
   return entries.map(e=>{if(typeof e.id!=='string'||!Number.isFinite(e.createdAt))throw new Error('掃描紀錄格式錯誤');return {...e,snapshot:sanitize(e.snapshot)};}).slice(0,5);
  }
  function add(snapshot){
   const clean=sanitize(snapshot),entry={id:makeId(),createdAt:now(),snapshot:clean};
   // One atomic write. Quota errors leave the previous five entries untouched.
   storage.setItem(key,JSON.stringify([entry,...list()].slice(0,5)));return entry;
  }
  function remove(id){storage.setItem(key,JSON.stringify(list().filter(e=>e.id!==id)));}
  function current(){
   const raw=storage.getItem(currentKey);if(!raw)return null;
   const value=JSON.parse(raw);return {...sanitize(value),savedAt:Number(value.savedAt)||0,revision:typeof value.revision==='string'?value.revision:''};
  }
  function saveCurrent(snapshot,expectedRevision){
   const previous=current();
   if(expectedRevision!==undefined&&(previous?.revision||'')!==expectedRevision)throw new Error('另一個分頁已儲存較新的清冊。此頁未覆蓋它；請先匯出此頁，再重新整理載入最新資料。');
   const value={...sanitize(snapshot),savedAt:now(),revision:makeId()};
   storage.setItem(currentKey,JSON.stringify(value));
   return value;
  }
  return {list,add,remove,current,saveCurrent};
 }
 root.RegistryScanHistory={createStore,sanitize,fields};
})(globalThis);
