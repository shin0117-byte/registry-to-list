(function(root){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
const single=snapshot=>{const {project,...data}=snapshot;return clone(data);};
const key=fields=>[fields?.district,fields?.section,fields?.parcel].map(v=>String(v||'').replace(/\s/g,'')).join('|');
const label=fields=>[fields?.district,fields?.section,fields?.parcel].filter(Boolean).join('')||'尚未填寫地號';
const hasData=snapshot=>Boolean(snapshot?.fields?.parcel||snapshot?.rows?.length);
const empty=()=>({version:1,view:'single',activeKey:'',lands:[]});
function create(snapshot){return hasData(snapshot)?upsert(empty(),[snapshot]):empty();}
function sync(project,snapshot){
 const p=clone(project||empty()),active=p.lands.find(land=>land.key===p.activeKey);
 if(active)active.snapshot=single(snapshot);
 else if(hasData(snapshot)){const id=key(snapshot.fields);p.lands.push({key:id,snapshot:single(snapshot)});p.activeKey=id;}
 return p;
}
function upsert(project,snapshots){
 const p=clone(project||empty());p.lands=p.lands.filter(land=>hasData(land.snapshot));if(!p.lands.some(land=>land.key===p.activeKey))p.activeKey='';
 for(const snapshot of snapshots){
  const id=key(snapshot.fields),existing=p.lands.find(land=>key(land.snapshot.fields)===id);
  if(existing)existing.snapshot=single(snapshot);else p.lands.push({key:id,snapshot:single(snapshot)});
  if(!p.activeKey)p.activeKey=existing?.key||id;
 }
 return p;
}
function matrix(project){
 const model=root.RegistryModel,people=[],lookup=new Map();let uncertain=0;
 for(const [landIndex,land] of project.lands.entries())for(const [rowIndex,row] of land.snapshot.rows.entries()){
  const id=String(row.id||'').replace(/\s/g,'').toUpperCase(),name=model.ownerName(row.name),address=model.address(row.address);
  const full=/^[A-Z][12]\d{8}$/.test(id),masked=/^[A-Z][12][A-Z0-9*＊]{8}$/.test(id)&&/[*＊]/.test(id)&&name&&address;
  const identity=full?'id:'+id:masked?JSON.stringify(['masked',id,name,address]):'separate:'+landIndex+':'+rowIndex;
  let person=lookup.get(identity);
  if(!person){person={name:name||'姓名待確認',address:address||'—',addresses:[],uncertain:!full,cells:project.lands.map(()=>[])};lookup.set(identity,person);people.push(person);if(!full)uncertain++;}
  if(address&&!person.addresses.includes(address))person.addresses.push(address);
  person.address=person.addresses.join('\n')||'—';person.cells[landIndex].push(row);
 }
 const ratio=f=>Number(BigInt(f.numerator)*1000000000000n/BigInt(f.denominator))/1e12;
 const reports=people.map(person=>{
  let total=0,hasCommon=false,invalid=false,areaMissing=false;
  const cells=person.cells.map((rows,index)=>{
   if(!rows.length)return {share:'—',area:'—'};
   const shares=[],areas=[],seen=new Set();let normal=0,common=0,hasShared=false,cellInvalid=false;
   const rawArea=project.lands[index].snapshot.fields.area,knownArea=rawArea!==''&&rawArea!==undefined&&Number.isFinite(Number(rawArea))&&Number(rawArea)>=0;if(!knownArea)areaMissing=true;
   for(const row of rows){
    const f=model.fraction(row);if(!f){invalid=true;cellInvalid=true;shares.push('持分待確認');continue;}
    const group=row.commonGroup?JSON.stringify([row.documentKey||'',row.commonGroup]):'';
    if(group&&seen.has(group))continue;if(group)seen.add(group);
    const value=Number(project.lands[index].snapshot.fields.area||0)*ratio(f)*.3025;
    shares.push(f.numerator+'／'+f.denominator+(group?'（'+(row.commonGroupLabel||'公同共有')+'）':''));
    if(group){common+=value;hasShared=true;hasCommon=true;}else normal+=value;
   }
   if(cellInvalid)areas.push('持分待確認');else if(!knownArea)areas.push('面積待確認');else if(normal||!hasShared)areas.push(normal.toFixed(2)+(hasShared?'（個別）':''));
   if(hasShared&&!cellInvalid&&knownArea)areas.push(common.toFixed(2)+'（共同）');total+=normal;
   return {share:shares.join('\n'),area:areas.join('\n')};
  });
  return {...person,cells,total:invalid?'持分待確認':areaMissing?'面積待確認':hasCommon?'含公同共有':total.toFixed(2)};
 });
 return {people:reports,uncertain,landCount:project.lands.length};
}
function blocks(project){
 const report=matrix(project),output=[];
 for(let i=0;i<project.lands.length;i+=2){
  const lands=project.lands.slice(i,i+2);
  const mixedDistricts=new Set(project.lands.map(land=>land.snapshot.fields.district||'')).size>1;
  const heading=land=>[mixedDistricts?land.snapshot.fields.district:'',land.snapshot.fields.section,land.snapshot.fields.parcel].filter(Boolean).join('\n');
  const headers=['次序','姓名','地址',...lands.flatMap(land=>[heading(land)+'\n持分',heading(land)+'\n坪數']),'個別坪數合計\n（全部土地）'];
  const rows=report.people.map((person,index)=>[String(index+1),person.name+(person.uncertain?'＊':''),person.address,...person.cells.slice(i,i+2).flatMap(cell=>[cell.share,cell.area]),person.total]);
  output.push({headers,rows,widths:lands.length===2?[4,11,31,12,9,12,9,12]:[5,13,36,17,12,17]});
 }
 return {...report,blocks:output};
}
const notice='＊遮碼資料相符者暫列同一候選，仍待人工核對；無法關聯者分列。公同共有坪數標示「共同」，不列入個人跨土地合計。';
root.RegistryMulti={single,key,label,hasData,empty,create,sync,upsert,matrix,blocks,notice};
})(globalThis);
