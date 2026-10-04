import { Modal, Notice, Setting } from "obsidian";
import type HomePagesPlugin from "../main";
import type { HomePage, WidgetInstance } from "../types";
import { widgetDisplayTitle } from "../widgets/registry";

type Profile = "desktop" | "tablet" | "phone";
type Layout = { order: Record<string,string[]>; sizes: Record<string,{w:number;h:number}>; hidden: string[] };
type State = { profile: Profile; layouts: Partial<Record<Profile,Layout>>; histories: Partial<Record<Profile,Layout[]>>; checkpoints: Partial<Record<Profile,Layout>> };
const names = {desktop:"电脑",tablet:"平板",phone:"手机"};
const blank = ():Layout=>({order:{},sizes:{},hidden:[]});
const copy = <T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const cache = new WeakMap<HomePagesPlugin,DeviceLayouts>();
export function layoutsFor(plugin:HomePagesPlugin):DeviceLayouts {let value=cache.get(plugin);if(!value){value=new DeviceLayouts(plugin);cache.set(plugin,value);}return value;}
export class DeviceLayouts {
  private state:State;
  private readonly key="personal-launchpad:device-layouts-v1";
  constructor(private plugin:HomePagesPlugin) {
    const mobile=document.body.classList.contains("is-mobile");
    this.state={profile:mobile?(Math.min(screen.width,screen.height)>=600?"tablet":"phone"):"desktop",layouts:{},histories:{},checkpoints:{}};
    const raw=plugin.app.loadLocalStorage(this.key);
    if(raw)try{const value=JSON.parse(String(raw)) as State;if(!names[value.profile]||!value.layouts||!value.histories||!value.checkpoints)throw Error();for(const layout of Object.values(value.layouts))this.validate(layout);for(const items of Object.values(value.histories)){if(!Array.isArray(items))throw Error();items.forEach(item=>this.validate(item));}Object.values(value.checkpoints).forEach(item=>this.validate(item));this.state=value;}catch{new Notice("本机布局配置无法读取，暂用默认布局；原缓存未改动。");}
  }
  private validate(value:unknown):void {const x=value as Layout;if(!x||!x.order||!x.sizes||!Array.isArray(x.hidden)||x.hidden.some(id=>typeof id!=="string"))throw Error();for(const ids of Object.values(x.order))if(!Array.isArray(ids)||ids.some(id=>typeof id!=="string"))throw Error();for(const size of Object.values(x.sizes))if(!size||!Number.isInteger(size.w)||size.w<1||size.w>12||!Number.isInteger(size.h)||size.h<1||size.h>30)throw Error();}
  get profile():Profile{return this.state.profile;}
  get label():string{return names[this.profile];}
  get current():Layout{return this.state.layouts[this.profile]||blank();}
  get canUndo():boolean{return !!this.state.histories[this.profile]?.length;}
  get hasCheckpoint():boolean{return !!this.state.checkpoints[this.profile];}
  private persist(next:State):void{this.plugin.app.saveLocalStorage(this.key,JSON.stringify(next));this.state=next;}
  select(profile:Profile):void{const next=copy(this.state);next.profile=profile;this.persist(next);}
  checkpoint():void{const next=copy(this.state);next.checkpoints[this.profile]=copy(this.current);this.persist(next);}
  change(mutator:(layout:Layout)=>void):void {const next=copy(this.state),before=copy(this.current),after=copy(before);mutator(after);if(JSON.stringify(before)===JSON.stringify(after))return;next.layouts[this.profile]=after;next.histories[this.profile]=[...(next.histories[this.profile]||[]),before].slice(-30);this.persist(next);}
  undo():void {const next=copy(this.state),previous=next.histories[this.profile]?.pop();if(previous){next.layouts[this.profile]=previous;this.persist(next);}}
  restore():void {const previous=this.state.checkpoints[this.profile];if(previous)this.change(layout=>Object.assign(layout,copy(previous)));}
  widgets(page:HomePage):WidgetInstance[]{const order=this.current.order[page.id]||page.widgets.map(w=>w.id),rank=new Map(order.map((id,i)=>[id,i]));return page.widgets.filter(w=>!this.current.hidden.includes(w.id)).slice().sort((a,b)=>(rank.get(a.id)??100000)-(rank.get(b.id)??100000));}
  size(widget:WidgetInstance):{w:number;h:number}{return this.current.sizes[widget.id]||{w:widget.w,h:widget.h};}
  resize(id:string,w:number,h:number):void{this.change(l=>{l.sizes[id]={w:Math.min(12,Math.max(1,Math.round(w))),h:Math.min(30,Math.max(1,Math.round(h)))};});}
  order(page:HomePage,ids:string[]):void{this.change(l=>{l.order[page.id]=ids;});}
  hide(id:string,hide:boolean):void{this.change(l=>{l.hidden=l.hidden.filter(item=>item!==id);if(hide)l.hidden.push(id);});}
  open(page:HomePage):void {
    const modal=new Modal(this.plugin.app);modal.modalEl.addClass("hp-modal","hp-device-layout");modal.titleEl.setText("设备布局与恢复");
    const render=()=>{modal.contentEl.empty();modal.contentEl.createEl("p",{cls:"hp-color-intro",text:"仅影响这台设备。资料与组件内容共用，排列、尺寸和可见组件分别保存。"});
      new Setting(modal.contentEl).setName("本机使用的布局").addDropdown(d=>d.addOptions(names).setValue(this.profile).onChange(value=>{try{this.select(value as Profile);this.plugin.refreshViews();render();}catch{new Notice("布局未能保存，请重试。");}}));
      new Setting(modal.contentEl).setName("撤销上次布局调整").setDesc("保留最近 30 步，不撤销笔记或组件内容。").addButton(b=>b.setButtonText("撤销").setDisabled(!this.canUndo).onClick(()=>{this.undo();this.plugin.refreshViews();render();}));
      new Setting(modal.contentEl).setName("恢复编辑前布局").addButton(b=>b.setButtonText("恢复布局").setDisabled(!this.hasCheckpoint).onClick(()=>{this.restore();this.plugin.refreshViews();render();}));
      modal.contentEl.createEl("h3",{text:`${page.name} · 显示的组件`});
      for(const widget of page.widgets)new Setting(modal.contentEl).setName(widgetDisplayTitle(widget)).addToggle(t=>t.setValue(!this.current.hidden.includes(widget.id)).onChange(value=>{this.hide(widget.id,!value);this.plugin.refreshViews();}));
    };render();modal.open();
  }
}
