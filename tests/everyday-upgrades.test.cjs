"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {VaultStore}=require('../home-pages-personal/src/personal/data/store');
const {DEFAULTS}=require('../home-pages-personal/src/personal/data/model');
const {FinanceStore}=require('../home-pages-personal/src/personal/data/finance-store');
const {overview,schedule,calendar}=require('../home-pages-personal/src/personal/data/finance-overview');
const {DraftStore}=require('../home-pages-personal/src/personal/data/draft-store');
class Vault {
 constructor(){this.files=new Map();this.fail=false;}
 getAbstractFileByPath(path){return this.files.get(path)||null;}
 getFiles(){return [...this.files.values()].filter(f=>!f.children);}
 async createFolder(path){if(this.files.has(path))throw Error('exists');this.files.set(path,{path,children:[]});}
 async create(path,content){if(this.fail)throw Error('disk full');if(this.files.has(path))throw Error('exists');const f={path,content};this.files.set(path,f);return f;}
 async read(file){return file.content;}
 async process(file,fn){if(this.fail)throw Error('disk full');const next=fn(file.content);file.content=next;return next;}
}
const sub={id:'demo',name:'阅读服务',amount:3000,cycle:'monthly',nextDue:'2026-01-31',billingDay:31,billingMonth:1,remindDays:3,active:true};
test('forecast includes today, repeats weekly, excludes paused/archived and preserves month-end anchor',()=>{
 const items=[sub,{...sub,id:'weekly',cycle:'weekly',nextDue:'2026-01-31',amount:1000},{...sub,id:'once',cycle:'once',amount:200},{...sub,id:'paused',active:false},{...sub,id:'archived',archived:true}];
 const view=overview(items,'2026-01-31');assert.equal(view.seven,4200);assert.equal(view.thirty,11200);assert.equal(view.monthly,7333);
 assert.deepEqual(schedule([sub],'2026-01-31',90).map(s=>s.date),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
 const late=overview([sub],'2026-02-02');assert.equal(late.overdue,3000);assert.equal(late.seven,0);assert.equal(late.thirty,3000);
});
test('calendar emits stable dated events, alarms, escaped text and UTF-8 lines up to 75 bytes',()=>{
 const value={...sub,name:'阅读;服务,\\提醒\n'+('中文'.repeat(40))};
 const output=calendar([value],'2026-01-31','2026-01-01T00:00:00.000Z');
 assert.match(output,/DTSTART:20260228T090000/);assert.match(output,/DTSTART:20260331T090000/);assert.match(output,/TRIGGER:-P3D/);assert.match(output,/UID:demo-2026-01-31@personal-launchpad/);
 assert.ok(output.endsWith('\r\n'));for(const line of output.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
 const unfolded=output.replace(/\r\n /g,'');assert.ok(unfolded.includes('阅读\\;服务\\,\\\\提醒\\n'));
 assert.ok(!output.includes('undefined'));assert.equal((output.match(/BEGIN:VEVENT/g)||[]).length,12);
});
test('restoring a ledger entry affects totals once; subscription restores paused without new payments',async()=>{
 const vault=new Vault(),store=new VaultStore(vault,{...DEFAULTS}),finance=new FinanceStore(store);
 await finance.saveEntry({id:'meal',type:'expense',amount:'12.34',date:'2026-10-04',category:'餐饮'});await finance.archiveEntry('meal');assert.equal((await finance.summary('2026-10')).expense,0);
 vault.fail=true;await assert.rejects(finance.restoreEntry('meal'));vault.fail=false;assert.equal((await finance.summary('2026-10')).expense,0);
 await finance.restoreEntry('meal');await finance.restoreEntry('meal');assert.equal((await finance.summary('2026-10')).expense,1234);
 await finance.saveSubscription({...sub,amount:'30'});await finance.archiveSubscription('demo');await finance.restoreSubscription('demo');const state=await finance.load();assert.equal(state.subscriptions[0].active,false);assert.equal(state.entries.length,1);
 await finance.saveSubscription({...sub,amount:'30',active:true});await finance.restoreSubscription('demo');assert.equal((await finance.load()).subscriptions[0].active,true);
});
test('drafts stay separate per device, serialize same-device writes and retain files on failure or corruption',async()=>{
 const vault=new Vault(),store=new VaultStore(vault,{...DEFAULTS}),a=new DraftStore(store,'device-a','电脑'),b=new DraftStore(store,'device-b','手机');
 await Promise.all([a.save('capture',{text:'电脑草稿',kind:'thought'}),b.save('capture',{text:'手机草稿',kind:'thought'})]);assert.equal((await a.list()).items.length,2);
 await Promise.all([a.save('capture',{text:'第一版',kind:'thought'}),a.save('capture',{text:'第二版',kind:'thought'})]);assert.equal((await a.list()).items.find(v=>v.device==='device-a').text,'第二版');
 vault.fail=true;await assert.rejects(a.save('capture',{text:'失败修改'}));vault.fail=false;assert.equal((await a.list()).items.find(v=>v.device==='device-a').text,'第二版');
 await a.save('capture',{text:'',kind:'thought'});assert.equal((await b.list()).items.length,1);
 const path=(await b.list()).items[0].path,file=vault.getAbstractFileByPath(path);file.content='invalid json';await assert.rejects(b.save('capture',{text:'禁止覆盖'}));assert.equal(file.content,'invalid json');assert.equal((await a.list()).unreadable,1);
});
