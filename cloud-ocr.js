async function validateOcrAccess() {
  if (!document.querySelector('#cloudConsent').checked) throw new Error('請先勾選同意將文件頁面傳送至雲端辨識');
  const code = document.querySelector('#cloudAccessCode').value.trim();
  if (!code) throw new Error('請輸入管理員提供的使用碼');
  const response = await fetch(cloudBaseUrl() + '/api/ocr/check', {headers:{Authorization:'Bearer '+code},signal:AbortSignal.timeout(15000)});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(response.status===404?'服務尚未更新使用碼預先驗證功能，請聯絡管理員更新':body.error||'無法驗證使用碼，尚未讀取文件');
  if (document.querySelector('#cloudAccessCode').value.trim()!==code) throw new Error('使用碼已變更，請重新開始');
}
function ocrRetrySeconds(response, body) {
  const header = response.headers?.get('Retry-After');
  let seconds = Number(body.retryAfterSeconds);
  if (header) seconds = /^\d+(\.\d+)?$/.test(header.trim()) ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 61;
  if (seconds > 3600) throw new Error('服務要求較長等待時間，請稍後再試。');
  return Math.ceil(seconds);
}
function cloudBaseUrl() {
  const configured = window.REGISTRY_OCR_URL || '';
  if (configured && new URL(configured).protocol !== 'https:') throw new Error('雲端 OCR 網址必須使用 HTTPS');
  return configured.replace(/\/$/, '');
}
async function refreshCloudSetup() {
  const title = document.querySelector('#cloudTitle');
  const detail = document.querySelector('#cloudDetail');
  try {
    const response = await fetch(cloudBaseUrl() + '/api/health', {signal: AbortSignal.timeout(8000)});
    const body = await response.json();
    if (!response.ok || body.engine !== 'google-vision' || !body.configured) throw new Error();
    window.prepaid?.configure(body.billingEnabled);
    title.textContent = 'Google Cloud Vision OCR 已連線';
    detail.textContent = '辨識時會將圖片住址或掃描頁傳送至 Google；辨識結果仍須逐筆校對。';
  } catch {
    title.textContent = 'Google OCR 尚未連線';
    detail.textContent = '雲端服務尚未部署完成或暫時無法連線。可先手動編輯清冊；僅讀取 PDF 文字不需連線。';
  }
}
async function runGoogleOcr(images, progress) {
  if (!document.querySelector('#cloudConsent').checked) throw new Error('請先勾選同意將文件頁面傳送至雲端辨識');
  const code = document.querySelector('#cloudAccessCode').value.trim();
  if (!code) throw new Error('請輸入管理員提供的使用碼');
  await window.prepaid?.prepare(images, code);
  let ocrText = '';
  const addressTexts = []; const pageResults = [];
  for (let index = 0; index < images.length; index++) {
    const job = images[index];
    if (job.blob.size > 7 * 1024 * 1024) throw new Error('圖片超過 7 MB，請縮小後重試');
    progress(20 + index / images.length * 75, 'OCR 辨識第 ' + (index + 1) + '/' + images.length + ' 項');
    const image = await blobToBase64(job.blob);
    let body;
    for (let attempt = 0; ; attempt++) {
      const response = window.prepaid?.active ? await window.prepaid.request(index,image,code,progress) : await fetch(cloudBaseUrl() + '/api/ocr', {
        method:'POST', signal:AbortSignal.timeout(90000),
        headers:{'Content-Type':'application/json','Authorization':'Bearer ' + code},
        body:JSON.stringify({image})
      });
      body = await response.json().catch(() => ({}));
      if (response.status === 429) {
        if (attempt >= 3) throw new Error('服務持續繁忙，已自動等待重試 3 次；請稍後再試。');
        const seconds = ocrRetrySeconds(response, body);
        for (let remaining = seconds; remaining > 0; remaining--) {
          progress(20 + index / images.length * 75,
            '服務限流，' + remaining + ' 秒後自動繼續第 ' + (index + 1) + '/' + images.length
            + ' 項（已完成 ' + index + ' 項，本次不重跑；重試 ' + (attempt + 1) + '/3）。請保持頁面開啟。');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        progress(20 + index / images.length * 75, '正在繼續 OCR 第 ' + (index + 1) + '/' + images.length + ' 項');
        continue;
      }
      if(!response.ok && body.refunded)window.prepaid?.release(index);
      if (!response.ok || typeof body.text !== 'string') throw new Error(String(body.error || 'OCR 暫時無法使用，請稍後重試').replace(/Google(?: Cloud Vision)?(?: OCR)?/gi,'辨識服務'));
      break;
    }
    window.prepaid?.record(index,body);
    if (job.kind === 'address') addressTexts.push(body.text);
    else { ocrText += '\n' + body.text; pageResults.push({pageKey:job.pageKey,text:body.text}); }
  }
  return {ocrText, addressTexts, pageResults};
}

let usageTimer;
async function refreshGoogleUsage() {
  const status = document.querySelector('#usageStatus');
  const button = document.querySelector('#refreshUsageBtn');
  const code = document.querySelector('#cloudAccessCode').value.trim();
  clearTimeout(usageTimer);
  if (!code) { status.textContent = '請先輸入 OCR 使用碼。'; return; }
  button.disabled = true;
  status.textContent = '正在向 Google 讀取專案用量…';
  let loaded = false;
  try {
    const response = await fetch(cloudBaseUrl() + '/api/usage', {
      headers:{Authorization:'Bearer ' + code}, signal:AbortSignal.timeout(60000)
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 404) throw new Error('雲端尚未更新監控功能，請管理員執行更新腳本。');
    if (!response.ok || body.source !== 'google-cloud-monitoring') throw new Error(body.error || '無法讀取 Google 監控資料。');
    for (const id of ['usageToday','usageMonthCount','usageResponses','usageImages','usageCost']) document.querySelector('#' + id).textContent = '—';
    document.querySelector('#usageWithoutFree').textContent = '';
    document.querySelector('#usageUpdated').textContent = body.month + '（台灣時間）・查詢時間：' + new Date(body.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});
    if (!body.hasData) {
      status.textContent = 'Google 尚無此月份的可用監控資料；可能尚未呼叫或資料仍在延遲，不能視為 0 張。';
    } else {
      document.querySelector('#usageToday').textContent = body.todayRequests.toLocaleString() + ' 次';
      document.querySelector('#usageMonthCount').textContent = body.requests.toLocaleString() + ' 次';
      document.querySelector('#usageResponses').textContent = body.success.toLocaleString() + '／' + body.errors.toLocaleString();
      document.querySelector('#usageImages').textContent = body.imageRequests.toLocaleString() + ' 次';
      document.querySelector('#usageCost').textContent = 'US$ ' + body.estimateUsd.toFixed(4);
      document.querySelector('#usageWithoutFree').textContent = '不折抵免費額度估算：US$ ' + body.estimateWithoutFreeUsd.toFixed(4);
      status.textContent = '已讀取 Google 專案用量；費用為條件式估算。';
    }
    loaded = true;
  } catch (error) {
    status.textContent = '更新失敗：' + error.message + ' 如有舊數字，僅代表上次查詢。';
  } finally {
    button.disabled = false;
    if (loaded) usageTimer = setTimeout(refreshGoogleUsage, 300000);
  }
}
document.querySelector('#refreshUsageBtn')?.addEventListener('click', refreshGoogleUsage);
