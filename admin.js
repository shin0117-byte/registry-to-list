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
 if(adminEl('adminCode').value.trim()!==secret)throw new Error('登入資料已變更，請重新操作');
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
  const codeCell=document.createElement('td'),field=document.createElement('input'),show=document.createElement('button'),copy=document.createElement('button');
  field.readOnly=true;field.type='text';field.placeholder=a.codeSaved?'••••••••（已加密保存）':'舊碼尚未補存';field.setAttribute('aria-label',a.name+'的使用碼');
  show.textContent='顯示';copy.textContent='複製';show.disabled=copy.disabled=!a.codeSaved;
  let hideTimer;
  const hide=()=>{field.value='';show.textContent='顯示';clearTimeout(hideTimer);};
  const fetchCode=async()=>{const result=await api('/api/admin/code',{accountId:a.id,requestId:crypto.randomUUID()});return result.code;};
  show.onclick=()=>guarded(show,async()=>{if(field.value){hide();return;}field.value=await fetchCode();show.textContent='隱藏';hideTimer=setTimeout(hide,60000);});
  copy.onclick=()=>guarded(copy,async()=>{const code=await fetchCode();try{await navigator.clipboard.writeText(code);message('已複製「'+a.name+'」的使用碼，請私下交付客戶');}catch{field.value=code;show.textContent='隱藏';field.select();hideTimer=setTimeout(hide,60000);message('請複製已選取的使用碼');}});
  codeCell.className='customer-code';codeCell.append(field,show,copy);tr.append(codeCell);
  const td=document.createElement('td'),toggle=document.createElement('button'),history=document.createElement('button');
  toggle.textContent=a.active?'停用':'啟用';history.textContent='紀錄';
  const requestId=crypto.randomUUID();
  toggle.addEventListener('click',()=>guarded(toggle,async()=>{
   if(!confirm('確定'+toggle.textContent+'「'+a.name+'」？'))return;
   await api('/api/admin/status',{accountId:a.id,active:!a.active,requestId});await load();message('客戶狀態已更新');
  }));
  history.addEventListener('click',()=>guarded(history,()=>loadHistory(a.id,true)));
  const remove=document.createElement('button'),deleteRequestId=crypto.randomUUID();remove.textContent='刪除';
  remove.addEventListener('click',()=>guarded(remove,async()=>{
   const name=prompt('刪除「'+a.name+'」後，使用碼立即失效並從清單移除。\n剩餘 '+a.balance+' 點將保留但不能使用，不會自動退款；帳務紀錄保留。\n請輸入完整客戶名稱確認：');
   if(name===null)return;
   if(name!==a.name)throw new Error('名稱不符，未刪除客戶');
   await api('/api/admin/delete',{accountId:a.id,requestId:deleteRequestId,confirmName:name});
   hide();adminEl('newCode').value='';createDraft=null;
   await load();message('客戶已刪除，使用碼已失效；帳務紀錄保留');
  }));
  td.append(toggle,history,remove);tr.append(td);tbody.append(tr);
 }
 if(accounts.some(a=>a.id===old))select.value=old;
 adminEl('moreAccounts').hidden=!nextCursor;
}
async function loadHistory(id,reset){
 const data=await api('/api/admin/history?id='+encodeURIComponent(id)+(reset?'':'&cursor='+encodeURIComponent(historyCursor)));
 historyAccount=id;historyCursor=data.nextCursor;
 const labels={trial:'試用',credit:'加點',ocr:'OCR',status:'狀態',code_view:'查看使用碼',delete:'刪除客戶'};
 const statuses={credited:'已加點',completed:'已扣點',pending:'保留點數中',refunded:'已退點',enabled:'啟用',disabled:'停用',viewed:'已查看',deleted:'已刪除'};
 const text=data.items.map(x=>new Date(x.createdAt).toLocaleString()+'　'+(labels[x.type]||x.type)+'　'+(statuses[x.status]||x.status)+'　'+x.points+' 點'+(x.twd?'　NT$'+x.twd:'')+(x.note?'　'+x.note:'')).join('\n');
 adminEl('history').textContent=reset?text:adminEl('history').textContent+'\n'+text;
 adminEl('moreHistory').hidden=!historyCursor;
}
adminEl('adminLoginForm').onsubmit=event=>{
 event.preventDefault();
 return guarded(adminEl('login'),async()=>{
  const secret=adminEl('adminCode').value.trim();
  await load();
  message('登入成功。可使用瀏覽器密碼管理員儲存及自動填入密碼。');
  if(secret===adminEl('adminCode').value.trim() && typeof PasswordCredential!=='undefined' && navigator.credentials?.store){
   try { await navigator.credentials.store(new PasswordCredential({id:'admin',password:secret,name:'謄本轉清冊管理員'})); }
   catch { /* Browser preferences may decline saving; login still succeeds. */ }
  }
  if(secret===adminEl('adminCode').value.trim())await loadAdminUsage();
 });
};
adminEl('logout').onclick=()=>{clearAdminUsage();adminEl('adminCode').value='';adminEl('newCode').value='';adminEl('accounts').replaceChildren();adminEl('creditAccount').replaceChildren();adminEl('history').textContent='';accounts=[];createDraft=creditDraft=null;message('已清除本頁登入資料');};
adminEl('moreAccounts').onclick=()=>guarded(adminEl('moreAccounts'),()=>load(false));
adminEl('moreHistory').onclick=()=>guarded(adminEl('moreHistory'),()=>loadHistory(historyAccount,false));
adminEl('createCustomer').onsubmit=event=>{
 event.preventDefault();const button=event.submitter;
 guarded(button,async()=>{
  const fields={customerRef:adminEl('customerRef').value.trim(),name:adminEl('customerName').value.trim(),trial:adminEl('grantTrial').checked};
  const key=JSON.stringify(fields);
  if(createDraft?.key!==key)createDraft={key,input:{...fields,code:randomCode()}};
  adminEl('newCode').value=createDraft.input.code;
  await api('/api/admin/create',createDraft.input);message('客戶已建立，使用碼已加密保存於客戶清單');await load();
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
let usageRevision=0;
function clearAdminUsage(){
 usageRevision++;adminEl('adminUsageData').textContent='';adminEl('adminUsageStatus').textContent='登入後顯示使用量。';
}
async function loadAdminUsage(){
 const revision=++usageRevision,secret=adminEl('adminCode').value.trim();
 adminEl('adminUsageData').textContent='';adminEl('adminUsageStatus').textContent='正在讀取使用量…';
 try{
  const data=await api('/api/usage');
  if(revision!==usageRevision||secret!==adminEl('adminCode').value.trim())return;
  if(!data.hasData){adminEl('adminUsageStatus').textContent='尚無監控資料或資料尚未送達，不能視為零用量。';return;}
  const count=key=>{if(typeof data[key]!=='number'||!Number.isFinite(data[key])||data[key]<0)throw new Error('監控數據不完整，請稍後更新');return data[key].toLocaleString('zh-TW');};
  const date=value=>value && Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'未提供';
  adminEl('adminUsageData').textContent=[
   '本日呼叫：'+count('todayRequests')+' 次',
   '本月呼叫：'+count('requests')+' 次',
   '本月成功／失敗：'+count('success')+'／'+count('errors')+' 次',
   '本月成功圖片辨識呼叫：'+count('imageRequests')+' 次',
   '統計月份：'+data.month+'（台灣時間）',
   '資料查詢時間：'+date(data.updatedAt),
   '最新監控資料時間：'+date(data.latestPoint)
  ].join('\n');
  adminEl('adminUsageStatus').textContent='已讀取雲端 OCR 用量';
 }catch(e){
  if(revision!==usageRevision||secret!==adminEl('adminCode').value.trim())return;
  adminEl('adminUsageData').textContent='';adminEl('adminUsageStatus').textContent='使用量讀取失敗：'+e.message;
 }
}
adminEl('refreshAdminUsage').onclick=()=>guarded(adminEl('refreshAdminUsage'),loadAdminUsage);
adminEl('adminCode').addEventListener('input',clearAdminUsage);