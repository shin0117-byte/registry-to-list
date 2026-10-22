import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const c=vm.createContext({document:{querySelector:()=>({children:[],addEventListener(){}})},localStorage:{getItem:()=>null},refreshCloudSetup(){}});
vm.runInContext(fs.readFileSync(new URL('../registry-model.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),c);
const M=c.RegistryModel;
const owner=(order,id,refs='')=>`（${order}）登記次序：${id}\n所有權人：測試＊＊\n權利範圍：1/2\n相關他項權利登記次序：${refs}\n其他登記事項：（空白）\n`;
const right=(kind,duration,target='0002',id='0001-000')=>`（0001）登記次序：${id} 權利種類：${kind}\n權利人：測試公司\n統一編號：12345678\n存續期間：${duration}\n地租：約定每年1000元\n權利標的：所有權\n標的登記次序：${target}\n設定權利範圍：1/2\n其他登記事項：（空白）`;
const doc=(block,refs='')=>'土地所有權部\n'+owner('0001','0002',refs)+owner('0002','0006')+'土地他項權利部\n'+block;
test('surface right notes contain only duration on the target owner and pass the UI whitelist',()=>{
 const rows=c.parsedOwners(doc(right('地上權','自民國１００年０１月０１日\n港\n至民國１５０年１２月３１日')));
 assert.equal(rows[0].surfaceRights.length,1);assert.equal(rows[1].surfaceRights.length,0);
 assert.equal(rows[0].review[0],'地上權（存續期間：自民國100年01月01日至民國150年12月31日）');
 assert.ok(c.isBusinessNote(rows[0].review[0]));assert.doesNotMatch(rows[0].review[0],/測試公司|1000|登記次序/);
 assert.equal(c.otherRightsNotes(doc(right('地上權','不定期限'))).length,0);
});
test('indefinite and condition-based terms are kept verbatim; unrelated field text is excluded',()=>{
 for(const duration of ['不定期限','自設定登記之日起至地上建物滅失之日止','自設定日起30年']){
  assert.equal(M.parseSurfaceRights(doc(right('地上權',duration)))[0].duration,duration);
 }
 assert.equal(M.parseSurfaceRights(doc(right('地上權','不定期限\n地租約定：每年1000元')))[0].duration,'不定期限');
 assert.equal(M.parseSurfaceRights(doc(right('地上權','（空白）')))[0].duration,'');
 assert.equal(c.parsedOwners(doc(right('地上權','（空白）')))[0].review[0],'地上權（存續期間：待確認）');
});
test('sectional surface rights can link by related rights and do not become mortgages',()=>{
 const text=doc(right('區分地上權','自民國110年01月01日至民國160年12月31日',''),'0001-000');
 const row=c.parsedOwners(text)[0];assert.equal(row.surfaceRights.length,1);assert.equal(row.mortgages.length,0);
 assert.match(row.review[0],/^區分地上權（存續期間：/);
});
test('PDF term wins OCR; missing term falls back once and never changes the right type',()=>{
 const direct=c.parsedOwners(doc(right('地上權','不定期限'),'0001-000'));
 const image=c.parsedOwners(doc(right('地上權','自民國110年01月01日至民國160年12月31日'),'0001-000'));
 const merged=c.reconcileOwners(direct,image);assert.equal(merged[0].surfaceRights[0].duration,'不定期限');assert.equal(merged[0].review.length,1);
 const missing=c.parsedOwners(doc(right('地上權','（空白）'),'0001-000'));
 assert.equal(c.reconcileOwners(missing,image)[0].surfaceRights[0].duration,'自民國110年01月01日至民國160年12月31日');
 const wrong=c.parsedOwners(doc(right('抵押權','不定期限'),'0001-000'));
 assert.equal(c.reconcileOwners(direct,wrong)[0].mortgages.length,0);
});
test('mixed mortgage and surface rights keep their separate note formats without extra owner rows',()=>{
 const mortgage=right('抵押權','自民國110年至130年','0002','0002-000').replace('存續期間：','擔保債權總金額：新台幣300,000元正\n存續期間：');
 const rows=c.parsedOwners(doc(right('地上權','不定期限')+'\n'+mortgage));
 assert.equal(rows.length,2);assert.equal(rows[0].surfaceRights.length,1);assert.equal(rows[0].mortgages.length,1);
 assert.ok(rows[0].review.includes('地上權（存續期間：不定期限）'));
 assert.ok(rows[0].review.some(note=>note.includes('0002-000；金額：新臺幣300,000元')));
 assert.equal(rows[1].review.length,0);
});
