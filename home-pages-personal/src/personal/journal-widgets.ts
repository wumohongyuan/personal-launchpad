import { Component, Keymap, MarkdownRenderer, Notice, Setting } from "obsidian";
import { todayIso, toIsoDate } from "../utils/date";
import { renderEmpty } from "../ui/dom";
import { WidgetContext, WidgetDefinition, clampInt, normalizeWith } from "../widgets/types";

type EntryKind = "thought" | "diary" | "task" | "focus" | "review";
interface Entry {
  id: string;
  kind: EntryKind;
  text: string;
  time: string;
  date: string;
  path: string;
  done?: boolean;
  block?: string;
  legacy?: boolean;
  legacyTask?: boolean;
  index?: number;
  source?: Record<string, unknown>;
  triageKey?: string;
  sourceExists?: boolean;
}
interface PersonalState { triage: Record<string, string>; [key: string]: unknown }
interface FormField {
  key: string;
  label: string;
  value?: string;
  type?: string;
  options?: string[][];
  hint?: string;
  multiline?: boolean;
}
interface PersonalServices {
  store: {
    capture(text: string, kind: string, date: string, id: string): Promise<Entry>;
    day(date: string): Promise<{ entries: Entry[]; path: string; original: string; exists: boolean }>;
    dailyPath(date: string): string;
    updateEntry(entry: Entry, changes: { text?: string; done?: boolean }): Promise<unknown>;
  };
  workbench: {
    load(): Promise<PersonalState>;
    thoughts(limit?: number, state?: PersonalState): Promise<Entry[]>;
    tasks(limit?: number, state?: PersonalState): Promise<Entry[]>;
    change(mutate: (state: PersonalState) => void): Promise<unknown>;
    oldTask(date: string, index: number, done: boolean, original: Record<string, unknown>): Promise<unknown>;
  };
  form(title: string, fields: FormField[], commit: (values: Record<string, string>) => Promise<unknown> | unknown): Promise<Record<string, string> | null>;
  openFile(path: string, content?: string, subpath?: string): Promise<unknown>;
  promote(entry: Entry): Promise<unknown>;
  readDraft(key: string): string | null | undefined;
  writeDraft(key: string, value: string): void;
  refresh(kind?: string): void;
}

const KIND_LABELS: Record<EntryKind, string> = { thought: "随手记", diary: "日记", task: "待办", focus: "今日重点", review: "复盘" };
const CAPTURE_KINDS: EntryKind[] = ["thought", "diary", "task"];
function services<C>(ctx: WidgetContext<C>): PersonalServices {
  return (ctx.plugin as unknown as { personal: PersonalServices }).personal;
}
function uniqueId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(new Date(`${value}T12:00:00`)) === value;
}
function nextDay(value: string, offset: number): string {
  const day = new Date(`${value}T12:00:00`); day.setDate(day.getDate() + offset); return toIsoDate(day);
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function statusElement(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: "hp-personal-status", attr: { role: "status", "aria-live": "polite" } });
}
function status(el: HTMLElement, text: string, error = false): void {
  el.setText(text); el.toggleClass("is-error", error);
}
function action(parent: HTMLElement, label: string, run: () => Promise<unknown> | unknown, feedback: HTMLElement, cls = "hp-personal-action"): HTMLButtonElement {
  const button = parent.createEl("button", { text: label, cls, attr: { type: "button" } });
  button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    void Promise.resolve().then(run).catch(error => { status(feedback, errorText(error), true); new Notice(errorText(error)); })
      .finally(() => { button.disabled = false; });
  });
  return button;
}
function refreshRecords(personal: PersonalServices): void {
  personal.refresh("personal-journal"); personal.refresh("personal-tasks");
}

interface CaptureDraft { text: string; id: string; date: string }
function loadCaptureDraft(personal: PersonalServices, key: string): CaptureDraft {
  try {
    const value = JSON.parse(personal.readDraft(key) || "null") as Partial<CaptureDraft> | null;
    if (value && typeof value.text === "string" && typeof value.id === "string" && /^[a-z0-9-]+$/.test(value.id) && typeof value.date === "string" && validDay(value.date)) {
      return { text: value.text, id: value.id, date: value.date };
    }
  } catch { /* An invalid cache must not prevent a new capture. */ }
  return { text: "", id: uniqueId(), date: todayIso() };
}

interface CaptureConfig extends Record<string, unknown> { defaultKind: string; placeholder: string }
const CAPTURE_DEFAULTS: CaptureConfig = { defaultKind: "thought", placeholder: "现在想到什么？先写下来，不用整理好。" };
export const personalCaptureWidget: WidgetDefinition<CaptureConfig> = {
  kind: "personal-capture", name: "随手记录", description: "想法、日记和待办直接写入 Markdown 日记；不用先建文件。",
  icon: "feather", accent: "#3f725a", defaultSize: { w: 8, h: 8 }, liveRefresh: false,
  defaultConfig: () => ({ ...CAPTURE_DEFAULTS }),
  normalizeConfig: raw => {
    const config = normalizeWith(CAPTURE_DEFAULTS, raw);
    if (!CAPTURE_KINDS.includes(config.defaultKind as EntryKind)) config.defaultKind = "thought";
    return config;
  },
  render(body, ctx) {
    const personal = services(ctx), wrap = body.createDiv({ cls: "hp-personal-capture" });
    const tabs = wrap.createDiv({ cls: "hp-personal-tabs", attr: { role: "group", "aria-label": "记录类型" } });
    let kind = ctx.config.defaultKind as EntryKind, busy = false, composing = false;
    const draftKey = (): string => `personal-capture:${ctx.widget.id}:${kind}`;
    let current = loadCaptureDraft(personal, draftKey());
    const label = wrap.createEl("label", { cls: "hp-personal-compose-label", text: "此刻，想记住什么？" });
    const inputId = `hp-personal-input-${uniqueId()}`;
    label.setAttribute("for", inputId);
    const input = wrap.createEl("textarea", { cls: "hp-personal-compose-input", attr: { id: inputId, placeholder: ctx.config.placeholder, rows: "5" } });
    input.value = current.text;
    const bottom = wrap.createDiv({ cls: "hp-personal-compose-bottom" });
    const hint = bottom.createSpan({ cls: "hp-personal-hint" });
    const feedback = statusElement(wrap);
    const buttons = new Map<EntryKind, HTMLButtonElement>();
    const persist = (): void => {
      try { personal.writeDraft(draftKey(), JSON.stringify(current)); }
      catch { status(feedback, "草稿暂时无法保存在本机，请尽快保存记录。", true); }
    };
    const update = (): void => {
      for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === kind));
      label.setText(kind === "task" ? "下一步，想做什么？" : kind === "diary" ? "今天，有什么想留下？" : "此刻，想记住什么？");
      hint.setText(`${current.date} · Ctrl / ⌘ + Enter 保存`);
      ctx.setSubtitle("草稿自动保留");
    };
    for (const type of CAPTURE_KINDS) {
      const button = tabs.createEl("button", { text: KIND_LABELS[type], cls: "hp-personal-tab", attr: { type: "button" } });
      buttons.set(type, button);
      button.addEventListener("click", () => {
        if (busy || type === kind) return;
        kind = type; current = loadCaptureDraft(personal, draftKey()); input.value = current.text; update(); input.focus();
      });
    }
    const saveButton = bottom.createEl("button", { text: "保存记录", cls: "hp-button mod-cta", attr: { type: "button" } });
    const save = async (): Promise<void> => {
      if (busy || composing || !ctx.isAlive()) return;
      if (!input.value.trim()) { status(feedback, "先写下一点内容吧。"); input.focus(); return; }
      current.text = input.value; persist();
      const pending = { ...current }, savedKey = draftKey(), savedKind = kind;
      busy = true; input.readOnly = true; saveButton.disabled = true; saveButton.setText("正在保存…");
      buttons.forEach(button => { button.disabled = true; });
      status(feedback, "正在写入日记…");
      try {
        const entry = await personal.store.capture(pending.text, savedKind, pending.date, pending.id);
        // Clear only the submitted cache, never a newer draft from a rebuilt view.
        const latest = loadCaptureDraft(personal, savedKey);
        if (latest.id === pending.id && latest.text === pending.text) personal.writeDraft(savedKey, "");
        if (ctx.isAlive()) {
          current = { text: "", id: uniqueId(), date: todayIso() }; input.value = ""; update();
          status(feedback, `已保存到 ${entry.path}`);
        }
        refreshRecords(personal);
      } catch (error) {
        if (ctx.isAlive()) status(feedback, `保存失败：${errorText(error)}。内容已保留，可重试。`, true);
      } finally {
        busy = false;
        if (ctx.isAlive()) { input.readOnly = false; saveButton.disabled = false; saveButton.setText("保存记录"); buttons.forEach(button => { button.disabled = false; }); input.focus(); }
      }
    };
    input.addEventListener("input", () => {
      const firstInput = !current.text;
      current = { text: input.value, id: uniqueId(), date: firstInput ? todayIso() : current.date };
      persist(); update();
    });
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.isComposing && !composing) { event.preventDefault(); void save(); }
    });
    saveButton.addEventListener("click", () => void save());
    ctx.registerCleanup(() => { if (!busy && input.value) { current.text = input.value; persist(); } });
    update();
  },
  renderSettings(container, ctx) {
    new Setting(container).setName("默认记录类型").addDropdown(dropdown => dropdown.addOptions({ thought: "随手记", diary: "日记", task: "待办" }).setValue(ctx.config.defaultKind).onChange(value => ctx.update({ defaultKind: value })));
    new Setting(container).setName("输入提示").addText(text => text.setValue(ctx.config.placeholder).onChange(value => ctx.update({ placeholder: value })));
  }
};

async function markdown<C>(container: HTMLElement, source: string, sourcePath: string, ctx: WidgetContext<C>, cleanups: Array<() => void>): Promise<void> {
  const component = new Component(); ctx.component.addChild(component);
  let disposed = false;
  cleanups.push(() => { if (!disposed) { disposed = true; ctx.component.removeChild(component); } });
  container.addClass("markdown-rendered", "hp-personal-entry-content");
  await MarkdownRenderer.render(ctx.app, source, container, sourcePath, component);
  container.addEventListener("click", event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a.internal-link");
    if (!link) return;
    const href = link.dataset.href || link.getAttribute("href");
    if (href) { event.preventDefault(); void ctx.app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(event)).catch(error => new Notice(errorText(error))); }
  });
}
function cleanAll(cleanups: Array<() => void>): void { cleanups.splice(0).forEach(cleanup => cleanup()); }
function triageKey(entry: Entry): string { return entry.triageKey || `${entry.path}#${entry.id}`; }

interface JournalConfig extends Record<string, unknown> { mode: string; date: string; filter: string; limit: number; showArchived: boolean }
const JOURNAL_DEFAULTS: JournalConfig = { mode: "today", date: "", filter: "all", limit: 30, showArchived: false };
export const personalJournalWidget: WidgetDefinition<JournalConfig> = {
  kind: "personal-journal", name: "日记与想法", description: "浏览今天的片段、按日期回看日记，或把想法慢慢整理成知识与行动。",
  icon: "notebook-pen", accent: "#527a68", defaultSize: { w: 12, h: 12 },
  defaultConfig: () => ({ ...JOURNAL_DEFAULTS }),
  normalizeConfig: raw => {
    const config = normalizeWith(JOURNAL_DEFAULTS, raw);
    if (!["today", "history", "inbox"].includes(config.mode)) config.mode = "today";
    if (!["all", ...Object.keys(KIND_LABELS)].includes(config.filter)) config.filter = "all";
    if (config.date && !validDay(config.date)) config.date = "";
    config.limit = clampInt(config.limit, 5, 200, 30); return config;
  },
  async render(body, ctx) {
    const personal = services(ctx), wrap = body.createDiv({ cls: "hp-personal-journal" });
    const toolbar = wrap.createDiv({ cls: "hp-personal-journal-toolbar" }), feedback = statusElement(wrap);
    const list = wrap.createDiv({ cls: "hp-personal-journal-list" }), cleanups: Array<() => void> = [];
    let selected = ctx.config.mode === "today" ? todayIso() : ctx.config.date || todayIso(), filter = ctx.config.filter, revision = 0;
    ctx.registerCleanup(() => { revision++; cleanAll(cleanups); });
    const changeDate = async (date: string, mode = "history"): Promise<void> => {
      if (!validDay(date)) throw new Error("请选择有效日期。");
      selected = date; await ctx.saveConfig({ date, mode }); await load();
    };
    if (ctx.config.mode !== "inbox") {
      action(toolbar, "前一天", () => changeDate(nextDay(selected, -1)), feedback);
      const date = toolbar.createEl("input", { cls: "hp-personal-date", attr: { type: "date", "aria-label": "日记日期" } }); date.value = selected;
      date.addEventListener("change", () => { void changeDate(date.value).catch(error => status(feedback, errorText(error), true)); });
      action(toolbar, "后一天", () => changeDate(nextDay(selected, 1)), feedback);
      action(toolbar, "今天", () => changeDate(todayIso(), "today"), feedback);
      const select = toolbar.createEl("select", { attr: { "aria-label": "记录筛选" } });
      for (const [value, label] of [["all", "全部"], ...Object.entries(KIND_LABELS)]) select.createEl("option", { value, text: label });
      select.value = filter;
      select.addEventListener("change", () => { filter = select.value; void ctx.saveConfig({ filter }).then(load).catch(error => status(feedback, errorText(error), true)); });
      action(toolbar, "日记原文", () => personal.openFile(personal.store.dailyPath(selected), ""), feedback);
    } else {
      toolbar.createSpan({ cls: "hp-personal-hint", text: ctx.config.showArchived ? "全部想法，包含已经整理的片段" : "先记下来，等有空时再慢慢整理。" });
    }
    const load = async (): Promise<void> => {
      const version = ++revision;
      const state = ctx.config.mode === "inbox" ? await personal.workbench.load() : null;
      const day = ctx.config.mode === "inbox" ? null : await personal.store.day(selected);
      const entries = state ? await personal.workbench.thoughts(200, state) : day?.entries || [];
      if (version !== revision || !ctx.isAlive()) return;
      cleanAll(cleanups); list.replaceChildren();
      const dateInput = toolbar.querySelector<HTMLInputElement>("input[type=date]"); if (dateInput) dateInput.value = selected;
      const visible = entries.filter(entry => state ? ctx.config.showArchived || !state.triage[triageKey(entry)] : filter === "all" || entry.kind === filter);
      ctx.setSubtitle(`${state ? "想法收件箱" : selected} · ${visible.length} 条`);
      if (!visible.length) renderEmpty(list, { icon: state ? "inbox" : "notebook-pen", text: state ? "暂时没有待整理的想法。先从一条随手记开始。" : "这一天还没有这样的记录。" });
      for (const entry of visible.slice(0, ctx.config.limit)) {
        const card = list.createEl("article", { cls: "hp-personal-entry", attr: { "data-entry-id": entry.id } });
        const meta = card.createDiv({ cls: "hp-personal-entry-meta" });
        meta.createEl("time", { text: `${state ? entry.date + " · " : ""}${entry.time}`, attr: { datetime: `${entry.date}T${entry.time}` } });
        meta.createSpan({ text: KIND_LABELS[entry.kind] || "随手记", cls: "hp-personal-kind" });
        if (state?.triage[triageKey(entry)]) meta.createSpan({ text: "已整理", cls: "hp-personal-hint" });
        const content = card.createDiv();
        await markdown(content, entry.text, entry.path, ctx, cleanups);
        if (version !== revision || !ctx.isAlive()) return;
        const actions = card.createDiv({ cls: "hp-personal-entry-actions" });
        if (!entry.legacy) action(actions, "编辑", async () => {
          const result = await personal.form("编辑这条记录", [{ key: "body", label: "内容", value: entry.text, multiline: true }], async values => {
            if (!values.body.trim()) throw new Error("记录内容不能为空。");
            await personal.store.updateEntry(entry, { text: values.body.trim() });
          });
          if (result) refreshRecords(personal);
        }, feedback);
        if (entry.kind !== "task" && entry.kind !== "focus") action(actions, "收进知识库", async () => { await personal.promote(entry); }, feedback);
        if (entry.path && entry.sourceExists !== false) action(actions, "原文", () => personal.openFile(entry.path, undefined, entry.legacy ? undefined : `^pl-${entry.id}`), feedback);
        if (state && !state.triage[triageKey(entry)]) {
          action(actions, "转为待办", async () => {
            await personal.store.capture(entry.text, "task", todayIso(), `from-${entry.id}-${entry.date}`);
            await personal.workbench.change(current => { current.triage[triageKey(entry)] = "task"; });
            refreshRecords(personal);
          }, feedback);
          action(actions, "收好", async () => {
            await personal.workbench.change(current => { current.triage[triageKey(entry)] = "archived"; });
            refreshRecords(personal);
          }, feedback);
        }
      }
      if (visible.length > ctx.config.limit) list.createDiv({ cls: "hp-personal-hint", text: `目前显示 ${ctx.config.limit} / ${visible.length} 条，可在组件设置中调整。` });
      if (day?.original) {
        const original = list.createDiv({ cls: "hp-personal-original" });
        original.createDiv({ text: "这一天还包含手写的日记内容。", cls: "hp-personal-hint" });
        action(original, "打开完整日记", () => personal.openFile(day.path), feedback);
      }
    };
    await load();
  },
  renderSettings(container, ctx) {
    new Setting(container).setName("显示内容").addDropdown(dropdown => dropdown.addOptions({ today: "今天的片段", history: "按日期回看日记", inbox: "待整理的想法" }).setValue(ctx.config.mode).onChange(value => ctx.update({ mode: value })));
    new Setting(container).setName("最多显示记录").addSlider(slider => slider.setLimits(5, 200, 5).setValue(ctx.config.limit).setDynamicTooltip().onChange(value => ctx.update({ limit: value })));
    new Setting(container).setName("收件箱显示已整理的想法").addToggle(toggle => toggle.setValue(ctx.config.showArchived).onChange(value => ctx.update({ showArchived: value })));
  }
};

interface TasksConfig extends Record<string, unknown> { limit: number }
export const personalTasksWidget: WidgetDefinition<TasksConfig> = {
  kind: "personal-tasks", name: "行动清单", description: "把历次日记里还未完成的行动放在一起，也保留旧版任务。",
  icon: "list-todo", accent: "#587a89", defaultSize: { w: 6, h: 8 },
  defaultConfig: () => ({ limit: 80 }), normalizeConfig: raw => ({ limit: clampInt(raw.limit, 5, 300, 80) }),
  async render(body, ctx) {
    const personal = services(ctx), wrap = body.createDiv({ cls: "hp-personal-tasks" }), feedback = statusElement(wrap);
    const toolbar = wrap.createDiv({ cls: "hp-personal-task-toolbar" });
    action(toolbar, "添加行动", async () => {
      const id = uniqueId(), date = todayIso();
      const result = await personal.form("添加行动", [{ key: "text", label: "准备做什么", multiline: true, value: "" }], async values => {
        if (!values.text.trim()) throw new Error("先写下准备做的事。");
        await personal.store.capture(values.text.trim(), "task", date, id);
      });
      if (result) refreshRecords(personal);
    }, feedback, "hp-button mod-cta");
    toolbar.createSpan({ cls: "hp-personal-hint", text: "以前没做完的事，也在这里。" });
    const tasks = await personal.workbench.tasks(ctx.config.limit);
    if (!ctx.isAlive()) return;
    const total = (tasks as Entry[] & { total?: number }).total || tasks.length;
    ctx.setSubtitle(`${total} 项待完成`);
    if (!tasks.length) renderEmpty(wrap, { icon: "check-check", text: "暂时没有未完成的行动。给今天留一点余地。" });
    const list = wrap.createDiv({ cls: "hp-personal-task-list" });
    for (const task of tasks) {
      const row = list.createDiv({ cls: "hp-personal-task", attr: { "data-entry-id": task.id } });
      const label = row.createEl("label", { cls: "hp-personal-task-label" });
      const checkbox = label.createEl("input", { attr: { type: "checkbox", "aria-label": `完成：${task.text}` } });
      checkbox.checked = !!task.done;
      label.createSpan({ cls: "hp-personal-task-text", text: task.text });
      const meta = row.createDiv({ cls: "hp-personal-task-meta" });
      meta.createEl("time", { text: task.date === todayIso() ? "今天" : task.date, attr: { datetime: task.date } });
      if (!task.legacyTask && task.path) action(meta, "原文", () => personal.openFile(task.path, undefined, task.legacy ? undefined : `^pl-${task.id}`), feedback);
      checkbox.addEventListener("change", () => {
        const done = checkbox.checked; checkbox.disabled = true;
        const save = task.legacyTask
          ? personal.workbench.oldTask(task.date, task.index ?? -1, done, task.source || {})
          : personal.store.updateEntry(task, { done });
        void save.then(() => { refreshRecords(personal); }).catch(error => {
          checkbox.checked = !!task.done; status(feedback, errorText(error), true);
        }).finally(() => { checkbox.disabled = false; });
      });
    }
    if (total > tasks.length) wrap.createDiv({ cls: "hp-personal-hint", text: `目前显示 ${tasks.length} / ${total} 项，可在组件设置中增加显示数量。` });
  },
  renderSettings(container, ctx) {
    new Setting(container).setName("最多显示行动").addSlider(slider => slider.setLimits(5, 300, 5).setValue(ctx.config.limit).setDynamicTooltip().onChange(value => ctx.update({ limit: value })));
  }
};
