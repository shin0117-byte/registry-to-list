import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../registry-model.js',import.meta.url),'utf8'),context);const M=context.RegistryModel;
const row=(order,reg,name='',share='1/100',extra='')=>`（${String(order).padStart(4,'0')}）登記次序：${reg}\n登記原因：繼承\n原因發生日期：民國110年12月25日\n${name?'所有權人：'+name+'\n':''}權利範圍：${share}\n其他登記事項：${extra}\n`;

test('120 registration skeletons survive missing raster names and OCR response order',()=>{
 const blocks=Array.from({length:120},(_,i)=>row(i+1,String(i+200).padStart(4,'0'),i===93||i===98?'':'測試甲'));
 blocks[93]=row(94,'0172','','公同共有1/50','主登記次序0142、0158、0172～0176公同共有');
 blocks[98]=row(99,'0177','','1/200');
 const direct=M.parseOwners(blocks.join(''));
 assert.equal(direct.length,120);assert.equal(direct[93].name,'');
 const ocr=M.parseOwners(row(99,'0177','同一人乙','1/200')+row(94,'0172','同一人乙','公同共有1/50','主登記次序0142、0158、0172～0176公同共有'));
 const merged=M.reconcile(direct,ocr);
 assert.equal(merged.length,120);assert.equal(merged[93].name,'同一人乙');assert.equal(merged[98].name,'同一人乙');
 assert.equal(merged[93].registrationSequence,'0172');assert.equal(merged[98].registrationSequence,'0177');
 assert.equal(merged[93].common,true);assert.equal(merged[98].common,false);
});
test('explicit references link nonadjacent members across different dates',()=>{
 const refs=['0142','0158','0172','0173','0174','0175','0176'];
 const items=refs.map((reg,i)=>({...M.parseOwners(row(i+1,reg,'共有人甲','公同共有1/50','主登記次序１４２、１５８、１７２～１７６公同共有'))[0],date:i===0?'民國103.07.13':i===1?'民國109.11.10':'民國110.12.25',documentKey:'doc'}));
 items.splice(1,0,{name:'一般持分甲',numerator:'49',denominator:'50',date:'民國099.01.01'});
 const grouped=M.groupOwners(items),s=M.summary(grouped,100);
 assert.equal(grouped[0].commonGroup,grouped[2].commonGroup);assert.equal(s.groups.length,1);
 assert.equal(s.groups[0].memberCount,7);assert.equal(s.groups[0].expectedCount,7);assert.equal(s.balanced,true);
 assert.equal(grouped[1].name,'一般持分甲');
 const missing=M.summary(grouped.filter(o=>o.registrationSequence!=='0172'),100);
 assert.equal(missing.percent,'100.0000');assert.equal(missing.balanced,false);assert.match(missing.groups[0].status,/0172/);
});
test('date grammar removes trailing seals and validates actual calendar dates',()=>{
 assert.equal(M.date('民國056年07月06日 50'),'民國056.07.06');
 assert.equal(M.date('民國074縣年11月25日'),'民國074.11.25');
 assert.equal(M.date('民國113年02月29日'),'民國113.02.29');
 for(const x of ['民國112年02月29日','民國114.13.01','民國056.07.0650','非日期'])assert.equal(M.date(x),'');
 assert.equal(M.reason('買賣 03'),'買賣');
});
test('address boundaries exclude headers, managers, adjacent owner fields and seals',()=>{
 assert.equal(M.address('測試縣測試鄉中山路62之1號\n測試鄉石光段0503-0000地號11時02'),'測試縣測試鄉中山路62之1號');
 assert.equal(M.address('測試縣測試鄉中山路62之1號測試鄉石光段0503-0000地號11時02'),'測試縣測試鄉中山路62之1號');
 assert.equal(M.address('測試市三民巷17之1號 管理者：甲\n住址：別的地址'),'測試市三民巷17之1號');
 assert.equal(M.address('測試市開封街66之5號OC'),'測試市開封街66之5號');
 assert.equal(M.address('測試市中山路1號*******'),'測試市中山路1號');
});
test('related rights references do not create an additional owner skeleton',()=>{
 const source=row(1,'0142','甲','1/2')+'相關他項權利登記次序：0002-000\n'+row(2,'0158','乙','1/2');
 assert.equal(M.parseOwners(source).length,2);
});
test('large integer fractions are totaled exactly and invalid shares do not report completeness',()=>{
 const a='90071992547409931234567890';
 const s=M.summary([{name:'甲',address:'地址甲',numerator:a,denominator:(BigInt(a)*2n).toString()},{name:'乙',address:'地址乙',numerator:'1',denominator:'2'}],100);
 assert.equal(s.totalFraction,'1/1');assert.equal(s.balanced,true);
 const invalid=M.summary([{name:'甲',numerator:'1',denominator:'06'}],100);assert.equal(invalid.complete,false);
});
test('manager address is separate and cannot replace an explicitly blank owner address',()=>{
 const direct=M.parseOwners('（0001）登記次序：0008\n所有權人：測試法人\n住址：（空白）\n管理者：測試管理機關\n統一編號：12345678\n住址：管理者測試路2號\n權利範圍：1/1');
 assert.equal(direct[0].address,'');assert.equal(direct[0].addressExplicitBlank,true);
 assert.equal(direct[0].manager,'測試管理機關');assert.equal(direct[0].managerAddress,'管理者測試路2號');
 const result=M.reconcile(direct,[{...direct[0],address:'錯誤帶入管理者地址'}]);assert.equal(result[0].address,'');
 const summary=M.summary(result,100);assert.equal(summary.managers.length,1);assert.equal(summary.managers[0].address,'管理者測試路2號');
});
test('truncated address is flagged without guessing a missing house-number suffix',()=>{
 const s=M.summary([{name:'測試甲',address:'測試市中山路335',numerator:'1',denominator:'1'}],100);
 assert.ok(s.issues.some(x=>x.includes('門牌結尾')));assert.equal(M.address('測試市中山路335'),'測試市中山路335');
});
