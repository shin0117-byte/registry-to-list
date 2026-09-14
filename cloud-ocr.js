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
    title.textContent = 'Google Cloud Vision OCR 已連線';
    detail.textContent = '辨識時會將圖片住址或掃描頁傳送至 Google；辨識結果仍須逐筆校對。';
  } catch {
    title.textContent = 'Google OCR 尚未連線';
    detail.textContent = '雲端服務尚未部署完成或暫時無法連線。可先手動編輯清冊；僅讀取 PDF 文字不需連線。';
  }
}
async function runGoogleOcr(images, progress) {
  if (!document.querySelector('#cloudConsent').checked) throw new Error('請先勾選同意將圖片傳送至 Google 進行辨識');
  const code = document.querySelector('#cloudAccessCode').value.trim();
  if (!code) throw new Error('請輸入管理員提供的使用碼');
  let ocrText = '';
  const addressTexts = [];
  for (let index = 0; index < images.length; index++) {
    const job = images[index];
    if (job.blob.size > 7 * 1024 * 1024) throw new Error('圖片超過 7 MB，請縮小後重試');
    progress(20 + index / images.length * 75, 'Google OCR 辨識第 ' + (index + 1) + '/' + images.length + ' 項');
    const response = await fetch(cloudBaseUrl() + '/api/ocr', {
      method:'POST', signal:AbortSignal.timeout(90000),
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + code},
      body:JSON.stringify({image:await blobToBase64(job.blob)})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.text !== 'string') throw new Error(body.error || 'Google OCR 暫時無法使用，請稍後重試');
    if (job.kind === 'address') addressTexts.push(body.text);
    else ocrText += '\n' + body.text;
  }
  return {ocrText, addressTexts};
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
    document.querySelector('#usageUpdated').textContent = body.month + '（UTC）・查詢時間：' + new Date(body.updatedAt).toLocaleString('zh-TW');
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
