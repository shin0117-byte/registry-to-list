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
