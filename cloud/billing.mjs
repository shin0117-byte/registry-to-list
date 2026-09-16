import {createHash} from 'node:crypto';
export const plans=Object.freeze({light:{points:100,twd:199},standard:{points:500,twd:499},bulk:{points:1500,twd:999}});
export const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=s=>createHash('sha256').update(s).digest('hex');
const operation=s=>{if(typeof s!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(s))throw fail(400,'操作編號無效');return s;};
const accountPath=id=>{if(!/^[a-f0-9]{64}$/.test(id||''))throw fail(400,'客戶編號無效');return 'ocrAccounts/'+id;};
const view=(id,a)=>({id,name:a.name,balance:a.balance,used:a.used,active:a.active,createdAt:a.createdAt,pending:!!a.pending});
export class Billing {
 constructor(store,{now=()=>Date.now(),lease=180000}={}){this.store=store;this.now=now;this.lease=lease;}
 async atomic(fn){for(let n=0;n<10;n++){try{return await fn();}catch(e){if(!e.conflict)throw e;}}throw fail(503,'點數更新忙碌，請使用原操作重試');}
 async lookup(code){
  if(typeof code!=='string'||!/^ocr_[a-f0-9]{64}$/.test(code))throw fail(401,'使用碼不正確');
  const id=hash(code),doc=await this.store.read(accountPath(id));
  if(!doc.data)throw fail(401,'使用碼不正確');
  return {id,doc};
 }
 async create({customerRef,name,code,trial=true}){
  if(typeof customerRef!=='string'||!customerRef.trim()||customerRef.length>100||typeof name!=='string'||!name.trim()||name.length>80||typeof trial!=='boolean')throw fail(400,'請填寫客戶名稱及唯一客戶代號');
  if(!/^ocr_[a-f0-9]{64}$/.test(code||''))throw fail(400,'使用碼必須由安全亂數產生');
  const id=hash(code),path=accountPath(id),ref='ocrCustomerRefs/'+hash(customerRef.trim().toLowerCase());
  return this.atomic(async()=>{
   const [a,r]=await Promise.all([this.store.read(path),this.store.read(ref)]);
   if(r.data){
    if(r.data.id===id&&a.data)return view(id,a.data);
    throw fail(409,'此客戶代號已建立使用碼；不可重複領取試用');
   }
   if(a.data)throw fail(409,'使用碼已存在');
   const data={name:name.trim(),balance:trial?10:0,used:0,active:true,pending:null,createdAt:this.now()};
   await this.store.commit([{...a,data},{...r,data:{id,createdAt:this.now()}},
    {path:path+'/ledger/welcome',version:null,data:{type:'trial',status:'credited',points:data.balance,twd:0,createdAt:this.now()}}]);
   return view(id,data);
  });
 }
 async credit({accountId,plan,requestId,note}){
  if(!Object.hasOwn(plans,plan))throw fail(400,'方案無效');
  if(typeof note!=='string'||!note.trim()||note.length>200)throw fail(400,'請填寫收款紀錄（200 字以內）');
  const path=accountPath(accountId),entry=path+'/ledger/credit_'+operation(requestId),fingerprint=hash(JSON.stringify([plan,note.trim()])),receiptPath=path+'/paymentRefs/'+hash(note.trim().toLowerCase());
  return this.atomic(async()=>{
   const [a,e,receipt]=await Promise.all([this.store.read(path),this.store.read(entry),this.store.read(receiptPath)]);
   if(!a.data)throw fail(404,'找不到客戶');
   if(e.data||receipt.data){if((e.data||receipt.data).fingerprint!==fingerprint)throw fail(409,'操作編號或收款編號已用於其他加點');return {...view(accountId,a.data),alreadyApplied:true};}
   if(a.data.balance+plans[plan].points>100000000)throw fail(400,'餘額超過上限');
   const data={...a.data,balance:a.data.balance+plans[plan].points};
   await this.store.commit([{...a,data},{...e,data:{type:'credit',status:'credited',...plans[plan],fingerprint,note,createdAt:this.now()}},{...receipt,data:{fingerprint,createdAt:this.now()}}]);
   return view(accountId,data);
  });
 }
 async status({accountId,active,requestId}){
  if(typeof active!=='boolean')throw fail(400,'狀態無效');
  const path=accountPath(accountId),entry=path+'/ledger/status_'+operation(requestId);
  return this.atomic(async()=>{
   const [a,e]=await Promise.all([this.store.read(path),this.store.read(entry)]);
   if(!a.data)throw fail(404,'找不到客戶');
   if(e.data){if(e.data.active!==active)throw fail(409,'操作編號已用於其他設定');return view(accountId,a.data);}
   const data={...a.data,active};
   await this.store.commit([{...a,data},{...e,data:{type:'status',status:active?'enabled':'disabled',active,points:0,createdAt:this.now()}}]);
   return view(accountId,data);
  });
 }
 async recover(id){
  const path=accountPath(id);
  return this.atomic(async()=>{
   const a=await this.store.read(path);
   if(!a.data)throw fail(401,'使用碼不正確');
   if(!a.data.pending||a.data.pending.until>this.now())return a;
   const e=await this.store.read(path+'/ledger/ocr_'+a.data.pending.id);
   if(e.data?.status!=='pending')throw fail(503,'扣點紀錄需由管理員檢查');
   await this.store.commit([{...a,data:{...a.data,balance:a.data.balance+1,pending:null}},
    {...e,data:{...e.data,status:'refunded',retryable:false,finishedAt:this.now()}}]);
   return this.store.read(path);
  });
 }
 async account(code){const {id}=await this.lookup(code);return view(id,(await this.recover(id)).data);}
 async list(cursor=''){const p=await this.store.list('ocrAccounts',cursor);return {...p,items:p.items.map(d=>view(d.path.split('/').at(-1),d.data))};}
 async history(id,cursor=''){
  const p=await this.store.list(accountPath(id)+'/ledger',cursor);
  return {...p,items:p.items.map(({data:d})=>({type:d.type,status:d.status,points:d.points,twd:d.twd||0,note:d.note||'',createdAt:d.createdAt,finishedAt:d.finishedAt||null}))};
 }
 async reserve(id,requestId,fingerprint){
  operation(requestId);await this.recover(id);const path=accountPath(id);
  return this.atomic(async()=>{
   const [a,e]=await Promise.all([this.store.read(path),this.store.read(path+'/ledger/ocr_'+requestId)]);
   if(!a.data?.active)throw fail(403,'使用碼已停用');
   if(e.data){
    if(e.data.fingerprint!==fingerprint)throw fail(409,'同一操作編號不能辨識不同頁面');
    if(['completed','pending'].includes(e.data.status))return e.data.status;
    if(!e.data.retryable)throw Object.assign(fail(409,'此頁已失敗並退點；可重新辨識此頁'),{refunded:true});
    if(e.data.retryAt>this.now())throw Object.assign(fail(429,'稍後使用原操作重試'),{retryAfterSeconds:Math.ceil((e.data.retryAt-this.now())/1000)});
   }
   if(a.data.pending)throw fail(409,'此使用碼已有一頁處理中，請等候完成');
   if(a.data.balance<1)throw fail(402,'點數不足，請聯絡管理員加點');
   await this.store.commit([{...a,data:{...a.data,balance:a.data.balance-1,pending:{id:requestId,until:this.now()+this.lease}}},
    {...e,data:{type:'ocr',points:1,status:'pending',fingerprint,createdAt:e.data?.createdAt||this.now(),retryable:false}}]);
   return 'reserved';
  });
 }
 async finish(id,requestId,text,error){
  const path=accountPath(id);
  return this.atomic(async()=>{
   const [a,e]=await Promise.all([this.store.read(path),this.store.read(path+'/ledger/ocr_'+requestId)]);
   if(e.data?.status==='completed')return;
   if(e.data?.status!=='pending'||a.data?.pending?.id!==requestId)throw fail(409,'保留點數已退回，請重新辨識');
   const writes=[{...a,data:{...a.data,balance:a.data.balance+(error?1:0),used:a.data.used+(error?0:1),pending:null}},
    {...e,data:{...e.data,status:error?'refunded':'completed',finishedAt:this.now(),retryable:error?.status===429,retryAt:this.now()+Math.max(61,error?.retryAfterSeconds||0)*1000}}];
   if(!error)writes.push({path:path+'/ocrResults/'+requestId,version:null,data:{text,createdAt:this.now(),expiresAt:new Date(this.now()+86400000)}});
   await this.store.commit(writes);
  });
 }
 async result(id,requestId){
  operation(requestId);await this.recover(id);const path=accountPath(id);
  const e=await this.store.read(path+'/ledger/ocr_'+requestId);
  if(!e.data)throw fail(404,'尚無此辨識紀錄');
  if(e.data.status==='pending')return {pending:true,requestId,retryAfterSeconds:2};
  if(e.data.status!=='completed')throw Object.assign(fail(409,'辨識未完成，保留點數已退回'),{refunded:true});
  const r=await this.store.read(path+'/ocrResults/'+requestId);
  if(!r.data||new Date(r.data.expiresAt).getTime()<=this.now())throw fail(409,'此頁已完成扣點，但結果暫存已到期；不會再次扣點');
  return {text:r.data.text,requestId,chargedPoints:1};
 }
 async recognize(code,{image,requestId},annotate){
  const {id}=await this.lookup(code);const state=await this.reserve(id,requestId,hash(image));
  if(state!=='reserved')return this.result(id,requestId);
  let text;
  try{
   text=await annotate(image);
   if(typeof text!=='string'||!text.trim())throw fail(422,'未辨識到文字，本頁未扣點');
   if(Buffer.byteLength(text)>700000)throw fail(413,'辨識文字過長，本頁未扣點');
  }catch(e){await this.finish(id,requestId,null,e);e.refunded=true;throw e;}
  // An uncertain completion commit is not a safe reason to issue a second refund.
  await this.finish(id,requestId,text);
  return {text,requestId,chargedPoints:1};
 }
}