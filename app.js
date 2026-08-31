const $ = (s) => document.querySelector(s);
const rows = $('#rows');
const state = { files: [] };
const demo = [
  ['羅＊＊','','大溪區龍潭鄉三洽水字1243番地',1,9,'---.--.--','總登記','108.7.22未辦繼承列冊'],
  ['卓先生','','桃園市龍潭區三和里店湖一路22號',1,3,'080.01.29','買賣',''],
  ['卓先生','','臺北市中山區聚盛里民生東路一段77號十樓之七',1,9,'091.06.22','分割繼承',''],
  ['羅先生','','桃園市桃園區三民里鎮撫街302號',1,9,'099.12.25','分割繼承','']
];

function addRow(data = []) {
  const fragment = $('#rowTemplate').content.cloneNode(true);
  const tr = fragment.querySelector('tr');
  const [name, id, address, numerator, denominator, date, reason, note] = data;
  Object.entries({name, id, address, numerator, denominator, date, reason, note}).forEach(([key, value]) => {
    const input = tr.querySelector(`[data-key="${key}"]`); if (value !== undefined) input.value = value;
  });
  tr.addEventListener('input', updateRow);
  tr.querySelector('.delete-row').addEventListener('click', () => { tr.remove(); updateAll(); });
  rows.append(tr); updateAll();
}
function genderFromId(id) {
  const normalized = id.trim().toUpperCase();
  if (!/^[A-Z][12]/.test(normalized)) return '—';
  return normalized[1] === '1' ? '男' : '女';
}
function updateRow(event) {
  const tr = event.currentTarget;
  tr.querySelector('.gender').textContent = genderFromId(tr.querySelector('[data-key="id"]').value);
  updateAll();
}
function updateAll() {
  const area = Number($('#area').value) || 0;
  [...rows.children].forEach((tr, index) => {
    tr.querySelector('.serial').textContent = index + 1;
    const numerator = Number(tr.querySelector('[data-key="numerator"]').value) || 0;
    const denominator = Number(tr.querySelector('[data-key="denominator"]').value) || 1;
    tr.querySelector('.share-area').textContent = (area * numerator / denominator * 0.3025).toFixed(2);
    tr.querySelector('.gender').textContent = genderFromId(tr.querySelector('[data-key="id"]').value);
  });
  $('#totalArea').textContent = (area * 0.3025).toFixed(2);
  $('#totalRatio').textContent = `總面積 ${area.toLocaleString('zh-TW',{maximumFractionDigits:2})} m²　約 ${(area * .3025).toLocaleString('zh-TW',{maximumFractionDigits:2})} 坪`;
}
function toast(text) { const t=$('#toast'); t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function setProgress(percent, label) { const safe = Math.min(100, Math.max(0, percent)); $('#progressWrap').hidden = false; $('#progressLabel').textContent = label; $('#progressPercent').textContent = `${Math.round(safe)}%`; $('#progressFill').style.width = `${safe}%`; }
function getData() { return [...rows.children].map(tr => Object.fromEntries(['name','id','address','numerator','denominator','date','reason','note'].map(key => [key, tr.querySelector(`[data-key="${key}"]`).value]))); }
function saveDraft() { localStorage.setItem('registry-draft', JSON.stringify({fields:Object.fromEntries(['district','section','parcel','area','value','zoning','building'].map(k=>[k,$('#'+k).value])), rows:getData()})); toast('草稿已儲存於本機瀏覽器'); }
function restoreDraft() { try { const d=JSON.parse(localStorage.getItem('registry-draft')); if (!d) return; Object.entries(d.fields).forEach(([k,v])=>$('#'+k).value=v); d.rows.forEach(r=>addRow([r.name,r.id || '',r.address,r.numerator,r.denominator,r.date,r.reason,r.note])); } catch {} }
function escapeXml(value='') { return String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }
function exportExcel() {
  const title = `${$('#district').value}${$('#section').value}${$('#parcel').value}地號清冊`;
  const items = getData(); const area=Number($('#area').value)||0;
  const head = ['次序','姓名','地址','持分','持分坪數','原因發生日期','登記原因','備註'];
  const body = items.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeXml(r.name)}</td><td>${escapeXml(r.address)}</td><td>${escapeXml(r.numerator)}／${escapeXml(r.denominator)}</td><td>${(area*Number(r.numerator||0)/Number(r.denominator||1)*.3025).toFixed(2)}</td><td>${escapeXml(r.date)}</td><td>${escapeXml(r.reason)}</td><td>${escapeXml(r.note)}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:'Microsoft JhengHei'}td,th{border:1px solid #555;padding:6px}th{background:#dcebe7}.title{font-size:16pt;font-weight:bold;text-align:left}</style></head><body><table><tr><th class="title" colspan="8">${escapeXml(title)}　總面積：${area.toLocaleString()}m²　約 ${(area*.3025).toFixed(2)}坪　公告現值：${$('#value').value}/m²</th></tr><tr><td colspan="8">${escapeXml($('#zoning').value)}　建號：${escapeXml($('#building').value)}</td></tr><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${body}<tr><td colspan="4">合計</td><td>${(area*.3025).toFixed(2)}</td><td colspan="3"></td></tr></table></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${title}.xls`; a.click(); URL.revokeObjectURL(a.href); toast('已匯出 Excel 相容清冊');
}
function exportPdf() {
  const title = `${$('#district').value}${$('#section').value}${$('#parcel').value}地號清冊`;
  const area = Number($('#area').value) || 0; const items = getData();
  const rowsHtml = items.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeXml(row.name)}</td><td>${escapeXml(row.address || '—')}</td><td>${escapeXml(row.numerator)}／${escapeXml(row.denominator)}</td><td>${(area * Number(row.numerator || 0) / Number(row.denominator || 1) * .3025).toFixed(2)}</td><td>${escapeXml(row.date)}</td><td>${escapeXml(row.reason)}</td><td>${escapeXml(row.note)}</td></tr>`).join('');
  const documentHtml = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Microsoft JhengHei',sans-serif;color:#17212b;font-size:10pt}h1{font-size:16pt;margin:0 0 5px}.meta{margin:0 0 12px;line-height:1.65;color:#334854}table{width:100%;border-collapse:collapse}th,td{border:1px solid #9baeb5;padding:5px 6px;vertical-align:top}th{background:#e4efed;white-space:nowrap}tr{break-inside:avoid}td:nth-child(1),td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:center;white-space:nowrap}.footer{margin-top:8px;font-size:9pt;color:#455b66}</style></head><body><h1>${escapeXml(title)}</h1><p class="meta">總面積：${area.toLocaleString('zh-TW',{maximumFractionDigits:2})} m²　約 ${(area * .3025).toLocaleString('zh-TW',{maximumFractionDigits:2})} 坪　公告現值：${escapeXml($('#value').value || '—')} 元／m²<br>${escapeXml($('#zoning').value)}　${escapeXml($('#building').value)}</p><table><thead><tr><th>次序</th><th>姓名</th><th>地址</th><th>持分</th><th>持分坪數</th><th>原因發生日期</th><th>登記原因</th><th>備註</th></tr></thead><tbody>${rowsHtml}</tbody></table><p class="footer">本清冊由謄本轉清冊系統於本機產生。</p><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
  const output = window.open('', '_blank'); if (!output) return toast('瀏覽器阻擋了 PDF 視窗，請允許彈出視窗後再試。');
  output.document.write(documentHtml); output.document.close();
}
$('#addRowBtn').addEventListener('click',()=>addRow()); $('#area').addEventListener('input',updateAll); $('#saveBtn').addEventListener('click',saveDraft); $('#printBtn').addEventListener('click',exportPdf); $('#exportBtn').addEventListener('click',exportExcel);
$('#loadDemoBtn').addEventListener('click',()=>{rows.innerHTML=''; demo.forEach(addRow); toast('已載入範例格式資料');});
$('#toggleOcr').addEventListener('click',()=>{const p=$('#ocrSettings');p.hidden=!p.hidden;$('#toggleOcr').textContent=p.hidden?'展開':'收合';});
$('#sourceFile').addEventListener('change',(e)=>{state.files=[...e.target.files];$('#fileList').innerHTML=state.files.map(f=>`<div class="file-item">${escapeXml(f.name)}</div>`).join('');$('#ocrBtn').disabled=!state.files.length;});
async function refreshPaddleSetup() {
  const panel = $('#paddleSetup'); const title = $('#paddleSetupTitle'); const text = $('#paddleSetupText'); const install = $('#paddleInstallBtn'); const download = $('#pythonDownload'); const localDownload = $('#localDownload');
  if (location.protocol === 'file:') { panel.hidden = true; return; }
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) { panel.hidden = false; title.textContent = '使用精準 OCR，請先下載本機版'; text.textContent = '公開網站無法存取你的文件或啟動電腦上的 OCR。下載 Windows 桌面版後直接執行；OCR 與文件都在你的電腦上處理，不需要 Python。'; install.hidden = true; download.hidden = true; localDownload.hidden = false; return; }
  try {
    const result = await fetch('/api/paddleocr-status'); const status = await result.json();
    const health = await fetch('http://127.0.0.1:8766/health', { signal: AbortSignal.timeout(900) }).then(r => r.ok).catch(() => false);
    localDownload.hidden = true; panel.hidden = health;
    if (health) return;
    if (!status.pythonAvailable) { title.textContent = '啟用精準 OCR：先安裝 Python'; text.textContent = '請按「下載 Python」，安裝時勾選 Add python.exe to PATH。完成後重新開啟本網站，再按「重新檢查」。'; install.hidden = true; download.hidden = false; return; }
    title.textContent = status.installed ? 'PaddleOCR 已安裝，正在啟動' : '可啟用 PaddleOCR 精準模式';
    text.textContent = status.installed ? '請重新開啟本網站；啟動器會自動啟動本機 OCR 服務。' : '按下「立即安裝 PaddleOCR」會開啟本機安裝視窗，首次下載模型可能需要幾分鐘。安裝完成後重新開啟本網站。';
    install.hidden = status.installed; download.hidden = true;
  } catch { panel.hidden = false; title.textContent = '無法檢查精準 OCR 狀態'; text.textContent = '請確認本網站是透過本機啟動器開啟，然後重新整理。'; }
}
$('#paddleCheckBtn').addEventListener('click', refreshPaddleSetup);
$('#paddleInstallBtn').addEventListener('click', async () => { const button = $('#paddleInstallBtn'); button.disabled = true; try { const response = await fetch('/api/start-paddleocr-install', { method: 'POST' }); if (response.status === 409) { await refreshPaddleSetup(); return; } if (!response.ok) throw new Error(); toast('安裝視窗已開啟；完成後重新開啟本網站。'); } catch { toast('無法啟動安裝器，請重新開啟本網站後再試。'); } finally { button.disabled = false; } });
refreshPaddleSetup();
async function runOcr() {
  if (!state.files.length) return;
  const button = $('#ocrBtn'); const mode = $('#readMode').value;
  button.disabled = true; button.textContent = '讀取文件中…'; setProgress(0, '正在讀取 PDF 與分析頁面');
  try {

    const source = await collectSourceContent(state.files, mode, (current, total) => { setProgress((current / total) * 20, `正在分析第 ${current}/${total} 頁`); });
    let ocrText = ''; const addressTexts = [];
    if (source.images.length) {
      const paddle = await runPaddleOcr(source.images, setProgress);
      if (paddle) { ocrText = paddle.ocrText; addressTexts.push(...paddle.addressTexts); }
      else { const fallback = await runTesseractOcr(source.images, setProgress); ocrText = fallback.ocrText; addressTexts.push(...fallback.addressTexts); }
    }    const ownerText = `${source.directText}\n${ocrText}`;
    setProgress(96, '正在整理土地與權利人資料'); await applyExtractedData(source.directText, ownerText, addressTexts); setProgress(100, '完成');
  } catch (error) { console.error(error); toast(`OCR 無法啟動：${error.message || '請重新整理後再試一次。'}`); }
  finally { button.disabled = false; button.textContent = '讀取並自動帶入'; }
}
async function runPaddleOcr(images, progress) {
  try {
    const probe = await fetch('http://127.0.0.1:8766/health', { signal: AbortSignal.timeout(1200) });
    if (!probe.ok) return null;
    let ocrText = ''; const addressTexts = [];
    for (let index = 0; index < images.length; index += 1) {
      const job = images[index]; progress(20 + (index / images.length) * 75, `PaddleOCR 精準辨識第 ${index + 1}/${images.length} 項`);
      const image = await blobToBase64(job.blob);
      const response = await fetch('http://127.0.0.1:8766/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'PaddleOCR 服務錯誤');
      if (job.kind === 'address') addressTexts.push(body.text); else ocrText += `\n${body.text}`;
    }
    return { ocrText, addressTexts };
  } catch (error) { console.info('PaddleOCR unavailable; using built-in OCR.', error); return null; }
}
function blobToBase64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); }); }
async function runTesseractOcr(images, progress) {
  if (!window.Tesseract) throw new Error('找不到 OCR 模組；請先執行 npm install。');
  const localUrl = (path) => new URL(path, window.location.href).href; let ocrText = ''; const addressTexts = [];
  let currentJob = 0; const totalJobs = images.length;
  const worker = await Tesseract.createWorker('chi_tra', 1, { langPath: localUrl('ocr-assets'), workerPath: localUrl('vendor/worker.min.js'), corePath: localUrl('vendor/tesseract-core.wasm.js'), logger: (m) => { if (m.status === 'recognizing text') progress(20 + ((currentJob + m.progress) / totalJobs) * 75, `內建 OCR 辨識第 ${currentJob + 1}/${totalJobs} 項`); } });
  for (let index = 0; index < images.length; index += 1) { currentJob = index; const job = images[index]; progress(20 + (index / totalJobs) * 75, `內建 OCR 辨識第 ${index + 1}/${totalJobs} 項`); await worker.setParameters({ tessedit_pageseg_mode: job.kind === 'address' ? '6' : '3' }); const result = await worker.recognize(job.blob); if (job.kind === 'address') addressTexts.push(result.data.text); else ocrText += `\n${result.data.text}`; }
  await worker.terminate(); return { ocrText, addressTexts };
}async function collectSourceContent(files, mode, progress) {
  const images = []; let directText = ''; let insideOwnershipSection = false;
  const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  const imageFiles = files.filter(file => !pdfFiles.includes(file));
  if (mode !== 'direct') images.push(...imageFiles.map(blob => ({ kind: 'page', blob })));
  if (!pdfFiles.length) return { images, directText };
  const pdfjs = await import('./vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';
  const documents = await Promise.all(pdfFiles.map(async file => pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise));
  const totalPages = documents.reduce((sum, pdfDocument) => sum + pdfDocument.numPages, 0);
  let pageNumber = 0;
  for (const pdfDocument of documents) for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex += 1) {
    pageNumber += 1; progress(pageNumber, totalPages);
    const page = await pdfDocument.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
    directText += `\n${rebuildPdfLines(textContent.items)}`;
    const hasOwnershipStart = /土\s*地\s*所\s*有\s*權\s*部/.test(pageText);
    const hasOtherRights = /土\s*地\s*他\s*項\s*權\s*利\s*部/.test(pageText);
    if (hasOwnershipStart) insideOwnershipSection = true;
    const otherRightsHeading = textContent.items.find(item => /土\s*地\s*他\s*項\s*權\s*利\s*部/.test(item.str));
    const idItems = insideOwnershipSection ? textContent.items.filter(item => /統\s*一\s*編\s*號/.test(item.str) && (!otherRightsHeading || item.transform[5] > otherRightsHeading.transform[5])) : [];
    const needsOcr = mode === 'ocr' || (mode === 'auto' && pageText.length < 70);
    if (!needsOcr && !idItems.length) { if (hasOtherRights) insideOwnershipSection = false; continue; }
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    if (needsOcr) images.push({ kind: 'page', blob: await new Promise(resolve => canvas.toBlob(resolve, 'image/png')) });
    for (const idItem of idItems) images.push({ kind: 'address', blob: await cropAddressLine(canvas, viewport, idItem) });
    if (hasOtherRights) insideOwnershipSection = false;
  }
  return { images, directText };
}
async function cropAddressLine(canvas, viewport, idItem) {
  const scale = viewport.scale; const idY = idItem.transform[5];
  const top = Math.max(0, Math.round(viewport.height - (idY + 6) * scale));
  const crop = document.createElement('canvas'); crop.width = Math.min(canvas.width, Math.round(550 * scale)); crop.height = Math.round(62 * scale);
  crop.getContext('2d').drawImage(canvas, 0, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const pixels = crop.getContext('2d').getImageData(0, 0, crop.width, crop.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const [r, g, b] = [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]];
    const isRedWatermark = r > g * 1.18 && r > b * 1.18;
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    const output = isRedWatermark || brightness > 190 ? 255 : 0;
    pixels.data[index] = output; pixels.data[index + 1] = output; pixels.data[index + 2] = output;
  }
  crop.getContext('2d').putImageData(pixels, 0, 0);
  return new Promise(resolve => crop.toBlob(resolve, 'image/png'));
}
function rebuildPdfLines(items) {
  const lines = [];
  for (const item of items) {
    const text = item.str?.trim(); if (!text) continue;
    const x = item.transform?.[4] || 0; const y = item.transform?.[5] || 0;
    let line = lines.find(candidate => Math.abs(candidate.y - y) < 2.5);
    if (!line) { line = { y, parts: [] }; lines.push(line); }
    line.parts.push({ x, text });
  }
  return lines.sort((a, b) => b.y - a.y).map(line => line.parts.sort((a, b) => a.x - b.x).map(part => part.text).join(' ')).join('\n');
}
async function applyExtractedData(landText, ownerText, addressTexts = []) {
  [...rows.children].filter(tr => /自動辨識|謄本未載地址|地址 OCR/.test(tr.querySelector('[data-key="note"]').value)).forEach(tr => tr.remove());
  const cleanLand = landText.replace(/\r/g, '').replace(/[　]/g, ' ').replace(/\s+/g, ' ').trim();
  const fields = extractLandFields(cleanLand); let filled = 0;
  const mappedDistrict = await lookupDistrict(fields.section);
  if (mappedDistrict) fields.district = mappedDistrict;
  for (const [id, value] of Object.entries(fields)) if (value && (!$('#' + id).value.trim() || (id === 'district' && mappedDistrict))) { $('#' + id).value = value; filled += 1; }
  const ownershipSection = isolateOwnershipSection(ownerText);
  const cleanOwners = ownershipSection.replace(/\r/g, '').replace(/[　]/g, ' ').replace(/\s+/g, ' ').trim();
  let owners = extractOwners(ownershipSection, cleanOwners);
  const localityDatabase = await loadLocalities();
  const roadDatabase = await loadRoads();
  owners.forEach((owner, index) => { owner.address = extractAddress(addressTexts[index] || '', fields.district || $('#district').value, localityDatabase, roadDatabase); });
  owners = groupCommonOwnership(owners);
  const existing = new Set([...rows.children].map(tr => [tr.dataset.sequence, tr.querySelector('[data-key="name"]').value, tr.querySelector('[data-key="id"]').value].join('|')));
  const newOwners = owners.filter(owner => { const key = [owner.sequence || '', owner.name, owner.id].join('|'); if (!owner.name || existing.has(key)) return false; existing.add(key); return true; });
  newOwners.forEach(owner => { const note = owner.common ? `公同共有（${owner.members.length}人；持分坪數合併計算）` : (owner.address ? '地址 OCR，請校對' : '地址 OCR 未辨識'); addRow([owner.name, owner.id, owner.address, owner.numerator, owner.denominator, owner.date, owner.reason, note]); rows.lastElementChild.dataset.sequence = owner.sequence || ''; });
  updateAll();
  toast(`讀取完成：土地資料帶入 ${filled} 項，新增權利人 ${newOwners.length} 筆。`);
}
function extractLandFields(text) {
  const district = text.match(/(?:臺|台|桃園|新北|臺北|台北|臺中|台中|高雄|臺南|台南)[\u4e00-\u9fff]{0,4}(?:市|縣)[\u4e00-\u9fff]{1,5}(?:區|鄉|鎮|市)/)?.[0];
  const rawSection = text.match(/[\u4e00-\u9fff0-9０-９]{1,16}段(?=\s*(?:\d{1,4}[-－]\d{4}|地號))/)?.[0] || '';
  const section = rawSection.replace(/^.*(?:縣|市|區|鄉|鎮)/, '');
  const parcelMatch = text.match(/(\d{1,4})\s*[-－]\s*(\d{4})\s*地號|地號\s*[：:]?\s*(\d{1,4})\s*[-－]?\s*(\d{4})?/);
  const parcel = parcelMatch ? `${(parcelMatch[1] || parcelMatch[3]).padStart(4, '0')}-${(parcelMatch[2] || parcelMatch[4] || '0000').padStart(4, '0')}` : '';
  const area = text.match(/(?:總\s*)?面\s*積\s*[：:]?[^\d]{0,18}([\d,]+(?:\.\d+)?)\s*(?:平方公尺|㎡|m2|m²)/i)?.[1]?.replace(/,/g, '');
  const value = text.match(/公告\s*(?:土地\s*)?現\s*值\s*[：:]?[^\d]{0,18}([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g, '');
  const zoning = text.match(/(山坡地保育區|一般農業區|特定農業區|都市計畫區|森林區)\s*(農牧用地|林業用地|建築用地|交通用地|水利用地)?/)?.[0];
  return { district, section, parcel, area, value, zoning };
}
async function lookupDistrict(section) {
  if (!section) return '';
  try { const database = await fetch('./land-sections.json', { cache: 'no-store' }).then(response => response.json()); return database.sections?.[section]?.district || ''; }
  catch { return ''; }
}
let localityDatabasePromise;
async function loadLocalities() {
  localityDatabasePromise ||= fetch('./localities.json', { cache: 'no-store' }).then(response => response.json()).catch(() => ({ localities: [], aliases: {} }));
  return localityDatabasePromise;
}
let roadDatabasePromise;
async function loadRoads() {
  roadDatabasePromise ||= fetch('./roads.json', { cache: 'no-store' }).then(response => response.json()).catch(() => ({ sites: {} }));
  return roadDatabasePromise;
}
function extractOwners(original, clean) {
  const labelled = extractLabelledOwners(original);
  if (labelled.length || /土地所有權部/.test(original)) return labelled;
  const cities = '(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|宜蘭縣|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|臺東縣|台東縣|花蓮縣|澎湖縣|金門縣|連江縣)';
  const addressPattern = new RegExp(`${cities}[^\n]{4,90}`, 'g'); const results = []; let match;
  while ((match = addressPattern.exec(original))) {
    const after = match[0].replace(/(?:\s+(?:持分|權利範圍|登記原因|原因|備註)|\s+\d+\s*[\/／]\s*\d+).*$/,'').trim();
    const context = original.slice(Math.max(0, match.index - 60), match.index + match[0].length + 70).replace(/\n/g, ' ');
    const named = context.match(new RegExp(`([\u4e00-\u9fff＊]{2,8})(?=\s*${cities})`));
    const label = context.match(/(?:權利人|姓名)\s*[：:]?\s*([\u4e00-\u9fff＊]{2,8})/);
    const share = context.match(/(\d+)\s*[\/／]\s*(\d+)/);
    const date = context.match(/\d{2,3}[.\/年]\d{1,2}[.\/月]\d{1,2}/)?.[0]?.replace(/[年月]/g,'.').replace('日','') || '';
    const reason = context.match(/分割繼承|買賣|繼承|贈與|總登記/)?.[0] || '';
    results.push({ name: label?.[1] || named?.[1] || '', id:'', address: after, numerator: share?.[1] || 1, denominator: share?.[2] || 1, date, reason });
  }
  if (!results.length) {
    const loose = clean.match(new RegExp(`${cities}.{4,80}`, 'g')) || [];
    loose.forEach(address => results.push({ name:'', id:'', address:address.trim(), numerator:1, denominator:1, date:'', reason:'' }));
  }
  return results;
}
function isolateOwnershipSection(text) {
  const start = text.search(/土\s*地\s*所\s*有\s*權\s*部/);
  if (start < 0) return text;
  const rest = text.slice(start);
  const end = rest.search(/土\s*地\s*他\s*項\s*權\s*利\s*部/);
  return end < 0 ? rest : rest.slice(0, end);
}
function extractAddress(raw, locality = '', database = { localities: [], aliases: {} }, roadDatabase = { sites: {} }) {
  let text = raw.replace(/\s+/g, '').replace(/^.*?住[。．.]*[址阯][:：]?/, '');
  text = text.replace(/(?:權狀字號|當期申報|登記原因|權利範圍|統一編號).*$/, '');
  for (const [from, to] of Object.entries(database.aliases || {})) text = text.replaceAll(from, to);
  const matches = (database.localities || []).filter(item => text.includes(item.name)).sort((a, b) => b.name.length - a.name.length);
  if (matches.length) {
    const preferred = matches.find(item => text.includes(item.county)) || matches.find(item => locality.startsWith(item.county)) || matches[0];
    const localityIndex = text.indexOf(preferred.name);
    return normalizeRoad(`${preferred.county}${preferred.name}${text.slice(localityIndex + preferred.name.length)}`, `${preferred.county}${preferred.name}`, roadDatabase);
  }
  const standardStart = text.search(/(?:[\u4e00-\u9fff]{1,3}縣|[\u4e00-\u9fff]{1,3}市)/);
  if (standardStart >= 0) return normalizeRoad(text.slice(standardStart), '', roadDatabase);
  const town = locality.match(/[\u4e00-\u9fff]{1,5}(?:區|鄉|鎮|市)$/)?.[0];
  if (town) { const townIndex = text.indexOf(town); if (townIndex >= 0) return normalizeRoad(`${locality}${text.slice(townIndex + town.length)}`, locality, roadDatabase); }
  return text.length >= 6 ? text : '';
}
function normalizeRoad(address, site, roadDatabase) {
  const roads = roadDatabase.sites?.[site] || [];
  if (!roads.length || roads.some(road => address.includes(road))) return address;
  const candidates = address.match(/[\u4e00-\u9fff0-9一二三四五六七八九十]+(?:路|街|道)/g) || [];
  for (const candidate of candidates) {
    const closest = roads.reduce((best, road) => {
      const distance = editDistance(candidate, road);
      return !best || distance < best.distance ? { road, distance } : best;
    }, null);
    if (closest && closest.distance <= 1 && candidate.length >= 3) return address.replace(candidate, closest.road);
  }
  return address;
}
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
function groupCommonOwnership(owners) {
  const grouped = new Map(); const singles = [];
  for (const owner of owners) {
    if (!owner.common) { singles.push(owner); continue; }
    const key = `${owner.numerator}/${owner.denominator}`;
    const group = grouped.get(key) || { ...owner, name: '', id: '', address: '', common: true, members: [], sequence: `common-${key}` };
    group.members.push(owner.name); grouped.set(key, group);
  }
  return [...singles, ...[...grouped.values()].map(group => ({ ...group, name: group.members.join('、') }))];
}
function extractLabelledOwners(text) {
  const compact = text.replace(/\r/g, '');
  const startPattern = /(?=(?:[（(]?\s*\d{1,4}\s*[)）]?\s*)?登\s*記\s*次\s*序)/g;
  const starts = [...compact.matchAll(startPattern)].map(match => match.index);
  const blocks = starts.length ? starts.map((start, index) => compact.slice(start, starts[index + 1] || compact.length)) : [compact];
  const valueAfter = (block, label) => {
    const match = block.match(new RegExp(`${label}\\s*[：:]?\\s*([^\\n]+)`, 'i'));
    return (match?.[1] || '').split(/(?:所\s*有\s*權\s*人|統\s*一\s*編\s*號|住\s*址|權\s*利\s*範\s*圍|登\s*記\s*原\s*因|原\s*因\s*發\s*生\s*日\s*期)/)[0].trim().replace(/\s+/g, '');
  };
  const records = blocks.map(block => {
    const sequence = block.match(/[（(]\s*(\d{4})\s*[)）]/)?.[1] || '';
    const name = valueAfter(block, '所\\s*有\\s*權\\s*人').replace(/^(姓名|所有權人)$/, '');
    const id = valueAfter(block, '統\\s*一\\s*編\\s*號').replace(/^(統一編號|身分證字號)$/, '');
    const address = valueAfter(block, '住\\s*址');
    const reason = valueAfter(block, '登\\s*記\\s*原\\s*因');
    const date = valueAfter(block, '原\\s*因\\s*發\\s*生\\s*日\\s*期').replace(/[年月]/g, '.').replace('日', '');
    const shareText = valueAfter(block, '權\\s*利\\s*範\\s*圍');
    const chineseShare = shareText.match(/(\d+)\s*分\s*之\s*(\d+)/);
    const slashShare = shareText.match(/(\d+)\s*[\/／]\s*(\d+)/);
    const numerator = chineseShare?.[2] || slashShare?.[1] || 1;
    const denominator = chineseShare?.[1] || slashShare?.[2] || 1;
    return { sequence, name, id, address, numerator, denominator, date, reason, common: /公\s*同\s*共\s*有/.test(shareText) };
  }).filter(record => record.name || record.id || record.address);
  return records.filter(record => record.name && record.name.length <= 80 && record.name !== '姓名');
}
$('#ocrBtn').addEventListener('click', runOcr);
restoreDraft();






