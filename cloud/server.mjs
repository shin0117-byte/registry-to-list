import {Billing} from './billing.mjs';
import {FirestoreStore} from './firestore-store.mjs';
import {readGoogleUsage} from './usage.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const files=new Set(['index.html','admin.html','admin.js','billing-client.js','app.js','styles.css','cloud-config.js','cloud-ocr.js','land-sections.json','localities.json','roads.json','vendor/pdf.mjs','vendor/pdf.worker.mjs']);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function readJson(req,limit){
 if(!String(req.headers['content-type']).startsWith('application/json'))throw fail(415,'請傳送 JSON');
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail(413,'資料過大');chunks.push(chunk);}
 try{const result=JSON.parse(Buffer.concat(chunks).toString());if(!result||typeof result!=='object'||Array.isArray(result))throw new Error();return result;}catch{throw fail(400,'JSON 格式無效');}
}
export async function googleVision(image, fetcher = fetch) {
 const auth=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
 if(!auth.ok) throw fail(503,'Google 服務帳戶尚未設定完成');
 const token=await auth.json();
 const response=await fetcher('https://vision.googleapis.com/v1/images:annotate',{
  method:'POST',signal:AbortSignal.timeout(65000),
  headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json','x-goog-user-project':process.env.GOOGLE_CLOUD_PROJECT},
  body:JSON.stringify({requests:[{image:{content:image},features:[{type:'DOCUMENT_TEXT_DETECTION'}],imageContext:{languageHints:['zh-TW']}}]})
 });
 const body=await response.json();
 if(response.status===429 || body.error?.code===429 || body.responses?.[0]?.error?.code===8) throw Object.assign(fail(429,'Google 配額暫時繁忙，稍候自動重試'),{retryAfterSeconds:61});
 if(!response.ok || body.error || body.responses?.[0]?.error) throw fail(502,'Google OCR 請求失敗；請管理員確認 API、計費、配額與服務帳戶權限');
 if(!body.responses?.[0]) throw fail(502,'Google OCR 未回傳辨識結果');
 return body.responses[0].fullTextAnnotation?.text || body.responses[0].textAnnotations?.[0]?.description || '';
}
export function createOcrServer({accessCode=process.env.OCR_ACCESS_CODE || '',project=process.env.GOOGLE_CLOUD_PROJECT || '',annotate=googleVision,usageReader=readGoogleUsage,billing=process.env.BILLING_ENABLED==='true'?new Billing(new FirestoreStore(project,{database:process.env.BILLING_DATABASE||'(default)'})):null,adminCode=process.env.OCR_ADMIN_CODE||'',billingActive=!!billing && process.env.BILLING_ADMIN_ONLY!=='true'}={}) {

 let usageCache,usageFlight;
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin==='https://shin0117-byte.github.io'){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end();}
  try {
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(path==='/api/health' && req.method==='GET') return json(res,200,{engine:'google-vision',configured:(billingActive?adminCode.length>=32:accessCode.length>=16) && !!project,billingEnabled:!!billingActive,billingAdminReady:!!billing,appRateLimit:null,version:'prepaid-preview-2026-09-16'});
   const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
   const adminAuth=()=>{
    if(adminCode.length<32)throw fail(503,'管理員密碼尚未設定');
    const a=Buffer.from(bearer),b=Buffer.from(adminCode);
    if(a.length!==b.length||!timingSafeEqual(a,b))throw fail(401,'管理員密碼不正確');
   };
   if(path==='/api/ocr/check' && req.method==='GET'){
    if((billingActive?adminCode.length<32:accessCode.length<16)||!project)throw fail(503,'雲端 OCR 尚未設定完成');
    if(billingActive){
     const a=await billing.account(bearer);
     if(!a.active)throw fail(403,'使用碼已停用');
     if(a.balance<1)throw fail(402,'點數不足，請聯絡管理員加點');
     return json(res,200,{valid:true,billingEnabled:true});
    }
    const supplied=Buffer.from(bearer),expected=Buffer.from(accessCode);
    if(supplied.length===expected.length&&timingSafeEqual(supplied,expected))return json(res,200,{valid:true,billingEnabled:false});
    if(billing&&/^ocr_[a-f0-9]{64}$/.test(bearer)){
     await billing.lookup(bearer);
     throw fail(409,'使用碼已確認，但客戶 OCR 模式尚未開放，請聯絡管理員；目前僅接受原共用碼');
    }
    throw fail(401,'使用碼不正確，請貼上完整 OCR 使用碼；客戶代號（例如 C0001）不是使用碼');
   }
   if(path.startsWith('/api/admin/')){
    if(!billing)throw fail(503,'計費功能尚未啟用');
    adminAuth();
    if(path==='/api/admin/accounts'&&req.method==='GET')return json(res,200,await billing.list(url.searchParams.get('cursor')||''));
    if(path==='/api/admin/history'&&req.method==='GET')return json(res,200,await billing.history(url.searchParams.get('id'),url.searchParams.get('cursor')||''));
    if(req.method!=='POST')throw fail(404,'找不到操作');
    const input=await readJson(req,16384);
    if(path==='/api/admin/delete')return json(res,200,await billing.remove(input));
    if(path==='/api/admin/code')return json(res,200,await billing.reveal(input));
    if(path==='/api/admin/create')return json(res,200,await billing.create(input));
    if(path==='/api/admin/credit')return json(res,200,await billing.credit(input));
    if(path==='/api/admin/status')return json(res,200,await billing.status(input));
    throw fail(404,'找不到操作');
   }
   if(['/api/account','/api/account/history','/api/ocr/result'].includes(path)&&req.method==='GET'){
    if(!billing)throw fail(404,'尚未啟用點數功能');
    const {id}=await billing.lookup(bearer);
    if(path==='/api/account')return json(res,200,await billing.account(bearer));
    if(path==='/api/account/history')return json(res,200,await billing.history(id,url.searchParams.get('cursor')||''));
    const result=await billing.result(id,url.searchParams.get('requestId'));
    return json(res,result.pending?202:200,result);
   }
   if(path==='/api/usage' && req.method==='GET'){
    if(billing)adminAuth();
    if((!billing&&accessCode.length<16) || !project) throw fail(503,'雲端監控尚未設定完成');
    const supplied=Buffer.from(req.headers.authorization || ''),expected=Buffer.from('Bearer '+accessCode);
    if(!billing && (supplied.length!==expected.length || !timingSafeEqual(supplied,expected))) throw fail(401,'使用碼不正確，請向管理員確認');
    if(!usageCache || Date.now()-usageCache.at>=300000 || usageCache.body.day!==new Date(Date.now()+8*3600000).toISOString().slice(0,10)){
     if(!usageFlight) usageFlight=usageReader(project).then(body=>{usageCache={body,at:Date.now()};}).finally(()=>{usageFlight=null;});
     await usageFlight;
    }
    return json(res,200,usageCache.body);
   }
   if(path==='/api/ocr' && req.method==='POST'){
    if((billingActive?adminCode.length<32:accessCode.length<16) || !project) throw fail(503,'雲端 OCR 尚未設定完成');
    const supplied=Buffer.from(req.headers.authorization || ''),expected=Buffer.from('Bearer '+accessCode);
    if(!billingActive && (supplied.length!==expected.length || !timingSafeEqual(supplied,expected))) throw fail(401,'使用碼不正確，請向管理員確認');


    if(billingActive)await billing.lookup(bearer);
    if(!String(req.headers['content-type']).startsWith('application/json')) throw fail(415,'請傳送 JSON 圖片資料');
    if(Number(req.headers['content-length'])>10*1024*1024) throw fail(413,'圖片過大');
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>10*1024*1024) throw fail(413,'圖片過大');chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'圖片資料格式錯誤');}
    const image=input?.image;
    if(typeof image!=='string' || !image.length || image.length%4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw fail(400,'圖片編碼無效');
    const bytes=Buffer.from(image,'base64');
    if(bytes.length>7*1024*1024) throw fail(413,'圖片超過 7 MB');
    const signature=bytes.subarray(0,8).toString('hex');
    if(signature!=='89504e470d0a1a0a' && !signature.startsWith('ffd8ff') && !signature.startsWith('49492a00') && !signature.startsWith('4d4d002a') && !(bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP')) throw fail(415,'請使用 PNG、JPG、TIFF 或 WebP 圖片');
    if(billingActive){const result=await billing.recognize(bearer,input,annotate);return json(res,result.pending?202:200,result);}
    return json(res,200,{engine:'google-vision',text:await annotate(image)});
   }
   const file=path==='/'?'index.html':path.slice(1);
   if(req.method!=='GET' || !files.has(file)) throw fail(404,'找不到頁面');
   const data=await readFile(resolve(process.env.PUBLIC_DIR || 'public',file)).catch(()=>{throw fail(404,'找不到頁面');});
   res.writeHead(200,{'Content-Type':(types[extname(file)] || 'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-cache'});res.end(data);
  }catch(error){if(!res.headersSent) json(res,error.status || 503,{error:error.status?error.message:'雲端辨識暫時無法使用，請稍後再試',...(error.refunded?{refunded:true}:{}),...(error.retryAfterSeconds?{retryAfterSeconds:error.retryAfterSeconds}:{})});}
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) createOcrServer().listen(Number(process.env.PORT || 8080),'0.0.0.0');
