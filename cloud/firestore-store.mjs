import {fail} from './billing.mjs';
const encode=v=>{
 if(v===null)return {nullValue:null};
 if(v instanceof Date)return {timestampValue:v.toISOString()};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(Number.isSafeInteger(v))return {integerValue:String(v)};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw new Error('Invalid database value');
};
const decode=v=>{
 if('nullValue'in v)return null;
 if('timestampValue'in v)return v.timestampValue;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 throw new Error('Invalid database value');
};
export class FirestoreStore {
 constructor(project,{database='(default)',fetcher=fetch,tokenProvider}={}){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(project)||!/^(\(default\)|[a-z][a-z0-9-]{2,62})$/.test(database))throw new Error('Invalid database configuration');
  this.root='projects/'+project+'/databases/'+database+'/documents';this.fetcher=fetcher;this.tokenProvider=tokenProvider;
 }
 async token(){
  if(this.tokenProvider)return this.tokenProvider();
  if(this.cached&&this.until>Date.now())return this.cached;
  const r=await this.fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw fail(503,'點數資料庫認證未設定');
  const b=await r.json();this.cached=b.access_token;this.until=Date.now()+Math.max(0,b.expires_in-60)*1000;return this.cached;
 }
 async request(path,options={}){
  const r=await this.fetcher('https://firestore.googleapis.com/v1/'+path,{...options,headers:{Authorization:'Bearer '+await this.token(),'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});
  const b=await r.json().catch(()=>({}));
  if(r.status===404&&options.method!=='POST')return null;
  if(!r.ok){
   if(['ABORTED','FAILED_PRECONDITION','ALREADY_EXISTS'].includes(b.error?.status))throw Object.assign(new Error('Concurrent update'),{conflict:true});
   throw fail(503,'點數資料庫無法使用，請保留原操作編號重試');
  }
  return b;
 }
 snapshot(path,doc){return {path,version:doc?.updateTime||null,data:doc?Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)])):null};}
 async read(path){return this.snapshot(path,await this.request(this.root+'/'+path));}
 async commit(writes){
  return this.request(this.root+':commit',{method:'POST',body:JSON.stringify({writes:writes.map(w=>({
   update:{name:this.root+'/'+w.path,fields:Object.fromEntries(Object.entries(w.data).map(([k,v])=>[k,encode(v)]))},
   currentDocument:w.version?{updateTime:w.version}:{exists:false}
  }))})});
 }
 async list(collection,cursor=''){
  if(typeof cursor!=='string'||cursor.length>2000)throw fail(400,'分頁編號無效');
  const query=new URLSearchParams({pageSize:'50',orderBy:'createdAt desc',...(cursor?{pageToken:cursor}:{})});
  const b=await this.request(this.root+'/'+collection+'?'+query);
  if(!b)throw fail(503,'點數資料庫尚未建立');
  return {items:(b.documents||[]).map(d=>this.snapshot(d.name.slice(this.root.length+1),d)),nextCursor:b.nextPageToken||''};
 }
}