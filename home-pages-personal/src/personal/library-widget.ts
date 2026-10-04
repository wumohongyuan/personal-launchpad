import { Component, MarkdownRenderer, Notice, Setting, TFile, setIcon } from "obsidian";
import type { WidgetContext, WidgetDefinition } from "../widgets/types";
import { clampInt } from "../widgets/types";

import type HomePagesPlugin from "../main";

type Config = Record<string, unknown>;
type NoteKind = "reflection" | "feeling" | "quote";
interface Book extends Record<string, unknown> {
  id: string;
  title: string;
  author: string;
  status: string;
  current: number;
  total: number;
  category: string;
  cover: string;
  path?: string;
  finishedAt?: string;
  source?: Record<string, unknown>;
}
interface ReadingNote { id: string; kind: NoteKind; text: string; date: string; time: string; block: string }
interface BookDetail { path: string; content: string; notes: ReadingNote[]; original: string; preview: string }
interface Field { key: string; label: string; value?: string; type?: string; multiline?: boolean; hint?: string; options?: string[][]; group?: string; vaultImage?: boolean; focus?: boolean }
interface PersonalServices {
  readDraft?(key:string):string;
  writeDraft?(key:string,value:string):void;
  library: {
    list(): Promise<Book[]>;
    saveBook(input: Record<string, unknown>, original?: Book): Promise<Book>;
    detail(book: Book): Promise<BookDetail>;
    ensureNote(book: Book): Promise<string>;
    appendNote(book: Book, text: string, kind: NoteKind, id: string, finish?: boolean): Promise<string>;
    updateNote(book: Book, note: ReadingNote, text: string): Promise<string>;
  };
  form(title: string, fields: Field[], commit: (values: Record<string, string>) => Promise<unknown>,onChange?: (values:Record<string,string>)=>void): Promise<Record<string, string> | null>;
  openFile(path: string, content?: string, subpath?: string): Promise<unknown>;
  promote(entry: { text: string; path: string; legacy: boolean }): Promise<unknown>;
}

const statuses = ["想读", "在读", "已读"];
const noteNames: Record<NoteKind, string> = { reflection: "读书心得", feeling: "感受与联想", quote: "摘录" };
const defaults: Config = { status: "全部", category: "", displayCount: 24 };

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const node = parent.ownerDocument.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function newId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

class LibraryPanel {
  private readonly personal: PersonalServices;
  private readonly root: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly content: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly categorySelect: HTMLSelectElement;
  private readonly tabs = new Map<string, HTMLButtonElement>();
  private readonly displayCount: number;
  private activeStatus: string;
  private activeCategory: string;
  private selected: string | null = null;
  private query = "";
  private shown: number;
  private generation = 0;
  private forms = 0;
  private changedDuringForm = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private markdownChildren:Component[]=[];

  constructor(body: HTMLElement, private readonly ctx: WidgetContext<Config>) {
    this.personal = (ctx.plugin as unknown as { personal: PersonalServices }).personal;
    this.displayCount = clampInt(ctx.config.displayCount, 1, 100, 24);
    this.shown = this.displayCount;
    this.activeStatus = ["全部", ...statuses].includes(String(ctx.config.status)) ? String(ctx.config.status) : "全部";
    this.activeCategory = String(ctx.config.category || "");
    this.root = el(body, "section", "hp-personal-library");
    this.root.setAttribute("aria-label", "我的图书馆");
    this.controls = el(this.root, "div", "hp-pl-controls");
    const toolbar = el(this.controls, "div", "hp-pl-toolbar");
    const searchField = el(toolbar, "label", "hp-pl-search");
    setIcon(el(searchField, "span", "hp-pl-icon"), "search");
    this.search = el(searchField, "input");
    this.search.type = "search";
    this.search.placeholder = "书名、作者或分类";
    this.search.setAttribute("aria-label", "搜索图书馆");
    this.search.addEventListener("input", () => {
      this.query = this.search.value;
      this.selected = null;
      this.shown = this.displayCount;
      this.schedule(150);
    });
    this.button(toolbar, "添加书籍", () => this.editBook(), "plus", true);
    const filters = el(this.controls, "div", "hp-pl-filters");
    const tabs = el(filters, "div", "hp-pl-tabs");
    tabs.setAttribute("aria-label", "阅读状态");
    for (const status of ["全部", ...statuses]) {
      const button = this.button(tabs, status, async () => {
        this.activeStatus = status;
        this.selected = null;
        this.shown = this.displayCount;
        await this.load();
      });
      this.tabs.set(status, button);
    }
    this.categorySelect = el(filters, "select", "hp-pl-category");
    this.categorySelect.setAttribute("aria-label", "图书分类");
    this.categorySelect.addEventListener("change", () => {
      this.activeCategory = this.categorySelect.value;
      this.selected = null;
      this.shown = this.displayCount;
      void this.load();
    });
    this.summary = el(this.root, "p", "hp-pl-summary");
    this.statusEl = el(this.root, "p", "hp-pl-status");
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    this.content = el(this.root, "div", "hp-pl-content");
    ctx.addHeaderAction("plus", "添加一本书", () => { void this.run(() => this.editBook()); });
    ctx.addHeaderAction("refresh-cw", "刷新图书馆", () => { void this.load(); });
    const changed = () => this.schedule(250);
    const vault = ctx.app.vault;
    const refs = [vault.on("create", changed), vault.on("modify", changed), vault.on("delete", changed), vault.on("rename", changed)];
    ctx.registerCleanup(() => {
      this.disposed = true;this.clearMarkdown();
      this.generation++;
      if (this.timer) clearTimeout(this.timer);
      refs.forEach(ref => vault.offref(ref));
    });
  }

  private alive(token?: number): boolean { return !this.disposed && this.ctx.isAlive() && (token === undefined || token === this.generation); }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.load(); }, delay);
  }

  private async run(action: () => Promise<unknown>, button?: HTMLButtonElement): Promise<void> {
    if (!this.alive() || button?.disabled || this.ctx.isEditing()) return;
    if (button) button.disabled = true;
    try { await action(); }
    catch (error) { this.report(error instanceof Error ? error.message : "操作失败，请重试。", true); }
    finally { if (button?.isConnected) button.disabled = false; }
  }

  private button(parent: HTMLElement, label: string, action: () => Promise<unknown>, icon?: string, primary = false): HTMLButtonElement {
    const button = el(parent, "button", `hp-pl-button${primary ? " mod-cta" : ""}`);
    button.type = "button";
    if (icon) { const mark = el(button, "span", "hp-pl-icon"); mark.setAttribute("aria-hidden", "true"); setIcon(mark, icon); }
    el(button, "span", "", label);
    button.addEventListener("click", () => { void this.run(action, button); });
    return button;
  }

  private report(message: string, error = false): void {
    if (!this.alive()) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("is-error", error);
    if (error) new Notice(message);
  }

  private async withForm<T>(action: () => Promise<T>): Promise<T> {
    this.forms++;
    try { return await action(); }
    finally {
      this.forms--;
      if (!this.forms && this.changedDuringForm && this.alive()) { this.changedDuringForm = false; this.schedule(0); }
    }
  }

  async load(): Promise<void> {
    if (!this.alive()) return;
    if (this.forms) { this.changedDuringForm = true; return; }
    const token = ++this.generation;
    try {
      const books = await this.personal.library.list();
      if (!this.alive(token)) return;
      if (this.forms) { this.changedDuringForm = true; return; }
      this.ctx.setSubtitle(`${books.length} 本藏书 · ${books.filter(book => book.status === "已读").length} 本已读`);
      this.tabs.forEach((button, status) => button.setAttribute("aria-pressed", String(status === this.activeStatus)));
      const categories = [...new Set(books.map(book => book.category || "未分类"))].sort();
      if (this.activeCategory && !categories.includes(this.activeCategory)) categories.unshift(this.activeCategory);
      this.categorySelect.replaceChildren();
      const all = el(this.categorySelect, "option", "", "所有分类"); all.value = "";
      for (const category of categories) { const option = el(this.categorySelect, "option", "", category); option.value = category; }
      this.categorySelect.value = this.activeCategory;
      const selected = books.find(book => String(book.id) === this.selected);
      if (selected) {
        const detail = await this.personal.library.detail(selected);
        if (!this.alive(token)) return;
        if (this.forms) { this.changedDuringForm = true; return; }
        this.controls.hidden = true;
        this.summary.hidden = true;
        await this.renderDetail(selected, detail,token);
      } else {
        this.selected = null;
        this.controls.hidden = false;
        this.summary.hidden = false;
        this.renderShelf(books);
      }
    } catch (error) {
      if (!this.alive(token)) return;
      this.report(`图书馆读取失败：${error instanceof Error ? error.message : String(error)}。请点卡片右上角刷新重试。`, true);
    }
  }

  private renderShelf(books: Book[]): void {
    this.clearMarkdown();
    this.content.replaceChildren();
    const words = this.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered = books.filter(book => (this.activeStatus === "全部" || book.status === this.activeStatus)
      && (!this.activeCategory || book.category === this.activeCategory)
      && words.every(word => `${book.title} ${book.author} ${book.category}`.toLocaleLowerCase().includes(word)));
    this.summary.textContent = `${filtered.length} 本${this.activeStatus === "全部" ? "藏书" : this.activeStatus} · 一本书，一份自己的理解`;
    if (!filtered.length) {
      const empty = el(this.content, "div", "hp-empty");
      el(empty, "strong", "", books.length ? "这层书架暂时没有匹配的书" : "留一个位置，给下一本影响你的书");
      el(empty, "span", "", books.length ? "试试其他关键词、状态或分类。" : "添加一本书，把摘录和读完后的心得放在一起。");
      if (!books.length) this.button(empty, "添加第一本书", () => this.editBook(), "plus");
      return;
    }
    const last=this.personal.readDraft?.("library:last-book");
    const resume=books.find(book=>book.id===last&&book.status==="在读")||books.find(book=>book.status==="在读");
    if(resume&&!this.query)this.button(this.content,`继续阅读《${resume.title}》`,async()=>{this.selected=resume.id;await this.load();},"book-open",true);
    const shelf = el(this.content, "div", "hp-pl-shelf");
    for (const book of filtered.slice(0, this.shown)) {
      const card = el(shelf, "article", "hp-pl-book");
      const open = this.button(card, "", async () => { this.selected = String(book.id); await this.load(); this.root.scrollTop = 0; });
      open.classList.add("hp-pl-book-open"); open.setAttribute("aria-label", `打开《${book.title}》`); open.replaceChildren();
      this.cover(open, book);
      el(open, "strong", "hp-pl-book-title", book.title);
      el(open, "span", "hp-pl-author", book.author || "作者待补充");
      const meta = el(card, "div", "hp-pl-book-meta");
      el(meta, "span", "hp-pl-badge", book.status); el(meta, "span", "hp-pl-category-label", book.category || "未分类");
      if (book.status === "在读" && book.total) {
        const progress = el(card, "progress", "hp-pl-progress"); progress.max = book.total; progress.value = book.current;
        progress.setAttribute("aria-label", `${book.title} 阅读进度`);
      }
      el(card, "span", "hp-pl-book-foot", book.status === "已读" ? `${book.finishedAt || ""} 已收进书架`.trim() : book.total ? `${book.current} / ${book.total} 页` : "打开，写下阅读记录");
    }
    if (filtered.length > this.shown) this.button(this.content, `再显示 ${Math.min(this.displayCount, filtered.length - this.shown)} 本`, async () => { this.shown += this.displayCount; await this.load(); });
  }

  private cover(parent: HTMLElement, book: Book): HTMLElement {
    let hash = 0; for (const char of book.title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const cover = el(parent, "span", `hp-pl-cover hp-pl-cover-${hash % 4}`);
    el(cover, "span", "hp-pl-cover-label", "MY LIBRARY");
    el(cover, "span", "hp-pl-cover-title", book.title);
    el(cover, "span", "hp-pl-cover-author", book.author || "私人藏书");
    let url = "";
    if (book.cover) {
      try {
        if (/^https:\/\//i.test(book.cover)) {
          const parsed = new URL(book.cover);
          if (!parsed.username && !parsed.password) url = parsed.href;
        } else if (!book.cover.startsWith("/") && !book.cover.split(/[\\/]/).some(part => part === ".." || part.startsWith(".")) && /\.(png|jpe?g|gif|webp|avif)$/i.test(book.cover)) {
          const file = this.ctx.app.vault.getAbstractFileByPath(book.cover);
          if (file instanceof TFile) url = this.ctx.app.vault.getResourcePath(file);
        }
      } catch { /* Keep the generated book cover when a supplied cover is unavailable. */ }
    }
    if (url) {
      const image = el(cover, "img", "hp-pl-cover-image"); image.src = url; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove(), { once: true });
    }
    return cover;
  }

  private clearMarkdown():void {for(const child of this.markdownChildren)this.ctx.component.removeChild(child);this.markdownChildren=[];}
  private async renderMarkdown(parent:HTMLElement,text:string,path:string):Promise<void>{
    const child=new Component();this.ctx.component.addChild(child);this.markdownChildren.push(child);parent.classList.add("markdown-rendered","hp-pl-markdown");
    await MarkdownRenderer.render(this.ctx.app,text,parent,path,child);
    parent.addEventListener("click",event=>{const link=(event.target as Element).closest<HTMLAnchorElement>("a.internal-link");const href=link?.dataset.href||link?.getAttribute("href");if(href){event.preventDefault();void this.ctx.app.workspace.openLinkText(href,path);}});
  }
  private async renderDetail(book: Book, detail: BookDetail,token:number): Promise<void> {
    this.clearMarkdown();
    this.content.replaceChildren();
    this.button(this.content, "回到书架", async () => { this.selected = null; await this.load(); this.root.scrollTop = 0; }, "arrow-left");
    this.personal.writeDraft?.("library:last-book",book.id);
    const panel = el(this.content, "div", "hp-pl-detail");
    const hero = el(panel, "div", "hp-pl-book-hero"); this.cover(hero, book);
    const info = el(hero, "div", "hp-pl-book-info");
    el(info, "span", "hp-pl-badge", `${book.status} · ${book.category || "未分类"}`);
    el(info, "h3", "", book.title); el(info, "p", "hp-pl-author", book.author || "作者待补充");
    el(info, "p", "hp-pl-summary", book.total ? `${book.current} / ${book.total} 页` : book.current ? `读到第 ${book.current} 页` : "阅读进度可在书籍资料里补充");
    if (book.finishedAt) el(info, "p", "hp-pl-summary", `读完于 ${book.finishedAt}`);
    const actions = el(info, "div", "hp-pl-actions");
    this.button(actions, "写阅读记录", () => this.writeNote(book), "notebook-pen", true);
    if (book.status !== "已读") this.button(actions, "读完，写心得", () => this.writeNote(book, true), "check");
    this.button(actions, "书籍资料", () => this.editBook(book), "pencil");
    this.button(actions, "打开书笔记", async () => { const path = await this.personal.library.ensureNote(book); await this.personal.openFile(path); }, "file-text");
    const notes = el(panel, "section", "hp-pl-notes");
    const heading = el(notes, "div", "hp-pl-note-heading"); el(heading, "h4", "", "我的阅读记录"); el(heading, "span", "hp-pl-summary", `${detail.notes.length} 条`);
    if (!detail.notes.length && !detail.original) el(notes, "div", "hp-empty", "一段摘录、一次联想，或者读完后的理解，都可以留在这里。");
    for (const note of detail.notes) {
      const article = el(notes, "article", "hp-pl-note");
      const meta = el(article, "div", "hp-pl-note-meta"); el(meta, "span", "hp-pl-badge", noteNames[note.kind]); el(meta, "time", "", `${note.date} ${note.time}`);
      await this.renderMarkdown(el(article,"div","hp-pl-prose"),note.text,detail.path);if(!this.alive(token))return;
      const actions = el(article, "div", "hp-pl-actions hp-pl-note-actions");
      this.button(actions, "编辑", () => this.editNote(book, note));
      this.button(actions, "提炼成知识", () => this.withForm(() => this.personal.promote({ text: note.text, path: detail.path, legacy: true })), "bookmark-plus");
      this.button(actions, "原文", () => this.personal.openFile(detail.path, undefined, `^pl-book-${note.id}`));
    }
    if (detail.original) {
      const original = el(notes, "section", "hp-pl-original"); el(original, "h4", "", "原有摘录与笔记");
      await this.renderMarkdown(el(original,"div","hp-pl-prose"),detail.original,detail.path);if(!this.alive(token))return;
      const actions = el(original, "div", "hp-pl-actions");
      this.button(actions, "阅读全文", () => this.personal.openFile(detail.path), "file-text");
      this.button(actions, "提炼成知识", () => this.withForm(() => this.personal.promote({ text: detail.original, path: detail.path, legacy: true })), "bookmark-plus");
    }
  }

  private async editBook(book?: Book): Promise<void> {
    const id = book?.id || newId(); let saved: Book | undefined;
    const group = book ? undefined : "补充书籍资料（可选）";
    const values = await this.withForm(() => this.personal.form(book ? "编辑书籍资料" : "添加一本书", [
      { key: "title", label: "书名", value: book?.title || "", hint: book ? undefined : "先加入想读书架，其他资料以后随时补充。" },
      { key: "author", label: "作者", value: book?.author || "", group },
      { key: "status", label: "阅读状态", value: book?.status || "想读", options: statuses.map(status => [status, status]), group },
      { key: "category", label: "分类", value: book?.category || this.activeCategory, hint: "可以用文学、心理学、技术，也可以填写自己的分类。", group },
      { key: "current", label: "当前页数", type: "number", value: String(book?.current || 0), group },
      { key: "total", label: "总页数", type: "number", value: String(book?.total || 0), hint: "不知道总页数时填 0。", group },
      { key: "cover", vaultImage:true, label: "封面（可选）", value: book?.cover || "", hint: "填写库内图片路径或 HTTPS 图片网址。留空会自动生成素色书封。", group }
    ], async values => { saved = await this.personal.library.saveBook({ ...values, id }, book); }));
    if (values && saved && this.alive()) { this.selected = String(saved.id); this.report(book ? "书籍资料已更新。" : "已加入图书馆。可以开始写阅读记录了。"); await this.load(); this.root.scrollTop = 0; }
  }

  private async writeNote(book: Book, finish = false): Promise<void> {
    const key=`personal-reading:${book.id}:${finish?"finish":"note"}`;let draft:{text?:string;kind?:string;id?:string}={};try{draft=JSON.parse(this.personal.readDraft?.(key)||"{}");}catch{}if(!draft||typeof draft!=="object")draft={};let id=draft.id||newId();
    const fields:Field[]=finish?[]:[{key:"kind",label:"记录类型",value:draft.kind||"reflection",options:Object.entries(noteNames)}];
    fields.push({key:"body",label:finish?"这本书带给你什么？可以用在哪里？":"阅读记录",value:draft.text||"",multiline:true,focus:true,hint:finish?"保存心得后，这本书会标记为已读并收进书架。":"支持 Markdown、引用和图片；草稿自动保留。"});
    const values=await this.withForm(()=>this.personal.form(finish?`读完《${book.title}》`:`记录《${book.title}》`,fields,async values=>{await this.personal.library.appendNote(book,values.body,finish?"reflection":values.kind as NoteKind,id,finish);this.personal.writeDraft?.(key,"");},values=>{id=newId();this.personal.writeDraft?.(key,JSON.stringify({text:values.body,kind:finish?"reflection":values.kind,id,bookId:book.id,finish}));}));
    if(values&&this.alive()){this.report(finish?"心得已保存，这本书已收进已读书架。":"阅读记录已保存。");await this.load();}
  }

  private async editNote(book: Book, note: ReadingNote): Promise<void> {
    const values = await this.withForm(() => this.personal.form(`编辑${noteNames[note.kind]}`, [{ key: "body", label: "内容", value: note.text, multiline: true }], values => this.personal.library.updateNote(book, note, values.body)));
    if (values && this.alive()) { this.report("阅读记录已更新。"); await this.load(); }
  }
}

export const personalLibraryWidget: WidgetDefinition<Record<string, unknown>> = {
  kind: "personal-library",
  name: "我的图书馆",
  description: "按本收纳阅读进度、摘录与心得；读完后归档到自己的书架，并把理解提炼成知识。",
  icon: "library",
  accent: "#427257",
  defaultSize: { w: 12, h: 12 },
  liveRefresh: false,
  defaultConfig: () => ({ ...defaults }),
  normalizeConfig: raw => ({ status: ["全部", ...statuses].includes(String(raw.status)) ? String(raw.status) : "全部", category: String(raw.category || "").trim(), displayCount: clampInt(raw.displayCount, 1, 100, 24) }),
  async render(body, ctx) { const panel = new LibraryPanel(body, ctx); await panel.load(); },
  renderSettings(container, ctx) {
    new Setting(container).setName("默认阅读状态").setDesc("可以添加多个图书馆组件，分别展示在读、想读或已读的书。")
      .addDropdown(dropdown => dropdown.addOptions({ 全部: "全部书架", 想读: "想读", 在读: "在读", 已读: "已读" }).setValue(String(ctx.config.status || "全部")).onChange(value => ctx.update({ status: value })));
    new Setting(container).setName("默认分类").setDesc("留空展示所有分类；例如文学、学习方法。")
      .addText(text => text.setValue(String(ctx.config.category || "")).onChange(value => ctx.update({ category: value.trim() })));
    new Setting(container).setName("每次显示书籍数").setDesc("超过数量时，书架底部可以继续加载。")
      .addSlider(slider => slider.setLimits(1, 100, 1).setValue(clampInt(ctx.config.displayCount, 1, 100, 24)).setDynamicTooltip().onChange(value => ctx.update({ displayCount: value })));
  }
};

export async function quickReading(plugin:HomePagesPlugin,seed?:{text:string;bookId?:string;kind?:string;finish?:boolean}):Promise<void>{
  const personal=plugin.personal,books=await personal.library.list() as Book[];
  if(!books.length){new Notice("先在图书馆添加一本书，再写阅读心得。");return;}
  const key=seed?`personal-reading:copy-${newId()}`:"personal-reading:quick";let saved:{text?:string;bookId?:string;kind?:string;id?:string;finish?:boolean}={};try{saved=JSON.parse(personal.readDraft(key)||"{}");}catch{}
  if(!saved||typeof saved!=="object"||Array.isArray(saved))saved={};
  const initial=seed||saved,bookId=initial.bookId||personal.readDraft("library:last-book")||books.find(b=>b.status==="在读")?.id||books[0].id;let noteId=seed?newId():saved.id||newId();
  const result=await personal.form("记下阅读心得",[{key:"bookId",label:"这次读的书",value:books.some(b=>b.id===bookId)?bookId:books[0].id,options:books.map(b=>[b.id,b.title])},{key:"kind",label:"记录类型",value:initial.kind||"reflection",options:Object.entries(noteNames)},{key:"body",label:"阅读心得",focus:true,value:initial.text||"",multiline:true,hint:"支持 Markdown、引用和库内图片。"},{key:"finish",label:"保存后",value:initial.finish?"true":"false",options:[["false","继续阅读"],["true","标记已读并收纳"]],group:"阅读状态（可选）"}],async values=>{const current=(await personal.library.list() as Book[]).find(b=>b.id===values.bookId);if(!current)throw Error("这本书已不存在，请重新选择。");await personal.library.appendNote(current,values.body,values.kind,noteId,values.finish==="true");personal.writeDraft(key,"");personal.writeDraft("library:last-book",current.id);},values=>{noteId=newId();personal.writeDraft(key,JSON.stringify({id:noteId,text:values.body,bookId:values.bookId,kind:values.kind,finish:values.finish==="true"}));});
  if(result){personal.refresh("personal-library");new Notice("阅读心得已保存。");}
}
