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
 const model=root.RegistryModel,people=[],lookup=new Map(),entries=[],parents=[],byAddress=new Map(),byId=new Map();let unnamed=0;
 const find=index=>{if(parents[index]!==index)parents[index]=find(parents[index]);return parents[index];};
 const join=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parents[y]=x;};
 for(const [landIndex,land] of project.lands.entries())for(const row of land.snapshot.rows){
  const name=model.ownerName(row.name).split(/住(?=[＊*\d])|住址[：:]|統一編號[：:]|出生日期[：:]|當期申報地價[：:]|前次移轉現值/)[0].normalize('NFKC'),address=model.address(row.address);
  const named=Boolean(name&&!/^[（(]?姓名待確認[）)]?$/.test(name)),id=String(row.id||'').normalize('NFKC').replace(/\s/g,'').toUpperCase();
  const index=entries.length;parents.push(index);entries.push({name,address,named,landIndex,row});
  if(named){
   const keys=[];
   if(address&&!/^(?:—|地址待確認|待確認|未知|未填)$/.test(address))keys.push([byAddress,JSON.stringify([name,address.normalize('NFKC')])]);
   if(/^[A-Z][12]\d{8}$/.test(id))keys.push([byId,JSON.stringify([name,id])]);
   for(const [map,key] of keys){if(map.has(key))join(index,map.get(key));else map.set(key,index);}
  }
 }
 for(const [index,entry] of entries.entries()){
  const {name,address,named,landIndex,row}=entry,identity=find(index);let person=lookup.get(identity);
  if(!person){person={name:name||'姓名待確認',address:address||'—',addresses:[],unnamed:!named,cells:project.lands.map(()=>[])};lookup.set(identity,person);people.push(person);if(!named)unnamed++;}
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
 return {people:reports,unnamed,landCount:project.lands.length};
}
function blocks(project){
 const report=matrix(project),lands=project.lands;if(!lands.length)return {...report,blocks:[]};
 const mixedDistricts=new Set(lands.map(land=>land.snapshot.fields.district||'')).size>1;
 const heading=land=>[mixedDistricts?land.snapshot.fields.district:'',land.snapshot.fields.section,land.snapshot.fields.parcel].filter(Boolean).join('\n');
 const headers=['次序','姓名','地址',...lands.flatMap(land=>[heading(land)+'\n持分',heading(land)+'\n坪數']),'個別坪數合計\n（全部土地）'];
 const rows=report.people.map((person,index)=>[String(index+1),person.name,person.address,...person.cells.flatMap(cell=>[cell.share,cell.area]),person.total]);
 const widths=lands.length===1?[5,13,36,17,12,17]:lands.length===2?[4,11,31,12,9,12,9,12]:[3,9,25,...lands.flatMap(()=>[30/lands.length,24/lands.length]),9];
 return {...report,blocks:[{headers,rows,widths}]};
}
const notice='姓名相同，且地址相同或完整未遮碼身分證字號相同才合併；遮碼、空白字號不單獨作合併依據；不同地址一併保留；各土地原始登記詳後附清冊。公同共有坪數標示「共同」，不列入個人跨土地合計。';
root.RegistryMulti={single,key,label,hasData,empty,create,sync,upsert,matrix,blocks,notice};
})(globalThis);
