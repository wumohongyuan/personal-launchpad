import HomePagesPlugin from "../src/main";
import { HomeView, VIEW_TYPE_HOME } from "../src/view";
import { registerWidget } from "../src/widgets/registry";
import { TFile } from "obsidian";
import { Notice } from "./personal-lifecycle-stub";
import { RenewalReminders } from "../src/personal/renewal-reminders";

function element(tag: string, options: any = {}): HTMLElement {
  if (typeof options === "string") options = { cls: options };
  const node = document.createElement(tag);
  if (options.cls) node.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
  if (options.text) node.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr || {})) node.setAttribute(key, String(value));
  if (options.type) node.setAttribute("type", options.type);
  if (options.value) node.setAttribute("value", options.value);
  return node;
}
Object.assign(HTMLElement.prototype, {
  createEl(this: HTMLElement, tag: string, options: any) { return this.appendChild(element(tag, options)); },
  createDiv(this: HTMLElement, options: any) { return this.appendChild(element("div", options)); },
  createSpan(this: HTMLElement, options: any) { return this.appendChild(element("span", options)); },
  empty(this: HTMLElement) { this.replaceChildren(); }, addClass(this: HTMLElement, ...names: string[]) { this.classList.add(...names); },
  removeClass(this: HTMLElement, ...names: string[]) { this.classList.remove(...names); },
  toggleClass(this: HTMLElement, name: string, value: boolean) { this.classList.toggle(name, value); },
  setText(this: HTMLElement, value: string) { this.textContent = value; }
});
Object.assign(globalThis, { createDiv: (options: any) => element("div", options) });

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
function rawSettings(): any {
  return { pages: [
    { id: "p1", name: "保存的工作台", widgets: [{ id: "w1", kind: "lifecycle-missing", w: 6, h: 4, config: { preserved: "原始配置" } }] },
    { id: "p2", name: "第二页", widgets: [] }
  ], activePageId: "p1", openOnStartup: false, customWidgetsFolder: "" };
}
let plugin: HomePagesPlugin, app: any, loaded: ReturnType<typeof deferred<unknown>>, raw: any;
let writes: any[] = [], saves: ReturnType<typeof deferred<void>>[] = [], manualSave = false, events: string[] = [], opening: Promise<void> | undefined;
let unregisterWidget: (() => void) | undefined;
async function closeView(view: HomeView): Promise<void> { await view.onClose(); for (const clean of (view as any).cleanups || []) clean(); }
function unload(): void { plugin.onunload(); for (const clean of (plugin as any).cleanups || []) clean(); (plugin as any).cleanups = []; }
async function reset(options: { pending?: boolean; raw?: unknown } = {}): Promise<void> {
  if (plugin) { unload(); for (const leaf of app.workspace.leaves) await closeView(leaf.view); }
  unregisterWidget?.(); unregisterWidget = undefined;
  document.body.replaceChildren(); writes = []; saves = []; events = []; manualSave = false; opening = undefined; Notice.messages = [];
  raw = options.raw === undefined ? rawSettings() : options.raw; loaded = deferred<unknown>();
  const workspace: any = {
    factories: new Map(), leaves: [], activeLeaf: null, layouts: [],
    getLeavesOfType(type: string) { return this.leaves.filter((leaf: any) => leaf.type === type); },
    getLeaf() {
      const leaf: any = { app, contentEl: document.body.appendChild(element("div")), type: "", view: null, updateHeader() {},
        async setViewState(state: any) { this.type = state.type; this.view = workspace.factories.get(state.type)(this); await this.view.onOpen(); }
      };
      this.leaves.push(leaf); return leaf;
    },
    async revealLeaf(leaf: any) { this.activeLeaf = leaf; },
    setActiveLeaf(leaf: any) { this.activeLeaf = leaf; },
    getActiveViewOfType() { return this.activeLeaf?.view; },
    onLayoutReady(callback: () => void) { this.layouts.push(callback); },
    trigger(name: string) { events.push(name); }, on() { return {}; }
  };
  app = { workspace, vault: { on() { return {}; }, getAbstractFileByPath() { return null; }, getMarkdownFiles() { return []; } }, metadataCache: { on() { return {}; } },
    loadLocalStorage() { return null; }, saveLocalStorage() {},
    testLoad: () => loaded.promise,
    testSave: (value: unknown) => { writes.push(JSON.parse(JSON.stringify(value))); if (!manualSave) return Promise.resolve(); const save = deferred<void>(); saves.push(save); return save.promise; }
  };
  plugin = new HomePagesPlugin(app as any, { id: "personal-launchpad" } as any);
  await plugin.onload();
  if (!options.pending) { loaded.resolve(raw); await plugin.ready; }
}
async function open(): Promise<void> { await plugin.openHome(); }
const view = () => app.workspace.leaves[0]?.view as HomeView;

Object.assign(window, { lifecycleFixture: {
  reset, sleep, open, plugin: () => plugin, view, writes: () => writes, events: () => events,
  roots: () => document.querySelectorAll(".hp-root").length,
  registered: () => app.workspace.factories.has(VIEW_TYPE_HOME), viewType: () => VIEW_TYPE_HOME,
  beginOpen: () => { opening = plugin.openHome(); opening.catch(() => {}); },
  beginOpenTwice: () => { opening = Promise.all([plugin.openHome(), plugin.openHome()]).then(() => {}); },
  finishOpen: () => opening,
  resolveLoad: async () => { loaded.resolve(raw); await plugin.ready; },
  rejectLoad: async () => { loaded.reject(new Error("模拟配置读取失败")); await plugin.ready.catch(() => {}); },
  close: () => closeView(view()), unload,
  leaves: () => app.workspace.leaves.length,
  async queueScenario() {
    await reset(); manualSave = true;
    plugin.settings.gap = 12; const first = plugin.saveSettings(); await sleep(230);
    plugin.settings.gap = 24; const second = plugin.saveSettings(); await sleep(230);
    const inFlightCount = writes.length;
    saves[0].resolve(); await first; await sleep();
    saves[1].resolve(); await second;
    plugin.settings.gap = 30; const bad = plugin.saveSettings(); const handled = bad.catch(() => "rejected"); await sleep(230); saves[2].reject(Error("磁盘写入失败")); const rejection = await handled;
    plugin.settings.gap = 32; const retry = plugin.saveSettings(); await sleep(230); saves[3].resolve(); await retry;
    plugin.settings.gap = 36; const flush = plugin.saveSettings(); plugin.onunload(); await sleep(); saves[4].resolve(); await flush;
    return { inFlightCount, gaps: writes.map(value => value.gap), rejection };
  },
  async pendingPin() {
    await reset({ pending: true });
    const result = plugin.api.pinWidget("lifecycle-new", {}, { open: false });
    await sleep(250); const writesBeforeReady = writes.length;
    loaded.resolve(raw); await plugin.ready; await result;
    return { writesBeforeReady, ids: plugin.settings.pages.map(page => page.id), kinds: plugin.settings.pages[0].widgets.map(widget => widget.kind), persisted: writes.at(-1)?.pages[0].widgets.map((widget: any) => widget.kind) };
  },
  async delayedDuplicate() {
    await reset(); await open();
    const current = view() as any;
    const duplicating = current.duplicateWidget("w1");
    plugin.settings.activePageId = "p2"; current.render();
    await duplicating;
    return { cards: document.querySelectorAll(".hp-card").length, firstPageItems: plugin.settings.pages[0].widgets.length, active: plugin.settings.activePageId };
  },
  async disposedHost() {
    await reset(); const pending = deferred(); let ctx: any, lateCleanups = 0, renders = 0;
    unregisterWidget = registerWidget({ kind: "lifecycle-slow", name: "测试异步卡片", icon: "clock", defaultSize: { w: 6, h: 4 }, defaultConfig: () => ({}),
      async render(_body: HTMLElement, context: any) { ctx = context; renders++; await pending.promise; context.registerCleanup(() => lateCleanups++); }
    } as any);
    plugin.settings.pages[0].widgets[0].kind = "lifecycle-slow";
    await open(); await closeView(view()); const aliveAfterClose = ctx.isAlive(); pending.resolve(); await sleep();
    const cleanupsBeforeStaleRender = lateCleanups;
    ctx.rerender(); await sleep();
    return { aliveAfterClose, lateCleanups, cleanupsBeforeStaleRender, renders };
  },
  async busyForm() {
    await reset(); const pending = deferred(); let commits = 0;
    const result = plugin.personal.form("测试保存", [{ key: "text", label: "正文", value: "不能丢失" }], () => { commits++; return pending.promise; });
    const form = document.querySelector(".hp-personal-form form") as HTMLFormElement; form.requestSubmit(); await sleep();
    plugin.onunload(); const connectedAfterUnload = form.isConnected;
    pending.reject(Error("磁盘暂时不可写")); await sleep();
    form.requestSubmit(); await sleep();
    let settled = false; result.then(() => { settled = true; }); await sleep();
    return { connectedAfterUnload, commits, settled, value: form.querySelector("input")?.value };
  },
  async invalidSettings() {
    const invalid = [
      { pages: [{ id: "p1", name: "不能清空", widgets: "corrupt" }] },
      { pages: [{ id: "p1", widgets: [] }, { id: "p1", widgets: [] }] },
      { pages: [{ id: "p1", widgets: [{ id: "w", kind: "x" }, { id: "w", kind: "x" }] }] }
    ];
    const rejected: boolean[] = [];
    for (const value of invalid) { await reset({ pending: true, raw: value }); loaded.resolve(raw); try { await plugin.ready; rejected.push(false); } catch { rejected.push(true); } }
    return rejected;
  },
  async readyNotification() {
    await reset({ pending: true });
    const running = Promise.all(app.workspace.layouts.map((callback: () => Promise<void>) => callback()));
    const before = [...events];
    // External component registration/refresh can happen while the restored view awaits ready.
    opening = plugin.openHome(); plugin.refreshViews(); plugin.refreshViews({ layoutOnly: true });
    loaded.resolve(raw); await plugin.ready; await running; await opening;
    return { before, after: events, roots: document.querySelectorAll(".hp-root").length };
  },
  async unloadedCustomScript() {
    await reset();
    const pending = deferred(); app.testScriptReady = pending.promise;
    app.vault.read = async () => 'await app.testScriptReady; module.exports = { kind:"lifecycle-slow-script",name:"Slow custom",defaultConfig(){return{};},render(){} };';
    const file = new TFile(); file.path = "widgets/slow.js"; file.name = "slow.js"; file.extension = "js";
    const loading = plugin.customWidgetManager.loadFile(file, false, true);
    await sleep(); plugin.onunload(); pending.resolve(); await loading; await sleep(250);
    return { loaded: plugin.customWidgetManager.getLoadedWidgets().length, added: plugin.settings.pages.some(page => page.widgets.some(widget => widget.kind === "lifecycle-slow-script")), writes: writes.length };
  },
  async staleCustomScripts() {
    await reset();
    const manager = plugin.customWidgetManager, pending = deferred(); app.testScriptReady = pending.promise;
    let source = 'await app.testScriptReady; module.exports={kind:"lifecycle-old-script",name:"old",render(){}};';
    app.vault.read = async () => source;
    const file = new TFile(); file.path = "widgets/race.js"; file.name = "race.js"; file.extension = "js";
    const stale = manager.loadFile(file, false, false); await sleep();
    source = 'module.exports={kind:"lifecycle-new-script",name:"new",render(){}};';
    await manager.loadFile(file, false, false); pending.resolve(); await stale;
    const newest = manager.getLoadedWidgets().map(item => item.kind);
    const pendingUnload = deferred(); app.testScriptReady = pendingUnload.promise;
    source = 'await app.testScriptReady; module.exports={kind:"lifecycle-after-unload",name:"gone",render(){}};';
    const loading = manager.loadFile(file, false, false); await sleep(); manager.unloadAll(); pendingUnload.resolve(); await loading;
    const afterUnload = manager.getLoadedWidgets().length;
    const pendingDelete = deferred(); app.testScriptReady = pendingDelete.promise;
    const deleted = manager.loadFile(file, false, false); await sleep(); manager.unloadFile(file.path); pendingDelete.resolve(); await deleted;
    return { newest, afterUnload, afterDelete: manager.getLoadedWidgets().length, stillActive: plugin.active, writes: writes.length };
  },
  async reminders() {
    await reset();
    const OriginalDate = Date, local = new Map(), originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let now = new OriginalDate(2026, 9, 3, 12).getTime(), visibility = "visible", reads = 0;
    class ClockDate extends OriginalDate { constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); } static now() { return now; } }
    Object.defineProperty(window, "Date", { configurable: true, writable: true, value: ClockDate });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    app.loadLocalStorage = (key: string) => local.get(key); app.saveLocalStorage = (key: string, value: string) => local.set(key, value);
    const due = [{ id: "demo", name: "合成订阅", amount: 3000, nextDue: "2026-10-03", daysUntil: 0, overdue: false }];
    plugin.personal.settings.renewalReminders = true;
    const finance = { due: async () => { reads++; return due; } }; Object.defineProperty(plugin.personal, "finance", { value: finance });
    const reminder = new RenewalReminders(plugin);
    try {
      await reminder.check(); await reminder.check(); const sameDay = Notice.messages.length;
      now = new OriginalDate(2026, 9, 4, 12).getTime(); await reminder.check(); const nextDay = Notice.messages.length;
      now = new OriginalDate(2026, 9, 5, 12).getTime(); visibility = "hidden"; const beforeHiddenReads = reads; await reminder.check(); const hidden = { notices: Notice.messages.length, read: reads !== beforeHiddenReads };
      visibility = "visible"; plugin.personal.settings.renewalReminders = false; await reminder.check(); const disabled = Notice.messages.length;
      plugin.personal.settings.renewalReminders = true;
      const waiting = deferred<typeof due>(); finance.due = () => waiting.promise; const check = reminder.check();
      visibility = "hidden"; waiting.resolve(due); await check;
      return { sameDay, nextDay, hidden, disabled, hiddenWhileReading: Notice.messages.length, history: JSON.parse(local.get("personal-launchpad:renewal-alerts")), writes: writes.length };
    } finally {
      Object.defineProperty(window, "Date", { configurable: true, writable: true, value: OriginalDate });
      if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility); else delete (document as any).visibilityState;
    }
  }
} });
