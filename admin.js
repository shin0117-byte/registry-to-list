'use strict';
const adminEl=id=>document.getElementById(id);
const randomCode=()=> 'ocr_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
let accounts=[],nextCursor='',historyCursor='',historyAccount='',createDraft,creditDraft;
function message(text){adminEl('adminStatus').textContent=text;}
async function api(path,body){
 const base=window.REGISTRY_OCR_URL||location.origin;
 if(new URL(base).protocol!=='https:')throw new Error('管理介面需要 HTTPS');
 const secret=adminEl('adminCode').value.trim();
 if(!secret)throw new Error('請輸入管理員密碼');
 const r=await fetch(base.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'操作未確認，請保留原資料後重試');
 return data;
}
async function guarded(button,fn){button.disabled=true;try{await fn();}catch(e){message(e.message);}finally{button.disabled=false;}}
async function load(reset=true){
 const data=await api('/api/admin/accounts'+(!reset&&nextCursor?'?cursor='+encodeURIComponent(nextCursor):''));
 accounts=reset?data.items:accounts.concat(data.items);nextCursor=data.nextCursor;
 const tbody=adminEl('accounts'),select=adminEl('creditAccount'),old=select.value;
 tbody.replaceChildren();select.replaceChildren();
 for(const a of accounts){
  const option=document.createElement('option');option.value=a.id;option.textContent=a.name+'（'+a.balance+' 點）';select.append(option);
  const tr=document.createElement('tr');
  for(const text of [a.name,a.balance,a.used,a.active?(a.pending?'處理中':'啟用'):'停用']){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  const td=document.createElement('td'),toggle=document.createElement('button'),history=document.createElement('button');
  toggle.textContent=a.active?'停用':'啟用';history.textContent='紀錄';
  const requestId=crypto.randomUUID();
  toggle.addEventListener('click',()=>guarded(toggle,async()=>{
   if(!confirm('確定'+toggle.textContent+'「'+a.name+'」？'))return;
   await api('/api/admin/status',{accountId:a.id,active:!a.active,requestId});await load();message('客戶狀態已更新');
  }));
  history.addEventListener('click',()=>guarded(history,()=>loadHistory(a.id,true)));
  td.append(toggle,history);tr.append(td);tbody.append(tr);
 }
 if(accounts.some(a=>a.id===old))select.value=old;
 adminEl('moreAccounts').hidden=!nextCursor;
}
async function loadHistory(id,reset){
 const data=await api('/api/admin/history?id='+encodeURIComponent(id)+(reset?'':'&cursor='+encodeURIComponent(historyCursor)));
 historyAccount=id;historyCursor=data.nextCursor;
 const labels={trial:'試用',credit:'加點',ocr:'OCR',status:'狀態'};
 const statuses={credited:'已加點',completed:'已扣點',pending:'保留點數中',refunded:'已退點',enabled:'啟用',disabled:'停用'};
 const text=data.items.map(x=>new Date(x.createdAt).toLocaleString()+'　'+(labels[x.type]||x.type)+'　'+(statuses[x.status]||x.status)+'　'+x.points+' 點'+(x.twd?'　NT$'+x.twd:'')+(x.note?'　'+x.note:'')).join('\n');
 adminEl('history').textContent=reset?text:adminEl('history').textContent+'\n'+text;
 adminEl('moreHistory').hidden=!historyCursor;
}
adminEl('login').onclick=()=>guarded(adminEl('login'),async()=>{await load();message('已讀取客戶；管理員密碼只保留於本頁記憶體');});
adminEl('logout').onclick=()=>{adminEl('adminCode').value='';adminEl('newCode').value='';adminEl('accounts').replaceChildren();adminEl('creditAccount').replaceChildren();adminEl('history').textContent='';accounts=[];createDraft=creditDraft=null;message('已清除本頁登入資料');};
adminEl('moreAccounts').onclick=()=>guarded(adminEl('moreAccounts'),()=>load(false));
adminEl('moreHistory').onclick=()=>guarded(adminEl('moreHistory'),()=>loadHistory(historyAccount,false));
adminEl('createCustomer').onsubmit=event=>{
 event.preventDefault();const button=event.submitter;
 guarded(button,async()=>{
  const fields={customerRef:adminEl('customerRef').value.trim(),name:adminEl('customerName').value.trim(),trial:adminEl('grantTrial').checked};
  const key=JSON.stringify(fields);
  if(createDraft?.key!==key)createDraft={key,input:{...fields,code:randomCode()}};
  adminEl('newCode').value=createDraft.input.code;
  await api('/api/admin/create',createDraft.input);message('客戶已建立，請保存本次使用碼');await load();
 });
};
adminEl('creditCustomer').onsubmit=event=>{
 event.preventDefault();guarded(event.submitter,async()=>{
  const fields={accountId:adminEl('creditAccount').value,plan:adminEl('creditPlan').value,note:adminEl('paymentNote').value.trim()},key=JSON.stringify(fields);
  if(!confirm('確認已收款，並替選取客戶加入「'+adminEl('creditPlan').selectedOptions[0].textContent+'」？'))return;
  if(creditDraft?.key!==key)creditDraft={key,input:{...fields,requestId:crypto.randomUUID()}};
  const result=await api('/api/admin/credit',creditDraft.input);creditDraft=null;adminEl('paymentNote').value='';message(result.alreadyApplied?'此收款已記錄，沒有重複加點':'已加點完成');await load();
 });
};