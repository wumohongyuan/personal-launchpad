"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { VaultStore } = require("../home-pages-personal/src/personal/data/store");
const { DEFAULTS, settingsFrom, fileTitle, blockFor, validDate, shiftDate, weekStart } = require("../home-pages-personal/src/personal/data/model");
class FakeVault {
  constructor() { this.files = new Map(); this.fail = false; }
  getAbstractFileByPath(path) { return this.files.get(path) || null; }
  getMarkdownFiles() { return [...this.files.values()].filter(f => f.extension === "md"); }
  async createFolder(path) { if(this.files.has(path)) throw Error("exists"); this.files.set(path,{path,children:[]}); }
  async create(path,content) { if(this.fail) throw Error("disk full"); if(this.files.has(path)) throw Error("exists"); const f = {path,content,extension:path.split(".").pop(),basename:path.split("/").pop().replace(/\.md$/,""),stat:{mtime:1}}; this.files.set(path,f); return f; }
  async read(file) { return file.content; }
  async cachedRead(file) { return file.content; }
  async process(file,fn) { if(this.fail) throw Error("disk full"); file.content = fn(file.content); return file.content; }
}
function fixture() { const vault = new FakeVault(); return {vault,store:new VaultStore(vault,{...DEFAULTS})}; }
test("concurrent captures retain all 20 entries",async () => {
  const {store} = fixture(); await Promise.all(Array.from({length:20},(_,i) => store.capture(`记录 ${i}`,"thought","2026-10-02",`entry-${i}`))); assert.equal((await store.day("2026-10-02")).entries.length,20);
});
test("same submission retry is idempotent",async () => {
  const {store} = fixture(); await store.capture("想法","thought","2026-10-02","one"); await store.capture("想法","thought","2026-10-02","one"); assert.equal((await store.day("2026-10-02")).entries.length,1);
});
test("append preserves user-authored frontmatter and diary",async () => {
  const {vault,store} = fixture(); const before = "---\ntags: [日记]\n---\n# 原来的日记\n\n自己写下的文字。\n"; await vault.create(store.dailyPath("2026-10-02"),before); await store.capture("新记录","diary","2026-10-02","new"); assert.ok((await store.read(store.dailyPath("2026-10-02"))).startsWith(before.trimEnd()));
});
test("failed write does not poison subsequent writes",async () => {
  const {vault,store} = fixture(); vault.fail=true; await assert.rejects(store.capture("保留我","thought","2026-10-02","retry"),/disk full/); assert.equal((await store.day("2026-10-02")).entries.length,0); vault.fail=false; await store.capture("保留我","thought","2026-10-02","retry"); assert.equal((await store.day("2026-10-02")).entries.length,1);
});
test("multiline tasks round trip literal replacement tokens",async () => {
  const {store} = fixture(); await store.capture("计划\n第二行 $& $'","task","2026-10-02","task-1"); let entry=(await store.day("2026-10-02")).entries[0]; assert.equal(entry.text,"计划\n第二行 $& $'"); await store.updateEntry(entry,{done:true,text:"修改 $& $$ 内容"}); entry=(await store.day("2026-10-02")).entries[0]; assert.equal(entry.done,true); assert.equal(entry.text,"修改 $& $$ 内容");
});
test("stale edits do not overwrite external changes",async () => {
  const {vault,store} = fixture(); await store.capture("原文","thought","2026-10-02","conflict"); const entry=(await store.day("2026-10-02")).entries[0]; const file=vault.getAbstractFileByPath(entry.path); file.content=file.content.replace("原文","手机修改"); await assert.rejects(store.updateEntry(entry,{text:"电脑修改"}),/别处修改/); assert.match(file.content,/手机修改/);
});
test("CRLF update retains unrelated text",async () => {
  const {vault,store} = fixture(); const block=blockFor({id:"crlf",kind:"diary",time:"12:00",text:"中文\n换行"}).replace(/\n/g,"\r\n"); await vault.create(store.dailyPath("2026-10-02"),"# 日记\r\n用户内容\r\n"+block); const entry=(await store.day("2026-10-02")).entries[0]; await store.updateEntry(entry,{text:"已更新"}); assert.match(await store.read(entry.path),/用户内容\r\n/);
});
test("legacy flash reading is non-mutating",async () => {
  const {vault,store} = fixture(); const path=`${DEFAULTS.legacyFolder}/闪念/2026-10-02.md`; const content="# 旧闪念\n\n## 09:20 · 闪念\n\n以前写的内容\n\n- 类型：闪念\n- 状态：待整理\n"; await vault.create(path,content); const size=vault.files.size; const day=await store.day("2026-10-02"); assert.equal(day.entries[0].text,"以前写的内容"); assert.equal(day.entries[0].legacy,true); assert.equal(vault.files.size,size); assert.equal(await store.read(path),content);
});
test("knowledge promotion keeps source and backlink; title collision fails closed",async () => {
  const {store} = fixture(); await store.capture("我的理解","thought","2026-10-02","source"); const source=(await store.day("2026-10-02")).entries[0]; const path=await store.createKnowledge({title:"学习/方法",body:source.text,topic:'知识"\n其他',source,id:"knowledge-one"}); const content=await store.read(path); assert.match(content,/#\^pl-source/); assert.equal((await store.day("2026-10-02")).entries.length,1); await assert.rejects(store.createKnowledge({title:"学习 方法",body:"不覆盖",id:"different"}),/同名/); assert.equal(await store.read(path),content);
});
test("knowledge retry does not duplicate",async () => {
  const {store} = fixture(); const data={title:"测试",body:"正文",id:"stable"}; assert.equal(await store.createKnowledge(data),await store.createKnowledge(data)); assert.equal((await store.notes()).items.length,1);
});
test("weekly reviews append snapshots",async () => {
  const {store} = fixture(); const path=await store.saveReview("2026-09-28",["第一次","",""],"review-a"); await store.saveReview("2026-09-28",["第二次","",""],"review-b"); const content=await store.read(path); assert.match(content,/第一次/); assert.match(content,/第二次/);
});
test("invalid paths, filenames and calendar dates rejected",() => {
  for(const path of ["../outside",".obsidian/plugins","/tmp","D:/test","x//y","x/./y"]) assert.throws(() => settingsFrom({dailyFolder:path})); assert.throws(() => fileTitle("CON")); assert.equal(validDate("2026-02-30"),false); assert.equal(shiftDate("2026-12-31",1),"2027-01-01"); assert.equal(weekStart("2026-10-04"),"2026-09-28");
});
test("entry delimiters cannot forge another record",async () => {
  const {store} = fixture(); await assert.rejects(store.capture("<!-- /pl-entry attacker -->","thought","2026-10-02","safe"),/边界/);
});
test("corrupt old config stays untouched",async () => {
  const {vault,store}=fixture(); const path=`${DEFAULTS.legacyFolder}/配置/launchpad.json`; await vault.create(path,"{broken"); await assert.rejects(store.recoverLegacy()); assert.equal(await store.read(path),"{broken"); assert.equal(vault.getMarkdownFiles().length,0);
});
test("legacy recovery includes tasks, books and focus without changing source",async () => {
  const {vault,store}=fixture(); const path=`${DEFAULTS.legacyFolder}/配置/launchpad.json`; const raw=JSON.stringify({books:[{title:"一本书"}],days:{"2026-10-01":{focus:"旧重点",tasks:[{text:"旧任务",done:true}],flashes:[{text:"旧想法",time:"11:00"}]}}}); await vault.create(path,raw); const text=await store.read(await store.recoverLegacy()); for(const word of ["一本书","旧重点","- [x] 旧任务","旧想法"]) assert.ok(text.includes(word)); assert.equal(await store.read(path),raw);
});
test("folder blocked by a file reports an actionable error",async () => {
  const {vault,store}=fixture(); await vault.create("个人成长系统","content"); await assert.rejects(store.capture("内容","thought","2026-10-02","blocked"),/是一个文件/);
});
