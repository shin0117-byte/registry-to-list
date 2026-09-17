import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
function setup(fetcher){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='adminCode'?'admin-secret':'',textContent:'',addEventListener(){},replaceChildren(){}});return nodes.get(id);};
 const c=vm.createContext({document:{getElementById:node},window:{REGISTRY_OCR_URL:'https://example.test'},URL,AbortSignal,fetch:fetcher});
 vm.runInContext(source,c);return {c,node};
}
const data={hasData:true,todayRequests:5,requests:30,success:28,errors:2,imageRequests:28,month:'2026-09',updatedAt:'2026-09-17T01:00:00Z',latestPoint:'2026-09-17T00:55:00Z'};
test('admin usage renders actual monitoring counts with admin auth',async()=>{
 let request;
 const {c,node}=setup(async(url,options)=>{request={url,options};return {ok:true,json:async()=>data};});
 await c.loadAdminUsage();
 assert.equal(request.url,'https://example.test/api/usage');
 assert.equal(request.options.headers.Authorization,'Bearer admin-secret');
 assert.match(node('adminUsageData').textContent,/本月呼叫：30 次/);
 assert.match(node('adminUsageData').textContent,/28／2/);
 assert.doesNotMatch(node('adminUsageData').textContent,/admin-secret/);
 c.clearAdminUsage();assert.equal(node('adminUsageData').textContent,'');
});
test('missing monitoring data and errors never appear as zero usage',async()=>{
 for(const response of [{ok:true,json:async()=>({hasData:false})},{ok:false,json:async()=>({error:'監控尚未授權'})}]){
  const {c,node}=setup(async()=>response);await c.loadAdminUsage();
  assert.equal(node('adminUsageData').textContent,'');assert.match(node('adminUsageStatus').textContent,/尚無|失敗/);
 }
});
test('late usage response after logout does not repopulate dashboard',async()=>{
 let finish;
 const {c,node}=setup(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=c.loadAdminUsage();node('logout').onclick();
 finish({ok:true,json:async()=>data});await pending;
 assert.equal(node('adminUsageData').textContent,'');assert.equal(node('adminUsageStatus').textContent,'登入後顯示使用量。');
});
test('admin login supports native password manager without browser-storage persistence',async()=>{
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 assert.match(html,/id="adminLoginForm" autocomplete="on"/);
 assert.match(html,/name="username"[^>]*autocomplete="username"/);
 assert.match(html,/name="password"[^>]*autocomplete="current-password"/);
 assert.match(html,/id="logout" type="button"/);
 assert.doesNotMatch(source,/(?:localStorage|sessionStorage)\s*\./);
 assert.ok(source.indexOf('await load();',source.indexOf("adminEl('adminLoginForm')"))<source.indexOf('navigator.credentials.store'));
});