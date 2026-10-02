"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {WorkbenchStore,normalize,cleanLayout,clone}=require("../home-pages-personal/src/personal/data/workbench-store");
const {VaultStore}=require("../home-pages-personal/src/personal/data/store");
const {DEFAULTS}=require("../home-pages-personal/src/personal/data/model");
class FakeVault {
  constructor(){this.files=new Map();this.fail=false;}
  getAbstractFileByPath(path){return this.files.get(path)||null;}
  getMarkdownFiles(){return [...this.files.values()].filter(f=>f.extension==="md");}
  async createFolder(path){if(this.files.has(path))throw Error("exists");this.files.set(path,{path,children:[]});}
  async create(path,content){if(this.fail)throw Error("disk full");if(this.files.has(path))throw Error("exists");const file={path,content,extension:path.split(".").pop(),basename:path.split("/").pop().replace(/\.md$/,""),stat:{mtime:1}};this.files.set(path,file);return file;}
  async read(file){return file.content;}
  async cachedRead(file){return file.content;}
  async process(file,fn){if(this.fail)throw Error("disk full");file.content=fn(file.content);return file.content;}
}
function fixture(){const vault=new FakeVault(),store=new VaultStore(vault,{...DEFAULTS}),wb=new WorkbenchStore(store);return {vault,store,wb};}
function oldPath(){return `${DEFAULTS.legacyFolder}/配置/launchpad.json`;}
function flashesPath(date){return `${DEFAULTS.legacyFolder}/闪念/${date}.md`;}
function flashBlock(time,text){return `## ${time} · 闪念\n\n${text}\n\n- 类型：闪念\n- 状态：待整理\n`;}

test("legacy geometry becomes reading order once; optional widgets stay opt-in",()=>{
  const old={order:["tasks","capture","focus"],layout:{capture:{x:5,y:1,w:6.5,h:10},focus:{x:1,y:1,w:4,h:8},tasks:{x:1,y:20,w:8,h:10}},locked:{capture:true},heights:{capture:300},futureOption:{retain:true}};
  const layout=cleanLayout(old);
  assert.deepEqual(layout.order.slice(0,3),["focus","capture","tasks"]);
  assert.equal(layout.widths.capture,7);assert.deepEqual(layout.layout,old.layout);assert.deepEqual(layout.locked,old.locked);assert.deepEqual(layout.futureOption,old.futureOption);
  assert.ok(layout.hidden.includes("habits"));assert.ok(layout.hidden.includes("rediscover"));
  layout.order.reverse();layout.hidden=layout.hidden.filter(id=>id!=="habits");
  const reloaded=cleanLayout(layout);assert.deepEqual(reloaded.order,layout.order);assert.ok(!reloaded.hidden.includes("habits"));assert.ok(reloaded.hidden.includes("rediscover"));
  assert.ok(cleanLayout().hidden.includes("habits"));
});

test("normalization preserves all custom content and unknown fields without clipping",()=>{
  const content="完整正文".repeat(10000),widgets=Array.from({length:55},(_,i)=>({id:`memo-${i}`,title:"长标题".repeat(50),content,ownData:{index:i}}));
  const clean=normalize({dashboard:{customWidgets:widgets},health:{weeklyGoal:0},ownField:{hello:"world"}});
  assert.equal(clean.dashboard.customWidgets.length,55);assert.equal(clean.dashboard.customWidgets[54].content,content);assert.deepEqual(clean.dashboard.customWidgets[3].ownData,{index:3});
  assert.equal(clean.health.weeklyGoal,0);assert.deepEqual(clean.ownField,{hello:"world"});
});

test("missing IDs receive deterministic collision-free IDs; duplicate IDs fail closed",()=>{
  const raw={books:[{id:"book-1",title:"A"},{title:"B"},{id:"book-1-1",title:"C"}],health:{workouts:[{id:"workout-1"},{date:"2026-10-02"}]}};
  const result=normalize(raw);assert.deepEqual(result.books.map(x=>x.id),["book-1","book-1-2","book-1-1"]);assert.equal(result.health.workouts[1].id,"workout-1-1");assert.deepEqual(normalize(result),result);
  for(const bad of [{books:[{id:"a"},{id:"a"}]},{health:{workouts:[{id:"a"},{id:"a"}]}},{dashboard:{customWidgets:[{id:"a"},{id:"a"}]}},{dashboard:{customWidgets:[{id:"capture"}]}}])assert.throws(()=>normalize(bad),/编号/);
});

test("legacy migration preserves source, old plan, task metadata, and writable record IDs",async()=>{
  const {vault,store,wb}=fixture();
  const old={version:10,growth:{startDate:"2026-09-05"},books:[{title:"一本书",notes:"手写资料"}],days:{"2026-09-05":{focus:"老重点",tasks:[{text:"原任务",done:false,sourceFlash:"old|0"}],flashes:[]}},dashboard:{locked:{capture:true}}};
  const before=JSON.stringify(old);await vault.create(oldPath(),before);
  const state=await wb.load();assert.equal(state.growth.planId,"legacy180");assert.equal(state.growth.startDate,"2026-09-05");assert.equal(state.books[0].id,"book-0");assert.equal(vault.getAbstractFileByPath(wb.path),null);
  await wb.change(s=>{s.health.weeklyGoal=4;});const next=await wb.load();assert.equal(next.days["2026-09-05"].tasks[0].sourceFlash,"old|0");assert.equal(next.books[0].notes,"手写资料");assert.equal(next.growth.planId,"legacy180");assert.equal(await store.read(oldPath()),before);
});

test("malformed known fields prevent all writes; empty new config does not revert to old data",async()=>{
  for(const bad of [{books:{}},{books:["lost"]},{days:[]},{days:{"2026-10-02":{tasks:"lost"}}},{health:{workouts:null}},{growth:{externalFeedback:"lost"}},{dashboard:{customWidgets:{content:"lost"}}},{dashboard:{widths:{capture:"nonsense"}}},{habits:{name:"lost"}}]){
    const {vault,store,wb}=fixture(),before=JSON.stringify(bad);await vault.create(wb.path,before);
    await assert.rejects(wb.change(s=>{s.dashboard.title="新标题";}));assert.equal(await store.read(wb.path),before);
  }
  const {vault,store,wb}=fixture();await vault.create(oldPath(),JSON.stringify({books:[{title:"老资料"}]}));await vault.create(wb.path,"");await assert.rejects(wb.load());await assert.rejects(wb.change(()=>{}));assert.equal(await store.read(wb.path),"");
});

test("layout save merges latest unrelated records and rejects a competing layout edit",async()=>{
  const {wb}=fixture(),base=(await wb.load()).dashboard,draft=clone(base);draft.title="我的布局";
  await wb.setItem("books",{id:"book-a",title:"新书"});await wb.saveLayout(draft,base);
  let state=await wb.load();assert.equal(state.books[0].title,"新书");assert.equal(state.dashboard.title,"我的布局");
  const stale=clone(state.dashboard);await wb.change(s=>{s.dashboard.title="手机调整";});
  await assert.rejects(wb.saveLayout({...stale,title:"电脑调整"},stale),/另一处/);assert.equal((await wb.load()).dashboard.title,"手机调整");
});

test("failed write retries cleanly and concurrent changes retain every record",async()=>{
  const {vault,wb}=fixture();vault.fail=true;await assert.rejects(wb.setItem("books",{id:"retry",title:"保留"}),/disk full/);vault.fail=false;
  await wb.setItem("books",{id:"retry",title:"保留"});await wb.setItem("books",{id:"retry",title:"保留"});
  await Promise.all(Array.from({length:10},(_,i)=>wb.setItem("workouts",{id:`session-${i}`,date:"2026-10-02"})));
  const state=await wb.load();assert.equal(state.books.length,1);assert.equal(state.health.workouts.length,10);
  await assert.rejects(wb.setItem("books",{id:"retry",title:"覆盖"}),/编号已经存在/);
});

test("backlog includes old JSON tasks and earlier Markdown tasks with exact update sources",async()=>{
  const {vault,store,wb}=fixture();await vault.create(oldPath(),JSON.stringify({days:{"2026-09-05":{tasks:[{text:"旧待办",done:false},{text:"旧完成",done:true}]}}}));
  await store.capture("昨天未完成","task","2026-10-01","yesterday");await store.capture("今日未完成","task","2026-10-02","today");await store.capture("今日完成","task","2026-10-02","done");
  await store.updateEntry((await store.day("2026-10-02")).entries.find(e=>e.id==="done"),{done:true});
  const limited=await wb.tasks(1);assert.equal(limited.length,1);assert.equal(limited.total,3);assert.equal(limited.limited,true);
  const all=await wb.tasks();assert.equal(all.length,3);const old=all.find(e=>e.legacyTask);assert.equal(old.date,"2026-09-05");assert.equal(old.index,0);assert.equal(old.id,"legacy-task-2026-09-05-0");
  await wb.oldTask(old.date,old.index,true,old.source);assert.equal((await wb.tasks()).length,2);await assert.rejects(wb.oldTask(old.date,old.index,false,old.source),/变更/);
  const modern=(await wb.tasks()).find(e=>e.id==="yesterday");await store.updateEntry(modern,{done:true});assert.equal((await wb.tasks()).length,1);
});

test("thought inbox honors old archive/action status and does not duplicate mirrored records",async()=>{
  const {vault,wb}=fixture(),date="2026-10-01";
  const flashes=[{time:"09:00",text:"已归档",status:"archived"},{time:"09:10",text:"已变行动",status:"actioned"},{time:"09:20",text:"待整理",status:"inbox"},{time:"09:30",text:"仅JSON记录"},{time:"09:40",text:"更旧已行动",type:"待办（已加入行动）"}];
  await vault.create(oldPath(),JSON.stringify({days:{[date]:{flashes}}}));await vault.create(flashesPath(date),flashes.slice(0,3).map(x=>flashBlock(x.time,x.text)).join("\n"));
  const entries=await wb.thoughts();assert.deepEqual(entries.map(x=>x.text),["仅JSON记录","待整理"]);assert.equal(entries.total,2);
  const json=entries[0];assert.equal(json.path,oldPath());assert.equal(json.sourceExists,true);assert.equal(json.sourceKind,"configuration");assert.ok(vault.getAbstractFileByPath(json.path));
  await wb.change(s=>{s.triage[json.triageKey]="archived";});const after=(await wb.thoughts()).find(x=>x.text===json.text);assert.equal(after.triageKey,json.triageKey);assert.equal((await wb.load()).triage[after.triageKey],"archived");
});

test("thought limit counts available entries after filtering and JSON-only memory sources are honest",async()=>{
  const {vault,store,wb}=fixture();await vault.create(oldPath(),JSON.stringify({days:{"2026-10-02":{flashes:[{time:"10:00",text:"收好",status:"archived"}]}}}));
  await vault.create(flashesPath("2026-10-02"),flashBlock("10:00","收好"));await store.capture("更早的第一条","thought","2026-10-01","one");await store.capture("更早的第二条","thought","2026-09-30","two");
  const entries=await wb.thoughts(1);assert.equal(entries[0].text,"更早的第一条");assert.equal(entries.total,2);assert.equal(entries.limited,true);
  const empty=fixture(),state=normalize({days:{"2026-09-01":{flashes:[{text:"尚未落盘",time:"08:00"}]}}});const memory=await empty.wb.thoughts(60,state);assert.equal(memory[0].path,"");assert.equal(memory[0].sourceExists,false);
});

test("provided state snapshots avoid additional config reads and completed plans stay bounded",async()=>{
  const {store,wb}=fixture();const state=normalize({growth:{planId:"focus",startDate:"2000-01-01"},days:{"2026-10-01":{tasks:[{text:"待办",done:false}]}}});
  wb.load=()=>{throw Error("unexpected config read");};assert.equal((await wb.tasks(200,state)).length,1);assert.deepEqual(await wb.thoughts(60,state),[]);
  const growth=wb.growth(state);assert.equal(growth.day,42);assert.equal(growth.week,6);assert.equal(growth.percent,100);
});

test("page normalization keeps active dashboard as truth and creates one default page",()=>{
  const fresh=normalize();assert.equal(fresh.spaces.length,1);assert.equal(fresh.activeSpace,"default");assert.equal(fresh.dashboard.spaceId,"default");
  const state=normalize({activeSpace:"a",dashboard:{title:"最新编辑"},spaces:[{id:"a",name:"页面A",layout:{title:"过时快照"}},{id:"b",name:"页面B",layout:{title:"独立布局"},retained:true}]});
  assert.equal(state.dashboard.title,"最新编辑");assert.equal(state.spaces[0].layout.title,"最新编辑");assert.equal(state.spaces[1].layout.title,"独立布局");assert.equal(state.spaces[1].retained,true);assert.deepEqual(normalize(state),state);
  const onlySnapshots=normalize({activeSpace:"b",spaces:state.spaces});assert.equal(onlySnapshots.dashboard.title,"独立布局");
  for(const bad of [{spaces:[]},{spaces:[{id:"a",name:"A",layout:{}},{id:"a",name:"B",layout:{}}]},{spaces:[{id:"a",name:"A",layout:{}}],activeSpace:"missing"},{spaces:[{id:"a",name:"A",layout:null}]}])assert.throws(()=>normalize(bad));
});

test("multiple workspaces keep separate layouts while books and tasks remain shared",async()=>{
  const {wb}=fixture();let state=await wb.load();const originalId=state.activeSpace;
  state=await wb.saveLayout({...state.dashboard,title:"日常",hidden:[...state.dashboard.hidden,"health"]},state.dashboard);
  const original=clone(state.dashboard);state=await wb.createSpace("阅读",state.dashboard);const readingId=state.activeSpace;
  assert.notEqual(readingId,originalId);assert.equal(state.dashboard.title,"日常");assert.equal(state.spaces.length,2);
  state=await wb.saveLayout({...state.dashboard,title:"阅读书房",hidden:["tasks"]},state.dashboard);
  await wb.setItem("books",{id:"shared",title:"共享图书"});await wb.change(s=>{s.days["2026-10-02"]={tasks:[{text:"共享行动",done:false}],flashes:[]};});
  state=await wb.switchSpace(originalId,state.dashboard);assert.deepEqual(state.dashboard,original);assert.equal(state.books[0].title,"共享图书");assert.equal(state.days["2026-10-02"].tasks[0].text,"共享行动");
  state=await wb.switchSpace(readingId,state.dashboard);assert.equal(state.dashboard.title,"阅读书房");assert.deepEqual(state.dashboard.hidden,["tasks"]);
  state=await wb.renameSpace(originalId,"日常生活",state.dashboard);assert.equal(state.spaces.find(p=>p.id===originalId).name,"日常生活");
  state=await wb.removeSpace(readingId,state.dashboard);assert.equal(state.activeSpace,originalId);assert.deepEqual(state.dashboard,original);assert.equal(state.books[0].title,"共享图书");assert.equal(state.spaces.length,1);
  await assert.rejects(wb.removeSpace(originalId,state.dashboard),/至少保留/);assert.equal((await wb.load()).spaces.length,1);
});

test("stale page actions fail even when copied page layouts otherwise match",async()=>{
  const {wb}=fixture();const start=await wb.load(),stale=clone(start.dashboard);
  let state=await wb.createSpace("副本",start.dashboard);assert.notEqual(state.dashboard.spaceId,stale.spaceId);
  await assert.rejects(wb.saveLayout({...stale,title:"误写"},stale),/另一处/);
  await assert.rejects(wb.switchSpace("default",stale),/另一处/);
  await assert.rejects(wb.renameSpace(state.activeSpace,"误改名称",stale),/另一处/);
  await assert.rejects(wb.removeSpace("default",stale),/另一处/);
  assert.equal((await wb.load()).activeSpace,state.activeSpace);assert.equal((await wb.load()).spaces[1].name,"副本");
});

test("new pages can start from defaults and inactive page removal leaves current editor intact",async()=>{
  const {wb}=fixture();let state=await wb.load();state=await wb.saveLayout({...state.dashboard,title:"特殊主页",customWidgets:[{id:"memo",type:"text",title:"我的内容",content:"请保留"}]},state.dashboard);
  state=await wb.createSpace("空白起点",state.dashboard,{copy:false});const current=clone(state.dashboard);assert.equal(current.title,"我的工作台");assert.equal(current.customWidgets.length,0);
  await wb.setItem("workouts",{id:"latest",duration:20});state=await wb.removeSpace("default",current);assert.deepEqual(state.dashboard,current);assert.equal(state.health.workouts.length,1);assert.equal(state.spaces.length,1);
});
