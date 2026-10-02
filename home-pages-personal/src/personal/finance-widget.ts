import { Notice, Setting, setIcon } from "obsidian";
import type { WidgetContext, WidgetDefinition } from "../widgets/types";
import { clampInt } from "../widgets/types";
import type { FormField, PersonalServices } from "./services";

type Config = Record<string, unknown>;
interface Entry { id: string; type: "income" | "expense"; amount: number; date: string; category: string; note: string; archived?: boolean; subscriptionId?: string }
interface Subscription { id: string; name: string; amount: number; cycle: string; nextDue: string; remindDays: number; url: string; note: string; active: boolean; archived?: boolean }
interface State { entries: Entry[]; subscriptions: Subscription[] }
const cycleNames: Record<string, string> = { monthly: "每月", quarterly: "每季度", yearly: "每年", weekly: "每周", once: "一次性" };
const defaults: Config = { mode: "overview", displayCount: 12 };
function today(): string { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-"); }
function id(): string { const bytes = new Uint8Array(12); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join(""); }
function money(cents: number): string { return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function daysUntil(date: string): number { return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 86400000); }
function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const node = parent.ownerDocument.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; parent.appendChild(node); return node;
}

class FinancePanel {
  private readonly personal: PersonalServices;
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly area: HTMLElement;
  private readonly message: HTMLElement;
  private readonly filters: HTMLElement;
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly mode: string;
  private readonly limit: number;
  private tab: "ledger" | "subscriptions";
  private month = today().slice(0, 7);
  private category = "";
  private entryType = "all";
  private subscriptionState = "active";
  private archived = false;
  private shown: number;
  private forms = 0;
  private pending = false;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  constructor(body: HTMLElement, private readonly ctx: WidgetContext<Config>) {
    this.personal = ctx.plugin.personal;
    this.mode = String(ctx.config.mode || "overview"); this.tab = this.mode === "subscriptions" ? "subscriptions" : "ledger";
    this.limit = clampInt(ctx.config.displayCount, 3, 100, 12); this.shown = this.limit;
    this.root = el(body, "section", "hp-personal-finance"); this.root.setAttribute("aria-label", "个人账本与订阅");
    const toolbar = el(this.root, "div", "hp-pf-toolbar");
    if (this.mode !== "subscriptions") {
      const label = el(toolbar, "label", "hp-pf-month-label", "月份"); const input = el(label, "input"); input.type = "month"; input.value = this.month; input.setAttribute("aria-label", "账本月份");
      input.addEventListener("change", () => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(input.value)) { this.month = input.value; this.shown = this.limit; void this.refresh(); } });
    }
    const actions = el(toolbar, "div", "hp-pf-actions");
    this.button(actions, "记一笔", () => this.editEntry(), "plus", true);
    if (this.mode !== "ledger") this.button(actions, "添加订阅", () => this.editSubscription(), "calendar-plus");
    this.summary = el(this.root, "div", "hp-pf-summary");
    if (this.mode === "overview") {
      const tabs = el(this.root, "div", "hp-pf-tabs"); tabs.setAttribute("aria-label", "账本内容");
      for (const [key, name] of [["ledger", "收支账目"], ["subscriptions", "会员与订阅"]]) this.tabButtons.set(key, this.button(tabs, name, async () => { this.tab = key as "ledger" | "subscriptions"; this.shown = this.limit; await this.refresh(); }));
    }
    this.filters = el(this.root, "div", "hp-pf-filters");
    this.message = el(this.root, "p", "hp-pf-message"); this.message.setAttribute("role", "status"); this.message.setAttribute("aria-live", "polite");
    this.area = el(this.root, "div", "hp-pf-area");
    ctx.addHeaderAction("plus", "记一笔收支", () => { void this.run(() => this.editEntry()); });
    ctx.addHeaderAction("refresh-cw", "刷新账本", () => { void this.refresh(); });
    const changed = () => { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => { void this.refresh(); }, 250); };
    const vault = ctx.app.vault, refs = [vault.on("create", changed), vault.on("modify", changed), vault.on("delete", changed), vault.on("rename", changed)];
    ctx.registerCleanup(() => { this.disposed = true; this.generation++; if (this.timer) clearTimeout(this.timer); refs.forEach(ref => vault.offref(ref)); });
  }

  private alive(token?: number): boolean { return !this.disposed && this.ctx.isAlive() && (token === undefined || token === this.generation); }
  private report(text: string, error = false): void { if (!this.alive()) return; this.message.textContent = text; this.message.classList.toggle("is-error", error); if (error) new Notice(text); }
  private async run(action: () => Promise<unknown>, button?: HTMLButtonElement): Promise<void> {
    if (!this.alive() || button?.disabled || this.ctx.isEditing()) return;
    if (button) button.disabled = true;
    try { await action(); } catch (error) { this.report(error instanceof Error ? error.message : "操作失败，请重试。", true); }
    finally { if (button?.isConnected) button.disabled = false; }
  }
  private button(parent: HTMLElement, text: string, action: () => Promise<unknown>, icon?: string, primary = false): HTMLButtonElement {
    const button = el(parent, "button", `hp-pf-button${primary ? " mod-cta" : ""}`); button.type = "button";
    if (icon) { const mark = el(button, "span", "hp-pf-icon"); mark.setAttribute("aria-hidden", "true"); setIcon(mark, icon); }
    el(button, "span", "", text); button.addEventListener("click", () => { void this.run(action, button); }); return button;
  }
  private select(parent: HTMLElement, label: string, choices: Array<[string, string]>, value: string, onChange: (value: string) => void): void {
    const input = el(parent, "select"); input.setAttribute("aria-label", label);
    for (const [key, text] of choices) { const option = el(input, "option", "", text); option.value = key; }
    input.value = value; input.addEventListener("change", () => { onChange(input.value); this.shown = this.limit; void this.refresh(); });
  }
  private async form(title: string, fields: FormField[], commit: (values: Record<string, string>) => Promise<unknown>): Promise<Record<string, string> | null> {
    this.forms++;
    try { return await this.personal.form(title, fields, commit); }
    finally { this.forms--; if (!this.forms && this.pending && this.alive()) { this.pending = false; void this.refresh(); } }
  }
  async refresh(): Promise<void> {
    if (!this.alive()) return; if (this.forms) { this.pending = true; return; }
    const token = ++this.generation;
    try {
      const [state, totals] = await Promise.all([
        this.personal.finance.load() as Promise<State>,
        this.mode === "subscriptions" ? Promise.resolve(null) : this.personal.finance.summary(this.month) as Promise<{ income: number; expense: number; balance: number }>
      ]);
      if (!this.alive(token)) return; if (this.forms) { this.pending = true; return; }
      const due = state.subscriptions.filter(item => !item.archived && item.active && daysUntil(item.nextDue) <= item.remindDays);
      this.ctx.setSubtitle(this.mode === "subscriptions" ? `${due.length} 项待关注 · ${state.subscriptions.filter(item => !item.archived && item.active).length} 项启用` : `${this.month} · 人民币`);
      this.tabButtons.forEach((button, key) => button.setAttribute("aria-pressed", String(key === this.tab)));
      this.summary.replaceChildren(); this.summary.hidden = this.mode === "subscriptions";
      if (!this.summary.hidden) {
        const income = totals?.income || 0, expense = totals?.expense || 0;
        for (const [name, value, type] of [["本月收入", income, "income"], ["本月支出", expense, "expense"], ["本月结余", income - expense, "balance"]] as Array<[string, number, string]>) {
          const item = el(this.summary, "div", "hp-pf-stat"); item.dataset.type = type; el(item, "span", "", name); el(item, "strong", "", `¥ ${money(value)}`);
        }
      }
      this.filters.replaceChildren(); this.area.replaceChildren();
      if (this.tab === "ledger") this.renderLedger(state); else this.renderSubscriptions(state);
    } catch (error) { if (this.alive(token)) this.report(`读取失败：${error instanceof Error ? error.message : String(error)}。请点卡片右上角刷新。`, true); }
  }

  private renderLedger(state: State): void {
    this.select(this.filters, "收支类型", [["all", "全部收支"], ["expense", "支出"], ["income", "收入"]], this.entryType, value => { this.entryType = value; });
    const categories = [...new Set(state.entries.map(item => item.category))].sort(); if (this.category && !categories.includes(this.category)) categories.unshift(this.category);
    this.select(this.filters, "账目分类", [["", "所有分类"], ...categories.map(value => [value, value] as [string, string])], this.category, value => { this.category = value; });
    this.select(this.filters, "账目状态", [["active", "当前账目"], ["archived", "已归档"]], this.archived ? "archived" : "active", value => { this.archived = value === "archived"; });
    const entries = state.entries.filter(item => Boolean(item.archived) === this.archived && item.date.startsWith(this.month + "-") && (!this.category || item.category === this.category) && (this.entryType === "all" || item.type === this.entryType)).sort((a, b) => b.date.localeCompare(a.date));
    if (!entries.length) this.empty(this.area, this.archived ? "这个月还没有归档账目。" : "这个月的账本，等你记下第一笔。", "账目按日期收好，分类和金额随时可以修改。");
    else {
      el(this.area, "p", "hp-pf-caption", `${entries.length} 笔${this.archived ? "已归档（不计入汇总）" : "账目"}`);
      const list = el(this.area, "div", "hp-pf-ledger");
      for (const entry of entries.slice(0, this.shown)) {
        const row = el(list, "article", "hp-pf-entry"); row.dataset.type = entry.type;
        const top = el(row, "div", "hp-pf-entry-top"); const copy = el(top, "div", "hp-pf-entry-copy");
        el(copy, "strong", "", entry.category); el(copy, "span", "hp-pf-caption", `${entry.date} · ${entry.type === "income" ? "收入" : "支出"}${entry.subscriptionId ? " · 订阅续费" : ""}`);
        el(top, "span", "hp-pf-amount", `${entry.type === "income" ? "+" : "−"} ¥ ${money(entry.amount)}`);
        if (entry.note) el(row, "p", "hp-pf-note", entry.note);
        if (!entry.archived) {
          const actions = el(row, "div", "hp-pf-row-actions"); this.button(actions, "编辑", () => this.editEntry(entry));
          this.button(actions, "归档", async () => { await this.personal.finance.archiveEntry(entry.id); this.report("账目已归档，不再计入汇总，可在已归档中查看。"); await this.refresh(); });
        }
      }
      if (entries.length > this.shown) this.button(this.area, "显示更多账目", async () => { this.shown += this.limit; await this.refresh(); });
    }
  }

  private renderSubscriptions(state: State): void {
    this.select(this.filters, "订阅状态", [["active", "启用中"], ["due", "近期到期 / 逾期"], ["inactive", "已停用"], ["all", "全部订阅"], ["archived", "已归档"]], this.subscriptionState, value => { this.subscriptionState = value; });
    const subscriptions = state.subscriptions.filter(item => this.subscriptionState === "archived" ? item.archived : !item.archived && (this.subscriptionState === "all" || this.subscriptionState === "inactive" && !item.active || this.subscriptionState === "active" && item.active || this.subscriptionState === "due" && item.active && daysUntil(item.nextDue) <= item.remindDays)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    if (!subscriptions.length) this.empty(this.area, "这里暂时没有对应的会员或订阅。", "添加服务名称、费用和下次到期日，把续费时间放在一起。");
    const list = el(this.area, "div", "hp-pf-subscriptions");
    for (const subscription of subscriptions.slice(0, this.shown)) {
      const row = el(list, "article", "hp-pf-subscription"); const remaining = daysUntil(subscription.nextDue);
      const dueLabel = subscription.archived ? "已归档" : !subscription.active ? "已停用" : remaining < 0 ? `逾期 ${-remaining} 天` : remaining === 0 ? "今天到期" : `${remaining} 天后到期`;
      if (subscription.active && remaining <= subscription.remindDays && !subscription.archived) row.classList.add("is-due");
      const top = el(row, "div", "hp-pf-entry-top"); const copy = el(top, "div", "hp-pf-entry-copy");
      el(copy, "strong", "", subscription.name); el(copy, "span", "hp-pf-caption", `${cycleNames[subscription.cycle] || subscription.cycle} · ${subscription.nextDue}`);
      el(top, "span", "hp-pf-amount", `¥ ${money(subscription.amount)}`);
      const badge = el(row, "span", "hp-pf-due", dueLabel); badge.classList.toggle("is-overdue", subscription.active && remaining < 0 && !subscription.archived);
      if (subscription.note) { const details = el(row, "details", "hp-pf-details"); el(details, "summary", "", "备注"); el(details, "p", "hp-pf-note", subscription.note); }
      if (!subscription.archived) {
        const actions = el(row, "div", "hp-pf-row-actions");
        if (subscription.active) this.button(actions, "登记已缴费", async () => { const result = await this.personal.finance.paySubscription(subscription.id, subscription.nextDue); this.report(result.alreadyPaid ? "这个账期已经登记过，没有重复记账。" : subscription.cycle === "once" ? "已记录支出，一次性服务已停用。" : `已记录支出，下次到期 ${result.subscription.nextDue}。`); await this.refresh(); }, "check");
        this.button(actions, "编辑", () => this.editSubscription(subscription));
        if (subscription.url) {
          const link = el(actions, "a", "hp-pf-link", "服务网站 ↗"); link.href = subscription.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        }
        this.button(actions, "归档", async () => { await this.personal.finance.archiveSubscription(subscription.id); this.report("订阅已归档，历史缴费账目继续保留。"); await this.refresh(); });
      }
    }
    if (subscriptions.length > this.shown) this.button(this.area, "显示更多订阅", async () => { this.shown += this.limit; await this.refresh(); });
    el(this.area, "p", "hp-pf-footnote", "登记已缴费会记一笔支出并顺延账期。提醒在 Obsidian 打开时显示；未打开时不会推送。");
  }

  private empty(parent: HTMLElement, title: string, caption: string): void { const box = el(parent, "div", "hp-empty"); el(box, "strong", "", title); el(box, "span", "", caption); }

  private async editEntry(entry?: Entry): Promise<void> {
    const entryId = entry?.id || id();
    const result = await this.form(entry ? "编辑账目" : "记一笔收支", [
      { key: "type", label: "收支类型", value: entry?.type || "expense", options: entry?.subscriptionId ? [["expense", "支出（订阅续费）"]] : [["expense", "支出"], ["income", "收入"]] },
      { key: "amount", label: "金额（元）", type: "number", value: entry ? (entry.amount / 100).toFixed(2) : "", hint: "人民币，最多两位小数。" },
      { key: "date", label: "日期", type: "date", value: entry?.date || today() },
      { key: "category", label: "分类", value: entry?.category || "", hint: "例如餐饮、交通、学习、订阅、工资；可填写自己的分类。" },
      { key: "note", label: "备注（可选）", value: entry?.note || "", multiline: true }
    ], values => this.personal.finance.saveEntry({ ...values, id: entryId }));
    if (result && this.alive()) { this.report("账目已保存。"); await this.refresh(); }
  }

  private async editSubscription(subscription?: Subscription): Promise<void> {
    const subscriptionId = subscription?.id || id();
    const result = await this.form(subscription ? "编辑会员或订阅" : "添加会员或订阅", [
      { key: "name", label: "服务名称", value: subscription?.name || "", hint: "例如视频会员、云存储、软件服务。" },
      { key: "amount", label: "每期费用（元）", type: "number", value: subscription ? (subscription.amount / 100).toFixed(2) : "" },
      { key: "cycle", label: "缴费周期", value: subscription?.cycle || "monthly", options: Object.entries(cycleNames) },
      { key: "nextDue", label: "下次到期日", type: "date", value: subscription?.nextDue || today() },
      { key: "remindDays", label: "提前几天提醒", type: "number", value: String(subscription?.remindDays ?? 3), hint: "0 表示当天提醒，打开 Obsidian 时检查。" },
      { key: "active", label: "使用状态", value: subscription?.active === false ? "false" : "true", options: [["true", "启用并提醒"], ["false", "已停用，不提醒"]] },
      { key: "url", label: "服务网址（可选）", type: "url", value: subscription?.url || "" },
      { key: "note", label: "备注（可选）", value: subscription?.note || "", multiline: true }
    ], values => this.personal.finance.saveSubscription({ ...values, id: subscriptionId, active: values.active === "true" }));
    if (result && this.alive()) { this.report("会员或订阅已保存。"); await this.refresh(); }
  }
}

export const personalFinanceWidget: WidgetDefinition<Record<string, unknown>> = {
  kind: "personal-finance", name: "账本与订阅", description: "记录收支、按月回看，也把会员服务和续费时间放在一起。", icon: "wallet", accent: "#477563", defaultSize: { w: 12, h: 14 }, liveRefresh: false,
  defaultConfig: () => ({ ...defaults }),
  normalizeConfig: raw => ({ mode: ["overview", "ledger", "subscriptions"].includes(String(raw.mode)) ? String(raw.mode) : "overview", displayCount: clampInt(raw.displayCount, 3, 100, 12) }),
  async render(body, ctx) { const panel = new FinancePanel(body, ctx); await panel.refresh(); },
  renderSettings(container, ctx) {
    new Setting(container).setName("组件内容").setDesc("可在不同页面放置多个组件；账目共享，月份与筛选各自独立。")
      .addDropdown(dropdown => dropdown.addOptions({ overview: "完整账本与订阅", ledger: "收支账本", subscriptions: "会员与续费" }).setValue(String(ctx.config.mode || "overview")).onChange(value => ctx.update({ mode: value })));
    new Setting(container).setName("每次显示条数").addSlider(slider => slider.setLimits(3, 100, 1).setDynamicTooltip().setValue(clampInt(ctx.config.displayCount, 3, 100, 12)).onChange(value => ctx.update({ displayCount: value })));
  }
};
