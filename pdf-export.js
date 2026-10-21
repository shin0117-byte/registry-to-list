(function(root){
'use strict';
const text=v=>String(v??'');
const wrap=v=>text(v).replace(/[A-Za-z0-9]{16,}/g,s=>s.match(/.{1,14}/g).join('\n'));
const layout={hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=>'#9baeb5',vLineColor:()=>'#9baeb5',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>4,paddingBottom:()=>4};
function definition(snapshot){
 const f=snapshot.fields,items=snapshot.rows,area=Number(f.area)||0,model=root.RegistryModel;
 const summary=model.summary(items,area),title=[f.district,f.section,f.parcel].map(text).join('')+'地號清冊';
 const available=841.89-48-64-4.5;
 const percentages=model.ownerColumnPercentages;
 const widths=percentages.map(n=>available*n/100);
 const headers=['次序','姓名','地址','持分','持分坪數','原因發生日期\n（民國）','登記原因','備註／組號'];
 const body=[headers.map((value,index)=>({text:value,fillColor:'#e4efed',alignment:'center',bold:true,...(index===5?{fontSize:9}:{})}))];
 const spans=model.commonCellSpans(items);
 items.forEach((row,index)=>{
  const fraction=model.fraction(row),value=fraction?(area*Number(fraction.numerator)/Number(fraction.denominator)*.3025).toFixed(2):'—';
  const group=row.commonGroupLabel||row.commonGroup;
  const note=text(row.note)+(group&&!text(row.note).includes(group)?'\n公同共有 '+group:'');
  const cells=[String(index+1),wrap(model.ownerName(row.name)||'（姓名待確認）'),wrap(model.address(row.address)||'—'),wrap(fraction?fraction.numerator+'／'+fraction.denominator:'—'),value,model.displayDate(row.date)||'—',model.reason(row.reason),wrap(note)];
  for(const [column,key] of [[3,'share'],[4,'share'],[5,'date'],[6,'reason']]){
   const count=spans[key][index];if(count===0)cells[column]={};else if(count>1)cells[column]={text:cells[column],rowSpan:count};
  }
  body.push(cells);
 });
 const content=[
  {text:title,fontSize:16,bold:true,alignment:'center',margin:[0,0,0,8]},
  {text:'土地總面積：'+text(f.area||'—')+' m²（'+summary.landArea+' 坪）　'+text(f.valuePeriod)+' 公告現值：'+text(f.value||'—')+' 元／m²',margin:[0,0,0,5]},
  {text:'使用分區：'+text(f.zoning||'—')+'　使用地類別：'+text(f.landCategory||'—'),margin:[0,0,0,5]},
  ...(f.building?[{text:'補充資訊：'+text(f.building),margin:[0,0,0,5]}]:[]),
  {text:'依原謄本順序列示；相同組號為同一公同共有關係，共同持分於組別合計只計一次。',fontSize:9,margin:[0,0,0,8]},
  {table:{headerRows:1,widths,body,dontBreakRows:false},layout},
  {text:'共有組別合計',fontSize:13,bold:true,alignment:'center',margin:[0,14,0,6]}
 ];
 if(summary.groups.length){
  const groupWidth=841.89-48-56-4;
  const groupBody=[['組號','清冊次序','主登記次序','筆數','共同持分','合計坪數','核對'].map(t=>({text:t,fillColor:'#e4efed',alignment:'center'})),
   ...summary.groups.map(g=>[g.label,wrap(g.rows.join('、')),wrap(g.registrationSequences.join('、')),g.expectedCount?g.memberCount+'／'+g.expectedCount:String(g.memberCount),wrap(g.numerator+'／'+g.denominator),g.area,g.status])];
  content.push({table:{headerRows:1,widths:[6,17,24,6,19,9,19].map(n=>groupWidth*n/100),body:groupBody,dontBreakRows:false},layout});
 }else content.push({text:'無公同共有組別。'});
 content.push({text:'逐筆持分合計：'+summary.percent+'%　換算 '+summary.area+' 坪（共同持分每組計一次）。',margin:[0,8,0,0]},
  {text:summary.balanced?'持分合計為 100%。':'持分合計或組別關聯尚待核對。',color:summary.balanced?'#176a6c':'#9a4e25',margin:[0,4,0,0]});
 if(summary.managers.length)content.push({text:'管理者資料',fontSize:13,bold:true,alignment:'center',margin:[0,12,0,6]},{table:{headerRows:1,widths:[50,100,170,841.89-48-32-2.5-320],body:[['清冊次序','所有權人','管理者','管理者地址'].map(value=>({text:value,alignment:'center'})),...summary.managers.map(m=>[String(m.row),wrap(m.owner),wrap(m.name),wrap(m.address)])]},layout});
 if(summary.issues.length)content.push({text:'待核對事項',fontSize:13,bold:true,alignment:'center',margin:[0,12,0,6]},{ul:summary.issues.map(wrap),fontSize:10});
 return {pageSize:'A3',pageOrientation:'portrait',pageMargins:[24,28,24,36],defaultStyle:{font:'RegistryCJK',fontSize:10.5,lineHeight:1.2,color:'#17212b'},info:{title,creator:'謄本轉清冊'},content,
  footer:(current,total)=>({text:'第 '+current+'／'+total+' 頁',alignment:'center',fontSize:9,margin:[0,8,0,0]})};
}
let loading;
async function engine(){
 if(!loading)loading=(async()=>{
  if(!root.pdfMake)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/pdfmake.min.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('PDF 程式載入失敗'));};document.head.append(script);});
  const response=await fetch('vendor/NotoSansCJKtc-Regular.otf');if(!response.ok)throw new Error('PDF 中文字型載入失敗');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  root.pdfMake.addVirtualFileSystem({'RegistryCJK.otf':btoa(binary)});root.pdfMake.addFonts({RegistryCJK:{normal:'RegistryCJK.otf',bold:'RegistryCJK.otf',italics:'RegistryCJK.otf',bolditalics:'RegistryCJK.otf'}});
  return root.pdfMake;
 })().catch(error=>{loading=null;throw error;});
 return loading;
}
async function download(snapshot,filename){
 const pdf=await engine(),doc=definition(snapshot);
 const blob=await new Promise((resolve,reject)=>{try{pdf.createPdf(doc).getBlob(resolve);}catch(error){reject(error);}});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
root.RegistryPdf={definition,download};
})(globalThis);
