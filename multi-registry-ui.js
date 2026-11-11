(function(root){
'use strict';
let api;
const el=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function project(){return api.project();}
function changeView(view){const p=project();p.view=view;api.set(p);render();api.save();}
function activate(key){const p=project(),land=p.lands.find(item=>item.key===key);if(!land)return;p.activeKey=key;p.view='single';api.set(p);api.load(land.snapshot);api.save();}
function addLand(){
 const p=project(),current=p.lands.find(land=>land.key===p.activeKey);
 if(current&&!root.RegistryMulti.hasData(current.snapshot)){changeView('single');api.message('請先填寫目前土地的地號，或加入謄本。');return;}
 const land={key:'draft-'+Date.now(),snapshot:{schemaVersion:2,fields:{},rows:[],otherRights:[],sourceFiles:[]}};
 p.lands.push(land);p.activeKey=land.key;p.view='single';api.set(p);api.load(land.snapshot);api.save();el('district')?.focus();
}
function addSnapshots(snapshots){
 const valid=snapshots.filter(root.RegistryMulti.hasData);if(!valid.length)throw new Error('這份清冊尚無土地資料');
 const p=root.RegistryMulti.upsert(project(),valid);p.view='multi';api.set(p);render();api.save();api.message('已加入多筆土地總表，不會重新辨識或扣點');
}
function removeLand(key){
 const p=project();if(!confirm('從這份多筆清冊移除此土地？最近掃描紀錄仍會保留。'))return;
 p.lands=p.lands.filter(item=>item.key!==key);
 if(p.activeKey===key){p.activeKey=p.lands[0]?.key||'';api.set(p);api.load(p.lands[0]?.snapshot||{fields:{},rows:[],otherRights:[],sourceFiles:[]});}
 else api.set(p);
 render();api.save();
}
async function exportProject(format,button){
 const p=project();if(!p.lands.some(land=>root.RegistryMulti.hasData(land.snapshot))){api.message('請先加入土地清冊');return;}
 if(p.lands.some(land=>root.RegistryModel.legacyDraft(land.snapshot))){api.message('其中一筆舊清冊缺少登記關聯，請先切換到該土地並重新讀取原謄本');return;}
 const clean={...p,lands:p.lands.filter(land=>root.RegistryMulti.hasData(land.snapshot))};
 const old=button?.textContent;if(button){button.disabled=true;button.textContent='正在產生檔案…';}
 try{const filename=root.RegistryMulti.projectTitle(clean).replace(/[\\/:*?"<>|]/g,'_')+'.'+(format==='pdf'?'pdf':'xlsx');await (format==='pdf'?root.RegistryPdf:root.RegistryExcel).downloadProject(clean,filename);api.message('已匯出多筆總表及各土地明細');}
 catch(error){api.message('匯出失敗：'+error.message);}
 finally{if(button){button.disabled=false;button.textContent=old;}render();}
}
function render(){
 if(!api||!el('singleModeBtn'))return;
 const p=project(),multi=p.view==='multi',report=root.RegistryMulti.blocks(p);
 el('singleModeBtn').setAttribute('aria-selected',String(!multi));el('multiModeBtn').setAttribute('aria-selected',String(multi));
 el('singleRegistryView').hidden=multi;el('multiRegistryView').hidden=!multi;
 el('landTabs').replaceChildren();
 p.lands.forEach((land,index)=>{const b=document.createElement('button');b.type='button';b.className='land-tab';b.textContent=(index+1)+'. '+root.RegistryMulti.label(land.snapshot.fields);b.setAttribute('aria-pressed',String(land.key===p.activeKey&&!multi));b.onclick=()=>activate(land.key);el('landTabs').append(b);});
 el('projectLandCount').textContent=p.lands.length+' 筆土地';
 el('multiSummary').textContent=p.lands.length?'共 '+p.lands.length+' 筆土地、'+report.people.length+' 列姓名彙整'+(report.unnamed?'；'+report.unnamed+' 列姓名待補。':'。'):'加入多筆謄本，或從最近掃描紀錄加入已完成的清冊。';
 el('multiDemoBtn').hidden=p.lands.length>0;
 el('multiMatrix').innerHTML=report.blocks.map((block,index)=>'<div class="matrix-block"><h3>全部地號對照</h3><div class="table-wrap"><table class="matrix-table"><colgroup>'+block.widths.map(n=>'<col style="width:'+n+'%">').join('')+'</colgroup><thead><tr>'+block.headers.map(h=>'<th>'+escape(h).replace(/\n/g,'<br>')+'</th>').join('')+'</tr></thead><tbody>'+block.rows.map(row=>'<tr>'+row.map((value,col)=>'<td'+(col>=3?' class="matrix-number"':'')+'>'+escape(value).replace(/\n/g,'<br>')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></div>').join('');
 el('multiLandCards').replaceChildren();
 p.lands.forEach(land=>{const card=document.createElement('article');card.className='land-card';const title=document.createElement('h3'),info=document.createElement('p'),actions=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');title.textContent=root.RegistryMulti.label(land.snapshot.fields);info.textContent=(land.snapshot.rows||[]).length+' 筆登記｜'+(land.snapshot.fields.area||'—')+' m²';open.textContent='查看／編輯此土地';open.onclick=()=>activate(land.key);remove.textContent='移出總表';remove.className='text-btn';remove.onclick=()=>removeLand(land.key);actions.append(open,remove);card.append(title,info,actions);el('multiLandCards').append(card);});
 const print=el('printBtn');if(print&&!print.disabled)print.textContent=multi?'匯出多筆 A3 PDF':'匯出 A3 直式 PDF';
}
function init(config){
 api=config;if(!el('singleModeBtn'))return;
 el('singleModeBtn').onclick=()=>changeView('single');el('multiModeBtn').onclick=()=>changeView('multi');el('addLandBtn').onclick=addLand;
 el('exportMultiPdfBtn').onclick=()=>exportProject('pdf',el('exportMultiPdfBtn'));el('exportMultiExcelBtn').onclick=()=>exportProject('xlsx',el('exportMultiExcelBtn'));
 el('multiNotice').textContent=root.RegistryMulti.notice;
 el('multiDemoBtn').onclick=()=>{
  const rows=[{name:'王先生',id:'A123456789',address:'測試縣測試鄉示範路1號',numerator:'1',denominator:'2',date:'115.01.01',reason:'買賣',note:''},{name:'林小姐',id:'B223456789',address:'測試縣測試鄉示範路2號',numerator:'1',denominator:'2',date:'115.01.01',reason:'買賣',note:''}];
  const snapshots=[1,2].map((n)=>({schemaVersion:2,fields:{district:'範例縣範例鄉',section:'示範段',parcel:'000'+n+'-0000',area:String(n*100)},rows:JSON.parse(JSON.stringify(rows)),otherRights:[],sourceFiles:['範例資料']}));
  const p=root.RegistryMulti.upsert(project(),snapshots);p.view='multi';p.activeKey=p.lands[0].key;api.set(p);api.load(p.lands[0].snapshot);api.save();render();
 };
}
root.RegistryMultiUI={init,render,activate,addSnapshots,exportProject};
})(globalThis);
