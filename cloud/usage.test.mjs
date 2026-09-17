import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoogleUsage,estimateVisionCost} from './usage.mjs';
import {createOcrServer} from './server.mjs';
const now=new Date('2026-09-14T12:00:00Z');
const point=(n,end)=>({value:{int64Value:String(n)},interval:{endTime:end}});
const series=(method,status,points)=>({resource:{labels:{method}},metric:{labels:{response_code_class:status}},points});
test('reads Google pages across all instances; counts HTTP failures separately; no OCR/billing-unit conflation',async()=>{
 const urls=[];
 const fetcher=async url=>{
  urls.push(String(url));
  if(String(url).includes('metadata.google')) return {ok:true,json:async()=>({access_token:'test-token'})};
  const second=new URL(url).searchParams.has('pageToken');
  return {ok:true,json:async()=>second?{timeSeries:[series('google.cloud.vision.v1.ImageAnnotator.BatchAnnotateImages','5xx',[point(3,'2026-09-14T10:00:00Z')]),series('OtherMethod','2xx',[point(5,'2026-09-14T11:00:00Z')])]}:{
   timeSeries:[series('google.cloud.vision.v1.ImageAnnotator.BatchAnnotateImages','2xx',[point(1200,'2026-09-13T23:00:00Z'),point(10,'2026-09-14T12:00:00Z')])],nextPageToken:'second'}};
 };
 const data=await readGoogleUsage('test-project',{now,fetcher});
 assert.equal(data.requests,1218);
 assert.equal(data.success,1215);
 assert.equal(data.errors,3);
 assert.equal(data.imageRequests,1210);
 assert.equal(data.otherRequests,5);
 assert.equal(data.todayRequests,1218);
 assert.equal(data.estimateUsd,0.315);
 assert.equal(urls.length,3);
 const query=new URL(urls[1]);
 assert.equal(query.searchParams.get('interval.startTime'),'2026-08-31T16:00:00.000Z');
 assert.match(query.searchParams.get('filter'),/vision.googleapis.com/);
 assert.equal(query.searchParams.get('aggregation.perSeriesAligner'),'ALIGN_SUM');
});
test('no series and denied permissions are not reported as zero usage',async()=>{
 const metadata={ok:true,json:async()=>({access_token:'test'})};
 const empty=await readGoogleUsage('test',{now,fetcher:async u=>String(u).includes('metadata.google')?metadata:{ok:true,json:async()=>({})}});
 assert.equal(empty.hasData,false);
 await assert.rejects(readGoogleUsage('test',{now,fetcher:async u=>String(u).includes('metadata.google')?metadata:{ok:false,status:403}}),/監控尚未授權/);
});
test('price boundaries match published unit pricing',()=>{
 assert.equal(estimateVisionCost(0),0);
 assert.equal(estimateVisionCost(1000),0);
 assert.equal(estimateVisionCost(1001),0.0015);
 assert.equal(estimateVisionCost(2000),1.5);
 assert.equal(estimateVisionCost(1000,false),1.5);
 assert.equal(estimateVisionCost(5001000),7499.1);
});
test('usage requires access code and deduplicates concurrent monitoring requests',async()=>{
 let calls=0;
 const server=createOcrServer({accessCode:'test-code-12345678',project:'test',usageReader:async()=>{
  calls++;await new Promise(r=>setTimeout(r,20));return {month:new Date(Date.now()+8*3600000).toISOString().slice(0,7),day:new Date(Date.now()+8*3600000).toISOString().slice(0,10),source:'google-cloud-monitoring'};
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/usage';
 try {
  assert.equal((await fetch(url)).status,401);
  assert.equal(calls,0);
  const headers={Authorization:'Bearer test-code-12345678'};
  const results=await Promise.all([fetch(url,{headers}),fetch(url,{headers})]);
  assert.ok(results.every(r=>r.status===200));
  assert.equal(calls,1);
  await fetch(url,{headers});
  assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});

test('Taiwan month boundary starts at local midnight, not UTC midnight',async()=>{
 let query;
 const data=await readGoogleUsage('test',{now:new Date('2026-12-31T16:05:00Z'),fetcher:async url=>{
  if(String(url).includes('metadata.google'))return {ok:true,json:async()=>({access_token:'test'})};
  query=new URL(url);
  return {ok:true,json:async()=>({timeSeries:[series('BatchAnnotateImages','2xx',[point(2,'2026-12-31T16:03:00Z')])]})};
 }});
 assert.equal(query.searchParams.get('interval.startTime'),'2026-12-31T16:00:00.000Z');
 assert.equal(data.month,'2027-01');assert.equal(data.day,'2027-01-01');
 assert.equal(data.timezone,'Asia/Taipei');assert.equal(data.todayRequests,2);
});