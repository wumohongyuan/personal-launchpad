import { Modal, Notice } from "obsidian";
import type HomePagesPlugin from "../main";
const {dateKey,uid}=require("./data/model");
type Seed={text:string;kind?:string;date?:string;bookId?:string;finish?:boolean};
export async function quickCapture(plugin:HomePagesPlugin,seed?:Seed):Promise<void>{
 const personal=plugin.personal,key=seed?`personal-capture:quick-copy-${uid()}:thought`:"personal-capture:quick:thought";let current:{text:string;id:string;date:string;kind:string};
 try{current=JSON.parse(personal.readDraft(key)||"null");}catch{current=null as never;}
 if(seed)current={text:seed.text,id:uid(),date:seed.date||dateKey(),kind:seed.kind||"thought"};
 if(!current||typeof current.text!=="string")current={text:"",id:uid(),date:dateKey(),kind:"thought"};
 const pending=current;
 await personal.form("随时记一笔",[{key:"kind",label:"记录类型",value:pending.kind,options:[["thought","随手记"],["diary","日记"],["task","待办"]]},{key:"body",label:"想记下的内容",focus:true,value:pending.text,multiline:true,hint:"草稿留在本机，同时写入笔记库草稿箱，沿用你的同步服务。"}],async values=>{if(!values.body.trim())throw Error("先写下一点内容吧。");await personal.store.capture(values.body,values.kind,pending.date,pending.id);personal.writeDraft(key,"");personal.refresh();new Notice("已保存到日记。");},values=>{pending.id=uid();pending.text=values.body;pending.kind=values.kind;personal.writeDraft(key,JSON.stringify(pending));});
}
export function openDrafts(plugin:HomePagesPlugin):void{
 const modal=new Modal(plugin.app);modal.modalEl.addClass("hp-modal","hp-draft-box");modal.titleEl.setText("跨设备草稿箱");
 modal.contentEl.createEl("p",{cls:"hp-color-intro",text:"显示同步到当前笔记库的草稿。每台设备分别保存；继续编写会创建本机副本，原设备草稿保留。"});
 const area=modal.contentEl.createDiv();area.setText("正在读取…");let active=true;const close=modal.onClose.bind(modal);modal.onClose=()=>{active=false;close();};
 void plugin.personal.sharedDrafts.list().then(({items,unreadable}:{items:Array<Seed&{deviceName:string;updatedAt:string}>;unreadable:number})=>{if(!active)return;area.empty();if(unreadable)area.createEl("p",{text:`${unreadable} 份草稿无法读取，原文件保留。`});if(!items.length)area.createEl("p",{text:"暂时没有待续写的草稿。"});for(const item of items){const row=area.createEl("article",{cls:"hp-draft-row"});row.createEl("small",{text:`${item.deviceName} · ${new Date(item.updatedAt).toLocaleString()}`});row.createEl("p",{text:item.text.slice(0,220)});const button=row.createEl("button",{text:"以副本继续",attr:{type:"button"}});button.addEventListener("click",()=>{modal.close();if(item.bookId)void import("./library-widget").then(m=>m.quickReading(plugin,item));else void quickCapture(plugin,item);});}}).catch(()=>{if(active)area.setText("草稿箱暂时无法读取，本机草稿仍保留。");});modal.open();
}
export function mountQuickDock(plugin:HomePagesPlugin,parent:HTMLElement):()=>void{
 const dock=parent.createDiv({cls:"hp-quick-dock",attr:{"aria-label":"快速记录"}});
 const button=dock.createEl("button",{cls:"mod-cta",attr:{type:"button"}});const more=dock.createEl("button",{text:"切换",attr:{type:"button","aria-label":"选择快速记录操作"}});
 const labels={capture:"随手记",finance:"记账",reading:"阅读心得"};type Action=keyof typeof labels;
 let selected=(plugin.app.loadLocalStorage("personal-launchpad:quick-action")||"capture") as Action;if(!labels[selected])selected="capture";
 const sync=()=>{button.setText(labels[selected]);};sync();
 const run=async()=>{if(selected==="capture"){await quickCapture(plugin);return;}if(selected==="finance"){const {quickFinance}=await import("./finance-widget");await quickFinance(plugin);return;}const {quickReading}=await import("./library-widget");await quickReading(plugin);};
 button.addEventListener("click",()=>{button.disabled=true;void run().catch(error=>new Notice(error instanceof Error?error.message:"暂时无法打开记录。")).finally(()=>button.disabled=false);});
 more.addEventListener("click",()=>{const modal=new Modal(plugin.app);modal.modalEl.addClass("hp-modal");modal.titleEl.setText("快速记录入口");for(const [key,label] of Object.entries(labels)){const pick=modal.contentEl.createEl("button",{cls:"hp-quick-choice",text:label,attr:{type:"button"}});pick.addEventListener("click",()=>{selected=key as Action;plugin.app.saveLocalStorage("personal-launchpad:quick-action",selected);sync();modal.close();});}const drafts=modal.contentEl.createEl("button",{cls:"hp-quick-choice",text:"跨设备草稿箱",attr:{type:"button"}});drafts.addEventListener("click",()=>{modal.close();openDrafts(plugin);});modal.open();});
 const viewport=parent.ownerDocument.defaultView?.visualViewport;
 const position=()=>{const win=parent.ownerDocument.defaultView;if(!win||!viewport)return;parent.style.setProperty("--hp-viewport-height",`${viewport.height}px`);parent.style.setProperty("--hp-keyboard-inset",`${Math.max(0,win.innerHeight-viewport.height-viewport.offsetTop)}px`);};
 viewport?.addEventListener("resize",position);viewport?.addEventListener("scroll",position);position();
 return ()=>{viewport?.removeEventListener("resize",position);viewport?.removeEventListener("scroll",position);dock.remove();};
}
