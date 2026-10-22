(function(root){
'use strict';
const str=v=>String(v??'');
const digits=v=>str(v).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/／/g,'/');
const noise='屏東縣枋寮地政事務所';
const labels=['地租','權利價值','設定目的','使用目的','使用範圍','使用方法','權利種類','擔保債權總金額','債權總金額','標的登記次序','設定權利範圍','存續期間','清償日期','權利標的','原因發生日期','相關他項權利登記次序','歷次取得權利範圍','前次移轉現值或原規定地價','其他登記事項','當期申報地價','登記次序','登記日期','登記原因','所有權人','統一編號','出生日期','住址','管理者','權利範圍','權狀字號'];
function repairLabels(text){
 let result=str(text);
 for(const label of labels){
  const pattern=label.split('').join('[\\s'+noise+'港]*')+'[\\s'+noise+'港]*[：:]';
  result=result.replace(new RegExp(pattern,'g'),label+'：');
 }
 return result;
}
function clean(text){
 let owners=false;
 return repairLabels(digits(text).replace(/\r/g,'').replace(/　/g,' '))
 .replace(/(?:[（(]\s*空\s*白\s*[）)]\s*){2,}/g,'（空白）')
 .split('\n').map(line=>{
  if(/土地所有權部|建物所有權部|[（(]\s*\d{4}\s*[）)]\s*登記次序/.test(line))owners=true;
  if(/列\s*印\s*時\s*間/.test(line))line=line.replace(/列\s*印\s*時\s*間[：:]\s*民國\s*\d{2,3}年\d{1,2}月\d{1,2}日(?:\d{1,2}時\d{1,2}分(?:\d{1,2}秒)?)?/g,'');
  if(owners && /^[^：:\n]*段\s*\d{1,4}[-－]\d{4}\s*地號\s*(?:\d{1,2}時\d{1,2}(?:分)?)?\s*$/.test(line))return '';
  if(/^\s*(?:[A-Z0-9]\s*[A-Z0-9]|[屏東縣枋寮地政事務所])\s*$/.test(line))return '';
  return line.replace(/頁\s*次\s*[：:]\s*\d+/g,'').replace(/[（(]\s*續\s*次\s*頁\s*[）)]/g,'');
 }).join('\n');
}
function date(value){
 const raw=digits(value).replace(new RegExp('['+noise+']','g'),'').trim();
 if(!raw || /^[（(]空白[）)]$/.test(raw))return '';
 const m=raw.match(/(?:民國\s*)?(\d{1,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/) || raw.match(/^(?:民國\s*)?(\d{1,3})[.\/-](\d{1,2})[.\/-](\d{1,2})(?!\d)/);
 if(!m)return '';
 const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const d=new Date(Date.UTC(y+1911,month-1,day));
 if(y<1 || month<1 || month>12 || day<1 || d.getUTCFullYear()!==y+1911 || d.getUTCMonth()!==month-1 || d.getUTCDate()!==day)return '';
 return '民國'+String(y).padStart(3,'0')+'.'+String(month).padStart(2,'0')+'.'+String(day).padStart(2,'0');
}
function reason(value){
 const raw=str(value).trim();
 const m=raw.match(/^(分割繼承|遺囑繼承|分割共有物|判決共有物分割|判決移轉|買賣|繼承|贈與|總登記|拍賣|拋棄|徵收|交換|信託歸屬|信託|塗銷信託|合併|分割|調處|更正|重測|地籍圖重測|第一次登記|時效取得|分配|其他登記)/);
 return m ? m[1] : (/^[\u3400-\u9fff]{2,12}$/.test(raw)?raw:'');
}
function address(value){
 let text=str(value).replace(/\r/g,'').split('\n').filter(line=>!/(?:列印時間|頁次|續次頁)/.test(line)).map(line=>{
  if(!/段\s*\d{1,4}[-－]\d{4}地號/.test(line))return line;
  const prefix=line.match(/^(.*?(?:號|樓)(?:之[\d一二三四五六七八九十]+)?)[\u4e00-\u9fff]{2,16}段\s*\d{1,4}[-－]\d{4}地號/);return prefix?.[1]||'';
 }).join('');
 text=repairLabels(text).replace(/^\s*住[。．.]*址[：:]?/,'');
 text=text.split(/管理者[：:]|(?:統一編號|出生日期|權狀字號|當期申報|登記原因|權利範圍|原因發生日期|其他登記事項|登記次序)[：:]?/)[0];
 text=text.replace(/\s/g,'').replace(/[＊*]+$/,'');
 text=text.replace(/((?:號|樓)(?:之[\d一二三四五六七八九十]+)?)[\u4e00-\u9fff]{2,16}段\d{1,4}[-－]\d{4}地號.*$/,'$1');
 text=text.replace(/((?:號|樓)(?:之\d+)?)(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])$/,'$1');
 return /^[（(]空白[）)]$/.test(text)||text==='—'?'':text;
}
function fraction(owner){
 if(owner.shareAvailable===false)return null;
 const text=digits(str(owner.numerator)+'/'+str(owner.denominator)).replace(/\s/g,'');
 if(!/^\d+\/\d+$/.test(text))return null;
 const [n,d]=text.split('/');if(d.startsWith('0'))return null;
 const top=BigInt(n),bottom=BigInt(d);
 return top>0n&&top<=bottom?{numerator:n,denominator:d}:null;
}
function registration(value){
 const text=digits(value).replace(new RegExp('[\\s'+noise+']','g'),'').replace(/[－—]/g,'-').replace(/O/g,'0');
 return /^\d{1,4}(?:-\d{3})?$/.test(text)?text.split('-').map((x,i)=>i?x:x.padStart(4,'0')).join('-'):'';
}
function commonRefs(text){
 const source=digits(text).replace(/\s/g,'');const ids=new Set();
 for(const match of source.matchAll(/主登記次序([\d、，,～~－\-至]+)公同共有/g)){
  for(const part of match[1].split(/[、，,]/)){
   const range=part.match(/^(\d{1,4})[～~－\-至](\d{1,4})$/);
   if(range){const a=Number(range[1]),b=Number(range[2]);if(b>=a&&b-a<=500)for(let n=a;n<=b;n++)ids.add(String(n).padStart(4,'0'));}
   else if(/^\d{1,4}$/.test(part))ids.add(part.padStart(4,'0'));
  }
 }
 return [...ids].sort();
}
const boundary=new RegExp('(?:'+labels.join('|')+')[：:]','g');
function field(block,label){
 const start=block.indexOf(label+'：');if(start<0)return '';
 const rest=block.slice(start+label.length+1);boundary.lastIndex=0;const end=boundary.exec(rest);
 return (end?rest.slice(0,end.index):rest).trim();
}
function debtorName(text){
 const source=clean(text).replace(/\s/g,'');
 const value=source.split(/債務人[：:]/)[1];if(!value)return '';
 const name=ownerName(value.split(/(?:限制範圍|債權人|債務人|義務人|權利人|登記日期|收件年期|收件字號|其他登記事項)[：:]?/)[0]);
 return name.match(/^[\u3400-\u9fff·．‧]{2,40}/)?.[0]||'';
}
function compactNote(value){
 const raw=clean(value).replace(/\n\s*/g,'').replace(/(查封登記)\s*[；;]\s*(?=收件(?:日期|時間)?[：:])/g,'$1，').trim();
 const pieces=[];let depth=0,start=0;
 for(let i=0;i<raw.length;i++){
  if(/[（(]/.test(raw[i]))depth++;
  else if(/[）)]/.test(raw[i]))depth=Math.max(0,depth-1);
  else if(/[；;]/.test(raw[i])&&!depth){pieces.push(raw.slice(start,i));start=i+1;}
 }
 pieces.push(raw.slice(start));
 const pattern='((?:民國)?\\d{1,3}(?:年|[.\\/-])\\d{1,2}(?:月|[.\\/-])\\d{1,2}日?)';
 const matchDate=(text,pattern)=>date(text.match(new RegExp(pattern))?.[1]||'');
 return [...new Set(pieces.flatMap(piece=>piece.split(/(?=[（(](?:限制登記事項|一般註記事項)[）)])/)).map(piece=>{
  const clause=piece.replace(/^(?:其他登記事項|備註)\s*[：:]\s*/,'').trim();
  const normalized=digits(clause).replace(new RegExp('[\\s'+noise+'港]','g'),'');
  if(/未辦繼承/.test(clause)){
   const listed=matchDate(normalized,'自'+pattern+'起.{0,40}?列冊')||matchDate(normalized,'列冊(?:管理)?(?:日期|時間)?[：:]?(?:為|自|於)?'+pattern)||matchDate(normalized,pattern+'(?:起)?(?:未辦繼承)?列冊')||matchDate(normalized,'未辦繼承列冊[（(]'+pattern);
   return '未辦繼承列冊'+(listed?'（'+listed+'）':'');
  }
  if(/查封/.test(clause)){
   const received=matchDate(normalized,pattern+'收件')||matchDate(normalized,'收件(?:日期|時間)?[：:]?(?:於)?'+pattern);
   return '查封登記'+(received?'（收件：'+received+'）':'');
  }
  return clause;
 }).filter(Boolean))].join('；');
}
function mortgageNote(item){
 return '抵押權（登記次序：'+item.registrationSequence+'；金額：'+(item.amount||'待確認')+'）';
}
function mortgageRefs(value){
 const refs=new Set();
 for(const match of digits(value).matchAll(/(?<!\d)(\d{4})(?:\s*[～~至－-]\s*(\d{4})(?!\d)|(-\d{3})?)(?!\d)/g)){
  if(match[2]){const first=Number(match[1]),last=Number(match[2]);if(last>=first&&last-first<=500)for(let n=first;n<=last;n++)refs.add(String(n).padStart(4,'0'));}
  else refs.add(match[1]+(match[3]||''));
 }
 return [...refs];
}
function otherRightRecords(text){
 const source=clean(text),start=source.search(/(?:土地|建物)他項權利部/);if(start<0)return [];
 const section=source.slice(start),heads=[...section.matchAll(/(?:[（(]\s*\d{1,4}\s*[）)]\s*|(?:^|\n)[ \t]*)登記次序：([^\n]*)/g)];
 return heads.flatMap((head,index)=>{
  const block=section.slice(head.index,heads[index+1]?.index??section.length);
  const id=registration(head[1].match(/^\s*(\d{1,4}(?:-\d{3})?)/)?.[1]||'');if(!id)return [];
  return [{block,registrationSequence:id,kind:field(block,'權利種類'),targets:mortgageRefs(field(block,'標的登記次序'))}];
 });
}
function parseMortgages(text){
 return otherRightRecords(text).flatMap(({block,registrationSequence,kind:rawKind,targets})=>{
  const kind=rawKind.match(/^(最高限額抵押權|普通抵押權|抵押權)/)?.[1];if(!kind)return [];
  const raw=(field(block,'擔保債權總金額')||field(block,'債權總金額')).replace(/[＊*\s]/g,'').replace(/，/g,',').replace(/台幣/g,'臺幣');
  const money=raw.match(/((?:本金最高限額|最高限額)?(?:新臺幣|美元|美金|人民幣|港幣|日圓|日幣|歐元)?)(\d[\d,]*(?:\.\d+)?)元/);
  let amount='';
  if(money){const [whole,decimal]=money[2].replace(/,/g,'').split('.');amount=money[1]+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal?'.'+decimal:'')+'元';if(kind==='最高限額抵押權'&&!/最高限額/.test(amount))amount='最高限額'+amount;}
  return [{registrationSequence,kind,amount,targets}];
 });
}
function surfaceRightNote(item){
 return item.kind+'（存續期間：'+(item.duration||'待確認')+'）';
}
function parseSurfaceRights(text){
 return otherRightRecords(text).flatMap(({block,registrationSequence,kind:rawKind,targets})=>{
  const kind=rawKind.match(/^(區分地上權|普通地上權|地上權)/)?.[1];if(!kind)return [];
  const duration=field(block,'存續期間').split(/\n[^\n：:]{1,20}[：:]/)[0].split('\n').filter(line=>!/^\s*[屏東縣枋寮港地政事務所]\s*$/.test(line)).join('')
   .replace(/[＊*\s]/g,'').replace(/^[（(]空白[）)]$/,'');
  return [{registrationSequence,kind,duration,targets}];
 });
}
function reconcileRightRecords(owner,image,key,detail){
 const direct=owner[key]||[],known=[...(owner.mortgages||[]),...(owner.surfaceRights||[])];
 const allowed=(image[key]||[]).filter(item=>!owner.mortgageSectionPresent||direct.some(record=>record.registrationSequence===item.registrationSequence)||(!known.some(record=>record.registrationSequence===item.registrationSequence)&&(owner.relatedMortgageRefs||[]).includes(item.registrationSequence)));
 const records=new Map(allowed.map(item=>[item.registrationSequence,item]));
 for(const item of direct){const fallback=records.get(item.registrationSequence);records.set(item.registrationSequence,{...item,[detail]:item[detail]||fallback?.[detail]||''});}
 return [...records.values()];
}
function parseOwners(text,notes=()=>[]){
 const fullSource=clean(text),mortgages=parseMortgages(fullSource),surfaceRights=parseSurfaceRights(fullSource),mortgageSectionPresent=/(?:土地|建物)他項權利部/.test(fullSource);
 let source=fullSource;
 const marker=source.search(/(?:土地|建物)所有權部/);if(marker>=0)source=source.slice(marker);
 const end=source.search(/(?:土地|建物)他項權利部/);if(end>=0)source=source.slice(0,end);
 const heads=[...source.matchAll(/(?:[（(]\s*(\d{1,4})\s*[）)]\s*|(?:^|\n)[ \t]*)登記次序：([^\n]*)/g)];
 const blocks=heads.length?heads.map((m,i)=>({text:source.slice(m.index,heads[i+1]?.index??source.length),sequence:m[1]?.padStart(4,'0')||'',registrationSequence:registration(m[2].split(/登記日期/)[0])})):[{text:source,sequence:'',registrationSequence:''}];
 return blocks.map(({text:block,sequence,registrationSequence},i)=>{
  const share=field(block,'權利範圍').replace(/\s/g,'').replace(new RegExp('['+noise+']','g'),'');
  const cn=share.match(/(\d+)分之(\d+)/),slash=share.match(/(\d+)\/(\d+)/);
  const f=fraction({numerator:cn?.[2]||slash?.[1]||'',denominator:cn?.[1]||slash?.[2]||''});
  const relatedRights=mortgageRefs(field(block,'相關他項權利登記次序'));
  const ownerMortgages=mortgages.filter(item=>item.targets.includes(registrationSequence)||relatedRights.includes(item.registrationSequence));
  const ownerSurfaceRights=surfaceRights.filter(item=>item.targets.includes(registrationSequence)||relatedRights.includes(item.registrationSequence));
  const fullName=debtorName(field(block,'其他登記事項'));
  const name=ownerName(field(block,'所有權人')).replace(/(?:[＊*]{3,}|[A-Z0-9]{2})$/,'').trim();
  const id=field(block,'統一編號').replace(/\s/g,'');
  const rawDate=field(block,'原因發生日期'),rawAddress=field(block,'住址');
  const managerPart=block.includes('管理者：')?block.slice(block.indexOf('管理者：')):'';
  return {name:fullName||(name.length<=80?name:''),debtorName:fullName,id:id.length===10?id:'',address:address(rawAddress),addressExplicitBlank:/[（(]\s*空\s*白\s*[）)]/.test(rawAddress),manager:field(managerPart,'管理者').replace(/\s/g,''),managerAddress:address(field(managerPart,'住址')),date:date(rawDate),rawDate,
   reason:reason(field(block,'登記原因')),numerator:f?.numerator||'',denominator:f?.denominator||'',shareAvailable:!!f,
   common:/公同共有/.test(share),commonRefs:commonRefs(block),sequence,registrationSequence,sourceOrder:sequence?Number(sequence):i+1,
   mortgages:ownerMortgages,surfaceRights:ownerSurfaceRights,relatedMortgageRefs:relatedRights,mortgageSectionPresent,review:[...notes(block),...ownerMortgages.map(mortgageNote),...ownerSurfaceRights.map(surfaceRightNote)],issues:rawDate&&!date(rawDate)?['原因發生日期無法確認：'+rawDate.replace(/\s+/g,' ').slice(0,80)]:[]};
 }).filter(o=>o.sequence||o.registrationSequence||o.name||o.id||o.address);
}
function reconcile(direct,scanned){
 const merged=direct.map(o=>({...o,review:[...(o.review||[])],issues:[...(o.issues||[])]}));const used=new Set();
 for(const image of scanned){
  let candidates=merged.map((o,i)=>({o,i})).filter(({o,i})=>!used.has(i)&&image.registrationSequence&&o.registrationSequence===registration(image.registrationSequence));
  if(!candidates.length)candidates=merged.map((o,i)=>({o,i})).filter(({o,i})=>!used.has(i)&&image.sequence&&o.sequence===image.sequence);
  if(!candidates.length&&!image.sequence&&!image.registrationSequence)candidates=merged.map((o,i)=>({o,i})).filter(({o,i})=>!used.has(i)&&/^[A-Z][12]\d{8}$/.test(image.id||'')&&o.id===image.id&&o.common===image.common&&str(o.numerator)===str(image.numerator)&&str(o.denominator)===str(image.denominator));
  if(candidates.length===1){
   const {o,i}=candidates[0];used.add(i);
   for(const key of ['name','id','address','date','reason','manager','managerAddress']){if(key==='address'&&o.addressExplicitBlank)continue;if(!str(o[key]).trim()||/[�□]/.test(o[key]))o[key]=image[key]||'';}
   o.debtorName=o.debtorName||image.debtorName||'';if(o.debtorName)o.name=o.debtorName;
   if(!fraction(o)&&fraction(image)){o.numerator=image.numerator;o.denominator=image.denominator;o.shareAvailable=true;o.common=image.common;}
   if(!o.commonRefs?.length)o.commonRefs=image.commonRefs||[];
   if(!o.review.length)o.review=[...(image.review||[])];
   const mortgages=reconcileRightRecords(o,image,'mortgages','amount'),surfaceRights=reconcileRightRecords(o,image,'surfaceRights','duration');
   o.mortgages=mortgages;o.surfaceRights=surfaceRights;
   o.review=[...new Set([...o.review.filter(note=>!note.startsWith('抵押權（登記次序：')&&!/^(?:區分|普通)?地上權（存續期間：/.test(note)),...mortgages.map(mortgageNote),...surfaceRights.map(surfaceRightNote)])];
   if(o.date)o.issues=o.issues.filter(x=>!x.startsWith('原因發生日期'));
  }else if(!candidates.length){merged.push({...image,review:[...(image.review||[])],issues:[...(image.issues||[])]});used.add(merged.length-1);}
 }
 // Order by the transcript ordinal, not by the OCR response or person's name.
 merged.sort((a,b)=>(a.sourceOrder||Number(a.sequence)||1e9)-(b.sourceOrder||Number(b.sequence)||1e9));
 return merged.map(o=>fraction(o)?o:{...o,numerator:'',denominator:'',shareAvailable:false});
}
function groupOwners(items){
 const parents=new Map(),refsByRoot=new Map();
 const find=x=>{if(!parents.has(x))parents.set(x,x);if(parents.get(x)!==x)parents.set(x,find(parents.get(x)));return parents.get(x);};
 const join=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parents.set(y,x);};
 const scope=o=>o.documentKey||str(o.sequence).split(':').slice(0,-1).join(':')||'document';
 for(const o of items)if((o.common||o.commonGroup)&&o.commonRefs?.length){const ids=o.commonRefs.map(id=>scope(o)+':'+id);ids.forEach(id=>join(ids[0],id));}
 for(const key of parents.keys()){const r=find(key);if(!refsByRoot.has(r))refsByRoot.set(r,[]);refsByRoot.get(r).push(key.split(':').at(-1));}
 const names=new Map();let count=0;
 return items.map((o,i)=>{
  if(!o.common&&!o.commonGroup)return {...o,commonGroup:'',commonGroupLabel:'',commonRefs:[]};
  const ref=o.commonRefs?.[0]||o.registrationSequence;
  const rootKey=ref&&parents.has(scope(o)+':'+ref)?find(scope(o)+':'+ref):'';
  const key=rootKey||o.commonGroup||scope(o)+':unconfirmed-'+(o.registrationSequence||o.sourceOrder||i+1);
  if(!names.has(key))names.set(key,'共'+(++count));
  return {...o,common:true,commonGroup:key,commonGroupLabel:names.get(key),commonRefs:rootKey?[...new Set(refsByRoot.get(rootKey))].sort():o.commonRefs||[],groupVerified:!!rootKey||o.groupVerified===true};
 });
}
const gcd=(a,b)=>{while(b){[a,b]=[b,a%b];}return a;};
function summary(items,landArea){
 const groups=new Map(),issues=[];let n=0n,d=1n,invalid=0;
 const add=f=>{const a=BigInt(f.numerator),b=BigInt(f.denominator);n=n*b+a*d;d*=b;const g=gcd(n,d);n/=g;d/=g;};
 for(const [index,row] of items.entries()){
  if(!row.name)issues.push('第'+(index+1)+'筆缺少姓名（主次序 '+(row.registrationSequence||'未確認')+'）');
  if(!row.address&&!row.addressExplicitBlank)issues.push('第'+(index+1)+'筆地址待確認');
  if(row.address&&!/(?:號|樓|室|番地|信箱)(?:之[\d一二三四五六七八九十百]+)?$/.test(row.address))issues.push('第'+(index+1)+'筆地址門牌結尾待核對，請依原謄本確認');
  if(!date(row.date)&&str(row.date).trim())issues.push('第'+(index+1)+'筆日期格式無效：'+row.date);
  for(const issue of row.issues||[])issues.push('第'+(index+1)+'筆 '+issue);
  if(row.commonGroup){if(!groups.has(row.commonGroup))groups.set(row.commonGroup,{key:row.commonGroup,label:row.commonGroupLabel||row.commonGroup,rows:[],members:[],expected:row.commonRefs||[],verified:row.groupVerified===true});const g=groups.get(row.commonGroup);g.rows.push(index+1);g.members.push(row);}
  else {const f=fraction(row);if(f)add(f);else{invalid++;issues.push('第'+(index+1)+'筆持分無效，未納入合計');}}
 }
 const documents=new Map();
 for(const row of items)if(row.documentKey&&Number(row.sourceRecordCount)>0){const entry=documents.get(row.documentKey)||{expected:Number(row.sourceRecordCount),found:0};entry.found++;documents.set(row.documentKey,entry);}
 for(const entry of documents.values())if(entry.found!==entry.expected)issues.push('原謄本 '+entry.expected+' 筆，目前列入 '+entry.found+' 筆，請核對漏列或重複');
 const output=[];
 for(const g of groups.values()){
  const f=fraction(g.members[0]),same=f&&g.members.every(x=>{const v=fraction(x);return v&&BigInt(v.numerator)*BigInt(f.denominator)===BigInt(f.numerator)*BigInt(v.denominator);});
  const present=new Set(g.members.map(x=>x.registrationSequence));const missing=g.expected.filter(x=>!present.has(x));
  let status=[];if(!same){invalid++;status.push('同組持分不一致，未計入');}else if(g.verified)add(f);
  if(!g.verified)status.push('組別關聯待確認，未納入合計');if(missing.length)status.push('缺少主次序 '+missing.join('、'));
  if(status.length)issues.push(g.label+'：'+status.join('；'));
  output.push({key:g.key,label:g.label,rows:g.rows,registrationSequences:g.expected.length?g.expected:g.members.map(x=>x.registrationSequence).filter(Boolean),memberCount:g.members.length,expectedCount:g.expected.length,numerator:f?.numerator||'',denominator:f?.denominator||'',area:same&&g.verified?(Number(landArea||0)*Number(f.numerator)/Number(f.denominator)*.3025).toFixed(2):'—',status:status.join('；')||'完整',valid:!!same&&g.verified&&!missing.length});
 }
 const ratio=Number(n*1000000000000n/d)/1e12;
 const sharesComplete=!invalid&&output.every(g=>g.valid);
 const recordsComplete=[...documents.values()].every(entry=>entry.found===entry.expected);
 const complete=sharesComplete&&recordsComplete&&!issues.length;
 return {groups:output,issues:[...new Set(issues)],ratio,percent:(ratio*100).toFixed(4),area:(Number(landArea||0)*ratio*.3025).toFixed(2),landArea:(Number(landArea||0)*.3025).toFixed(2),complete,balanced:sharesComplete&&recordsComplete&&n===d,totalFraction:n+'/'+d,recordCount:items.length,managers:items.map((row,index)=>({row:index+1,owner:row.name||'姓名待確認',name:row.manager||'',address:row.managerAddress||'—'})).filter(row=>row.name)};
}
function legacyDraft(snapshot){
 if(snapshot?.needsSourceRebuild)return true;
 return (snapshot?.rows||[]).some(row=>row.commonGroup&&!row.registrationSequence&&!row.commonRefs?.length&&row.groupVerified!==true&&snapshot.schemaVersion!==2);
}
function ownerName(value){
 let name=str(value).replace(/\s/g,'');
 const office='屏東縣枋寮地政事務所';
 // Keep a government agency when it is the actual owner; remove a stamp attached to a name.
 if(name!==office)name=name.split(office).join('');
 return name.replace(/((?:先生|小姐|[＊*]+))(?:屏東縣|枋寮地政事務所)+$/,'$1');
}
function displayDate(value){return date(value).replace(/^民國/,'');}
// Merge fields independently, only within an uninterrupted common-owner group.
function commonCellSpans(items){
 const result={share:items.map(()=>1),date:items.map(()=>1),reason:items.map(()=>1)};
 const group=row=>row.commonGroup?JSON.stringify([row.documentKey||'',row.commonGroup]):'';
 const values={share:row=>{const f=fraction(row);return f?f.numerator+'/'+f.denominator:'';},date:row=>date(row.date),reason:row=>reason(row.reason)};
 for(const [key,value] of Object.entries(values)){
  for(let i=0;i<items.length;){
   const id=group(items[i]),v=value(items[i]);let end=i+1;
   if(id&&v)while(end<items.length&&group(items[end])===id&&value(items[end])===v)end++;
   result[key][i]=end-i;for(let j=i+1;j<end;j++)result[key][j]=0;i=end;
  }
 }
 return result;
}
const ownerColumnPercentages=[4,9,26,14,8,8,8,23];
root.RegistryModel={legacyDraft,digits,clean,repairLabels,date,displayDate,ownerName,debtorName,compactNote,parseMortgages,mortgageNote,parseSurfaceRights,surfaceRightNote,commonCellSpans,ownerColumnPercentages,reason,address,fraction,registration,commonRefs,parseOwners,reconcile,groupOwners,summary};
})(globalThis);
