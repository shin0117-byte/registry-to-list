import test from 'node:test';
import assert from 'node:assert/strict';
import {createOcrServer} from './server.mjs';
test('auth and image validation protect paid provider calls; text is preserved',async()=>{
 let calls=0; const code='test-access-code-123456';
 const server=createOcrServer({accessCode:code,project:'test',annotate:async()=>{calls++;return '住址：測試市一號';}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try {
  assert.equal((await (await fetch(base+'/api/health')).json()).configured,true);
  const send=(image,auth=true)=>fetch(base+'/api/ocr',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+code}:{})},body:JSON.stringify({image})});
  assert.equal((await send('AAAA',false)).status,401);
  assert.equal((await send('???')).status,400);
  assert.equal((await send('AAAA')).status,415);
  assert.equal(calls,0);
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=';
  const good=await send(image);
  assert.equal(good.status,200);
  assert.equal((await good.json()).text,'住址：測試市一號');
  assert.equal(calls,1);
  assert.equal((await fetch(base+'/server.mjs')).status,404);
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:'https://evil.example'}})).headers.get('access-control-allow-origin'),null);
 } finally {await new Promise(r=>server.close(r));}
});
test('unconfigured service fails closed',async()=>{
 const server=createOcrServer({accessCode:'',project:''});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await (await fetch(base+'/api/health')).json()).configured,false);
  assert.equal((await fetch(base+'/api/ocr',{method:'POST'})).status,503);
 } finally {await new Promise(r=>server.close(r));}
});
