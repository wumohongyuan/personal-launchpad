import "./personal-dom";
import { TFile, TFolder, Notice } from "obsidian";
import { HomeView } from "../src/view";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/settings";
import { PersonalServices, personalSettings } from "../src/personal/services";
import { createPersonalPages } from "../src/personal/defaults";
import type HomePagesPlugin from "../src/main";
import type { HomePagesSettings } from "../src/types";
import type { App, WorkspaceLeaf } from "obsidian";

class PreviewVault {
  files=new Map<string,TFile|TFolder>(); private contents=new Map<string,string>();
  private listeners=new Map<string,Set<(...args:unknown[])=>void>>(); failWrites=false;
  constructor() {
    const saved=JSON.parse(localStorage.getItem("hp-personal-v3-demo-files")||"[]") as Array<{path:string;content?:string;folder?:boolean}>;
    for(const item of saved) {if(item.folder)this.addFolder(item.path);else this.addFile(item.path,item.content||"");}
  }
  getName(): string {return "演示笔记库";}
  getAbstractFileByPath(path:string):TFile|TFolder|null{return this.files.get(path)||null;}
  getMarkdownFiles():TFile[]{return [...this.files.values()].filter((f):f is TFile=>f instanceof TFile&&f.extension==="md");}
  getFiles():TFile[]{return [...this.files.values()].filter((f):f is TFile=>f instanceof TFile);}
  getAllLoadedFiles():Array<TFile|TFolder>{return [...this.files.values()];}
  on(name:string,callback:(...args:unknown[])=>void){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(callback);return {off:()=>this.listeners.get(name)?.delete(callback)};}
  offref(ref:{off?:()=>void}):void{ref.off?.();}
  private emit(name:string,file:TFile|TFolder):void{for(const callback of this.listeners.get(name)||[])callback(file);}
  private addFolder(path:string):TFolder{const folder=new TFolder();folder.path=path;folder.name=path.split("/").pop()!;folder.children=[];this.files.set(path,folder);return folder;}
  private addFile(path:string,content:string):TFile{const file=new TFile();file.path=path;file.name=path.split("/").pop()!;file.basename=file.name.replace(/\.[^.]+$/,"");file.extension=file.name.split(".").pop()!;file.stat={ctime:Date.now(),mtime:Date.now(),size:content.length};this.files.set(path,file);this.contents.set(path,content);return file;}
  private persist():void{localStorage.setItem("hp-personal-v3-demo-files",JSON.stringify([...this.files.values()].map(file=>({path:file.path,...(file instanceof TFolder?{folder:true}:{content:this.contents.get(file.path)})}))));}
  async createFolder(path:string):Promise<TFolder>{if(this.failWrites)throw new Error("模拟磁盘写入失败。");if(this.files.has(path))throw new Error("Already exists");const file=this.addFolder(path);this.persist();return file;}
  async create(path:string,content:string):Promise<TFile>{if(this.failWrites)throw new Error("模拟磁盘写入失败，输入已保留。");if(this.files.has(path))throw new Error("Already exists");const file=this.addFile(path,content);this.persist();this.emit("create",file);return file;}
  async read(file:TFile):Promise<string>{if(!this.contents.has(file.path))throw new Error("Missing file");return this.contents.get(file.path)!;}
  async cachedRead(file:TFile):Promise<string>{return this.read(file);}
  async process(file:TFile,fn:(text:string)=>string):Promise<string>{if(this.failWrites)throw new Error("模拟磁盘写入失败，输入已保留。");const next=fn(await this.read(file));this.contents.set(file.path,next);file.stat.mtime=Date.now();file.stat.size=next.length;this.persist();this.emit("modify",file);return next;}
  async modify(file:TFile,text:string):Promise<void>{await this.process(file,()=>text);}
  getResourcePath():string{return "";}
  adapter={exists:async(path:string)=>this.files.has(path)};
}

async function main():Promise<void> {
  const vault=new PreviewVault();let view:HomeView,personal:PersonalServices;const cleanups:Array<()=>void>=[];
  const raw=JSON.parse(localStorage.getItem("hp-personal-v3-demo-layout")||"null") as HomePagesSettings|null;
  const settings=raw?sanitizeSettings(raw):{...DEFAULT_SETTINGS,pages:createPersonalPages(),activePageId:"personal-workbench",personal:personalSettings(null)};
  document.body.classList.toggle("theme-dark",settings.appearance==="dark");
  // Keep demo records and edited pages while adding newly shipped demo entry points.
  if(raw) {
    const defaults=createPersonalPages();for(const page of defaults)if(!settings.pages.some(existing=>existing.id===page.id))settings.pages.push(page);
    const workbench=settings.pages.find(page=>page.id==="personal-workbench"),finance=defaults[0].widgets.find(widget=>widget.kind==="personal-finance");
    if(workbench&&finance&&!workbench.widgets.some(widget=>widget.kind==="personal-finance"))workbench.widgets.push(finance);
  }
  const app={vault,metadataCache:{on:()=>({}),getTags:()=>({}),getFileCache:()=>({}),getFirstLinkpathDest:(path:string)=>vault.getAbstractFileByPath(path)||vault.getAbstractFileByPath(path+".md")},
    loadLocalStorage:(key:string)=>localStorage.getItem(`hp-personal-v3-demo-draft:${key}`),saveLocalStorage:(key:string,value:string)=>value===null?localStorage.removeItem(`hp-personal-v3-demo-draft:${key}`):localStorage.setItem(`hp-personal-v3-demo-draft:${key}`,value),
    workspace:{on:()=>({}),offref:()=>{},getLeavesOfType:()=>[],getLeaf:()=>({openFile:async(file:TFile)=>{await personal.form(`原文 · ${file.basename}`,[{key:"text",label:"Markdown 内容（演示库）",multiline:true,value:await vault.read(file)}],values=>vault.process(file,()=>values.text));}}),openLinkText:async(path:string)=>{await personal.openFile(path.endsWith(".md")?path:path+".md");}},
    commands:{executeCommandById:()=>new Notice("演示中不运行其他 Obsidian 命令。")}
  };
  const plugin={app,settings,active:true,ready:Promise.resolve(),manifest:{id:"personal-launchpad",name:"个人空间"},
    register:(cleanup:()=>void)=>cleanups.push(cleanup),
    getActivePage:()=>settings.pages.find(page=>page.id===settings.activePageId)||settings.pages[0],
    saveSettings:async()=>{if(vault.failWrites)throw new Error("模拟布局保存失败。");localStorage.setItem("hp-personal-v3-demo-layout",JSON.stringify(settings));},
    refreshViews:(options:{kind?:string;layoutOnly?:boolean}={})=>{if(options.kind)view?.refreshKind(options.kind);else if(options.layoutOnly)view?.applyLayout();else view?.render();},
    openSettings:()=>{toggleTheme();new Notice("已切换个人空间外观；插件设置中还可以选择跟随 Obsidian。");}
  };
  personal=new PersonalServices(plugin as unknown as HomePagesPlugin,settings.personal||personalSettings(null));Object.assign(plugin,{personal});
  if(!vault.getMarkdownFiles().length) {
    await personal.store.capture("读完一段内容，用自己的话讲一遍。讲得清楚的部分，才开始成为自己的知识。","thought",undefined,"demo-thought");
    await personal.store.capture("睡前留十分钟，回看今天的记录。","task",undefined,"demo-task");
    await personal.library.saveBook({id:"demo-book-a",title:"如何阅读一本书",author:"莫提默·J. 艾德勒",status:"在读",current:86,total:376,category:"学习方法"});
    const book=await personal.library.saveBook({id:"demo-book-b",title:"原子习惯",author:"詹姆斯·克利尔",status:"在读",current:320,total:320,category:"个人成长"});
    await personal.library.appendNote(book,"先把开始变得容易：每天写一句话，就已经在积累自己的理解。","reflection","demo-reflection",true);
    await personal.store.createKnowledge({id:"demo-knowledge",title:"把开始变成一个小动作",topic:"个人成长",body:"从足够小的行动开始，降低开始的阻力。\n\n今天可以试试：读两页书，写一句自己的理解。"});
  }
  const contentEl=document.getElementById("app")!;view=new HomeView({app:app as unknown as App,contentEl,updateHeader:()=>{}} as unknown as WorkspaceLeaf,plugin as unknown as HomePagesPlugin);
  await view.onOpen();
  window.addEventListener("pagehide",()=>{plugin.active=false;void view.onClose();view.unload();personal.dispose();for(const cleanup of cleanups.splice(0).reverse())cleanup();},{once:true});
  Object.assign(window,{__hpPreview:{view,plugin,personal,vault,settings,refresh:()=>view.refreshKind("personal-journal")}});
  function toggleTheme():void {
    settings.appearance=settings.appearance==="dark"?"light":"dark";
    document.body.classList.toggle("theme-dark",settings.appearance==="dark");
    view.applyLayout();void plugin.saveSettings();
  }
  document.getElementById("theme-toggle")?.addEventListener("click",toggleTheme);
  const presetButton=document.createElement("button");presetButton.type="button";presetButton.textContent="查看原版布局";
  document.querySelector(".preview-bar")?.insertBefore(presetButton,document.getElementById("theme-toggle"));
  presetButton.addEventListener("click",()=>{
    let preset=settings.pages.find(page=>page.id==="personal-workbench-original"||(page.id==="personal-workbench"&&page.widgets.some(widget=>widget.kind==="pomodoro")));
    if(!preset) {
      preset=createPersonalPages()[0];preset.id="personal-workbench-original";preset.name="工作台 · 原版";
      for(const [index,widget] of preset.widgets.entries())widget.id=`${preset.id}-${index}-${widget.kind}`;
      settings.pages.unshift(preset);
    }
    settings.activePageId=preset.id;settings.appearance="dark";document.body.classList.add("theme-dark");
    view.render();contentEl.scrollTop=0;void plugin.saveSettings();
  });
}
void main().catch(error=>{document.getElementById("app")!.textContent=`预览载入失败：${error instanceof Error?error.message:String(error)}`;console.error(error);});
