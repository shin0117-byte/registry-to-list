import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const c=vm.createContext({document:{querySelector:()=>({children:[],addEventListener(){}})},localStorage:{getItem:()=>null},refreshCloudSetup(){}});
for(const file of ['registry-model.js','app.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
const localities=JSON.parse(fs.readFileSync(new URL('../localities.json',import.meta.url),'utf8')),roads=JSON.parse(fs.readFileSync(new URL('../roads.json',import.meta.url),'utf8'));
test('US Texas Victoria address retains country and state prefix shown in source transcript',()=>{
 const original='美國德州維多利亞市櫻桃石圓環505號';
 assert.equal(c.extractAddress(original,'苗栗縣通霄鎮',localities,roads),original);
 assert.equal(c.extractAddress('住址：美國德州維多利亞市\n櫻桃石圓環505號','苗栗縣通霄鎮',localities,roads),original);
 assert.equal(c.selectBestAddress(original,'多利亞市櫻桃石圓環505號'),original);
 assert.equal(c.selectBestAddress('USA505CHERRYSTONECIR,VICTORIATX77904','VICTORIATX77904'),'USA505CHERRYSTONECIR,VICTORIATX77904');
});
test('foreign addresses bypass Taiwan locality aliases even when overseas place names overlap',()=>{
 const database={aliases:{三芝區:'錯誤行政區'},localities:[{name:'三芝區',county:'新北市'}]};
 assert.equal(c.extractAddress('美國德州三芝區測試街1號','新北市三芝區',database,{sites:{}}),'美國德州三芝區測試街1號');
 for(const original of ['加拿大卑詩省維多利亞市測試街8號','日本東京都新宿區測試町2號','未列國名的維多利亞市測試街3號'])assert.equal(c.extractAddress(original,'苗栗縣通霄鎮',localities,roads),original);
});
test('Taiwan locality completion and known county prefixes continue to normalize',()=>{
 const db={localities:[{name:'三芝區',county:'新北市'}],aliases:{}};
 assert.equal(c.extractAddress('三芝區測試路1號','新北市三芝區',db,{sites:{}}),'新北市三芝區測試路1號');
 assert.equal(c.extractAddress('住址：臺北市大安區測試路1號','苗栗縣通霄鎮',{localities:[],aliases:{}},{sites:{}}),'臺北市大安區測試路1號');
});
