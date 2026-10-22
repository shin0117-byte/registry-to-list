import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const c=vm.createContext({document:{querySelector:()=>({children:[],addEventListener(){}})},localStorage:{getItem:()=>null},refreshCloudSetup(){}});
vm.runInContext(fs.readFileSync(new URL('../registry-model.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),c);
const owner=(order,reg,refs='')=>`（${order}）登記次序：${reg}\n所有權人：測試＊＊\n統一編號：A123****89\n住址：測試縣測試鄉測試路1號\n權利範圍：1/2\n登記原因：繼承\n原因發生日期：民國110年01月01日\n相關他項權利登記次序：${refs}\n其他登記事項：未辦繼承列冊管理\n`;
const mortgage=(order,reg,amount,target,kind='抵押權')=>`（${order}）登記次序：${reg} 權事利種類：${kind}\n權 利 人：測試銀行\n擔保債權總金額：${amount}\n存續期間：民國115年至135年\n標的登記次序：${target}\n設定權利範圍：1/2\n其他登記事項：（空白）\n`;
const transcript=(rights,refs='0002-000 0003-000')=>'土地所有權部\n'+owner('0001','0002',refs)+owner('0002','0006')+'土地他項權利部\n'+rights;
const two=mortgage('0001','0002-000','新台幣*****300,000元正','0002 60\n地')+mortgage('0002','0003-000','本金最高限額新台幣****4,000,000元正','0002');
test('mortgages attach only to target ownership, retaining existing notes and only sequence plus amount',()=>{
 const rows=c.parsedOwners(transcript(two));assert.equal(rows.length,2);
 assert.equal(rows[0].mortgages.length,2);assert.equal(rows[1].mortgages.length,0);
 assert.match(rows[0].review.join('；'),/未辦繼承列冊/);
 assert.match(rows[0].review.join('；'),/抵押權（登記次序：0002-000；金額：新臺幣300,000元）/);
 assert.match(rows[0].review.join('；'),/0003-000；金額：本金最高限額新臺幣4,000,000元/);
 assert.doesNotMatch(rows[0].review.join('；'),/測試銀行|民國115年至/);
 assert.ok(rows[0].review.every(c.isBusinessNote));assert.ok(!rows[1].review.some(x=>x.includes('抵押權')));
 assert.equal(c.otherRightsNotes(transcript(two)).length,0);
});
test('related rights link missing targets and amount formatting keeps maximum limit and decimals',()=>{
 const text=transcript(mortgage('0001','0002-000','新台幣１２３４５６７.８９元正','','最高限額抵押權'));
 const row=c.parsedOwners(text)[0];assert.equal(row.mortgages[0].amount,'最高限額新臺幣1,234,567.89元');
 assert.equal(row.review.find(note=>note.startsWith('最高限額抵押權（')),'最高限額抵押權（登記次序：0002-000；金額：最高限額新臺幣1,234,567.89元）');
 const merged=c.reconcileOwners([row],[row]);assert.equal(merged[0].review.filter(note=>note.includes('抵押權（')).length,1);
});
test('PDF mortgage values win OCR; missing amount alone can fall back and no duplicate notes appear',()=>{
 const direct=c.parsedOwners(transcript(two)),ocr=c.parsedOwners(transcript(two.replace('300,000','900,000')));
 const merged=c.reconcileOwners(direct,ocr);assert.equal(merged[0].mortgages[0].amount,'新臺幣300,000元');
 assert.equal(merged[0].review.filter(n=>n.startsWith('抵押權（')).length,2);
 const missing=c.parsedOwners(transcript(two.replace('新台幣*****300,000元正','（空白）')));
 assert.equal(c.reconcileOwners(missing,direct)[0].mortgages[0].amount,'新臺幣300,000元');
});
test('OCR cannot add an unrelated mortgage to an owner excluded by complete PDF rights data',()=>{
 const direct=c.parsedOwners(transcript(two));
 const wrong=c.parsedOwners(transcript(mortgage('0001','0099-000','新台幣999元','0006')));
 const merged=c.reconcileOwners(direct,wrong);assert.equal(merged[1].mortgages.length,0);
 assert.ok(!merged[1].review.some(note=>note.includes('0099-000')));
 direct[1].review=[];assert.ok(!c.reconcileOwners(direct,wrong)[1].review.some(note=>note.includes('0099-000')));
});
test('multi-page document and documents with identical registration sequences stay isolated',()=>{
 const rights=two.replace('擔保債權總金額：新台幣*****300,000元正','擔保債權總金額：\n新台幣*****300,000元正');
 const pages=[{fileKey:'a',pageKey:'a1',directText:transcript('').split('土地他項權利部')[0]},{fileKey:'a',pageKey:'a2',directText:'土地他項權利部\n'+rights},{fileKey:'b',pageKey:'b1',directText:'土地所有權部\n'+owner('0001','0002')}];
 const rows=c.reconcileDocumentPages(pages,[]);assert.equal(rows.length,3);
 assert.equal(rows[0].mortgages.length,2);assert.equal(rows[2].mortgages.length,0);
});
