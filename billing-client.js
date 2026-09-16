(() => {
 const el=id=>document.getElementById(id),storageKey='registry-prepaid-pending-v1';
 let enabled=false,batch=null,historyCursor='';
 const base=()=>cloudBaseUrl();
 const auth=code=>({Authorization:'Bearer '+code});
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const fingerprint=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 function saved(){try{return JSON.parse(sessionStorage.getItem(storageKey));}catch{return null;}}
 function save(){try{if(batch)sessionStorage.setItem(storageKey,JSON.stringify(batch));else sessionStorage.removeItem(storageKey);}catch{/* Closed storage does not affect server-side idempotency. */}}
 async function json(path,code){
  const r=await fetch(base()+path,{headers:auth(code),signal:AbortSignal.timeout(15000)}),b=await r.json();
  if(!r.ok)throw new Error(b.error||'無法讀取點數');return b;
 }
 function configure(value){enabled=value===true;el('creditPanel').hidden=!enabled;}
 async function refresh(code=el('cloudAccessCode').value.trim()){if(!code)throw new Error('請先輸入使用碼');
  const a=await json('/api/account',code);
  if(el('cloudAccessCode').value.trim()===code)el('creditBalance').textContent='可用 '+a.balance+' 點｜已辨識 '+a.used+' 頁'+(!a.active?'｜已停用':'')+(a.pending?'｜有保留點數處理中':'');
  return a;
 }
 async function prepare(images,code){
  // Recheck the server before each paid batch; never infer billing from a client flag.
  const r=await fetch(base()+'/api/health',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('無法確認服務狀態，尚未開始辨識');
  const health=await r.json();configure(health.billingEnabled);
  if(!enabled){batch=null;return;}
  if(images.some(job=>job.blob.size>7*1024*1024))throw new Error('有圖片超過 7 MB，尚未開始扣點');
  const hashes=await Promise.all(images.map(job=>job.blob.arrayBuffer().then(fingerprint)));
  const owner=await fingerprint(new TextEncoder().encode(code));
  const signature=await fingerprint(new TextEncoder().encode(JSON.stringify([owner,hashes])));
  const old=batch||saved(),resume=old?.signature===signature;
  const a=await refresh(code);
  if(!a.active)throw new Error('使用碼已停用');
  if(!resume&&a.balance<images.length)throw new Error('本次需要 '+images.length+' 點，目前只有 '+a.balance+' 點，尚未開始辨識');
  if(old&&!resume&&!confirm('有一筆未完成的任務。開始新文件將不再續接該任務，確定繼續？'))throw new Error('已取消');
  if(!confirm(resume?'續接上次任務：已完成的頁面不會重複扣點。請在結果暫存有效期間內完成。':
   '本次共 '+images.length+' 頁，最多使用 '+images.length+' 點。失敗退點；已成功的頁面仍會計費。辨識文字會暫存 24 小時供斷線續接。確定開始？'))throw new Error('已取消，尚未新增扣點');
  batch=resume?old:{signature,ids:images.map(()=>crypto.randomUUID()),done:[],createdAt:Date.now()};
  save();
 }
 async function request(index,image,code,progress){
  const requestId=batch.ids[index];
  const send=()=>fetch(base()+'/api/ocr',{method:'POST',headers:{...auth(code),'Content-Type':'application/json'},body:JSON.stringify({image,requestId}),signal:AbortSignal.timeout(90000)});
  const poll=()=>fetch(base()+'/api/ocr/result?requestId='+encodeURIComponent(requestId),{headers:auth(code),signal:AbortSignal.timeout(15000)});
  let response;
  try{response=await send();}
  catch{
   progress(30,'連線中斷，正在確認原任務；不建立新的扣點操作');
   response=await poll();
   if(response.status===404)response=await send();
  }
  for(let n=0;response.status===202;n++){
   if(n>=100)throw new Error('此頁仍在處理。保留本頁，再按讀取即可續接原任務');
   progress(30,'等待原任務完成，不重複扣點…');
   await pause(2000);response=await poll();
  }
  return response;
 }
 function record(index,body){
  if(!enabled||!batch)return;
  if(body.requestId!==batch.ids[index])throw new Error('操作編號不一致，請聯絡管理員確認扣點');
  batch.done[index]=true;save();
  refresh().catch(()=>{});
 }
 function release(index){if(enabled&&batch){batch.ids[index]=crypto.randomUUID();batch.done[index]=false;save();}}
 function finish(){if(enabled){batch=null;save();refresh().catch(()=>{});}}
 el('refreshCredit').onclick=async()=>{try{await refresh();}catch(e){el('creditBalance').textContent=e.message;}};
 async function history(reset){
  const code=el('cloudAccessCode').value.trim();
  const data=await json('/api/account/history'+(!reset&&historyCursor?'?cursor='+encodeURIComponent(historyCursor):''),code);
  historyCursor=data.nextCursor;
  const names={trial:'體驗',credit:'加點',ocr:'辨識',status:'狀態'};
  const statuses={credited:'入帳',completed:'扣點完成',pending:'保留中',refunded:'已退點',enabled:'啟用',disabled:'停用'};
  const text=data.items.map(x=>new Date(x.createdAt).toLocaleString()+' '+(names[x.type]||x.type)+' '+x.points+' 點 '+(statuses[x.status]||x.status)).join('\n');
  el('creditHistory').textContent=reset?text:el('creditHistory').textContent+'\n'+text;
  el('moreCreditHistory').hidden=!historyCursor;
 }
 el('showCreditHistory').onclick=()=>history(true).catch(e=>el('creditHistory').textContent=e.message);
 el('moreCreditHistory').onclick=()=>history(false).catch(e=>el('creditHistory').textContent=e.message);
 el('cloudAccessCode').addEventListener('input',()=>{el('creditBalance').textContent='請查詢此使用碼餘額';el('creditHistory').textContent='';el('moreCreditHistory').hidden=true;historyCursor='';});
 el('resetCreditBatch').onclick=()=>{
  if(confirm('清除續接任務後，重新辨識已完成頁面會再次扣點。未完成頁面的保留點數仍會由伺服器逾時退回。確定清除？')){batch=null;save();el('creditHistory').textContent='已清除本機續接任務，未更動伺服器餘額';}
 };
 window.prepaid={configure,prepare,request,record,release,finish,get active(){return enabled&&!!batch;}};
})();