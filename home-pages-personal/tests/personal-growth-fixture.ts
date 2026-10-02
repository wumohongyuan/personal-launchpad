import { personalGrowthWidget, personalHealthWidget, personalReviewWidget, personalKnowledgeWidget, parsePlanFields, phaseTaskId, reviewDraft } from "../src/personal/growth-widgets";
import type { WidgetContext, WidgetDefinition } from "../src/widgets/types";
const { VaultStore } = require("../src/personal/data/store.js");
const { WorkbenchStore } = require("../src/personal/data/workbench-store.js");
const { DEFAULTS, dateKey, weekStart, shiftDate } = require("../src/personal/data/model.js");

function element(tag: string, options: DomElementInfo = {}): HTMLElement {
  const node = document.createElement(tag);
  if (options.cls) node.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
  if (options.text) node.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr || {})) node.setAttribute(key, String(value));
  return node;
}
Object.assign(HTMLElement.prototype, {
  createEl(this: HTMLElement, tag: string, options: DomElementInfo) { return this.appendChild(element(tag, options)); },
  createDiv(this: HTMLElement, options: DomElementInfo) { return this.appendChild(element("div", options)); },
  createSpan(this: HTMLElement, options: DomElementInfo) { return this.appendChild(element("span", options)); },
  empty(this: HTMLElement) { this.replaceChildren(); }, addClass(this: HTMLElement, ...names: string[]) { this.classList.add(...names); },
  setText(this: HTMLElement, text: string) { this.textContent = text; }
});

interface File { path: string; content?: string; extension?: string; basename?: string; children?: unknown[]; stat?: { mtime: number } }
class FakeVault {
  files = new Map<string, File>(); fail = false;
  getAbstractFileByPath(path: string): File | null { return this.files.get(path) || null; }
  getMarkdownFiles(): File[] { return [...this.files.values()].filter(file => file.extension === "md"); }
  async createFolder(path: string): Promise<void> { if (this.files.has(path)) throw Error("exists"); this.files.set(path, { path, children: [] }); }
  async create(path: string, content: string): Promise<File> { if (this.fail) throw Error("disk full"); if (this.files.has(path)) throw Error("exists"); const file = { path, content, extension: path.split(".").pop(), basename: path.split("/").pop()!.replace(/\.md$/, ""), stat: { mtime: Date.now() } }; this.files.set(path, file); return file; }
  async read(file: File): Promise<string> { return file.content || ""; }
  async cachedRead(file: File): Promise<string> { return this.read(file); }
  async process(file: File, transform: (text: string) => string): Promise<string> { if (this.fail) throw Error("disk full"); return file.content = transform(file.content || ""); }
}
const definitions: Record<string, WidgetDefinition<Record<string, unknown>>> = { growth: personalGrowthWidget, health: personalHealthWidget, review: personalReviewWidget, knowledge: personalKnowledgeWidget };
let vault: FakeVault, store: any, workbench: any, service: any;
let cleanups: (() => void)[] = [], intervals: (() => void)[] = [], opened: string[] = [], refreshes: string[] = [];
let forms: Record<string, string>[] = [], drafts = new Map<string, string>(), generation = 0, selected = "growth";
async function mount(kind = selected): Promise<void> {
  selected = kind; cleanups.forEach(cleanup => cleanup()); cleanups = []; intervals = []; generation += 1; const token = generation;
  document.body.replaceChildren(); const root = document.body.appendChild(element("section", { cls: "hp-card" })); const header = root.createDiv({ cls: "hp-personal-toolbar" }); const body = root.createDiv({ cls: "hp-card-body" });
  const definition = definitions[kind];
  const ctx = {
    app: { vault }, plugin: { personal: service, refreshViews: ({ kind }: { kind: string }) => refreshes.push(kind) }, widget: { id: kind, kind: definition.kind, config: {}, w: 12, h: 10 }, config: definition.defaultConfig(),
    component: {}, saveConfig: async () => {}, rerender: () => { void mount(); }, openPath: async (path: string) => { opened.push(path); }, setSubtitle: (text: string) => root.setAttribute("data-subtitle", text),
    addHeaderAction: (_icon: string, label: string, callback: () => void) => { const action = header.createEl("button", { text: label }); action.addEventListener("click", callback); return action; },
    registerCleanup: (callback: () => void) => cleanups.push(callback), registerInterval: (callback: () => void) => intervals.push(callback), isAlive: () => generation === token && body.isConnected, isEditing: () => false
  } as unknown as WidgetContext<Record<string, unknown>>;
  await definition.render(body, ctx);
}
async function reset(kind: string): Promise<void> {
  vault = new FakeVault(); store = new VaultStore(vault, { ...DEFAULTS }); workbench = new WorkbenchStore(store); opened = []; refreshes = []; forms = []; drafts = new Map();
  await vault.create(`${DEFAULTS.legacyFolder}/配置/launchpad.json`, JSON.stringify({ growth: { planId: "legacy180", startDate: shiftDate(dateKey(), -28), externalFeedback: [], completedMilestones: [] }, health: { workouts: [], weeklyGoal: 3 } }));
  const notes = store.notes.bind(store); store.notes = async (query: string, ...args: unknown[]) => { if (query === "慢查询") await new Promise(resolve => setTimeout(resolve, 850)); return notes(query, ...args); };
  service = {
    store, workbench, readDraft: (key: string) => drafts.get(key) || "", writeDraft: (key: string, value: string) => drafts.set(key, value),
    form: async (_title: string, _fields: unknown[], commit: (values: Record<string, string>) => Promise<unknown>) => { const values = forms.shift(); if (!values) return null; await commit(values); return values; },
    openFile: async (path: string, content?: string) => { if (!vault.getAbstractFileByPath(path) && content !== undefined) await vault.create(path, content); opened.push(path); },
    promote: async () => { await vault.create(`${DEFAULTS.knowledgeFolder}/新知识.md`, "新笔记"); }
  };
  await mount(kind);
}
Object.assign(window, { growthFixture: {
  reset, mount, tick: () => intervals.forEach(callback => callback()), queueForm: (values: Record<string, string>) => forms.push(values),
  state: () => workbench.load(), today: () => store.day(dateKey()), fail: (value: boolean) => { vault.fail = value; },
  files: () => [...vault.files.values()].filter(file => file.extension === "md"), opened: () => opened, refreshes: () => refreshes,
  addNote: (title: string, body: string) => vault.create(`${DEFAULTS.knowledgeFolder}/${title}.md`, body),
  draft: (key: string) => drafts.get(key), week: () => weekStart(), parsePlanFields, phaseTaskId, reviewDraft,
  plan: async () => workbench.growth(await workbench.load())
} });
