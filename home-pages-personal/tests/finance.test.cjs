"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { VaultStore } = require("../src/personal/data/store");
const { DEFAULTS, dateKey } = require("../src/personal/data/model");
const { FinanceStore, amountToCents, MAX_CENTS } = require("../src/personal/data/finance-store");
class Vault {
  constructor() { this.files = new Map(); this.fail = false; this.createAcknowledgementFails = false; this.writes = 0; }
  getAbstractFileByPath(path) { return this.files.get(path) || null; }
  async createFolder(path) { if (this.fail) throw Error("disk full"); if (this.files.has(path)) throw Error("exists"); this.files.set(path, { path, children: [] }); this.writes++; }
  async create(path, content) { if (this.fail) throw Error("disk full"); if (this.files.has(path)) throw Error("exists"); const file = { path, content }; this.files.set(path, file); this.writes++; if(this.createAcknowledgementFails) {this.createAcknowledgementFails = false; throw Error("lost acknowledgement");} return file; }
  async read(file) { return file.content; }
  async process(file, fn) { const original = file.content; await new Promise(resolve => setTimeout(resolve, 1)); const next = fn(original); if (this.fail) throw Error("disk full"); file.content = next; this.writes++; return next; }
}
function fixture() { const vault = new Vault(), store = new VaultStore(vault, { ...DEFAULTS }), finance = new FinanceStore(store); return { vault, store, finance }; }
const entry = { id: "meal", type: "expense", amount: "19.99", currency: "CNY", date: "2026-10-03", category: "餐饮", note: "午餐" };
const subscription = { id: "obsidian", name: "订阅服务", amount: "30.00", currency: "CNY", cycle: "monthly", nextDue: "2025-01-31", remindDays: 3, active: true };

test("read-only empty load creates nothing and returns independent snapshots", async () => {
  const { vault, finance } = fixture(); const state = await finance.load(); assert.deepEqual(state, { version: 1, entries: [], subscriptions: [] }); state.entries.push({ bogus: true });
  assert.equal((await finance.load()).entries.length, 0); assert.equal(vault.writes, 0); assert.equal(vault.files.size, 0);
});
test("decimal amounts use exact integer cents, reject non-finite, precision and bounds errors", () => {
  for (const [input, cents] of [["0.01",1],[0.1,10],["19.99",1999],[".50",50],["1.",100],[" 001.20 ",120],[1000000000,MAX_CENTS]]) assert.equal(amountToCents(input), cents);
  for (const input of [0,-1,"-0.01",Infinity,NaN,"NaN","1e3",true,null,"",{},"0.001",1.234,"1000000000.01","9".repeat(500)]) assert.throws(() => amountToCents(input));
});
test("entries update by id, persist cents, summarize one month and archive softly", async () => {
  const { finance } = fixture(); const saved = await finance.saveEntry(entry); assert.equal(saved.amount,1999);
  await finance.saveEntry({ ...entry, id:"salary", type:"income", amount:100 }); await finance.saveEntry({ ...entry, id:"old", date:"2026-09-30", amount:60 });
  assert.deepEqual(await finance.summary("2026-10"),{income:10000,expense:1999,balance:8001});
  await finance.saveEntry({ ...entry, amount:20.01 }); assert.equal((await finance.load()).entries.length,3); assert.equal((await finance.summary("2026-10")).expense,2001);
  await finance.archiveEntry("meal"); await finance.archiveEntry("meal"); assert.equal((await finance.load()).entries.find(item=>item.id==="meal").archived,true); assert.equal((await finance.summary("2026-10")).expense,0);
  await assert.rejects(finance.saveEntry(entry),/已归档/); await assert.rejects(finance.archiveEntry("missing"),/不存在/);
});
test("invalid dates and input types do not create a finance file", async () => {
  const { vault, finance } = fixture();
  for (const date of ["2026-02-29","2025-04-31","2026-13-01","26-01-01","2026-01-32",""]) await assert.rejects(finance.saveEntry({...entry,date}),/日期/);
  for(const change of [{type:"other"},{currency:"USD"},{amount:-1},{note:{}},{id:"../bad"}])await assert.rejects(finance.saveEntry({...entry,...change}));
  for(const month of ["2026-13","2026-1","bad",null])await assert.rejects(finance.summary(month));
  assert.equal(vault.files.size,0);
});
test("concurrent operations across separate stores sharing one vault preserve every entry", async () => {
  const { vault, store, finance } = fixture(); const second = new FinanceStore(new VaultStore(vault,{...DEFAULTS}));
  await Promise.all(Array.from({length:40},(_,i)=>(i%2?finance:second).saveEntry({...entry,id:`entry-${i}`,amount:"0.01"})));
  assert.equal((await finance.load()).entries.length,40); assert.equal((await finance.summary("2026-10")).expense,40);
  assert.equal(await store.read(`${DEFAULTS.legacyFolder}/配置/workbench.json`),"");
});
test("writes preserve unrelated files and unknown finance metadata", async () => {
  const { vault, finance } = fixture(); await finance.saveEntry(entry); const file=vault.getAbstractFileByPath(finance.path),state=JSON.parse(file.content);state.custom={keep:"原样"};state.entries[0].customEntry="保留";file.content=JSON.stringify(state);
  const unrelated=await vault.create(`${DEFAULTS.legacyFolder}/配置/workbench.json`,'{"keep":"all"}'); await finance.saveEntry({...entry,amount:"20"});
  assert.equal((await finance.load()).custom.keep,"原样");assert.equal((await finance.load()).entries[0].customEntry,"保留");assert.equal(unrelated.content,'{"keep":"all"}');
});
test("invalid JSON, malformed schema and duplicate IDs fail closed without rewriting", async () => {
  for(const broken of ["{broken","",JSON.stringify({version:2,entries:[],subscriptions:[]}),JSON.stringify({version:1,entries:{},subscriptions:[]}),JSON.stringify({version:1,entries:[{...entry,amount:19.99}],subscriptions:[]})]) {
    const { vault, finance }=fixture();const file=await vault.create(finance.path,broken),writes=vault.writes;await assert.rejects(finance.load());await assert.rejects(finance.saveEntry(entry));assert.equal(file.content,broken);assert.equal(vault.writes,writes);
  }
  const {vault,finance}=fixture();await finance.saveEntry(entry);const file=vault.getAbstractFileByPath(finance.path),state=JSON.parse(file.content);state.entries.push({...state.entries[0]});file.content=JSON.stringify(state);await assert.rejects(finance.load(),/重复标识/);
});
test("write failures leave old contents and a failed operation does not poison the queue", async () => {
  const { vault, finance } = fixture(); vault.fail=true;await assert.rejects(finance.saveEntry(entry),/disk full/);vault.fail=false;await finance.saveEntry(entry);
  const file=vault.getAbstractFileByPath(finance.path),original=file.content;vault.fail=true;await assert.rejects(finance.saveEntry({...entry,amount:100}),/disk full/);assert.equal(file.content,original);
  vault.fail=false;await finance.saveEntry({...entry,id:"after",amount:1});assert.equal((await finance.load()).entries.length,2);
});
test("creation acknowledgement loss retries without a duplicate entry", async () => {
  const {vault,finance}=fixture();vault.createAcknowledgementFails=true;await finance.saveEntry(entry);await finance.saveEntry(entry);assert.equal((await finance.load()).entries.length,1);
});
test("monthly billing preserves January 31 through February and later edits", async () => {
  const { finance }=fixture();await finance.saveSubscription(subscription);let paid=await finance.paySubscription("obsidian","2025-01-31");assert.equal(paid.subscription.nextDue,"2025-02-28");assert.equal(paid.subscription.billingDay,31);assert.equal(paid.entry.date,dateKey());assert.equal(paid.entry.amount,3000);assert.equal(paid.entry.cycleId,"obsidian:2025-01-31");
  await finance.saveSubscription({...subscription,nextDue:"2025-02-28",amount:31});paid=await finance.paySubscription("obsidian","2025-02-28");assert.equal(paid.subscription.nextDue,"2025-03-31");assert.equal(paid.entry.amount,3100);
  assert.equal((await finance.paySubscription("obsidian","2025-03-31")).subscription.nextDue,"2025-04-30");assert.equal((await finance.paySubscription("obsidian","2025-04-30")).subscription.nextDue,"2025-05-31");
});
test("quarterly and yearly leap-day recurrence keep their original anchor", async () => {
  const { finance }=fixture();await finance.saveSubscription({...subscription,id:"q",cycle:"quarterly"});assert.equal((await finance.paySubscription("q","2025-01-31")).subscription.nextDue,"2025-04-30");assert.equal((await finance.paySubscription("q","2025-04-30")).subscription.nextDue,"2025-07-31");
  await finance.saveSubscription({...subscription,id:"year",cycle:"yearly",nextDue:"2024-02-29"});for(const [due,next]of[["2024-02-29","2025-02-28"],["2025-02-28","2026-02-28"],["2026-02-28","2027-02-28"],["2027-02-28","2028-02-29"]])assert.equal((await finance.paySubscription("year",due)).subscription.nextDue,next);
});
test("weekly crosses month and year, one-time payment disables reminders", async () => {
  const {finance}=fixture();await finance.saveSubscription({...subscription,id:"week",cycle:"weekly",nextDue:"2025-12-29"});assert.equal((await finance.paySubscription("week","2025-12-29")).subscription.nextDue,"2026-01-05");
  await finance.saveSubscription({...subscription,id:"once",cycle:"once"});const first=await finance.paySubscription("once","2025-01-31");assert.equal(first.subscription.active,false);assert.equal((await finance.paySubscription("once","2025-01-31")).alreadyPaid,true);assert.equal((await finance.due("2026-01-01")).some(item=>item.id==="once"),false);
});
test("a paid billing cycle is atomic, idempotent across concurrency, later payments and archival", async () => {
  const {vault,finance}=fixture();await finance.saveSubscription(subscription);const other=new FinanceStore(new VaultStore(vault,{...DEFAULTS}));
  const results=await Promise.all([finance.paySubscription("obsidian","2025-01-31"),other.paySubscription("obsidian","2025-01-31"),finance.paySubscription("obsidian","2025-01-31")]);assert.equal(results.filter(item=>!item.alreadyPaid).length,1);assert.equal((await finance.load()).entries.length,1);
  await finance.paySubscription("obsidian","2025-02-28");const retry=await finance.paySubscription("obsidian","2025-01-31");assert.equal(retry.subscription.nextDue,"2025-03-31");assert.equal((await finance.load()).entries.length,2);
  await finance.archiveEntry(retry.entry.id);await finance.archiveSubscription("obsidian");assert.equal((await finance.paySubscription("obsidian","2025-01-31")).alreadyPaid,true);await assert.rejects(finance.paySubscription("obsidian","2025-03-31"),/停用或归档/);assert.equal((await finance.load()).entries.length,2);
});
test("failed renewal changes neither expense ledger nor next due date", async () => {
  const { vault, finance }=fixture();await finance.saveSubscription(subscription);const file=vault.getAbstractFileByPath(finance.path),content=file.content;vault.fail=true;await assert.rejects(finance.paySubscription("obsidian","2025-01-31"),/disk full/);assert.equal(file.content,content);
  vault.fail=false;await finance.paySubscription("obsidian","2025-01-31");assert.equal((await finance.load()).entries.length,1);await assert.rejects(finance.paySubscription("obsidian","2025-01-30"),/账期已改变/);
});
test("lost renewal acknowledgement is safely retryable and malformed reminder metadata fails closed", async () => {
  const {vault,finance}=fixture();await finance.saveSubscription(subscription);const process=vault.process.bind(vault);let first=true;
  vault.process=async(...args)=>{const result=await process(...args);if(first){first=false;throw Error("lost acknowledgement");}return result;};
  await assert.rejects(finance.paySubscription("obsidian","2025-01-31"),/lost acknowledgement/);const retry=await finance.paySubscription("obsidian","2025-01-31");assert.equal(retry.alreadyPaid,true);assert.equal(retry.subscription.nextDue,"2025-02-28");assert.equal((await finance.load()).entries.length,1);
  const file=vault.getAbstractFileByPath(finance.path),state=JSON.parse(file.content);delete state.subscriptions[0].remindDays;file.content=JSON.stringify(state);const original=file.content;await assert.rejects(finance.due(),/提前提醒天数/);await assert.rejects(finance.saveEntry(entry),/提前提醒天数/);assert.equal(file.content,original);
});
test("reminder window uses calendar days, includes overdue and excludes paused or archived", async () => {
  const {finance}=fixture();for(const [id,nextDue,remindDays,active]of[["late","2026-09-29",3,true],["today","2026-10-03",0,true],["soon","2026-10-06",3,true],["later","2026-10-07",3,true],["paused","2026-10-01",3,false]])await finance.saveSubscription({...subscription,id,nextDue,remindDays,active});
  const due=await finance.due("2026-10-03");assert.deepEqual(due.map(item=>[item.id,item.daysUntil,item.overdue]),[["late",-4,true],["today",0,false],["soon",3,false]]);await finance.archiveSubscription("late");assert.equal((await finance.due("2026-10-03")).length,2);
});
test("subscription validation, changed billing dates, long IDs and maximum date boundary", async () => {
  const {finance}=fixture();for(const patch of [{cycle:"daily"},{nextDue:"2026-02-30"},{remindDays:1.5},{remindDays:-1},{remindDays:366},{name:""},{active:"true"},{url:"javascript:alert(1)"},{url:"https://user:password@example.com"}])await assert.rejects(finance.saveSubscription({...subscription,...patch}));
  await finance.saveSubscription(subscription);await finance.saveSubscription({...subscription,nextDue:"2025-02-20"});assert.equal((await finance.paySubscription("obsidian","2025-02-20")).subscription.nextDue,"2025-03-20");
  const longId="a".repeat(200);await finance.saveSubscription({...subscription,id:longId});assert.ok((await finance.paySubscription(longId,"2025-01-31")).entry.id.length>200);
  await finance.saveSubscription({...subscription,id:"last",nextDue:"9999-12-31"});const before=(await finance.load()).entries.length;await assert.rejects(finance.paySubscription("last","9999-12-31"),/下一账期/);assert.equal((await finance.load()).entries.length,before);
});
