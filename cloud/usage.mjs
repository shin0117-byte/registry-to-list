const failure=(status,message)=>Object.assign(new Error(message),{status});
export function estimateVisionCost(units,free=true) {
 const count=Math.max(0,Number(units)||0);
 return Math.max(0,Math.min(count,5000000)-(free?1000:0))*0.0015+Math.max(0,count-5000000)*0.0006;
}
export async function readGoogleUsage(project,{fetcher=fetch,now=new Date()}={}) {
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 const auth=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
 if(!auth.ok) throw failure(503,'無法讀取 Google 服務帳戶');
 const token=await auth.json();
 const query=new URL('https://monitoring.googleapis.com/v3/projects/'+encodeURIComponent(project)+'/timeSeries');
 query.searchParams.set('filter','metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.type="consumed_api" AND resource.labels.service="vision.googleapis.com"');
 query.searchParams.set('interval.startTime',start.toISOString());
 query.searchParams.set('interval.endTime',now.toISOString());
 query.searchParams.set('aggregation.alignmentPeriod','3600s');
 query.searchParams.set('aggregation.perSeriesAligner','ALIGN_SUM');
 query.searchParams.set('view','FULL');
 query.searchParams.set('pageSize','1000');
 let pageToken='',latest=null,seriesCount=0,requests=0,success=0,errors=0,todayRequests=0,imageRequests=0,otherRequests=0;
 const seen=new Set();
 do {
  if(pageToken) query.searchParams.set('pageToken',pageToken);
  const response=await fetcher(query.toString(),{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});
  if(response.status===403) throw failure(503,'監控尚未授權：請啟用 Monitoring API 並授予服務帳戶 Monitoring Viewer');
  if(!response.ok) throw failure(503,'Google 用量監控暫時無法讀取');
  const body=await response.json();
  if(body.executionErrors?.length) throw failure(503,'Google 監控只回傳部分資料，請稍後重試');
  for(const series of body.timeSeries || []) {
   seriesCount++;
   const method=series.resource?.labels?.method || '';
   const ok=series.metric?.labels?.response_code_class==='2xx' || /^2\d\d$/.test(series.metric?.labels?.response_code || '');
   for(const point of series.points || []) {
    const count=Number(point.value?.int64Value ?? point.value?.doubleValue);
    if(!Number.isFinite(count) || count<0) throw failure(503,'Google 監控數值格式無法辨識');
    const end=point.interval?.endTime;
    if(!end || !Number.isFinite(Date.parse(end))) throw failure(503,'Google 監控時間格式無法辨識');
    requests+=count;
    if(ok) { success+=count; if(/(?:^|[./])BatchAnnotateImages$/.test(method)) imageRequests+=count; else otherRequests+=count; }
    else errors+=count;
    if(Date.parse(end)>today.getTime()) todayRequests+=count;
    if(!latest || end>latest) latest=end;
   }
  }
  pageToken=body.nextPageToken || '';
  if(pageToken && seen.has(pageToken)) throw failure(503,'Google 監控分頁異常');
  seen.add(pageToken);
 } while(pageToken);
 return {source:'google-cloud-monitoring',project,month:start.toISOString().slice(0,7),timezone:'UTC',
  updatedAt:now.toISOString(),latestPoint:latest,hasData:seriesCount>0,
  requests,success,errors,todayRequests,imageRequests,otherRequests,
  estimateUsd:estimateVisionCost(imageRequests),estimateWithoutFreeUsd:estimateVisionCost(imageRequests,false),
  estimatedUnits:imageRequests,assumption:'假設每次 BatchAnnotateImages 成功呼叫只有一張圖片且僅使用 Document Text Detection；不是 Google 帳單。'};
}
