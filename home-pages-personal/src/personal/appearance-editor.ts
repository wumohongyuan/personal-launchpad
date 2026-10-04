import { Modal, Notice, Setting } from "obsidian";
import type HomePagesPlugin from "../main";
import type { HomePagesSettings, WidgetInstance } from "../types";

export const COLOR_FIELDS = [
  ["page", "页面背景"], ["card", "卡片底色"], ["text", "正文与标题"],
  ["muted", "次要文字"], ["accent", "强调色"], ["border", "边框与高光"], ["input", "输入框底色"]
] as const;
type ColorKey = typeof COLOR_FIELDS[number][0];
export type Appearance = Pick<HomePagesSettings,"appearance"|"material"|"materialOpacity"|"colors"|"cardRadius"|"glassBlur"|"gap">;
export interface AppearancePreset {id:string;name:string;visual:Appearance}
export function cleanAppearance(raw:unknown):Appearance {
  const v=(raw&&typeof raw==="object"?raw:{}) as Partial<Appearance>;
  const bounded=(n:unknown,min:number,max:number,fallback:number)=>typeof n==="number"&&Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback;
  return {appearance:v.appearance==="light"||v.appearance==="system"?v.appearance:"dark",material:v.material==="solid"?"solid":"glass",materialOpacity:glassOpacity(v.materialOpacity),cardRadius:bounded(v.cardRadius,6,30,v.material==="solid"?11:22),glassBlur:bounded(v.glassBlur,0,28,18),gap:bounded(v.gap,4,40,12),colors:sanitizeColors(v.colors)};
}
export function cleanPresets(raw:unknown):AppearancePreset[]{
  if(!Array.isArray(raw))return [];
  const seen=new Set<string>();
  return raw.slice(0,30).filter(v=>v&&typeof v.id==="string"&&v.id.length>0&&v.id.length<=80&&typeof v.name==="string"&&v.name.trim()&&!seen.has(v.id)&&!!seen.add(v.id)).map(v=>({id:v.id.slice(0,80),name:v.name.trim().slice(0,48),visual:cleanAppearance(v.visual)}));
}
const previews = new WeakMap<HomePagesPlugin, Appearance>();
const editors = new WeakMap<HomePagesPlugin, AppearanceEditor>();
const widgetPreviews = new WeakMap<HomePagesPlugin, Map<string,NonNullable<WidgetInstance["colors"]>>>();
export function widgetColorsFor(plugin:HomePagesPlugin,widget:WidgetInstance):WidgetInstance["colors"] {return widgetPreviews.get(plugin)?.get(widget.id)||widget.colors;}
export function previewWidgetColors(plugin:HomePagesPlugin,id:string,colors:WidgetInstance["colors"]):void {
  let entries=widgetPreviews.get(plugin);if(!entries){entries=new Map();widgetPreviews.set(plugin,entries);}
  entries.set(id,{...colors});plugin.refreshViews({layoutOnly:true});
}
export function clearWidgetColorPreview(plugin:HomePagesPlugin,id:string):void {widgetPreviews.get(plugin)?.delete(id);if(plugin.active)plugin.refreshViews({layoutOnly:true});}
export function sanitizeColors(raw:unknown):NonNullable<HomePagesSettings["colors"]> {
  const colors:NonNullable<HomePagesSettings["colors"]>={};
  if(raw&&typeof raw==="object")for(const [key] of COLOR_FIELDS) {
    const value=(raw as Record<string,unknown>)[key];
    if(typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value))colors[key]=value.toLowerCase();
  }
  return colors;
}
export function glassOpacity(value:unknown):number {
  return typeof value==="number"&&Number.isFinite(value)?Math.min(.95,Math.max(.35,value)):.62;
}
export function appearanceFor(plugin:HomePagesPlugin):Appearance {return previews.get(plugin)||plugin.settings;}
export function openAppearanceEditor(plugin:HomePagesPlugin):void {
  if (!plugin.active || !plugin.personal) {
    new Notice("个人空间配置尚未就绪，请先打开主页查看状态，再调整外观。");
    return;
  }
  const existing=editors.get(plugin);if(existing){existing.modalEl.focus();return;}
  const modal=new AppearanceEditor(plugin);editors.set(plugin,modal);modal.open();
}
const FALLBACKS:Record<"dark"|"light",Record<ColorKey,string>>={
  dark:{page:"#1b1c23",card:"#25262e",text:"#ececf2",muted:"#b0b1c1",accent:"#a998e5",border:"#535667",input:"#22242c"},
  light:{page:"#edf1f8",card:"#ffffff",text:"#282a39",muted:"#64687c",accent:"#7560c8",border:"#b8bfd0",input:"#f8f9fc"}
};
export function accentInk(color:string):string {
  const values=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance=values[0]*.2126+values[1]*.7152+values[2]*.0722;
  return luminance>.179?"#111111":"#ffffff";
}
class AppearanceEditor extends Modal {
  private draft:Appearance;
  private presets:AppearancePreset[];
  private saving=false;
  private controls!:HTMLElement;
  private error!:HTMLElement;
  constructor(private readonly plugin:HomePagesPlugin) {
    super(plugin.app);
    this.presets=cleanPresets(plugin.settings.appearancePresets);
    this.draft={gap:plugin.settings.gap,appearance:plugin.settings.appearance||"dark",material:plugin.settings.material||"glass",materialOpacity:glassOpacity(plugin.settings.materialOpacity),cardRadius:plugin.settings.cardRadius,glassBlur:plugin.settings.glassBlur,colors:sanitizeColors(plugin.settings.colors)};
    plugin.register(()=>this.close());
  }
  onOpen():void {
    this.modalEl.addClass("hp-modal","hp-appearance-editor");this.titleEl.setText("外观与配色");
    this.contentEl.createEl("p",{cls:"hp-color-intro",text:"边调边看，搭配属于你的工作台。取消会恢复打开前的外观。"});
    this.controls=this.contentEl.createDiv();this.renderControls();
    this.error=this.contentEl.createDiv({cls:"hp-personal-error",attr:{role:"status"}});
    const footer=this.contentEl.createDiv({cls:"hp-color-footer"});
    const reset=footer.createEl("button",{text:"恢复默认",attr:{type:"button"}});
    reset.addEventListener("click",()=>{if(this.saving)return;this.draft.colors={};this.draft.materialOpacity=.62;this.draft.cardRadius=undefined;this.draft.glassBlur=undefined;this.draft.gap=12;this.preview();this.renderControls();});
    const cancel=footer.createEl("button",{text:"取消",attr:{type:"button"}});cancel.addEventListener("click",()=>this.close());
    const save=footer.createEl("button",{cls:"mod-cta",text:"保存配色",attr:{type:"button"}});
    save.addEventListener("click",()=>void this.save(save));
    this.preview();
  }
  private preview():void {previews.set(this.plugin,this.draft);this.plugin.refreshViews({layoutOnly:true});}
  private renderControls():void {
    this.controls.empty();
    this.renderPresets();
    new Setting(this.controls).setName("工作台外观").addDropdown(control=>control.addOptions({dark:"深色",light:"浅色",system:"跟随 Obsidian"}).setValue(this.draft.appearance||"dark").onChange(value=>{
      this.draft.appearance=value==="light"||value==="system"?value:"dark";this.preview();this.renderControls();
    }));
    new Setting(this.controls).setName("组件材质").addDropdown(control=>control.addOptions({glass:"液态玻璃",solid:"原版卡片"}).setValue(this.draft.material||"glass").onChange(value=>{
      this.draft.material=value==="solid"?"solid":"glass";this.preview();this.renderControls();
    }));
    const opacityRow=this.controls.createDiv({cls:"hp-opacity-row"});
    const label=opacityRow.createEl("label",{text:"玻璃不透明度",attr:{for:"hp-glass-opacity"}});
    const value=label.createSpan({text:` ${Math.round(glassOpacity(this.draft.materialOpacity)*100)}%`});
    const slider=opacityRow.createEl("input",{attr:{id:"hp-glass-opacity",type:"range",min:"35",max:"95",step:"1"}});
    slider.value=String(Math.round(glassOpacity(this.draft.materialOpacity)*100));slider.disabled=this.draft.material==="solid";
    slider.addEventListener("input",()=>{this.draft.materialOpacity=Number(slider.value)/100;value.setText(` ${slider.value}%`);this.preview();});
    for(const option of [{key:"cardRadius",label:"卡片圆角",min:6,max:30,fallback:this.draft.material==="solid"?11:22},{key:"glassBlur",label:"玻璃模糊",min:0,max:28,fallback:18},{key:"gap",label:"组件间距",min:4,max:40,fallback:12}] as const) {
      const row=this.controls.createDiv({cls:"hp-opacity-row"});const label=row.createEl("label",{text:option.label,attr:{for:`hp-${option.key}`}});
      const value=label.createSpan({text:` ${this.draft[option.key]??option.fallback}px`});
      const input=row.createEl("input",{attr:{type:"range",id:`hp-${option.key}`,min:String(option.min),max:String(option.max),step:"1"}});
      input.value=String(this.draft[option.key]??option.fallback);input.disabled=option.key==="glassBlur"&&this.draft.material==="solid";
      input.addEventListener("input",()=>{this.draft[option.key]=Number(input.value);value.setText(` ${input.value}px`);this.preview();});
    }
    const grid=this.controls.createDiv({cls:"hp-color-grid"});
    const dark=this.draft.appearance==="dark"||(this.draft.appearance==="system"&&document.body.classList.contains("theme-dark"));
    for(const [key,title] of COLOR_FIELDS) {
      const row=grid.createDiv({cls:"hp-color-row"});
      row.createEl("label",{text:title,attr:{for:`hp-color-${key}`}});
      const controls=row.createDiv({cls:"hp-color-controls"});
      const picker=controls.createEl("input",{cls:"hp-color-picker",attr:{type:"color",id:`hp-color-${key}`,"aria-label":title}});
      picker.value=this.draft.colors?.[key]||FALLBACKS[dark?"dark":"light"][key];
      const hex=controls.createEl("input",{cls:"hp-color-hex",attr:{type:"text","aria-label":`${title}色值`,maxlength:"7",spellcheck:"false"}});hex.value=picker.value;
      const state=row.createEl("small",{text:this.draft.colors?.[key]?"自定义":"跟随主题"});
      const update=(color:string):void=>{this.draft.colors={...this.draft.colors,[key]:color};picker.value=color;hex.value=color;hex.removeAttribute("aria-invalid");state.setText("自定义");this.preview();};
      picker.addEventListener("input",()=>update(picker.value));
      hex.addEventListener("input",()=>{if(/^#[0-9a-f]{6}$/i.test(hex.value))update(hex.value.toLowerCase());else hex.setAttribute("aria-invalid","true");});
      const reset=controls.createEl("button",{cls:"hp-color-reset",text:"重置",attr:{type:"button","aria-label":`重置${title}`}});
      reset.addEventListener("click",()=>{delete this.draft.colors?.[key];this.preview();this.renderControls();});
    }
  }
  private renderPresets():void {
    const details=this.controls.createEl("details",{cls:"hp-disclosure hp-presets"});details.createEl("summary",{text:"我的外观方案"});
    const area=details.createDiv({cls:"hp-disclosure-content"});
    area.createEl("p",{cls:"hp-color-intro",text:"选方案立即预览。编辑后可另存一份；点击底部「保存配色」才保存本次外观与方案变更。"});
    const select=area.createEl("select",{attr:{"aria-label":"选择外观方案"}});select.createEl("option",{text:"选择方案预览",value:""});for(const preset of this.presets)select.createEl("option",{text:preset.name,value:preset.id});
    const label=area.createEl("label",{text:"方案名称"});const name=label.createEl("input",{attr:{type:"text",maxlength:"48","aria-label":"方案名称",placeholder:"例如：夜读、清爽工作台"}});
    select.addEventListener("change",()=>{const preset=this.presets.find(p=>p.id===select.value);if(!preset)return;this.draft=cleanAppearance(preset.visual);this.preview();this.renderControls();const box=this.controls.querySelector<HTMLDetailsElement>(".hp-presets");if(box){box.open=true;box.querySelector<HTMLInputElement>('input[aria-label="方案名称"]')!.value=preset.name;box.querySelector<HTMLSelectElement>('select')!.value=preset.id;}});
    const actions=area.createDiv({cls:"hp-personal-toolbar"});
    const save=actions.createEl("button",{text:"保存为新方案",attr:{type:"button"}});save.addEventListener("click",()=>{if(!name.value.trim()){name.focus();return;}if(this.presets.length>=30){this.error.setText("最多保留 30 个方案，请先移除不用的方案。");return;}this.presets.push({id:crypto.randomUUID(),name:name.value.trim(),visual:cleanAppearance(this.draft)});this.renderControls();this.controls.querySelector<HTMLDetailsElement>(".hp-presets")!.open=true;this.error.setText("新方案待保存，点击底部「保存配色」完成。");});
    const remove=actions.createEl("button",{text:"移除所选方案",attr:{type:"button"}});remove.addEventListener("click",()=>{if(!select.value)return;this.presets=this.presets.filter(p=>p.id!==select.value);this.renderControls();this.controls.querySelector<HTMLDetailsElement>(".hp-presets")!.open=true;});
    const share=area.createEl("details",{cls:"hp-disclosure"});share.createEl("summary",{text:"分享或导入外观"});
    share.createEl("p",{cls:"hp-color-intro",text:"只包含颜色、材质、圆角与间距，不包含页面、路径、笔记或账本。"});
    const text=share.createEl("textarea",{attr:{rows:"5","aria-label":"外观方案 JSON"}});
    const exportButton=share.createEl("button",{text:"生成当前外观 JSON",attr:{type:"button"}});exportButton.addEventListener("click",()=>{text.value=JSON.stringify({format:"personal-launchpad-appearance",version:1,visual:cleanAppearance(this.draft)},null,2);text.focus();text.select();});
    const importButton=share.createEl("button",{text:"导入并预览",attr:{type:"button"}});importButton.addEventListener("click",()=>{try{if(text.value.length>20000)throw Error();const value=JSON.parse(text.value);if(value.format!=="personal-launchpad-appearance"||value.version!==1||!value.visual||typeof value.visual!=="object")throw Error();this.draft=cleanAppearance(value.visual);this.preview();this.renderControls();this.error.setText("已导入预览，可保存为新方案；取消不会改变外观。");}catch{this.error.setText("请粘贴有效的个人空间外观 JSON。");}});
  }
  private async save(button:HTMLButtonElement):Promise<void> {
    if(this.saving)return;
    if(this.controls.querySelector('[aria-invalid="true"]')) {this.error.setText("请输入完整的十六进制色值，例如 #7c3aed。");return;}
    if(!this.plugin.active){this.error.setText("插件已关闭，请重新打开后保存。");return;}
    this.saving=true;button.disabled=true;this.controls.inert=true;this.error.setText("");
    const previousPresets=this.plugin.settings.appearancePresets;
    const previous:Appearance={gap:this.plugin.settings.gap,appearance:this.plugin.settings.appearance,material:this.plugin.settings.material,materialOpacity:this.plugin.settings.materialOpacity,cardRadius:this.plugin.settings.cardRadius,glassBlur:this.plugin.settings.glassBlur,colors:this.plugin.settings.colors};
    Object.assign(this.plugin.settings,{...this.draft,colors:{...this.draft.colors},appearancePresets:cleanPresets(this.presets)});
    try {await this.plugin.saveSettings();this.saving=false;this.close();}
    catch(error) {Object.assign(this.plugin.settings,previous);this.plugin.settings.appearancePresets=previousPresets;this.error.setText(error instanceof Error?error.message:"配色没有保存成功，请重试。");}
    finally {this.saving=false;button.disabled=false;this.controls.inert=false;}
  }
  close():void {if(this.saving&&this.plugin.active)return;super.close();}
  onClose():void {previews.delete(this.plugin);editors.delete(this.plugin);if(this.plugin.active)this.plugin.refreshViews({layoutOnly:true});}
}
