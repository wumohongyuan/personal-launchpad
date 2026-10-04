import { App, Modal, Notice, TFile } from "obsidian";
import type HomePagesPlugin from "../main";
// These local data services are shared with the tested Markdown implementation.
// They have no dependency on the previous workbench's UI or CSS.
const { DraftStore } = require("./data/draft-store.js");
const { VaultStore } = require("./data/store.js");
const { WorkbenchStore } = require("./data/workbench-store.js");
const { LibraryStore } = require("./data/library-store.js");
const { FinanceStore } = require("./data/finance-store.js");
const { settingsFrom, uid } = require("./data/model.js");

export interface PersonalSettings {
  autoOpen: boolean;
  renewalReminders: boolean;
  dailyFolder: string;
  knowledgeFolder: string;
  reviewFolder: string;
  legacyFolder: string;
}
export interface FormField {
  key: string; label: string; value?: string | number; hint?: string;
  type?: string; multiline?: boolean; options?: Array<[string, string]>;
  /** Optional fields remain part of the form even while their section is closed. */
  group?: string;
  vaultImage?: boolean;
  focus?: boolean;
}
export function personalSettings(raw: unknown): PersonalSettings { return {...settingsFrom(raw),renewalReminders:(raw as Partial<PersonalSettings>|null)?.renewalReminders!==false} as PersonalSettings; }

class PersonalForm extends Modal {
  private busy = false;
  private disposed = false;
  private completed = false;
  private releaseViewport?:()=>void;
  constructor(app: App, private title: string, private fields: FormField[], private commit: (values: Record<string,string>)=>Promise<unknown>|unknown, private result: (values: Record<string,string>|null)=>void, private onChange?: (values:Record<string,string>)=>void) { super(app); }
  onOpen(): void {
    this.modalEl.addClass("hp-modal", "hp-personal-form");this.titleEl.setText(this.title);
    const viewport=this.modalEl.ownerDocument.defaultView?.visualViewport;
    const fit=()=>{if(viewport)this.modalEl.style.setProperty("--hp-viewport-height",`${viewport.height}px`);const active=this.modalEl.ownerDocument.activeElement;if(active&&this.modalEl.contains(active))setTimeout(()=>active.scrollIntoView({block:"nearest"}),30);};
    viewport?.addEventListener("resize",fit);fit();this.releaseViewport=()=>viewport?.removeEventListener("resize",fit);
    const form=this.contentEl.createEl("form"), controls: Record<string,HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>={};
    const groups = new Map<string, HTMLDetailsElement>();
    for(const field of this.fields) {
      let parent: HTMLElement = form;
      if (field.group) {
        let group = groups.get(field.group);
        if (!group) {
          group = form.createEl("details", { cls: "hp-disclosure" });
          group.createEl("summary", { text: field.group });
          groups.set(field.group, group);
        }
        parent = group;
      }
      const row=parent.createDiv({cls:"hp-personal-field"}),id=`hp-field-${uid()}`;
      row.createEl("label",{text:field.label,attr:{for:id}});
      let input: HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
      if(field.options) {const select=row.createEl("select",{attr:{id}});for(const [value,label] of field.options)select.createEl("option",{value,text:label});input=select;}
      else if(field.multiline)input=row.createEl("textarea",{attr:{id,rows:"6"}});
      else {input=row.createEl("input",{type:field.type||"text",attr:{id}});if(field.type==="number")input.step="any";}
      input.value=String(field.value??""); controls[field.key]=input;
      if(field.vaultImage){
        const choose=row.createEl("button",{text:"选择库内图片",attr:{type:"button"}});
        choose.addEventListener("click",()=>{const picker=new Modal(this.app);picker.modalEl.addClass("hp-modal");picker.titleEl.setText("选择封面图片");const search=picker.contentEl.createEl("input",{attr:{type:"search","aria-label":"搜索库内图片",placeholder:"搜索图片名称"}});const list=picker.contentEl.createDiv({cls:"hp-image-picker"});const files=this.app.vault.getFiles().filter(file=>/\.(png|jpe?g|gif|webp|avif)$/i.test(file.path));const render=()=>{list.empty();const matches=files.filter(file=>file.path.toLowerCase().includes(search.value.trim().toLowerCase()));if(!matches.length)list.createEl("p",{text:"没有匹配图片。可以先把封面放进笔记库附件文件夹。"});for(const file of matches.slice(0,80)){const button=list.createEl("button",{text:file.path,attr:{type:"button"}});button.addEventListener("click",()=>{input.value=file.path;input.dispatchEvent(new Event("input",{bubbles:true}));picker.close();});}};search.addEventListener("input",render);render();picker.open();});
      }
      if(field.hint) {row.createEl("small",{text:field.hint,attr:{id:`${id}-hint`}});input.setAttribute("aria-describedby",`${id}-hint`);}
    }
    form.addEventListener("input",()=>{try{this.onChange?.(Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value])));}catch{error.setText("草稿暂时无法保存，请保留窗口并尽快保存记录。");}});
    const error=form.createDiv({cls:"hp-personal-error",attr:{role:"alert"}}),footer=form.createDiv({cls:"hp-modal-footer"});
    const cancel=footer.createEl("button",{cls:"hp-button",text:"取消",type:"button"});cancel.addEventListener("click",()=>this.close());
    const save=footer.createEl("button",{cls:"hp-button mod-cta",text:"保存",type:"submit"});
    form.addEventListener("submit",event=>{
      event.preventDefault();if(this.busy||this.disposed)return;this.busy=true;save.disabled=true;cancel.disabled=true;save.setText("正在保存…");
      const values=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value]));Object.values(controls).forEach(input=>input.disabled=true);error.empty();
      void Promise.resolve().then(()=>{if(!this.disposed)return this.commit(values);}).then(()=>{if(this.disposed)return;this.completed=true;this.result(values);this.busy=false;this.close();}).catch((reason: unknown)=>{if(!this.disposed){for(const group of groups.values())group.open=true;error.setText(reason instanceof Error?reason.message:"保存失败，输入已保留。");}}).finally(()=>{this.busy=false;if(this.disposed)return;save.disabled=false;cancel.disabled=false;save.setText("保存");Object.values(controls).forEach(input=>input.disabled=false);});
    });
    form.addEventListener("invalid", event => {
      const group = (event.target as HTMLElement).closest("details");
      if (group) group.open = true;
    }, true);
    form.addEventListener("keydown",event=>{if(!event.isComposing&&(event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();form.requestSubmit();}});
    window.setTimeout(()=>{if(!this.disposed)(controls[this.fields.find(field=>field.focus)?.key||""]||Object.values(controls)[0])?.focus();},50);
  }
  close(): void { if(!this.busy)super.close(); }
  dispose(): void {this.disposed=true;super.close();}
  onClose(): void {this.releaseViewport?.();this.contentEl.empty();if(!this.completed)this.result(null);}
}

export class PersonalServices {
  readonly store = new VaultStore(this.plugin.app.vault, this.settings);
  readonly workbench = new WorkbenchStore(this.store);
  readonly library = new LibraryStore(this.store);
  readonly finance = new FinanceStore(this.store);
  private drafts = new Map<string,string>();
  private forms = new Set<PersonalForm>();
  readonly sharedDrafts: any;
  private sharedPending=new Map<string,{value:string;timer:ReturnType<typeof setTimeout>}>();
  private draftErrorShown=false;
  constructor(readonly plugin: HomePagesPlugin, readonly settings: PersonalSettings) {
    let device=plugin.app.loadLocalStorage("personal-launchpad:device-id");if(typeof device!=="string"||!/^[a-z0-9-]+$/i.test(device)){device=uid();plugin.app.saveLocalStorage("personal-launchpad:device-id",device);}
    const label=globalThis.document?.body?.classList?.contains("is-mobile")?(Math.min(screen.width,screen.height)>=600?"平板":"手机"):"电脑";
    this.sharedDrafts=new DraftStore(this.store,device,`${label} · ${String(device).slice(-4)}`);
  }
  form(title: string, fields: FormField[], commit: (values: Record<string,string>)=>Promise<unknown>|unknown, onChange?: (values:Record<string,string>)=>void): Promise<Record<string,string>|null> {
    return new Promise(resolve=>{const modal=new PersonalForm(this.plugin.app,title,fields,commit,value=>{this.forms.delete(modal);resolve(value);},onChange);this.forms.add(modal);modal.open();});
  }
  readDraft(key: string): string {
    if(this.drafts.has(key))return this.drafts.get(key)||"";
    const value=this.plugin.app.loadLocalStorage(`personal-launchpad:${key}`);const text=typeof value==="string"?value:"";this.drafts.set(key,text);return text;
  }
  writeDraft(key: string,value: string): void {this.drafts.set(key,value);this.plugin.app.saveLocalStorage(`personal-launchpad:${key}`,value||null);
    if(!key.startsWith("personal-capture:")&&!key.startsWith("personal-reading:")&&!/^review:\d{4}-/.test(key))return;
    const previous=this.sharedPending.get(key);if(previous)clearTimeout(previous.timer);
    const timer=setTimeout(()=>{this.sharedPending.delete(key);void this.syncDraft(key,value);},600);this.sharedPending.set(key,{value,timer});
  }
  private async syncDraft(key:string,value:string):Promise<void>{
    try{let payload:{text:string;kind:string;date?:string;bookId?:string;finish?:boolean}={text:"",kind:key.split(":").pop()||"thought"};if(value){const data=JSON.parse(value);if(Array.isArray(data))payload={text:data.filter(v=>typeof v==="string").join("\n\n"),kind:"diary"};else if(data&&typeof data.text==="string")payload={text:data.text,kind:data.kind||payload.kind,date:data.date,bookId:data.bookId,finish:data.finish===true};}
      await this.sharedDrafts.save(key,payload);this.draftErrorShown=false;
    }catch{if(!this.draftErrorShown){this.draftErrorShown=true;new Notice("草稿已留在本机，暂未写入跨设备草稿箱；继续输入会重试。");}}
  }
  refresh(kind?: string): void {
    for(const name of kind?[kind]:["personal-journal","personal-tasks","personal-library","personal-growth","personal-health","personal-knowledge","personal-finance"])this.plugin.refreshViews({kind:name});
  }
  async openFile(path: string, content?: string, subpath?: string): Promise<void> {
    let file=this.plugin.app.vault.getAbstractFileByPath(path);
    if(!file&&content!==undefined) {
      const parent=path.slice(0,path.lastIndexOf("/"));if(parent)await this.store.ensureFolder(parent);
      try{file=await this.plugin.app.vault.create(path,content);}catch(error){file=this.plugin.app.vault.getAbstractFileByPath(path);if(!file)throw error;}
    }
    if(!(file instanceof TFile))throw new Error("文件还不存在或已移动，请先保存一条记录。");
    await this.plugin.app.workspace.getLeaf("tab").openFile(file,{state:{mode:"preview"},...(subpath?{eState:{subpath:`#${subpath}`}}:{})});
  }
  async promote(entry?: {text?: string;path?: string;id?: string;legacy?: boolean}): Promise<void> {
    const id=uid();const values=await this.form(entry?"把想法提炼成知识":"新建知识笔记",[
      {key:"title",label:"以后找得到的标题",value:""},{key:"topic",label:"主题",value:"未分类"},
      {key:"body",label:"自己的理解",value:entry?.text||"",multiline:true,hint:"可以保留原文，也可以补上理解、例子和下一步。"}
    ],async values=>{const path=await this.store.createKnowledge({title:values.title,body:values.body,topic:values.topic,source:entry?.path?entry:undefined,id});new Notice(`已收进知识库：${path}`);});
    if(values)this.refresh("personal-knowledge");
  }
  dispose(): void {for(const [key,item] of this.sharedPending){clearTimeout(item.timer);void this.syncDraft(key,item.value);}this.sharedPending.clear();for(const form of this.forms)form.dispose();this.forms.clear();}
}
