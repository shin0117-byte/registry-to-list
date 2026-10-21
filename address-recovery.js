(function(root){
'use strict';
const model=()=>root.RegistryModel;
const normalized=value=>model().digits(value).replace(/\s/g,'').replace(/＊/g,'*').toUpperCase();
function locate(owner,pages){
 if(owner.address||owner.addressExplicitBlank||!owner.registrationSequence||!owner.id)return null;
 for(const page of pages){
  if(!page.pdfPage||!page.textItems?.length||page.fileKey!==owner.documentKey||(page.pdfPage.rotate||0)%360)continue;
  const records=model().parseOwners(page.directText);
  if(records.filter(r=>r.registrationSequence===owner.registrationSequence).length!==1)continue;
  const source=records.find(r=>r.registrationSequence===owner.registrationSequence);
  const order=String(source.sourceOrder).padStart(4,'0');
  const headings=page.textItems.filter(item=>new RegExp('[（(]'+order+'[）)]').test(normalized(item.str)));
  let ids=page.textItems.filter(item=>normalized(item.str).includes(normalized(owner.id)));
  if(headings.length===1){
   const top=headings[0].transform[5];
   const next=page.textItems.filter(item=>/[（(]\d{4}[）)]/.test(normalized(item.str))&&item.transform[5]<top).map(item=>item.transform[5]);
   const bottom=next.length?Math.max(...next):0;
   ids=ids.filter(item=>item.transform[5]<top&&item.transform[5]>bottom);
  }
  if(ids.length!==1)continue;
  const id=ids[0],y=id.transform[5],font=id.height||12;
  const following=page.textItems.filter(item=>/權利範圍[：:]/.test(model().repairLabels(item.str))&&item.transform[5]<y&&y-item.transform[5]<=font*5).sort((a,b)=>b.transform[5]-a.transform[5])[0];
  if(!following)continue;
  const bottom=following.transform[5]+font-2;
  if(y-bottom<font*.8||y-bottom>font*4)continue;
  return {page,id,left:id.transform[4]+font*5,top:y,bottom};
 }
 return null;
}
function candidate(value){
 const text=model().address(value);
 if(!/^(?:[\u3400-\u9fff]{2,3}[縣市])[\u3400-\u9fff]{1,5}[區鄉鎮市]/.test(text)||text.length>120||/地號|列印|權利範圍|登記次序/.test(text))return '';
 return /(?:號|樓|室)(?:之[\d一二三四五六七八九十]+)?$/.test(text)?text:'';
}
function consensus(results){
 if(results.length!==2||results.some(r=>!Number.isFinite(r.confidence)||r.confidence<90))return '';
 const a=candidate(results[0].text),b=candidate(results[1].text);return a&&a===b?a:'';
}
let engineLoading;
async function engine(){
 if(!engineLoading)engineLoading=(async()=>{
  if(!root.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/tesseract.min.js',document.baseURI).href;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('局部辨識程式載入失敗'));};document.head.append(script);});
  return root.Tesseract;
 })().catch(error=>{engineLoading=null;throw error;});
 return engineLoading;
}
async function crop(location){
 const viewport=location.page.pdfPage.getViewport({scale:3}),full=document.createElement('canvas');
 full.width=Math.ceil(viewport.width);full.height=Math.ceil(viewport.height);
 try{
  await location.page.pdfPage.render({canvasContext:full.getContext('2d'),viewport}).promise;
  const padding=20,left=Math.round(location.left*3),top=Math.round(viewport.height-location.top*3);
  const width=Math.floor(viewport.width-45-left),height=Math.ceil((location.top-location.bottom)*3);
  if(width<100||height<20||left<0||top<0||top+height>full.height)throw new Error('無法定位地址影像');
  const crops=[false,true].map(binary=>{
   const canvas=document.createElement('canvas');canvas.width=width+padding*2;canvas.height=height+padding*2;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(full,left,top,width,height,padding,padding,width,height);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),dropout=document.querySelector('#fadeWatermark')?.checked!==false;
   for(let i=0;i<pixels.data.length;i+=4){const d=pixels.data;let gray=dropout?d[i]:d[i]*.299+d[i+1]*.587+d[i+2]*.114;if(binary)gray=gray>180?255:0;d[i]=d[i+1]=d[i+2]=gray;}
   ctx.putImageData(pixels,0,0);return canvas;
  });
  return crops;
 }finally{full.width=0;full.height=0;}
}
async function recover(owners,pages,progress=()=>{}){
 const jobs=owners.map(owner=>({owner,location:locate(owner,pages)})).filter(job=>job.location);
 if(!jobs.length)return owners;
 let worker;
 try{
  progress(94,'正在載入本機地址補讀');const tess=await engine();
  worker=await tess.createWorker('chi_tra+eng',1,{workerPath:new URL('vendor/worker.min.js',document.baseURI).href,corePath:new URL('vendor/tesseract-core.wasm.js',document.baseURI).href,langPath:new URL('ocr-assets',document.baseURI).href,workerBlobURL:false,gzip:true});
  await worker.setParameters({tessedit_pageseg_mode:'7'});
  for(let i=0;i<jobs.length;i++){
   const {owner,location}=jobs[i];let images=[];
   try{
    progress(95,'正在局部補讀缺漏地址 '+(i+1)+'／'+jobs.length);images=await crop(location);
    const readings=[];for(const image of images){const result=await worker.recognize(image);readings.push({text:result.data.text,confidence:result.data.confidence});}
    const address=consensus(readings);if(address&&!owner.address&&!owner.addressExplicitBlank)owner.address=address;
   }catch{}finally{for(const image of images){image.width=0;image.height=0;}}
  }
 }catch{}finally{if(worker)await worker.terminate().catch(()=>{});}
 return owners;
}
root.RegistryAddressRecovery={locate,candidate,consensus,recover};
})(globalThis);
