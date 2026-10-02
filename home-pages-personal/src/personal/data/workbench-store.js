"use strict";
const { dateKey, validDate, safeFolder, uid } = require("./model");
const { getPlanForGrowth } = require("./plans");

const MODULES = Object.freeze({
  capture:["随手记录","feather",8], focus:["今日重点","sprout",4],
  tasks:["行动清单","square-check",6], library:["在读书库","library",6],
  growth:["成长计划","leaf",6], milestone:["下一交付物","flag",6],
  health:["运动记录","activity",6], week:["这一周","calendar-days",6],
  shortcuts:["快捷入口","arrow-up-right",6], recent:["今天的片段","notebook-pen",6],
  inbox:["想法收件箱","inbox",12], habits:["习惯打卡","square-check",6],
  rediscover:["回顾一条","bookmark-plus",6]
});
const OPTIONAL_MODULES = ["habits","rediscover"];
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
function invalid(field) { throw new Error(`工作台配置的“${field}”格式无效。原文件保持不变，请检查后再试。`); }
function objectField(value,name) { if(value === undefined) return {}; if(!object(value)) invalid(name); return value; }
function arrayField(value,name) { if(value === undefined) return []; if(!Array.isArray(value)) invalid(name); return value; }
function strings(value,name) { const items=arrayField(value,name); if(items.some(x=>typeof x!=="string")) invalid(name); return items; }
function text(value,fallback,name) { if(value===undefined) return fallback; if(typeof value!=="string") invalid(name); return value; }
function finite(value,fallback,name) { if(value===undefined || value==="") return fallback; if(typeof value!=="number" && typeof value!=="string") invalid(name); const n=Number(value); if(!Number.isFinite(n)) invalid(name); return n; }
function records(value,name) { const items=arrayField(value,name); if(items.some(x=>!object(x))) invalid(name); return items; }
function identified(value,prefix,name) {
  const items=records(value,name), used=new Set();
  for(const item of items) {
    if(item.id===undefined || item.id===null || item.id==="") continue;
    if(typeof item.id!=="string" || !/^[a-z0-9-]+$/i.test(item.id) || used.has(item.id)) invalid(`${name}的记录编号`);
    used.add(item.id);
  }
  return items.map((item,index)=>{
    if(item.id) return {...item};
    const base=`${prefix}-${index}`; let id=base, suffix=1;
    while(used.has(id)) id=`${base}-${suffix++}`;
    used.add(id); return {...item,id};
  });
}
function cleanLayout(raw = {}) {
  if(!object(raw)) invalid("布局");
  const oldOrder=strings(raw.order,"模块顺序"), hidden=strings(raw.hidden,"隐藏模块");
  const customWidgets=identified(raw.customWidgets,"custom","自定义模块").map(w=>{
    if(own(MODULES,w.id)) invalid("自定义模块编号与内置模块重复");
    return {...w,type:text(w.type,"text","模块类型"),title:text(w.title,"自定义模块","模块标题"),content:text(w.content,"","模块内容"),value:finite(w.value,0,"模块计数"),goal:finite(w.goal,0,"模块目标")};
  });
  const ids=[...Object.keys(MODULES),...customWidgets.map(w=>w.id)];
  const oldLayout=objectField(raw.layout,"旧布局"), oldSizes=objectField(raw.sizes,"旧模块宽度");
  const rawWidths=objectField(raw.widths,"模块宽度"), rawHeights=objectField(raw.cardHeights,"模块高度"), rawTitles=objectField(raw.titles,"模块名称");
  const order=[...new Set([...oldOrder.filter(id=>ids.includes(id)),...ids])];
  // Convert old free-position layouts once; subsequent saves use explicit order.
  if(raw.widths===undefined && Object.keys(oldLayout).length) {
    const rank=new Map(order.map((id,index)=>[id,index]));
    const point=id=>{const p=oldLayout[id];return object(p)&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)) ? [Number(p.y),Number(p.x)] : [Infinity,Infinity];};
    order.sort((a,b)=>{const pa=point(a),pb=point(b);return (pa[0]-pb[0] || pa[1]-pb[1] || rank.get(a)-rank.get(b));});
  }
  const widths={...rawWidths}, cardHeights={...rawHeights}, titles={...rawTitles};
  for(const id of ids) {
    const old=oldLayout[id]?.w ?? String(oldSizes[id] || "").replace("span-","");
    widths[id]=Math.max(3,Math.min(12,Math.round(finite(rawWidths[id],finite(old,MODULES[id]?.[2] || 6,`旧模块 ${id} 宽度`),`模块 ${id} 宽度`))));
    if(rawHeights[id]!==undefined && !["auto","compact","tall"].includes(rawHeights[id])) invalid(`模块 ${id} 高度`);
    cardHeights[id]=rawHeights[id] || "auto";
    if(rawTitles[id]!==undefined) titles[id]=text(rawTitles[id],"",`模块 ${id} 名称`);
  }
  return {
    ...raw,order,hidden:[...new Set([...hidden,...OPTIONAL_MODULES.filter(id=>!oldOrder.includes(id))])],widths,cardHeights,titles,
    mobileOrder:[...new Set([...strings(raw.mobileOrder,"手机模块顺序").filter(id=>ids.includes(id)),...order])],customWidgets,
    title:text(raw.title,"我的工作台","工作台标题"),subtitle:text(raw.subtitle,"把常用的事放在手边，按自己的方式生活与成长。","工作台副标题"),
    accent:text(raw.accent,"green","强调色"),
    density:text(raw.density,"comfortable","布局密度")
  };
}
function normalize(raw = {}, legacy = false) {
  if(!object(raw)) invalid("工作台");
  const health=objectField(raw.health,"运动"), growth=objectField(raw.growth,"成长计划"), days=objectField(raw.days,"每日记录");
  const cleanDays={};
  for(const [date,day] of Object.entries(days)) {
    if(!object(day)) invalid(`每日记录 ${date}`);
    const tasks=records(day.tasks,`${date} 的任务`), flashes=records(day.flashes,`${date} 的闪念`);
    for(const item of [...tasks,...flashes]) if(typeof item.text!=="string") invalid(`${date} 的记录正文`);
    for(const item of tasks) if(item.done!==undefined && typeof item.done!=="boolean") invalid(`${date} 的任务完成状态`);
    cleanDays[date]={...day,tasks:tasks.map(x=>({...x})),flashes:flashes.map(x=>({...x}))};
  }
  const shortcuts=raw.shortcuts===undefined ? [{label:"今日日记",action:"daily"},{label:"记录反馈",action:"feedback"},{label:"本周复盘",action:"review"},{label:"搜索笔记",action:"search"}] : records(raw.shortcuts,"快捷入口");
  const habits=identified(raw.habits,"habit","习惯").map(h=>({...h,days:strings(h.days,"习惯日期")}));
  let dashboard=cleanLayout(raw.dashboard);
  const spaces=raw.spaces===undefined ? [{id:"default",name:"我的工作台",layout:clone(dashboard)}] : identified(raw.spaces,"space","工作台页面").map(space=>{
    if(!object(space.layout)) invalid(`页面 ${space.id} 的布局`);
    const name=text(space.name,"工作台","页面名称");if(!name.trim()) invalid("页面名称");
    return {...space,name,layout:cleanLayout(space.layout)};
  });
  if(!spaces.length) invalid("工作台至少需要保留一个页面");
  const activeSpace=raw.activeSpace===undefined ? spaces[0].id : text(raw.activeSpace,"default","当前页面");
  if(!spaces.some(space=>space.id===activeSpace)) invalid("当前页面不存在");
  // dashboard is the active editor's source of truth. Never resurrect a stale
  // saved page snapshot over a layout that was just changed by a caller.
  if(raw.dashboard===undefined && raw.spaces!==undefined) dashboard=clone(spaces.find(space=>space.id===activeSpace).layout);
  dashboard={...dashboard,spaceId:activeSpace};
  for(const space of spaces) space.layout=space.id===activeSpace ? clone(dashboard) : {...space.layout,spaceId:space.id};
  return {
    ...raw,version:3,dashboard,spaces,activeSpace,books:identified(raw.books,"book","图书"),
    health:{...health,weeklyGoal:finite(health.weeklyGoal,3,"每周运动目标"),workouts:identified(health.workouts,"workout","运动记录")},
    growth:{planId:legacy && raw.growth!==undefined ? "legacy180" : "balanced",startDate:dateKey(),...growth,externalFeedback:records(growth.externalFeedback,"外部反馈"),completedMilestones:strings(growth.completedMilestones,"已完成交付物")},
    days:cleanDays,triage:{...objectField(raw.triage,"想法整理状态")},shortcuts:shortcuts.map(x=>({...x})),habits,
    importedFrom:raw.importedFrom || (legacy ? "launchpad.json" : "")
  };
}
function pageOf(items,limit) {
  const count=Number.isFinite(Number(limit)) ? Math.max(1,Math.floor(Number(limit))) : 200;
  const result=items.slice(0,count);
  Object.defineProperties(result,{total:{value:items.length},limited:{value:items.length>result.length}});
  return result;
}
function flashState(flash) { return flash.status || (String(flash.type || "").includes("已加入行动") ? "actioned" : "inbox"); }
function flashKey(flash) { return `${flash.time || ""}\n${String(flash.text || "").replace(/\r\n/g,"\n").trim()}`; }
function assertDashboard(state,expected) {
  if(JSON.stringify(state.dashboard)!==JSON.stringify(expected)) throw new Error("布局或当前页面在另一处发生了变化。你的调整仍在，请取消后重新载入再调整。");
}
function spaceName(value) { const name=String(value || "").trim();if(!name || name.length>80) throw new Error("页面名称请填写 1～80 个字符。");return name; }
function snapshotActive(state) { state.spaces.find(space=>space.id===state.activeSpace).layout=clone(state.dashboard); }
class WorkbenchStore {
  constructor(store) { this.store=store; }
  get path() { return `${this.store.settings.legacyFolder}/配置/workbench.json`; }
  async load() {
    const file=this.store.vault.getAbstractFileByPath(this.path);
    if(file) { if(Array.isArray(file.children)) invalid("工作台路径被文件夹占用"); return normalize(JSON.parse(await this.store.read(this.path))); }
    const legacyPath=`${this.store.settings.legacyFolder}/配置/launchpad.json`, legacyFile=this.store.vault.getAbstractFileByPath(legacyPath);
    if(legacyFile) { if(Array.isArray(legacyFile.children)) invalid("旧版配置路径被文件夹占用"); return normalize(JSON.parse(await this.store.read(legacyPath)),true); }
    return normalize();
  }
  async change(mutate) {
    return this.store.enqueue(this.path,async()=>{
      await this.store.ensureFolder(this.path.slice(0,this.path.lastIndexOf("/")));
      let file=this.store.vault.getAbstractFileByPath(this.path), result;
      const apply=state=>{const response=mutate(state);if(response && typeof response.then==="function") { Promise.resolve(response).catch(()=>{});throw new Error("工作台更改必须在一次同步操作中完成。"); }return normalize(state);};
      if (!file) {
        result=apply(await this.load());
        try { await this.store.vault.create(this.path,JSON.stringify(result,null,2)+"\n"); return result; }
        catch(error) { file=this.store.vault.getAbstractFileByPath(this.path); if(!file) throw error; }
      }
      if(Array.isArray(file.children)) invalid("工作台路径被文件夹占用");
      await this.store.vault.process(file,text=>{
        result=apply(normalize(JSON.parse(text)));
        return JSON.stringify(result,null,2)+"\n";
      });
      return result;
    });
  }
  async saveLayout(layout, expected) {
    const next=cleanLayout(layout);
    return this.change(state=>{
      assertDashboard(state,expected);
      state.dashboard={...next,spaceId:state.activeSpace};snapshotActive(state);
    });
  }
  async createSpace(name,expectedDashboard,options={}) {
    const title=spaceName(name), id=options.id || `space-${uid()}`;
    return this.change(state=>{
      // A create may have committed before the storage adapter reported a failure.
      if(state.spaces.some(space=>space.id===id) && state.activeSpace===id) return;
      assertDashboard(state,expectedDashboard);snapshotActive(state);
      if(state.spaces.some(space=>space.id===id)) throw new Error("页面编号已存在。");
      const layout=options.copy===false ? cleanLayout() : clone(state.dashboard);
      layout.spaceId=id;
      state.spaces.push({id,name:title,layout:clone(layout)});state.activeSpace=id;state.dashboard=layout;
    });
  }
  async switchSpace(id,expectedDashboard) {
    return this.change(state=>{
      assertDashboard(state,expectedDashboard);
      const space=state.spaces.find(item=>item.id===id);if(!space) throw new Error("这个工作台页面已被移除，请刷新。");
      snapshotActive(state);state.activeSpace=id;state.dashboard={...clone(space.layout),spaceId:id};
    });
  }
  async removeSpace(id,expectedDashboard) {
    return this.change(state=>{
      assertDashboard(state,expectedDashboard);
      if(state.spaces.length===1) throw new Error("至少保留一个工作台页面。");
      const index=state.spaces.findIndex(space=>space.id===id);if(index<0) throw new Error("这个工作台页面已被移除，请刷新。");
      snapshotActive(state);state.spaces.splice(index,1);
      if(state.activeSpace===id) {
        const target=state.spaces[Math.min(index,state.spaces.length-1)];state.activeSpace=target.id;state.dashboard={...clone(target.layout),spaceId:target.id};
      }
    });
  }
  async renameSpace(id,name,expectedDashboard) {
    const title=spaceName(name);
    return this.change(state=>{
      assertDashboard(state,expectedDashboard);
      const space=state.spaces.find(item=>item.id===id);if(!space) throw new Error("这个工作台页面已被移除，请刷新。");
      space.name=title;
    });
  }
  async setItem(collection, item, original) {
    if(!["workouts","books"].includes(collection)) throw new Error("资料类型无效。");
    if(!object(item) || typeof item.id!=="string" || !item.id) throw new Error("资料编号无效。");
    return this.change(state=>{
      const items=collection === "workouts" ? state.health.workouts : state.books;
      const index=items.findIndex(x=>x.id===item.id);
      if(original && (index<0 || JSON.stringify(items[index])!==JSON.stringify(original))) throw new Error("这条资料已在别处修改，请刷新后再试。");
      if(!original && index>=0 && JSON.stringify(items[index])!==JSON.stringify(item)) throw new Error("资料编号已经存在，请刷新后再试。");
      if(index<0) items.push(item); else items[index]=item;
    });
  }
  async oldTask(date,index,done,expected) {
    return this.change(state=>{ const task=state.days[date]?.tasks?.[index]; if(!task || JSON.stringify(task)!==JSON.stringify(expected)) throw new Error("任务已变更，请刷新。"); task.done=Boolean(done); });
  }
  dates(state) {
    const files=this.store.vault.getMarkdownFiles().filter(f=>f.path.startsWith(`${this.store.settings.dailyFolder}/`) || f.path.startsWith(`${this.store.settings.legacyFolder}/闪念/`));
    return [...new Set([...files.map(f=>f.basename),...Object.keys(state.days)])].filter(validDate).sort().reverse();
  }
  async tasks(limit=200,state) {
    state=state || await this.load();const items=[];
    for(const date of this.dates(state)) {
      const day=await this.store.day(date);
      items.push(...day.entries.filter(e=>e.kind==="task" && !e.done));
      for(const [index,task] of (state.days[date]?.tasks || []).entries()) if(!task.done) items.push({legacyTask:true,date,index,source:task,text:task.text,done:false,id:`legacy-task-${date}-${index}`});
    }
    return pageOf(items,limit);
  }
  async thoughts(limit=60,state) {
    state=state || await this.load();const items=[];
    const configPaths=[this.path,`${this.store.settings.legacyFolder}/配置/launchpad.json`];
    const configPath=configPaths.find(path=>{const f=this.store.vault.getAbstractFileByPath(path);return f&&!Array.isArray(f.children);}) || "";
    for(const date of this.dates(state)) {
      const day=await this.store.day(date), flashes=state.days[date]?.flashes || [], matched=new Set();
      for(const entry of day.entries.filter(e=>e.kind==="thought")) {
        if(!entry.legacy) {items.push(entry);continue;}
        const index=flashes.findIndex((flash,i)=>!matched.has(i)&&flashKey(flash)===flashKey(entry));
        if(index>=0) matched.add(index);
        const status=index<0 ? "inbox" : flashState(flashes[index]);
        if(!["archived","actioned"].includes(status)) items.push({...entry,status,legacyIndex:index,sourceExists:true});
      }
      for(const [index,flash] of flashes.entries()) {
        const status=flashState(flash);
        if(matched.has(index) || ["archived","actioned"].includes(status)) continue;
        items.push({id:`legacy-json-${date}-${index}`,triageKey:`legacy-json:${date}:${index}`,kind:"thought",text:flash.text,time:flash.time || "00:00",date,legacy:true,legacyIndex:index,status,path:configPath,sourceExists:!!configPath,sourceKind:"configuration"});
      }
    }
    items.sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    return pageOf(items,limit);
  }
  growth(state) {
    const plan=getPlanForGrowth(state.growth), start=validDate(state.growth.startDate) ? state.growth.startDate : dateKey();
    const elapsed=Math.floor((new Date(dateKey()+"T12:00:00")-new Date(start+"T12:00:00"))/86400000);
    const day=Math.min(plan.days,Math.max(0,elapsed+1)), week=Math.max(1,Math.ceil(day/7));
    const phase=plan.phases.find(p=>week>=p.from&&week<=p.to) || plan.phases[plan.phases.length-1];
    const milestone=plan.milestones.find(m=>!state.growth.completedMilestones.includes(m.id));
    return {plan,phase,milestone,day,week,percent:Math.min(100,Math.round(day/plan.days*100)),future:elapsed<0};
  }
}
function notePath(value) {
  const path=safeFolder(String(value).trim().replace(/^\[\[|\]\]$/g,""));
  return /\.[a-z0-9]+$/i.test(path) ? path : path+".md";
}
module.exports={WorkbenchStore,MODULES,cleanLayout,normalize,clone,notePath};
