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
  const checked = validateOwnerIdentity({name,id}); name=checked.name; id=checked.id;
  const issues=[...(metadata.issues || [])];
  if(date && !RegistryModel.date(date))issues.push('原因發生日期無法確認：'+date);
  date=RegistryModel.displayDate(date);reason=RegistryModel.reason(reason);address=RegistryModel.address(address);
  Object.entries({name: formatOwnerName(name, id), id, address, numerator, denominator, date, reason, note}).forEach(([key, value]) => {
    const input = tr.querySelector(`[data-key="${key}"]`); if (value !== undefined) input.value = value;
  });
  tr.dataset.commonGroup = metadata.commonGroup || '';
  tr.dataset.sequence = metadata.sequence || '';
  tr.dataset.relatedShareTypes = (metadata.relatedShareTypes || []).join(',');
  for(const key of ['registrationSequence','documentKey','sourceOrder','sourceRecordCount','commonGroupLabel','manager','managerAddress'])tr.dataset[key]=String(metadata[key] || '');
  tr.dataset.addressExplicitBlank=metadata.addressExplicitBlank?'true':'';
  tr.dataset.commonRefs=JSON.stringify(metadata.commonRefs || []);tr.dataset.issues=JSON.stringify(issues);tr.dataset.groupVerified=metadata.groupVerified?'true':'';
  tr.dataset.ocrImported = metadata.ocrImported ? 'true' : '';
  const groupField = document.createElement('input');
  groupField.className = 'common-group-input';
  groupField.placeholder = '公同共有組別（同組填相同）';
  groupField.title = '依原謄本主登記次序關聯；同組持分另列一次合計。';
  groupField.value = metadata.commonGroupLabel || metadata.commonGroup || '';
  groupField.readOnly=Boolean(metadata.commonRefs?.length);
  groupField.setAttribute('aria-label', '公同共有組別');
  groupField.addEventListener('input', () => { tr.dataset.commonGroup = groupField.value.trim();tr.dataset.commonGroupLabel=groupField.value.trim(); });
  tr.querySelector('[data-key="note"]').parentElement.append(groupField);
  tr.addEventListener('input', updateRow);
  tr.addEventListener('focusin',event=>{
    if(['date','reason'].includes(event.target.dataset?.key))delete event.target._mergedTargets;
  });
  tr.addEventListener('focusout',event=>{delete event.target._mergedTargets;});
  tr.addEventListener('change',event=>{
    if(event.target.dataset?.key==='date'){
      const value=RegistryModel.displayDate(event.target.value);
      if(value){for(const member of event.target._mergedTargets||[tr])member.querySelector('[data-key="date"]').value=value;autoGrowField(event.target);updateAll();}
    }
  });

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
  const key=event.target.dataset?.key,cell=event.target.closest('td');
  // Editing a merged date/reason edits precisely the rows represented by that cell.
  const current=[...rows.children],start=current.indexOf(event.currentTarget);
  const targets=['date','reason'].includes(key)?(event.target._mergedTargets ||= current.slice(start,start+Number(cell?.dataset.mergeCount||1))):[];
  if(['date','reason'].includes(key))for(const member of targets){
    member.querySelector('[data-key="'+key+'"]').value=event.target.value;
    if(key==='date'&&RegistryModel.date(event.target.value))member.dataset.issues=JSON.stringify(JSON.parse(member.dataset.issues||'[]').filter(x=>!x.startsWith('原因發生日期')));
  }
  autoGrowField(event.target);
  const sharedKey = event.target.dataset?.key;
  const group = event.currentTarget.dataset.commonGroup;
  if (group && ['numerator','denominator'].includes(sharedKey)) {
    for (const member of rows.children) if (member.dataset.commonGroup === group && member.dataset.documentKey === event.currentTarget.dataset.documentKey) {
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
    const fraction=validShare({numerator:tr.querySelector('[data-key="numerator"]').value,denominator:tr.querySelector('[data-key="denominator"]').value});
    tr.querySelector('.share-area').textContent = fraction ? (area * Number(fraction.numerator) / Number(fraction.denominator) * .3025).toFixed(2) : '—';
    tr.querySelector('.gender').textContent = genderFromId(tr.querySelector('[data-key="id"]').value);
  });
  mergeCommonCells();
  const summary=RegistryModel.summary(getData(),area);
  $('#totalArea').textContent = summary.area;
  $('#totalRatio').textContent = '持分合計 '+summary.percent+'%　土地總面積 '+summary.landArea+' 坪'+(summary.complete?'':'（有未確認資料）');
  renderRegistrySummary(summary);
}
function toast(text) { const t=$('#toast'); t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function setProgress(_percent, label) { $('#ocrEngineStatus').textContent = 'OCR：' + label; }
function setOcrEngine(name) { state.ocrEngine = name; }
function getData() {
  return [...rows.children].map(tr => ({
    ...Object.fromEntries(['name','id','address','numerator','denominator','date','reason','note'].map(key => [key, tr.querySelector('[data-key="' + key + '"]').value])),
    commonGroup:tr.dataset.commonGroup || '', sequence:tr.dataset.sequence || '', relatedShareTypes:tr.dataset.relatedShareTypes ? tr.dataset.relatedShareTypes.split(',') : [],
    ...Object.fromEntries(['registrationSequence','documentKey','sourceOrder','sourceRecordCount','commonGroupLabel','manager','managerAddress'].map(key=>[key,tr.dataset[key] || ''])),
    addressExplicitBlank:tr.dataset.addressExplicitBlank==='true',
    commonRefs:JSON.parse(tr.dataset.commonRefs || '[]'),issues:JSON.parse(tr.dataset.issues || '[]'),groupVerified:tr.dataset.groupVerified==='true',
    ocrImported:tr.dataset.ocrImported === 'true'
  }));
}
function commonSpans(items) { return RegistryModel.commonCellSpans(items).share; }
function mergeCommonCells() {
 const list=[...rows.children],spans=RegistryModel.commonCellSpans(getData());
 for(const [index,key] of [[4,'share'],[5,'share'],[6,'share'],[7,'share'],[8,'date'],[9,'reason']]){
  list.forEach((tr,i)=>{
   const cell=tr.children[index],count=spans[key][i];cell.rowSpan=Math.max(1,count);cell.style.display=count===0?'none':'';
   cell.dataset.mergeCount=Math.max(1,count);cell.classList.toggle('common-share',Boolean(tr.dataset.commonGroup));
  });
 }
}
function buildExportRows(items,area) {
 const spans=RegistryModel.commonCellSpans(items);
 return items.map((row,index)=>{
  const f=validShare(row),value=f?(area*Number(f.numerator)/Number(f.denominator)*.3025).toFixed(2):'—';
  const group=row.commonGroupLabel||row.commonGroup,note=(row.note||'')+(group&&!(row.note||'').includes(group)?'\n公同共有 '+group:'');
  return '<tr>'+[index+1,RegistryModel.ownerName(row.name)||'（姓名待確認）',row.address||'—',f?f.numerator+'／'+f.denominator:'—',value,RegistryModel.displayDate(row.date),RegistryModel.reason(row.reason),note].map((value,column)=>{
   const key=({3:'share',4:'share',5:'date',6:'reason'})[column],count=key?spans[key][index]:1;
   return count===0?'':'<td'+(count>1?' rowspan="'+count+'"':'')+(column===5?' class="date-cell"':'')+'>'+escapeXml(value)+'</td>';
  }).join('')+'</tr>';
 }).join('');
}
function summaryHtml(summary) {
 const header='<tr><th>組號</th><th>清冊次序</th><th>主登記次序</th><th>筆數</th><th>共同持分</th><th>合計坪數</th><th>核對</th></tr>';
 return '<p>共 '+summary.recordCount+' 筆；持分合計 '+summary.percent+'%，換算 '+summary.area+' 坪。土地總面積 '+summary.landArea+' 坪。</p>'+
  (summary.groups.length?'<table class="group-table"><thead>'+header+'</thead><tbody>'+summary.groups.map(g=>'<tr>'+[g.label,g.rows.join('、'),g.registrationSequences.join('、'),g.expectedCount?g.memberCount+'／'+g.expectedCount:g.memberCount,g.numerator+'／'+g.denominator,g.area,g.status].map(v=>'<td>'+escapeXml(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>無公同共有組別。</p>')+
  (summary.managers.length?'<h3>管理者資料</h3><table class="group-table"><thead><tr><th>清冊次序</th><th>所有權人</th><th>管理者</th><th>管理者地址</th></tr></thead><tbody>'+summary.managers.map(m=>'<tr>'+[m.row,m.owner,m.name,m.address].map(v=>'<td>'+escapeXml(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'')+
  (summary.issues.length?'<details open><summary>待核對 '+summary.issues.length+' 項</summary><ul>'+summary.issues.map(issue=>'<li>'+escapeXml(issue)+'</li>').join('')+'</ul></details>':'');
}
function renderRegistrySummary(summary) { const node=$('#registrySummary');if(node)node.innerHTML=summaryHtml(summary); }
function printableHtml() {
 const title=[$('#district').value,$('#section').value,$('#parcel').value].join('')+'地號清冊',items=getData(),area=Number($('#area').value)||0;
 const headers=['次序','姓名','地址','持分','持分坪數','原因發生日期<br>（民國）','登記原因','備註／組號'];
 return '<h1>'+escapeXml(title)+'</h1><p>土地總面積：'+area+' m²（'+(area*.3025).toFixed(2)+' 坪）　'+escapeXml(landValueLabel())+escapeXml($('#value').value)+' 元／m²</p><p>依原謄本排序；相同組號為同一公同共有關係，持分另列組別合計。</p><table class="print-owner-table"><colgroup>'+RegistryModel.ownerColumnPercentages.map(n=>'<col style="width:'+n+'%">').join('')+'</colgroup><thead><tr>'+headers.map((x,i)=>'<th'+(i===5?' class="date-heading"':'')+'>'+x+'</th>').join('')+'</tr></thead><tbody>'+buildExportRows(items,area)+'</tbody></table><h2>共有組別合計與核對</h2>'+summaryHtml(RegistryModel.summary(items,area));
}
function preparePrintView() {
 document.querySelector('#registryPrintSheet')?.remove();
 const sheet=document.createElement('section');sheet.id='registryPrintSheet';sheet.innerHTML=printableHtml();document.body.append(sheet);
}
if(typeof window!=='undefined') {
 window.addEventListener?.('beforeprint',preparePrintView);
 window.addEventListener?.('afterprint',()=>document.querySelector('#registryPrintSheet')?.remove());
}
function saveDraft() { localStorage.setItem('registry-draft', JSON.stringify({fields:Object.fromEntries(['district','section','parcel','area','value','valuePeriod','zoning','landCategory','building'].map(k=>[k,$('#'+k).value])), rows:getData()})); toast('草稿已儲存於本機瀏覽器'); }
function restoreDraft() { try { const d=JSON.parse(localStorage.getItem('registry-draft')); if (!d) return; Object.entries(d.fields).forEach(([k,v])=>$('#'+k).value=v); d.rows.forEach(r=>addRow([r.name,r.id || '',r.address,r.numerator,r.denominator,r.date,r.reason,r.note],r)); } catch {} }
function escapeXml(value='') { return String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }
function exportExcel() {
 const title=`${$('#district').value}${$('#section').value}${$('#parcel').value}地號清冊`,items=getData(),area=Number($('#area').value)||0;
 const summary=RegistryModel.summary(items,area),headers=['次序','姓名','地址','持分','持分坪數','原因發生日期<br>（民國）','登記原因','備註／組號'];
 const options='<xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>清冊</x:Name><x:WorksheetOptions><x:PageSetup><x:Layout x:Orientation="Portrait"/></x:PageSetup><x:FitToPage/><x:Print><x:PaperSizeIndex>8</x:PaperSizeIndex><x:FitWidth>1</x:FitWidth><x:FitHeight>0</x:FitHeight></x:Print></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>';
 const html='<!doctype html><html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]>'+options+'<![endif]--><style>@page{size:A3 portrait;margin:10mm}body{font-family:"Microsoft JhengHei";font-size:10pt}table{border-collapse:collapse;table-layout:fixed;width:100%}td,th{border:1px solid #999;padding:5px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;word-wrap:break-word}th{background:#e4efed}h1{font-size:16pt}thead{display:table-header-group}.date-heading{font-size:8pt}.date-cell{white-space:nowrap;font-variant-numeric:tabular-nums;mso-number-format:"\\@"}</style></head><body><h1>'+escapeXml(title)+'</h1><p>土地總面積：'+area+' m²（'+summary.landArea+' 坪）　'+escapeXml(landValueLabel())+escapeXml($('#value').value)+' 元／m²</p><p>依原謄本排序；同組共同持分另列合計，每組計一次。</p><table><colgroup>'+RegistryModel.ownerColumnPercentages.map(n=>'<col style="width:'+n+'%">').join('')+'</colgroup><thead><tr>'+headers.map((x,i)=>'<th'+(i===5?' class="date-heading"':'')+'>'+x+'</th>').join('')+'</tr></thead><tbody>'+buildExportRows(items,area)+'</tbody></table><h2>共有組別合計與核對</h2>'+summaryHtml(summary)+'</body></html>';
 const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=title+'.xls';link.click();URL.revokeObjectURL(link.href);toast('已匯出 A3 直式 Excel 相容清冊');
}
async function exportPdf() {
  const button=$('#printBtn');button.disabled=true;const label=button.textContent;button.textContent='正在產生 PDF…';
  try{
    const snapshot=captureSnapshot();
    const title=[snapshot.fields.district,snapshot.fields.section,snapshot.fields.parcel].join('')+'地號清冊';
    await RegistryPdf.download(snapshot,title.replace(/[\\/:*?"<>|]/g,'_')+'.pdf');
    toast('PDF 檔已產生，請查看瀏覽器下載項目');
  }catch(error){toast('PDF 產生失敗：'+error.message);}
  finally{button.disabled=false;button.textContent=label;}
}
function captureSnapshot() {
  const fields=['district','section','parcel','area','value','valuePeriod','zoning','landCategory','building'];
  return {fields:Object.fromEntries(fields.map(k=>[k,$('#'+k).value])),rows:getData()};
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

    const source = await collectSourceContent(state.files, mode, (current, total) => { setProgress((current / total) * 20, `正在分析第 ${current}/${total} 頁`); });
    setOcrEngine('PDF 文字讀取');
    const ocrImages = source.images.filter(job => needsOcrForDocument(source.pages, job.pageKey));
    let ocrText = ''; const addressTexts = []; let pageResults = [];
    if (ocrImages.length) {
      setProgress(0, '正在驗證使用碼'); await validateOcrAccess();
      setOcrEngine('Google Cloud Vision');
      if ($('#fadeWatermark').checked) await prepareWatermarkImages(ocrImages, setProgress);
      const result = await runGoogleOcr(ocrImages, setProgress);
      ocrText = result.ocrText; addressTexts.push(...result.addressTexts); pageResults = result.pageResults || [];
    }
    const ownerText = chooseExtractionText(mode, source.directText, ocrText);
    setProgress(96, '正在整理土地與權利人資料'); await applyExtractedData(ownerText, ownerText, addressTexts, mode === 'auto' ? reconcileDocumentPages(source.pages, pageResults) : null, mode === 'auto' ? reconcileLandFields(source.directText, ocrText) : null); setProgress(100, '完成'); if(ocrImages.length) window.prepaid?.finish();
  } catch (error) { setProgress(0, '未完成：' + error.message); toast(`OCR 無法啟動：${error.message || '請重新整理後再試一次。'}`); }
  finally { button.disabled = false; button.textContent = '讀取並自動帶入'; }
}
function chooseExtractionText(mode, directText, ocrText) { return cleanTranscriptText(mode === 'ocr' || !directText.trim() ? ocrText : directText); }
function needsOcrForDocument(pages, pageKey) {
  const page = pages.find(item => item.pageKey === pageKey);
  if (!page || !page.directText.trim()) return true;
  const text = pages.filter(item => item.fileKey === page.fileKey).map(item => item.directText).join('\n');
  const land = extractLandFields(text), owners = parsedOwners(text);
  return ![land.district,land.section,land.parcel,land.area].every(Boolean) ||
    !owners.length || owners.some(owner => ![owner.name,owner.id,owner.address,owner.date,owner.reason].every(Boolean) || !validShare(owner));
}
function blobToBase64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); }); }
async function collectSourceContent(files, mode, progress, loadPdf = () => import('./vendor/pdf.mjs')) {
  const images = [], pages = [], pendingPdfPages = []; let directText = '';
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
      const pageText = cleanTranscriptText(rebuildPdfLines(textContent.items));
      const pageKey = 'pdf-' + fileIndex + '-' + pageIndex;
      pages.push({pageKey,fileKey:'pdf-' + fileIndex,directText:pageText});
      directText += '\n' + pageText;
      if (mode !== 'direct') pendingPdfPages.push({page,pageKey});
    }
  }
  // Render only documents whose text layer cannot supply all required fields.
  for (const {page,pageKey} of pendingPdfPages) {
    if (!needsOcrForDocument(pages,pageKey)) continue;
    const viewport = page.getViewport({scale:3});
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('頁面影像產生失敗，請重新讀取。');
    images.push({kind:'page',blob,pageKey});
    canvas.width=0;canvas.height=0;
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
function cleanTranscriptText(text) { return RegistryModel.clean(text); }
function parsedOwners(text) {
  const section = isolateOwnershipSection(cleanTranscriptText(text));
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
    const sourceOwners=parsedOwners(direct);
    owners.push(...reconcileOwners(sourceOwners,parsedOwners(ocr)).map(owner => ({
      ...owner, sequence:fileKey + ':' + (owner.registrationSequence || owner.sequence || ''),
      documentKey:fileKey,sourceRecordCount:sourceOwners.length
    })));
  }
  return owners;
}
const BUSINESS_NOTE = /假扣押|假處分|查封|扣押|禁止處分|限制登記|限制事項|債權人|債務人|未辦繼承|列冊管理|列冊|國產署|國有財產署|標售|公同共有/;
function isBusinessNote(value) { return BUSINESS_NOTE.test(value) && !/不一致|採用OCR|請校對|影像補入|未辨識|地址辨識|謄本未載/.test(value); }
function businessNoteClauses(text) {
 const cleaned=RegistryModel.clean(text).replace(/[（(]\s*空\s*白\s*[）)]/g,'').replace(/\b(?:[A-Z]\s?[A-Z0-9]|[0-9]\s?[A-Z])\b/g,'').replace(/\n\s*/g,'').trim();
 return cleaned.split(/(?=[（(](?:限制登記事項|一般註記事項)[）)])/).map(value=>value.replace(/^(?:其他登記事項|備註)\s*[：:]\s*/,'').replace(/[；;]+$/,'').trim()).filter(value=>value&&isBusinessNote(value));
}
function otherRightsNotes(text) {
  const source=cleanTranscriptText(text);
  const start=source.search(/土\s*地\s*他\s*項\s*權\s*利\s*部/);
  return start<0 ? [] : [...new Set(businessNoteClauses(source.slice(start)))];
}
function registrationNotes(text, landOnly=false) {
  let source=cleanTranscriptText(text);
  if (landOnly) {
    const marker=/土\s*地\s*標\s*示\s*部/.exec(source);
    if (!marker) return [];
    source=source.slice(marker.index+marker[0].length).split(/土\s*地\s*(?:所\s*有\s*權|他\s*項\s*權\s*利)\s*部/)[0];
  }
  const pattern=/其\s*他\s*登\s*記\s*事\s*項\s*[：:]\s*([\s\S]*?)(?=其\s*他\s*登\s*記\s*事\s*項|土\s*地\s*(?:所\s*有\s*權|他\s*項\s*權\s*利|標\s*示)\s*部|[（(]\s*\d{4}\s*[）)]\s*登\s*記\s*次\s*序|登\s*記\s*次\s*序|$)/g;
  const registration=[...source.matchAll(pattern)].flatMap(match => businessNoteClauses(match[1]));
  const labelled=[...source.matchAll(/備\s*註\s*[：:]\s*([^\n]+)/g)].flatMap(match => businessNoteClauses(match[1]));
  const standalone=source.split('\n').filter(line => /^\s*(?:未辦繼承|列冊管理|移送國產署|國有財產署|假扣押|假處分|查封|扣押|禁止處分)/.test(line)).flatMap(businessNoteClauses);
  return [...new Set([...registration,...labelled,...standalone])];
}
function reconcileLandFields(directText, ocrText) {
  const direct=cleanTranscriptText(directText), scanned=cleanTranscriptText(ocrText);
  const fields=extractLandFields(direct), fallback=extractLandFields(scanned);
  for (const key of ['district','section','parcel','area','value','valuePeriod','zoning','landCategory']) {
    if (!fields[key] && fallback[key] && !/[�□]/.test(fallback[key])) fields[key]=fallback[key];
  }
  const directNotes=[...registrationNotes(direct,true),...otherRightsNotes(direct)];
  const review=[...new Set(directNotes.length ? directNotes : [...registrationNotes(scanned,true),...otherRightsNotes(scanned)])];
  return {fields,review};
}
function validateOwnerIdentity(owner) {
  let name=RegistryModel.ownerName(owner.name),id=String(owner.id || '').replace(/\s/g,'');
  if (id && id.length!==10) id='';
  if (/[0-9０-９]+$/.test(name)) name=name.replace(/[0-9０-９]+$/,'').trim();
  return {...owner,name,id,review:[...(owner.review || [])]};
}
function validShare(owner) { return RegistryModel.fraction(owner); }
function ownerIdentity(owner) {
  const id=String(owner.id || '').toUpperCase();
  const name=String(owner.name || '').replace(/\s/g,'').replace(/台/g,'臺');
  if (/^[A-Z][12]\d{8}$/.test(id)) return 'id:'+id;
  if (/^[A-Z][12][A-Z0-9*＊]{8}$/.test(id)) return 'masked:'+id+':'+name;
  return 'name:'+name;
}
function reconcileOwners(directOwners,ocrOwners) {
  const merged=RegistryModel.reconcile(directOwners.map(validateOwnerIdentity),ocrOwners.map(validateOwnerIdentity));
  for(const owner of merged) owner.relatedShareTypes=[...new Set(merged.filter(other=>ownerIdentity(other)===ownerIdentity(owner)).map(other=>other.common?'公同共有':'一般持分'))];
  return merged;
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
  const cleanLand = cleanTranscriptText(landText).replace(/\s+/g, ' ').trim();
  const fields = reconciledLand ? reconciledLand.fields : extractLandFields(cleanLand); let filled = 0;
  if (!reconciledLand) reconciledLand = {review:[...registrationNotes(landText,true),...otherRightsNotes(landText)]};
  const globalNotes = reconciledLand.review || [];
  const mappedDistrict = await lookupDistrict(fields.section);
  if (mappedDistrict && (!fields.district || mappedDistrict.endsWith(fields.district))) fields.district = mappedDistrict;
  for (const [id, value] of Object.entries(fields)) if (value && (!$('#' + id).value.trim() || (id === 'district' && mappedDistrict))) { $('#' + id).value = value; filled += 1; }
  const ownershipSection = isolateOwnershipSection(cleanTranscriptText(ownerText));
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
  const ownerKey = owner => owner.sequence || [owner.name,owner.id,owner.numerator,owner.denominator,owner.commonGroup].join('|');
  const existing = new Set([...rows.children].map(tr => ownerKey({sequence:tr.dataset.sequence,name:tr.querySelector('[data-key="name"]').value,id:tr.querySelector('[data-key="id"]').value,numerator:tr.querySelector('[data-key="numerator"]').value,denominator:tr.querySelector('[data-key="denominator"]').value,commonGroup:tr.dataset.commonGroup})));
  const newOwners = owners.filter(owner => { const key=ownerKey(owner); if (existing.has(key)) return false; existing.add(key); return true; });
  newOwners.forEach(owner => {
    const commonNote=owner.common ? '公同共有' + (owner.commonGroupLabel ? '（'+owner.commonGroupLabel+'）' : '') : '';
    const note=[...new Set([...globalNotes,...(owner.review || []),commonNote].filter(value=>value && isBusinessNote(value)))].join('；');
    addRow([owner.name,owner.id,owner.address,owner.numerator,owner.denominator,owner.date,owner.reason,note],
      {...owner,relatedShareTypes:owner.relatedShareTypes || [],ocrImported:true});
  });
  updateAll();
  toast(`讀取完成：土地資料帶入 ${filled} 項，新增權利人 ${newOwners.length} 筆。`);
}
function extractLandFields(text) {
  text=cleanTranscriptText(text);
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
  original=cleanTranscriptText(original);
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
    const parsed=share ? validShare({numerator:share[1],denominator:share[2]}) : null;
    results.push({ name: label?.[1] || named?.[1] || '', id:'', address: after, numerator:parsed?.numerator || '', denominator:parsed?.denominator || '', shareAvailable:!!parsed, date, reason });
  }
  if (!results.length) {
    const loose = clean.match(new RegExp(`${cities}.{4,80}`, 'g')) || [];
    loose.forEach(address => results.push({ name:'', id:'', address:address.trim(), numerator:'', denominator:'', shareAvailable:false, date:'', reason:'' }));
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
  let text = RegistryModel.address(raw);
  if (!text) return '';
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
function groupCommonOwnership(owners) { return RegistryModel.groupOwners(owners); }
function extractLabelledOwners(text) { return RegistryModel.parseOwners(text,registrationNotes); }
$('#ocrBtn').addEventListener('click', runOcr);

restoreDraft();
updateAll();
