import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const c=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../registry-model.js',import.meta.url),'utf8'),c);const M=c.RegistryModel;
test('inheritance note keeps listing start date rather than government letter date',()=>{
 const raw='未辦繼承登記，列冊管理：依據測試縣政府１０３年７月１日府地籍字第123號函准自１０３年７事月４日起由測試縣政府列冊管理期間為15年。';
 assert.equal(M.compactNote(raw),'未辦繼承列冊（民國103.07.04）');
 assert.equal(M.compactNote('108.7.22未辦繼承列冊'),'未辦繼承列冊（民國108.07.22）');
});
test('seizure note uses receipt date and excludes court letter, debtors and scope',()=>{
 const raw='（限制登記事項）９３年４月８日收件測登字第20860號依測試地方法院９３年４月９日法院字第243號函辦理假扣押查封登記 債權人：測試銀行 債務人：張完整 限制範圍：1/96 93年4月10日登記';
 assert.equal(M.compactNote(raw),'查封登記（收件：民國093.04.08）');
 assert.equal(M.debtorName(raw),'張完整');
 assert.equal(M.compactNote('（限制登記事項）查封登記；收件日期：民國093年04月08日'),'查封登記（收件：民國093.04.08）');
});
test('combined notes retain separate mortgage records and common group, and normalize idempotently',()=>{
 const raw='未辦繼承列冊：民國103年07月04日；抵押權（登記次序：0002-000；金額：新臺幣300,000元）；公同共有（共1）';
 const result=M.compactNote(raw);assert.equal(result,'未辦繼承列冊（民國103.07.04）；抵押權（登記次序：0002-000；金額：新臺幣300,000元）；公同共有（共1）');
 assert.equal(M.compactNote(result),result);
 assert.equal(M.compactNote('查封登記（收件：民國093.04.08）'),'查封登記（收件：民國093.04.08）');
});
test('missing or invalid dates are not replaced with other dates or fabricated values',()=>{
 assert.equal(M.compactNote('未辦繼承列冊'),'未辦繼承列冊');
 assert.equal(M.compactNote('查封登記，民國093年04月08日登記'),'查封登記');
 assert.equal(M.compactNote('未辦繼承列冊：民國115年02月30日'),'未辦繼承列冊');
});
