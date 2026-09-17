const $ = (s) => document.querySelector(s);
const rows = $('#rows');
const state = { files: [], ocrEngine: '',  };
const demo = [
  ['羅＊＊','','大溪區龍潭鄉三洽水字1243番地',1,9,'---.--.--','總登記','108.7.22未辦繼承列冊'],
  ['卓先生','','桃園市龍潭區三和里店湖一路22號',1,3,'080.01.29','買賣',''],
  ['卓先生','','臺北市中山區聚盛里民生東路一段77號十樓之七',1,9,'091.06.22','分割繼承',''],
  ['羅先生','','桃園市桃園區三民里鎮撫街302號',1,9,'099.12.25','分割繼承','']
];

function addRow(data = [], metadata = {}) {
  const fragment = $('#rowTemplate').content.cloneNode(true);
  const tr = fragment.querySelector('tr');
  let [name, id, address, numerator, denominator, date, reason, note] = data;
  const checked = validateOwnerIdentity({name,id}); name=checked.name; id=checked.id; note=[note,...checked.review].filter(Boolean).join('；');
  Object.entries({name: formatOwnerName(name, id), id, address, numerator, denominator, date, reason, note}).forEach(([key, value]) => {
    const input = tr.querySelector(`[data-key="${key}"]`); if (value !== undefined) input.value = value;
  });
  tr.dataset.commonGroup = metadata.commonGroup || '';
  tr.dataset.sequence = metadata.sequence || '';
  tr.dataset.ocrImported = metadata.ocrImported ? 'true' : '';
  const groupField = document.createElement('input');
  groupField.className = 'common-group-input';
  groupField.placeholder = '公同共有組別（同組填相同）';
  groupField.title = '只合併相鄰且組別相同的持分與坪數；清空可拆開。';
  groupField.value = metadata.commonGroup || '';
  groupField.setAttribute('aria-label', '公同共有組別');
  groupField.addEventListener('input', () => { tr.dataset.commonGroup = groupField.value.trim(); });
  tr.querySelector('[data-key="note"]').parentElement.append(groupField);
  tr.addEventListener('input', updateRow);

  tr.querySelector('.delete-row').addEventListener('click', () => { tr.remove(); updateAll(); });
  setupRowMovement(tr);
  rows.append(tr); tr.querySelectorAll('textarea').forEach(autoGrowField); updateAll();
}
function moveOwnerRow(tr,position) {
  const list=[...rows.children],from=list.indexOf(tr),target=Number(position)-1;
  if(from<0 || !Number.isInteger(target) || target<0 || target>=list.length || target===from)return false;
  const others=list.filter(row=>row!==tr);
  rows.insertBefore(tr,others[target] || null);
  updateAll();
  tr.scrollIntoView?.({block:'nearest'});
  return true;
}
function setupRowMovement(tr) {
  const controls=document.createElement('div');controls.className='row-movement';
  for(const [label,cls,action] of [
    ['↑','move-up',()=>moveOwnerRow(tr,[...rows.children].indexOf(tr))],
    ['↓','move-down',()=>moveOwnerRow(tr,[...rows.children].indexOf(tr)+2)],
    ['移至','move-to',()=>{
      const value=prompt('移到第幾筆？請輸入 1～'+rows.children.length,[...rows.children].indexOf(tr)+1);
      if(value===null)return;
      if(!/^\d+$/.test(value.trim())||Number(value)<1||Number(value)>rows.children.length){toast('請輸入有效次序');return;}
      moveOwnerRow(tr,Number(value));
    }]
  ]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=cls;
    button.setAttribute('aria-label',cls==='move-up'?'此筆上移':cls==='move-down'?'此筆下移':'移到指定次序');
    button.addEventListener('click',action);controls.append(button);
  }
  tr.querySelector('.delete-row').parentElement.prepend(controls);
}
function genderFromId(id) {
  const normalized = id.trim().toUpperCase();
  if (normalized.length !== 10 || !/^[A-Z][12]/.test(normalized)) return '—';
  return normalized[1] === '1' ? '男' : '女';
}
function formatOwnerName(name = '', id = '') {
  const value = String(name).trim(); const gender = genderFromId(String(id || ''));
  if (!value || gender === '—' || /(先生|小姐)$/.test(value)) return value;
  const title = gender === '男' ? '先生' : '小姐';
  return /[＊*]+/.test(value) ? value.replace(/[＊*]+/g, title) : `${value}${title}`;
}
function autoGrowField(field) { if (field?.tagName === 'TEXTAREA') { field.style.height = 'auto'; field.style.height = Math.max(30, field.scrollHeight) + 'px'; } }
function updateRow(event) {
  autoGrowField(event.target);
  const sharedKey = event.target.dataset?.key;
  const group = event.currentTarget.dataset.commonGroup;
  if (group && ['numerator','denominator'].includes(sharedKey)) {
    for (const member of rows.children) if (member.dataset.commonGroup === group) {
      member.querySelector('[data-key="' + sharedKey + '"]').value = event.target.value;
    }
  }
  const tr = event.currentTarget; const id = tr.querySelector('[data-key="id"]').value;
  tr.querySelector('.gender').textContent = genderFromId(id);
  const name = tr.querySelector('[data-key="name"]'); name.value = formatOwnerName(name.value, id);
  updateAll();
}
function updateAll() {
  const area = Number($('#area').value) || 0;
  [...rows.children].forEach((tr, index) => {
    tr.querySelector('.serial').textContent = index + 1;
    const up=tr.querySelector('.move-up'),down=tr.querySelector('.move-down');
    if(up)up.disabled=index===0;if(down)down.disabled=index===rows.children.length-1;
    const numerator = Number(tr.querySelector('[data-key="numerator"]').value) || 0;
    const denominator = Number(tr.querySelector('[data-key="denominator"]').value) || 1;
    tr.querySelector('.share-area').textContent = (area * numerator / denominator * 0.3025).toFixed(2);
    tr.querySelector('.gender').textContent = genderFromId(tr.querySelector('[data-key="id"]').value);
  });
  mergeCommonCells();
  $('#totalArea').textContent = (area * 0.3025).toFixed(2);
  $('#totalRatio').textContent = `總面積 ${area.toLocaleString('zh-TW',{maximumFractionDigits:2})} m²　約 ${(area * .3025).toLocaleString('zh-TW',{maximumFractionDigits:2})} 坪`;
}
function toast(text) { const t=$('#toast'); t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function setProgress(_percent, label) { $('#ocrEngineStatus').textContent = 'OCR：' + label; }
function setOcrEngine(name) { state.ocrEngine = name; }
function getData() {
  return [...rows.children].map(tr => ({
    ...Object.fromEntries(['name','id','address','numerator','denominator','date','reason','note'].map(key => [key, tr.querySelector('[data-key="' + key + '"]').value])),
    commonGroup:tr.dataset.commonGroup || '', sequence:tr.dataset.sequence || '',
    ocrImported:tr.dataset.ocrImported === 'true'
  }));
}
function commonSpans(items) {
  const spans = items.map(() => 1);
  for (let i = 0; i < items.length;) {
    let end = i + 1;
    const lead = items[i];
    if (lead.commonGroup) while (end < items.length && items[end].commonGroup === lead.commonGroup &&
      String(items[end].numerator) === String(lead.numerator) &&
      String(items[end].denominator) === String(lead.denominator)) end++;
    spans[i] = end - i;
    for (let j = i + 1; j < end; j++) spans[j] = 0;
    i = end;
  }
  return spans;
}
function mergeCommonCells() {
  const spans = commonSpans(getData());
  [...rows.children].forEach((tr, i) => {
    // Keep hidden controls in the DOM for drafts, row deletion and per-owner data.
    for (const index of [4,5,6,7]) {
      const cell = tr.children[index];
      cell.rowSpan = spans[i] || 1;
      cell.style.display = spans[i] === 0 ? 'none' : '';
      cell.classList.toggle('common-share', Boolean(tr.dataset.commonGroup && spans[i] > 1));
    }
  });
}
function buildExportRows(items, area) {
  const spans = commonSpans(items);
  return items.map((row,i) => {
    const shared = spans[i] ? '<td class="export-share" rowspan="' + spans[i] + '">' +
      escapeXml(row.numerator) + '／' + escapeXml(row.denominator) + '</td><td class="export-share" rowspan="' +
      spans[i] + '">' + (area * Number(row.numerator || 0) / Number(row.denominator || 1) * .3025).toFixed(2) + '</td>' : '';
    return '<tr><td>' + (i + 1) + '</td><td><span class="export-name">' + escapeXml(row.name) +
      '</span></td><td><span class="export-address">' + escapeXml(row.address || '—') + '</span></td>' + shared +
      '<td>' + escapeXml(row.date) + '</td><td>' + escapeXml(row.reason) + '</td><td>' + escapeXml(row.note) + '</td></tr>';
  }).join('');
}
function saveDraft() { localStorage.setItem('registry-draft', JSON.stringify({fields:Object.fromEntries(['district','section','parcel','area','value','valuePeriod','zoning','landCategory','building'].map(k=>[k,$('#'+k).value])), rows:getData()})); toast('草稿已儲存於本機瀏覽器'); }
function restoreDraft() { try { const d=JSON.parse(localStorage.getItem('registry-draft')); if (!d) return; Object.entries(d.fields).forEach(([k,v])=>$('#'+k).value=v); d.rows.forEach(r=>addRow([r.name,r.id || '',r.address,r.numerator,r.denominator,r.date,r.reason,r.note],r)); } catch {} }
function escapeXml(value='') { return String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }
function exportExcel() {
  const title = `${$('#district').value}${$('#section').value}${$('#parcel').value}地號清冊`;
  const items = getData(); const area=Number($('#area').value)||0;
  const head = ['次序','姓名','地址','持分','持分坪數','原因發生日期','登記原因','備註'];
  const body = buildExportRows(items, area);
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:'Microsoft JhengHei'}td,th{border:1px solid #555;padding:6px;vertical-align:top;white-space:normal;overflow-wrap:anywhere}.export-share{vertical-align:middle;text-align:center}.export-name{display:block;width:7em}.export-address{display:block;width:15em}th{background:#dcebe7}.title{font-size:16pt;font-weight:bold;text-align:left}</style></head><body><table><tr><th class="title" colspan="8">${escapeXml(title)}　總面積：${area.toLocaleString()}m²　約 ${(area*.3025).toFixed(2)}坪　${escapeXml(landValueLabel())}${$('#value').value}/m²</th></tr><tr><td colspan="8">${escapeXml($('#zoning').value)}　建號：${escapeXml($('#building').value)}</td></tr><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${body}<tr><td colspan="4">合計</td><td>${(area*.3025).toFixed(2)}</td><td colspan="3"></td></tr></table></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${title}.xls`; a.click(); URL.revokeObjectURL(a.href); toast('已匯出 Excel 相容清冊');
}
function exportPdf() {
  const title = `${$('#district').value}${$('#section').value}${$('#parcel').value}地號清冊`;
  const area = Number($('#area').value) || 0; const items = getData();
  const rowsHtml = buildExportRows(items, area);
  const documentHtml = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>@page{size:A3 landscape;margin:12mm}body{font-family:'Microsoft JhengHei',sans-serif;color:#17212b;font-size:12pt;line-height:1.4;margin:0}h1{font-size:16pt;margin:0 0 5px}.meta{margin:0 0 12px;line-height:1.65;color:#334854}table{width:100%;table-layout:fixed;border-collapse:collapse}thead{display:table-header-group}th,td{border:1px solid #9baeb5;padding:6px 7px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;word-break:normal}th{background:#e4efed}tr{break-inside:avoid}.export-share{text-align:center;vertical-align:middle;overflow-wrap:anywhere}.export-name{display:block;width:100%;overflow-wrap:anywhere}.export-address{display:block;width:100%;overflow-wrap:anywhere}.footer{margin-top:8px;font-size:12pt;color:#455b66}</style></head><body><h1>${escapeXml(title)}</h1><p class="meta">總面積：${area.toLocaleString('zh-TW',{maximumFractionDigits:2})} m²　約 ${(area * .3025).toLocaleString('zh-TW',{maximumFractionDigits:2})} 坪　${escapeXml(landValueLabel())}${escapeXml($('#value').value || '—')} 元／m²<br>${escapeXml($('#zoning').value)}　${escapeXml($('#building').value)}</p><table><colgroup><col style="width:4%"><col style="width:9%"><col style="width:25%"><col style="width:15%"><col style="width:8%"><col style="width:12%"><col style="width:9%"><col style="width:18%"></colgroup><thead><tr><th>次序</th><th>姓名</th><th>地址</th><th>持分</th><th>持分坪數</th><th>原因發生日期</th><th>登記原因</th><th>備註</th></tr></thead><tbody>${rowsHtml}</tbody></table><p class="footer">本清冊由謄本轉清冊系統於本機產生。</p><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
  const output = window.open('', '_blank'); if (!output) return toast('瀏覽器阻擋了 PDF 視窗，請允許彈出視窗後再試。');
  output.document.write(documentHtml); output.document.close();
}
function setupDesktopUpdater() {
  if (!window.desktopUpdater) return;
  const banner = $('#updateBanner'); const title = $('#updateTitle'); const text = $('#updateText'); const button = $('#installUpdateBtn');
  window.desktopUpdater.onStatus(status => {
    if (status.state === 'available') { banner.hidden = false; title.textContent = `發現新版 ${status.version}`; text.textContent = '可下載後自動覆蓋更新；程式會重新開啟。'; button.hidden = false; button.disabled = false; return; }
    if (status.state === 'downloading') { banner.hidden = false; title.textContent = '正在下載更新'; text.textContent = '下載完成後會自動關閉、覆蓋並重新開啟程式。'; button.hidden = true; return; }
    if (status.state === 'installing') { title.textContent = '正在套用更新'; text.textContent = '程式即將重新開啟。'; }
  });
  button.addEventListener('click', async () => { button.disabled = true; try { await window.desktopUpdater.install(); } catch (error) { button.disabled = false; text.textContent = `更新失敗：${error.message || '請稍後再試。'}`; } });
}
$('#addRowBtn').addEventListener('click',()=>addRow()); $('#area').addEventListener('input',updateAll); $('#saveBtn').addEventListener('click',saveDraft); $('#printBtn').addEventListener('click',exportPdf); $('#exportBtn').addEventListener('click',exportExcel);
$('#loadDemoBtn').addEventListener('click',()=>{rows.innerHTML=''; demo.forEach(addRow); toast('已載入範例格式資料');});
$('#sourceFile').addEventListener('change',(e)=>{state.files=[...e.target.files];$('#fileList').innerHTML=state.files.map(f=>`<div class="file-item">${escapeXml(f.name)}</div>`).join('');$('#ocrBtn').disabled=!state.files.length;});
refreshCloudSetup();
async function runOcr() {
  if (!state.files.length) return;
  const button = $('#ocrBtn'); const mode = $('#readMode').value;
  button.disabled = true; button.textContent = '讀取文件中…'; setProgress(0, '正在讀取 PDF 與分析頁面');
  try {

    if (mode !== 'direct') { setProgress(0, '正在驗證使用碼'); await validateOcrAccess(); }
    const source = await collectSourceContent(state.files, mode, (current, total) => { setProgress((current / total) * 20, `正在分析第 ${current}/${total} 頁`); });
    setOcrEngine('PDF 文字讀取');
    let ocrText = ''; const addressTexts = []; let pageResults = [];
    if (source.images.length) {
      setOcrEngine('Google Cloud Vision');
      if ($('#fadeWatermark').checked) await prepareWatermarkImages(source.images, setProgress);
      const result = await runGoogleOcr(source.images, setProgress);
      ocrText = result.ocrText; addressTexts.push(...result.addressTexts); pageResults = result.pageResults || [];
    }
    const ownerText = chooseExtractionText(mode, source.directText, ocrText);
    setProgress(96, '正在整理土地與權利人資料'); await applyExtractedData(ownerText, ownerText, addressTexts, mode === 'auto' ? reconcileDocumentPages(source.pages, pageResults) : null, mode === 'auto' ? reconcileLandFields(source.directText, ocrText) : null); setProgress(100, '完成'); window.prepaid?.finish();
  } catch (error) { setProgress(0, '未完成：' + error.message); toast(`OCR 無法啟動：${error.message || '請重新整理後再試一次。'}`); }
  finally { button.disabled = false; button.textContent = '讀取並自動帶入'; }
}
function chooseExtractionText(mode, directText, ocrText) { return mode === 'ocr' ? ocrText : directText + '\n' + ocrText; }
function blobToBase64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); }); }
async function collectSourceContent(files, mode, progress, loadPdf = () => import('./vendor/pdf.mjs')) {
  const images = [], pages = []; let directText = '';
  const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  const imageFiles = files.filter(file => !pdfFiles.includes(file));
  imageFiles.forEach((blob,index) => {
    const pageKey = 'image-' + index;
    pages.push({pageKey,fileKey:pageKey,directText:''});
    if (mode !== 'direct') images.push({kind:'page',blob,pageKey});
  });
  if (!pdfFiles.length) return {images,directText,pages};
  const pdfjs = await loadPdf();
  pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';
  const documents = await Promise.all(pdfFiles.map(async file => pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise));
  const totalPages = documents.reduce((sum,pdf) => sum + pdf.numPages,0);
  let pageNumber = 0;
  for (let fileIndex = 0; fileIndex < documents.length; fileIndex++) {
    const pdfDocument = documents[fileIndex];
    for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex++) {
      progress(++pageNumber,totalPages);
      const page = await pdfDocument.getPage(pageIndex);
      const textContent = mode === 'ocr' ? {items:[]} : await page.getTextContent().catch(error => { if (mode === 'direct') throw error; return {items:[]}; });
      const pageText = rebuildPdfLines(textContent.items);
      const pageKey = 'pdf-' + fileIndex + '-' + pageIndex;
      pages.push({pageKey,fileKey:'pdf-' + fileIndex,directText:pageText});
      directText += '\n' + pageText;
      if (mode === 'direct') continue;
      // One full-page image serves every owner; never submit extra address crops.
      const viewport = page.getViewport({scale:3});
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      if (!blob) throw new Error('頁面影像產生失敗，請重新讀取。');
      images.push({kind:'page',blob,pageKey});
    }
  }
  return {images,directText,pages};
}
function fadeRedWatermarkPixels(data) {
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r=data[i],g=data[i+1],b=data[i+2];
    // Retain dark/neutral strokes. Red-channel dropout lightens only clearly red pixels.
    if (data[i+3] && r >= 150 && r-g >= 30 && r-b >= 30 && r >= g*1.2 && r >= b*1.2) {
      data[i+1]=r;data[i+2]=r;changed++;
    }
  }
  return changed;
}
async function fadeRedWatermarkBlob(blob) {
  let bitmap,canvas;
  try {
    bitmap=await createImageBitmap(blob);
    if (bitmap.width*bitmap.height>40000000) return blob;
    canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    if (!fadeRedWatermarkPixels(pixels.data)) return blob;
    ctx.putImageData(pixels,0,0);
    const cleaned=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    return cleaned && cleaned.size<=7*1024*1024 ? cleaned : blob;
  } catch { return blob; }
  finally { bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;} }
}
async function prepareWatermarkImages(images,progress) {
  for (let i=0;i<images.length;i++) {
    progress(20,'正在淡化紅色浮水印 '+(i+1)+'／'+images.length);
    images[i].blob=await fadeRedWatermarkBlob(images[i].blob);
  }
}
function parsedOwners(text) {
  const section = isolateOwnershipSection(text);
  return extractOwners(section,section.replace(/\s+/g,' ').trim());
}
function reconcileDocumentPages(pages = [], results = []) {
  const recognized = new Map(results.map(result => [result.pageKey,result.text]));
  const documents = new Map();
  for (const page of pages) {
    if (!documents.has(page.fileKey)) documents.set(page.fileKey,{direct:[],ocr:[]});
    const doc = documents.get(page.fileKey);
    doc.direct.push(page.directText); doc.ocr.push(recognized.get(page.pageKey) || '');
  }
  const owners = [];
  for (const [fileKey,doc] of documents) {
    const direct = doc.direct.join('\n'), ocr = doc.ocr.join('\n');
    owners.push(...reconcileOwners(parsedOwners(direct),parsedOwners(ocr)).map(owner => ({
      ...owner, sequence:fileKey + ':' + (owner.registrationSequence || owner.sequence || ''),
      documentKey:fileKey
    })));
  }
  return owners;
}
function otherRightsNotes(text) {
  return /土\s*地\s*他\s*項\s*權\s*利\s*部/.test(String(text || '')) ? ['謄本出現「土地他項權利部」，請查閱原謄本內容'] : [];
}
function registrationNotes(text, landOnly=false) {
  let source=String(text || '').replace(/\r/g,'');
  if(landOnly) {
    const marker=/土\s*地\s*標\s*示\s*部/.exec(source);
    if(!marker)return [];
    source=source.slice(marker.index+marker[0].length).split(/土\s*地\s*(?:所\s*有\s*權|他\s*項\s*權\s*利)\s*部/)[0];
  }
  const notes=[];
  const pattern=/其\s*他\s*登\s*記\s*事\s*項\s*[：:]\s*([\s\S]*?)(?=其\s*他\s*登\s*記\s*事\s*項|土\s*地\s*(?:所\s*有\s*權|他\s*項\s*權\s*利|標\s*示)\s*部|[（(]\s*\d{4}\s*[）)]\s*登\s*記\s*次\s*序|登\s*記\s*次\s*序|$)/g;
  for(const match of source.matchAll(pattern)){
    const value=match[1].replace(/[＊*]{3,}/g,'').replace(/[（(]\s*續次頁\s*[）)]/g,'').replace(/\s+/g,' ').trim();
    if(!value || /^[（(]\s*空\s*白\s*[）)]$/.test(value))continue;
    notes.push('有其他登記事項：'+value);
  }
  return [...new Set(notes)];
}
function reconcileLandFields(directText, ocrText) {
  const fields = extractLandFields(directText), scanned = extractLandFields(ocrText), review = [];
  const labels = {district:'縣市／行政區',section:'段別',parcel:'地號',area:'面積',value:'公告現值',valuePeriod:'公告現值年期',zoning:'使用分區',landCategory:'使用地類別'};
  const normalize = v => String(v || '').replace(/\s/g,'').replace(/台/g,'臺');
  for (const [key,label] of Object.entries(labels)) {
    if (!scanned[key] || /[�□]/.test(scanned[key])) continue;
    if (fields[key] && normalize(fields[key]) !== normalize(scanned[key]))
      review.push(label + '不一致；文字：' + fields[key] + '；採用OCR：' + scanned[key]);
    fields[key] = scanned[key];
  }
  review.push(...new Set([...registrationNotes(directText,true),...registrationNotes(ocrText,true),...otherRightsNotes(directText),...otherRightsNotes(ocrText)]));
  return {fields,review};
}
function validateOwnerIdentity(owner) {
  const review=[...(owner.review || [])];
  let name=String(owner.name || '').trim(),id=String(owner.id || '').replace(/\s/g,'');
  if(id && id.length!==10){review.push('身分證字號長度非10碼，未登載，請校對');id='';}
  if(/[0-9０-９]+$/.test(name)){name=name.replace(/[0-9０-９]+$/,'').trim();review.push('姓名尾端數字已移除，請校對');}
  return {...owner,name,id,review};
}
function reconcileOwners(directOwners, ocrOwners) {
  directOwners=directOwners.map(validateOwnerIdentity); ocrOwners=ocrOwners.map(validateOwnerIdentity);
  const merged = directOwners.map(owner => ({...owner,review:[...(owner.review || [])]}));
  const used = new Set();
  const normalize = value => String(value || '').replace(/[\s＊*]/g,'').replace(/台/g,'臺');
  const usable = value => Boolean(String(value || '').trim()) && !/[�□]/.test(String(value));
  for (const scanned of ocrOwners) {
    // Registration sequence is scoped to a single document; never pair by row position.
    const key = scanned.registrationSequence || scanned.sequence;
    let matches = merged.map((owner,index) => ({owner,index})).filter(({owner,index}) =>
      !used.has(index) && key && (owner.registrationSequence || owner.sequence) === key);
    if (!matches.length && !key) matches = merged.map((owner,index) => ({owner,index})).filter(({owner,index}) =>
      !used.has(index) && !owner.registrationSequence && !owner.sequence &&
      /^[A-Z][12]\d{8}$/.test(scanned.id || '') && owner.id === scanned.id && normalize(owner.name) === normalize(scanned.name));
    if (matches.length !== 1) {
      merged.push({...scanned,review:[...(scanned.review || []),...(directOwners.length ? ['影像補入：請校對是否為遺漏或重複權利人'] : [])]});
      used.add(merged.length - 1); continue;
    }
    const {owner,index} = matches[0]; used.add(index); owner.review.push(...(scanned.review || []));
    const labels = {name:'姓名',id:'身分證字號',address:'住址',date:'日期',reason:'登記原因'};
    for (const [field,label] of Object.entries(labels)) {
      if (field === 'reason' && usable(owner.reason) && usable(scanned.reason) && normalize(owner.reason) !== normalize(scanned.reason)) { owner.review.push('登記原因不一致；採用文字：' + owner.reason + '；OCR：' + scanned.reason); continue; }
      if (!usable(owner[field]) && usable(scanned[field])) owner[field] = scanned[field];
      else if (usable(owner[field]) && usable(scanned[field]) && normalize(owner[field]) !== normalize(scanned[field]))
        { owner.review.push(label + '不一致；文字：' + owner[field] + '；採用OCR：' + scanned[field]); owner[field] = scanned[field]; }
    }
    if (owner.shareAvailable === false && scanned.shareAvailable !== false) {
      owner.numerator = scanned.numerator; owner.denominator = scanned.denominator; owner.shareAvailable = true;
    } else if (scanned.shareAvailable !== false &&
      (String(owner.numerator) !== String(scanned.numerator) || String(owner.denominator) !== String(scanned.denominator)))
      { owner.review.push('持分不一致；文字：' + owner.numerator + '／' + owner.denominator + '；採用OCR：' + scanned.numerator + '／' + scanned.denominator); owner.numerator = scanned.numerator; owner.denominator = scanned.denominator; }
    if (owner.common !== scanned.common) owner.review.push('公同共有標示不一致；文字：' + (owner.common ? '是' : '否') + '；採用OCR：' + (scanned.common ? '是' : '否'));
    owner.common = scanned.common;
  }
  return merged.map(owner => owner.shareAvailable === false ? {...owner,numerator:'',denominator:'',review:[...owner.review,'持分未辨識，請校對']} : owner);
}
async function cropAddressLine(canvas, viewport, idItem) {
  const scale = viewport.scale; const idY = idItem.transform[5];
  const top = Math.max(0, Math.round(viewport.height - (idY - 4) * scale));
  const crop = document.createElement('canvas'); crop.width = Math.min(canvas.width, Math.round(430 * scale)); crop.height = Math.round(26 * scale);
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
async function applyExtractedData(landText, ownerText, addressTexts = [], reconciledOwners = null, reconciledLand = null) {
  [...rows.children].filter(tr => tr.dataset.ocrImported === 'true' || /自動辨識|謄本未載住址|地址辨識|地址 OCR|公同共有（\d+人；持分坪數合併計算）/.test(tr.querySelector('[data-key="note"]').value)).forEach(tr => tr.remove());
  const cleanLand = landText.replace(/\r/g, '').replace(/[　]/g, ' ').replace(/\s+/g, ' ').trim();
  const fields = reconciledLand ? reconciledLand.fields : extractLandFields(cleanLand); let filled = 0;
  if (!reconciledLand) reconciledLand = {review:[...registrationNotes(landText,true),...otherRightsNotes(landText)]};
  if (reconciledLand?.review.length) { const notes = $('#building'); notes.value = [notes.value, ...reconciledLand.review].filter(Boolean).join('；'); }
  const mappedDistrict = await lookupDistrict(fields.section);
  if (mappedDistrict && (!fields.district || mappedDistrict.endsWith(fields.district))) fields.district = mappedDistrict;
  for (const [id, value] of Object.entries(fields)) if (value && (!$('#' + id).value.trim() || (id === 'district' && mappedDistrict))) { $('#' + id).value = value; filled += 1; }
  const ownershipSection = isolateOwnershipSection(ownerText);
  const cleanOwners = ownershipSection.replace(/\r/g, '').replace(/[　]/g, ' ').replace(/\s+/g, ' ').trim();
  let owners = reconciledOwners === null ? extractOwners(ownershipSection, cleanOwners) : reconciledOwners;
  const localityDatabase = await loadLocalities();
  const roadDatabase = await loadRoads();
  const documentHasAddress = addressTexts.length > 0 || /住\s*[址阯]/.test(ownershipSection);
  owners.forEach((owner, index) => {
    const structuredAddress = extractAddress(owner.address || '', fields.district || $('#district').value, localityDatabase, roadDatabase);
    const croppedOcrAddress = extractAddress(addressTexts[index] || '', fields.district || $('#district').value, localityDatabase, roadDatabase);
    owner.address = selectBestAddress(structuredAddress, croppedOcrAddress);
    owner.addressAvailable = documentHasAddress;
  });
  owners = groupCommonOwnership(owners);
  const existing = new Set([...rows.children].map(tr => [tr.dataset.sequence, tr.querySelector('[data-key="name"]').value, tr.querySelector('[data-key="id"]').value].join('|')));
  const newOwners = owners.filter(owner => { const key = [owner.sequence || '', owner.name, owner.id].join('|'); if (!owner.name || existing.has(key)) return false; existing.add(key); return true; });
  newOwners.forEach(owner => {
    const note = owner.common ? '公同共有（組別與住址請校對）' : (owner.address ? '地址辨識，請校對' : (owner.addressAvailable ? '地址 OCR 未辨識' : '謄本未載住址'));
    addRow([owner.name,owner.id,owner.address,owner.numerator,owner.denominator,owner.date,owner.reason,[note,...(owner.review || [])].join('；')],
      {commonGroup:owner.commonGroup,sequence:owner.sequence,ocrImported:true});
  });
  updateAll();
  toast(`讀取完成：土地資料帶入 ${filled} 項，新增權利人 ${newOwners.length} 筆。`);
}
function extractLandFields(text) {
  const compact = text.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/\s+/g,'');
  const header = compact.split(/土地標示部/)[0];
  const title = header.match(/(?:^|謄本(?:[（(]地號全部[）)])?)((?:[\u4e00-\u9fff]{2,3}[縣市])?[\u4e00-\u9fff]{2,5}?(?:區|鄉|鎮|市))([\u4e00-\u9fff0-9]{1,18}段)(\d{1,4})[-－](\d{4})地號/);
  const heading = title || header.match(/((?:[\u4e00-\u9fff]{2,3}[縣市])?[\u4e00-\u9fff]{2,5}?(?:區|鄉|鎮|市))([\u4e00-\u9fff0-9]{1,18}段)(\d{1,4})[-－](\d{4})地號/);
  const authorityCounty = header.match(/資料管轄機關[：:]?((?:臺|台)北市|新北市|桃園市|(?:臺|台)中市|(?:臺|台)南市|高雄市|基隆市|新竹[縣市]|嘉義[縣市]|宜蘭縣|苗栗縣|彰化縣|南投縣|雲林縣|屏東縣|花蓮縣|(?:臺|台)東縣|澎湖縣|金門縣|連江縣)/)?.[1];
  const headingDistrict = heading?.[1] || '';
  const hasCounty = /^(?:[\u4e00-\u9fff]{2,3}[縣市])[\u4e00-\u9fff]+(?:區|鄉|鎮|市)$/.test(headingDistrict);
  const district = headingDistrict && authorityCounty && !hasCounty ? authorityCounty + headingDistrict : headingDistrict || authorityCounty;
  const section = heading?.[2] || header.match(/([\u4e00-\u9fff0-9]{1,16}段)(?=\d{1,4}[-－]\d{4}地號)/)?.[1];
  const parcelMatch = compact.match(/(\d{1,4})[-－](\d{4})地號|地號[：:]?(\d{1,4})[-－]?(\d{4})?/);
  const parcel = parcelMatch ? (parcelMatch[1] || parcelMatch[3]).padStart(4,'0')+'-'+(parcelMatch[2] || parcelMatch[4] || '0000').padStart(4,'0') : '';
  const land = (compact.split('土地標示部')[1] || compact).split(/土地所有權部|土地他項權利部/)[0];
  const area = land.match(/(?:總)?面積[：:]?[^\d]{0,18}([\d,]+(?:\.\d+)?)(?:平方公尺|㎡|m2|m²)/i)?.[1]?.replace(/,/g,'');
  const value = land.match(/公告(?:土地)?現值[：:]?[^\d]{0,18}([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g,'');
  const period = land.match(/(?:民國)?(\d{2,3})年(\d{1,2})月[^\d\u4e00-\u9fff]{0,8}公告(?:土地)?現值/);
  const valuePeriod = period ? '民國'+period[1]+'年'+period[2].padStart(2,'0')+'月' : '';
  const zoning = land.match(/使用分區[：:]?([（(]空白[）)]|[\u4e00-\u9fff]{1,12}?區)/)?.[1] ||
    land.match(/山坡地保育區|一般農業區|特定農業區|都市計畫區|森林區/)?.[0];
  const landCategory = land.match(/使用地類別[：:]?([（(]空白[）)]|[\u4e00-\u9fff]{1,12}?用地)/)?.[1];
  return {district,section,parcel,area,value,valuePeriod,zoning,landCategory};
}
function landClassificationLabel() {
  return [$('#zoning').value, $('#landCategory').value ? '使用地類別：'+$('#landCategory').value : ''].filter(Boolean).join('　');
}
function landValueLabel() {
  return ($('#valuePeriod').value ? $('#valuePeriod').value+'　' : '')+'公告現值：';
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
function selectBestAddress(structuredAddress, croppedOcrAddress) {
  if (structuredAddress && /(?:市|縣).{2,}(?:區|鄉|鎮|市)/.test(structuredAddress)) return structuredAddress;
  return croppedOcrAddress || structuredAddress;
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
  let previousKey = '', currentGroup = '';
  const prefix = '共-' + Date.now().toString(36) + '-';
  return owners.map((owner,index) => {
    if (!owner.common) { previousKey = ''; currentGroup = ''; return {...owner,commonGroup:''}; }
    // Never collapse owner records. Without an explicit group reference, only
    // adjacent matching share/date/reason records form a provisional group.
    const key = JSON.stringify([String(owner.numerator),String(owner.denominator),owner.date || '',owner.reason || '',owner.commonGroup || '',owner.documentKey || '']);
    if (key !== previousKey) currentGroup = owner.commonGroup || prefix + (index + 1);
    previousKey = key;
    return {...owner,commonGroup:currentGroup};
  });
}
function extractLabelledOwners(text) {
  const compact = text.replace(/\r/g, '');
  const startPattern = /(?:[（(]?\s*\d{1,4}\s*[)）]?\s*)?登\s*記\s*次\s*序/g;
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
    const address = (block.match(/住\s*[址阯]\s*[：:]?\s*([\s\S]*?)(?=\s*(?:權\s*利\s*範\s*圍|權\s*狀\s*字\s*號|當\s*期\s*申\s*報|登\s*記\s*原\s*因|原\s*因\s*發\s*生\s*日\s*期)|$)/)?.[1] || '').replace(/\s+/g,'');
    const reason = valueAfter(block, '登\\s*記\\s*原\\s*因');
    const date = valueAfter(block, '原\\s*因\\s*發\\s*生\\s*日\\s*期').replace(/[年月]/g, '.').replace('日', '');
    const shareText = valueAfter(block, '權\\s*利\\s*範\\s*圍');
    const chineseShare = shareText.match(/(\d+)\s*分\s*之\s*(\d+)/);
    const slashShare = shareText.match(/(\d+)\s*[\/／]\s*(\d+)/);
    const numerator = chineseShare?.[2] || slashShare?.[1] || 1;
    const denominator = chineseShare?.[1] || slashShare?.[2] || 1;
    const registrationSequence = block.match(/登\s*記\s*次\s*序\s*[：:]?\s*(\d{4}(?:-\d{3})?)/)?.[1] || '';
    return { review:registrationNotes(block), sequence, registrationSequence, shareAvailable:Boolean(chineseShare || slashShare), name, id, address, numerator, denominator, date, reason, common: /公\s*同\s*共\s*有/.test(shareText) };
  }).filter(record => record.name || record.id || record.address);
  return records.filter(record => record.name && record.name.length <= 80 && record.name !== '姓名');
}
$('#ocrBtn').addEventListener('click', runOcr);

restoreDraft();
