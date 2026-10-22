(function(root){
'use strict';
const text=v=>String(v??'');
const headers=['次序','姓名','地址','持分','持分坪數','原因發生日期\n（民國）','登記原因','備註／組號'];
const border={top:{style:'thin',color:{argb:'FF9BAEB5'}},left:{style:'thin',color:{argb:'FF9BAEB5'}},bottom:{style:'thin',color:{argb:'FF9BAEB5'}},right:{style:'thin',color:{argb:'FF9BAEB5'}}};
function lines(value,width){return text(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((sum,c)=>sum+(/[\u3400-\u9fff\uff00-\uffef]/.test(c)?2:1),0)/Math.max(1,width-1))),0);}
function build(snapshot,Excel){
 const model=root.RegistryModel,fields=snapshot.fields,items=snapshot.rows,area=Number(fields.area)||0,summary=model.summary(items,area);
 const book=new Excel.Workbook();book.creator='謄本轉清冊';book.title=[fields.district,fields.section,fields.parcel].map(text).join('')+'地號清冊';
 const sheet=book.addWorksheet('清冊',{views:[{showGridLines:false,state:'frozen',ySplit:6}],pageSetup:{paperSize:8,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.39,right:.39,top:.39,bottom:.39,header:.15,footer:.2},printTitlesRow:'6:6'}});
 sheet.headerFooter.oddFooter='&C第 &P／&N 頁';
 // Keep serial, owner name and share compact; give the released space to addresses and notes.
 const widths=[3.5,7,29.5,11,8,8,8,25].map(n=>147*n/100);sheet.columns=widths.map(width=>({width}));
 function style(row,head=false){
  row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Microsoft JhengHei',size:10.5,bold:head};cell.alignment={vertical:'top',wrapText:true,...(head?{horizontal:'center'}:{})};cell.border=border;if(head)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE4EFED'}};});
 }
 function mergedLine(value,size=10.5,center=false){
  const row=sheet.addRow([text(value)]);sheet.mergeCells(row.number,1,row.number,8);
  row.getCell(1).font={name:'Microsoft JhengHei',size,bold:size>=13};row.getCell(1).alignment={horizontal:center?'center':'left',vertical:'middle',wrapText:true};
  row.height=Math.min(409,Math.max(size>=13?28:23,lines(value,147)*(size+4)+6));return row;
 }
 mergedLine(book.title,16,true);
 mergedLine('土地總面積：'+text(fields.area||'—')+' m²（'+summary.landArea+' 坪）　'+text(fields.valuePeriod)+' 公告現值：'+text(fields.value||'—')+' 元／m²');
 mergedLine('使用分區：'+text(fields.zoning||'—')+'　使用地類別：'+text(fields.landCategory||'—'));
 mergedLine(fields.building?'補充資訊：'+text(fields.building):'依原謄本順序列示；相同組號為同一公同共有關係，共同持分每組計一次。');
 sheet.addRow([]).height=8;
 const head=sheet.addRow(headers);style(head,true);head.height=34;head.getCell(6).font={name:'Microsoft JhengHei',size:9,bold:true};
 const spans=model.commonCellSpans(items),first=7;
 items.forEach((item,index)=>{
  const fraction=model.fraction(item),share=fraction?fraction.numerator+'／'+fraction.denominator:'—';
  const amount=fraction?Number((area*Number(fraction.numerator)/Number(fraction.denominator)*.3025).toFixed(2)):'—';
  const group=item.commonGroupLabel||item.commonGroup,note=text(item.note)+(group&&!text(item.note).includes(group)?'\n公同共有 '+group:'');
  const values=[index+1,model.ownerName(item.name)||'（姓名待確認）',model.address(item.address)||'—',share,amount,model.displayDate(item.date),model.reason(item.reason),note];
  const row=sheet.addRow(values.map(value=>value===''?null:value));style(row);
  row.height=Math.min(409,Math.max(27,...values.map((value,col)=>lines(value,widths[col])*15+8)));
  for(const col of [2,3,4,6,7,8])row.getCell(col).numFmt='@';row.getCell(1).numFmt='0';row.getCell(5).numFmt='#,##0.00';
  for(const col of [1,4,5,6,7])row.getCell(col).alignment={vertical:'middle',horizontal:[4,5].includes(col)?'right':'center',wrapText:col!==6};
 });
 for(const [col,key] of [[4,'share'],[5,'share'],[6,'date'],[7,'reason']])spans[key].forEach((count,index)=>{if(count>1)sheet.mergeCells(first+index,col,first+index+count-1,col);});
 if((snapshot.otherRights||[]).length){
  sheet.addRow([]).height=10;mergedLine('他項權利明細',13,true);
  const mapping=[[1,2],[3,3],[4,4],[5,6],[7,7],[8,8]];
  const entries=[model.otherRightHeaders,...snapshot.otherRights.map(model.otherRightValues)];
  entries.forEach((values,index)=>{
   const row=sheet.addRow(Array(8).fill(null));style(row,index===0);let height=32;
   values.forEach((value,column)=>{
    const shown=index&&column===3?value.replace(/^(.+?)(\d[\d,.]*元)$/,'$1\n$2'):index&&column===4?value.replace(/至/,'\n至'):value;
    const [a,b]=mapping[column],cell=row.getCell(a);cell.value=shown;cell.numFmt='@';
    cell.alignment={vertical:'top',wrapText:true,horizontal:index===0?'center':([2,3].includes(column)?'right':'left')};
    if(a!==b)sheet.mergeCells(row.number,a,row.number,b);
    height=Math.max(height,lines(shown,widths.slice(a-1,b).reduce((sum,width)=>sum+width,0))*15+8);
   });row.height=Math.min(409,height);
  });
 }
 sheet.addRow([]).height=10;mergedLine('共有組別合計',13,true);
 if(summary.groups.length){
  const row=sheet.addRow(['組號','清冊次序','主登記次序','筆數','共同持分','合計坪數','核對','']);style(row,true);sheet.mergeCells(row.number,7,row.number,8);row.height=32;
  for(const group of summary.groups){
   const values=[group.label,group.rows.join('、 '),group.registrationSequences.join('、 '),group.expectedCount?group.memberCount+'／'+group.expectedCount:group.memberCount,group.numerator+'／'+group.denominator,group.area==='—'?'—':Number(group.area),group.status,''];
   const r=sheet.addRow(values);style(r);sheet.mergeCells(r.number,7,r.number,8);r.getCell(6).numFmt='#,##0.00';
   for(const col of [5,6])r.getCell(col).alignment={vertical:'top',horizontal:'right',wrapText:true};
   r.height=Math.min(409,Math.max(30,...values.slice(0,7).map((v,i)=>lines(v,i===6?widths[6]+widths[7]:widths[i])*15+8)));
  }
 }else mergedLine('無公同共有組別。');
 mergedLine('共 '+items.length+' 筆；'+(summary.groups.some(g=>!g.valid)?'已確認持分小計：':'持分合計：')+summary.percent+'%，換算 '+summary.area+' 坪（共同持分每組計一次）。');
 if(summary.managers.length){
  sheet.addRow([]).height=8;mergedLine('管理者資料',13,true);
  const mapping=[[1,1],[2,3],[4,5],[6,8]];
  for(const [index,values] of [['清冊次序','所有權人','管理者','管理者地址'],...summary.managers.map(m=>[m.row,m.owner,m.name,m.address])].entries()){
   const r=sheet.addRow(Array(8).fill(null));style(r,index===0);let height=30;
   values.forEach((value,i)=>{const [a,b]=mapping[i];r.getCell(a).value=value;if(a!==b)sheet.mergeCells(r.number,a,r.number,b);height=Math.max(height,lines(value,widths.slice(a-1,b).reduce((x,y)=>x+y,0))*15+8);});r.height=Math.min(409,height);
  }
 }
 if(summary.issues.length){sheet.addRow([]).height=8;mergedLine('待核對事項',13,true);for(const issue of summary.issues)mergedLine(issue);}
 sheet.pageSetup.printArea='A1:H'+sheet.rowCount;
 return book;
}
let loading;
async function engine(){
 if(!loading)loading=(async()=>{
  if(!root.ExcelJS)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/exceljs.min.js',document.baseURI).href;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Excel 匯出程式載入失敗'));};document.head.append(script);});
  return root.ExcelJS;
 })().catch(error=>{loading=null;throw error;});return loading;
}
async function download(snapshot,filename){
 const Excel=await engine(),book=build(snapshot,Excel),bytes=await book.xlsx.writeBuffer();
 const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
root.RegistryExcel={build,download};
})(globalThis);
