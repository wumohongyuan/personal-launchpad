import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, HomePagesSettingTab, createDefaultPage, sanitizeSettings } from "./settings";
import { createWidgetInstance } from "./widgets/registry";
import { resumePomodoroTimers } from "./widgets/pomodoro";
import { createApi, type HomePagesApi } from "./api";
import type { HomePage, HomePagesSettings, WidgetKind } from "./types";
import { HomeView, VIEW_TYPE_HOME } from "./view";
import { CustomWidgetManager, DeleteCustomWidgetSuggestModal, PasteWidgetModal } from "./widgets/userLoader";
import { PersonalServices, personalSettings } from "./personal/services";
import { createPersonalPages } from "./personal/defaults";
import { quickCapture, openDrafts } from "./personal/quick-capture";
import { RenewalReminders } from "./personal/renewal-reminders";

type SettingApp = { setting?: { open: () => void; openTabById: (id: string) => void } };

export default class HomePagesPlugin extends Plugin {
  ready: Promise<void> = Promise.resolve();
  personal!: PersonalServices;
  active = false;
  private opening: Promise<void> | null = null;
  settings: HomePagesSettings = { ...DEFAULT_SETTINGS, pages: [createDefaultPage()] };
  /** 对外 API：其他插件用 app.plugins.plugins["home-pages"].api 注册自己的首页组件。 */
  api: HomePagesApi = createApi(this);
  /** 自定义脚本组件管理器：负责扫描指定目录、热重载与示例生成。 */
  readonly customWidgetManager = new CustomWidgetManager(this);
  private saveTimer: number | null = null;
  private pendingSave: Promise<void> | null = null;
  private resolveSave: (() => void) | null = null;
  private rejectSave: ((error: unknown) => void) | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private readonly renewals=new RenewalReminders(this);

  async onload(): Promise<void> {
    this.active = true;
    // Workspace restoration can happen before asynchronous settings reads finish.
    this.registerView(VIEW_TYPE_HOME, (leaf) => new HomeView(leaf, this));
    this.ready = this.loadSettings();
    this.ready.catch(error => { console.error("个人空间初始化失败",error);new Notice("个人空间配置未能读取，请打开主页查看恢复提示。"); });
    // 番茄时钟：恢复上次仍在运行的计时（首页没打开也会到点提醒）。
    void this.ready.then(()=>{if(this.active)resumePomodoroTimers(this);}).catch(()=>{});
    this.addRibbonIcon("home", "打开个人空间", () => void this.openHome());
    this.addCommand({ id: "open-home", name: "打开首页", callback: () => void this.openHome() });
    this.addCommand({id:"open-personal-launchpad",name:"打开个人空间",callback:()=>void this.openHome()});
    this.addCommand({id:"open-personal-library",name:"打开图书馆",callback:()=>void this.openPersonalPage("图书馆")});
    this.addCommand({id:"open-personal-journal",name:"打开日记",callback:()=>void this.openPersonalPage("日记")});
    this.addCommand({id:"open-personal-finance",name:"打开账本与续费提醒",callback:()=>void this.openPersonalPage("账本")});
    this.addCommand({id:"quick-capture",name:"随手记一条",callback:()=>void this.ready.then(()=>{if(this.active)void quickCapture(this);})});
    this.addCommand({id:"open-shared-drafts",name:"打开跨设备草稿箱",callback:()=>void this.ready.then(()=>{if(this.active)openDrafts(this);})});
    this.addCommand({id:"repair-personal-home",name:"重新打开主页（恢复视图）",callback:()=>void this.openHome()});
    this.addCommand({
      id: "toggle-edit-layout",
      name: "编辑首页布局",
      checkCallback: (checking) => {
        const view = this.getActiveHomeView();
        if (!view) return false;
        if (!checking) view.toggleEditing();
        return true;
      }
    });
    this.addCommand({
      id: "next-page",
      name: "切换到下一个首页页面",
      checkCallback: (checking) => {
        const view = this.getActiveHomeView();
        if (!view || this.settings.pages.length < 2) return false;
        if (!checking) {
          const pages = this.settings.pages;
          const index = pages.findIndex((page) => page.id === this.settings.activePageId);
          void view.switchPage(pages[(index + 1) % pages.length].id);
        }
        return true;
      }
    });
    this.addCommand({
      id: "add-source-widgets",
      name: "把「待办与日程 / 批注与复习 / 微信收件」加入当前首页",
      callback: () => void this.addSourceWidgets()
    });
    this.addCommand({
      id: "paste-custom-widget",
      name: "粘贴代码新建自定义组件",
      callback: () => new PasteWidgetModal(this.app, this).open()
    });
    this.addCommand({
      id: "delete-custom-widget",
      name: "删除自定义组件",
      callback: () => {
        const widgets = this.customWidgetManager.getLoadedWidgets();
        if (widgets.length === 0) {
          new Notice("当前没有已载入的自定义组件");
          return;
        }
        if (widgets.length === 1) {
          this.customWidgetManager.promptDeleteWidget(widgets[0].kind);
          return;
        }
        new DeleteCustomWidgetSuggestModal(this.app, widgets, (item) => {
          this.customWidgetManager.promptDeleteWidget(item.kind);
        }).open();
      }
    });
    this.addSettingTab(new HomePagesSettingTab(this.app, this));

    // 通知晚于本插件加载 / 正在监听的插件：可以注册组件了。

    this.app.workspace.onLayoutReady(async () => {
      try {await this.ready;} catch {if(this.active)await this.openHome();return;}
      if(!this.active)return;
      (this.app.workspace as unknown as { trigger(name: string, ...data: unknown[]): void }).trigger("home-pages:ready", this.api);
      this.registerInterval(window.setInterval(()=>void this.renewals.check(),60000));
      this.registerDomEvent(document,"visibilitychange",()=>void this.renewals.check());
      void this.renewals.check();
      this.customWidgetManager.registerWatcher();
      await this.customWidgetManager.loadAll(true);
      if (this.settings.openOnStartup && this.getHomeLeaves().length === 0) void this.openHome();
    });
  }

  onunload(): void {
    this.active = false;
    this.personal?.dispose();
    this.customWidgetManager.unloadAll();
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
      const resolve = this.resolveSave;
      const reject = this.rejectSave;
      this.pendingSave = null;
      this.resolveSave = null;
      this.rejectSave = null;
      this.saveChain=this.saveChain.catch(()=>{}).then(()=>this.saveData(this.settings));
      void this.saveChain.then(()=>resolve?.(),error=>reject?.(error));
    }
  }

  // ---- 设置 ----------------------------------------------------------------

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as unknown;
    if(raw!=null&&(typeof raw!=="object"||Array.isArray(raw)))throw new Error("设置文件格式无效，原文件保持不变。");
    const saved=(raw||{}) as Record<string,unknown>;
    if(saved.pages!==undefined&&!Array.isArray(saved.pages))throw new Error("工作台页面配置格式无效，原文件保持不变。");
    if(Array.isArray(saved.pages)) {
      const pageIds=new Set<string>(),widgetIds=new Set<string>();
      for(const page of saved.pages) {
        if(!page||typeof page!=="object"||typeof page.id!=="string"||!page.id||pageIds.has(page.id)||!Array.isArray(page.widgets))throw new Error("工作台页面配置无效或编号重复，原文件保持不变。");
        pageIds.add(page.id);
        for(const widget of page.widgets) {
          if(!widget||typeof widget!=="object"||typeof widget.id!=="string"||!widget.id||widgetIds.has(widget.id)||typeof widget.kind!=="string"||!widget.kind)throw new Error("组件配置无效或编号重复，原文件保持不变。");
          widgetIds.add(widget.id);
        }
      }
    }
    this.settings = sanitizeSettings(raw);
    this.settings.personal=personalSettings(saved.personal??saved);
    this.personal=new PersonalServices(this,this.settings.personal);
    if(!Array.isArray(saved.pages)) {
      this.settings.pages=createPersonalPages();this.settings.activePageId=this.settings.pages[0].id;
      this.settings.openOnStartup=this.settings.personal.autoOpen;
    }
  }

  /** 合并短时间内的多次保存，避免拖拽/打卡时频繁写盘。 */
  saveSettings(): Promise<void> {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    if (!this.pendingSave) {
      this.pendingSave = new Promise<void>((resolve,reject) => {
        this.resolveSave = resolve;
        this.rejectSave = reject;
      });
      // Some upstream click handlers intentionally fire and forget.
      this.pendingSave.catch(()=>{});
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      const resolve = this.resolveSave;
      const reject = this.rejectSave;
      this.pendingSave = null;
      this.resolveSave = null;
      this.rejectSave = null;
      const snapshot=JSON.parse(JSON.stringify(this.settings)) as HomePagesSettings;
      this.saveChain=this.saveChain.catch(()=>{}).then(()=>this.saveData(snapshot));
      void this.saveChain.then(()=>resolve?.(),error=>{new Notice("布局未能保存，调整仍保留在当前页面，请重试。",8000);reject?.(error);});
    }, 200);
    return this.pendingSave;
  }

  getActivePage(): HomePage {
    const { pages, activePageId } = this.settings;
    const page = pages.find((item) => item.id === activePageId);
    if (page) return page;
    if (pages.length === 0) pages.push(createDefaultPage());
    this.settings.activePageId = pages[0].id;
    return pages[0];
  }

  /** 老布局升级：把三个数据源组件补到当前页（已存在的跳过）。 */
  async addSourceWidgets(): Promise<void> {
    await this.ready;
    if(!this.active)return;
    const page = this.getActivePage();
    const wanted: Array<[WidgetKind, string]> = [["duowei", "待办与日程"], ["annotations", "批注与复习"], ["wechat", "微信收件"]];
    let added = 0;
    for (const [kind, title] of wanted) {
      if (page.widgets.some((widget) => widget.kind === kind)) continue;
      page.widgets.push(createWidgetInstance(kind, { w: 6, h: 7, title }));
      added += 1;
    }
    await this.saveSettings();
    this.refreshViews();
    new Notice(added > 0 ? `已加入 ${added} 个组件，可在“编辑布局”里调整位置` : "这三个组件已经在当前页上了");
  }

  openSettings(): void {
    const setting = (this.app as unknown as SettingApp).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

  // ---- 视图 ----------------------------------------------------------------

  getHomeLeaves(): WorkspaceLeaf[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE_HOME);
  }

  getActiveHomeView(): HomeView | null {
    const view = this.app.workspace.getActiveViewOfType(HomeView);
    return view ?? null;
  }

  async openHome(): Promise<void> {
    if(!this.active)return;
    if(this.opening)return this.opening;
    this.opening=this.openHomeLeaf();
    try {await this.opening;}finally{this.opening=null;}
  }
  private async openHomeLeaf(): Promise<void> {
    const existing = this.getHomeLeaves()[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    const leaf = this.settings.openInNewTab ? this.app.workspace.getLeaf("tab") : this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_HOME, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  private async openPersonalPage(name: string, focus=false): Promise<void> {
    try {await this.ready;await this.openHome();const page=this.settings.pages.find(page=>page.name===name);const view=this.getHomeLeaves()[0]?.view;if(view instanceof HomeView&&page){await view.switchPage(page.id);if(focus)view.contentEl.querySelector<HTMLTextAreaElement>(".hp-personal-capture textarea")?.focus();}}
    catch(error){new Notice(error instanceof Error?error.message:"个人空间暂时无法打开。");}
  }

  refreshViews(options: { layoutOnly?: boolean; kind?: string } = {}): void {
    if(!this.active)return;
    for (const leaf of this.getHomeLeaves()) {
      const view = leaf.view;
      if (!(view instanceof HomeView)) continue;
      if (options.layoutOnly) view.applyLayout();
      else if (options.kind) view.refreshKind(options.kind);
      else view.render();
    }
  }
}
