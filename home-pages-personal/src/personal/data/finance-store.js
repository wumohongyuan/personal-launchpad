"use strict";
const { dateKey, validDate, uid, safeFolder } = require("./model");

const VERSION = 1;
const MAX_CENTS = 100000000000; // 1,000,000,000.00 CNY; all calculations stay in integer cents.
const CYCLES = ["monthly", "quarterly", "yearly", "weekly", "once"];
const queues = new WeakMap(); // Shared by every FinanceStore using this vault, including different VaultStore instances.
const clone = value => JSON.parse(JSON.stringify(value));
const initial = () => ({ version: VERSION, entries: [], subscriptions: [] });
function fail(message) { throw new Error(message); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function idValue(value, max = 200) { if (typeof value !== "string" || value.length > max || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) fail("记录标识无效，请刷新后重试。"); return value; }
function dayValue(value, label = "日期") { if (typeof value !== "string" || !validDate(value)) fail(`${label}无效，请选择有效日期。`); return value; }
function currency(value = "CNY") { if (value !== "CNY") fail("当前记账只支持人民币 CNY。"); return value; }
function textValue(value, label, max, required = false) { if (value !== undefined && typeof value !== "string") fail(`${label}格式无效。`); const text = (value || "").trim(); if ((required && !text) || text.length > max) fail(`${label}${required ? "不能为空，且" : ""}不能超过 ${max} 个字符。`); return text; }
function centsValue(value) { if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_CENTS) fail("金额数据无效，原文件未被覆盖。"); return value; }
function amountToCents(value) {
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "number" && !Number.isFinite(value))) fail("金额请填写大于 0 的数字，最多两位小数。");
  const raw = String(value).trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) fail("金额请填写大于 0 的数字，最多两位小数。");
  const [whole = "0", decimal = ""] = raw.split(".");
  const cents = Number(whole || "0") * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) fail("金额需要大于 0，且不能超过 1,000,000,000 元。");
  return cents;
}
function urlValue(value) {
  const text = textValue(value, "网址", 2048); if (!text) return "";
  let url; try { url = new URL(text); } catch { fail("订阅网址请填写完整的 HTTPS 或 HTTP 链接。"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail("订阅网址不能包含登录信息或不安全的协议。");
  return url.href;
}
function remindValue(value = 3) { const days = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value; if (!Number.isSafeInteger(days) || days < 0 || days > 365) fail("提前提醒天数需要是 0 到 365 的整数。"); return days; }
function archivedValue(item) { if (item.archived !== undefined && typeof item.archived !== "boolean") fail("归档状态数据无效。"); }
function parse(content) {
  let state; try { state = JSON.parse(content); } catch { fail("记账文件 finance.json 已损坏，请先修复原文件；未覆盖任何数据。"); }
  if (!object(state) || state.version !== VERSION || !Array.isArray(state.entries) || !Array.isArray(state.subscriptions)) fail("记账文件结构或版本无效，原文件未被覆盖。");
  const entryIds = new Set(), subscriptionIds = new Set(), payments = new Set();
  for (const item of state.entries) {
    if (!object(item)) fail("账目数据无效。"); idValue(item.id, 240); if (entryIds.has(item.id)) fail("账目中存在重复标识，原文件未被覆盖。"); entryIds.add(item.id);
    if (!["expense", "income"].includes(item.type)) fail("收支类型数据无效。"); centsValue(item.amount); if (item.currency !== "CNY") fail("币种数据无效。"); dayValue(item.date); archivedValue(item);
    textValue(item.category, "分类", 80, true); textValue(item.note, "备注", 10000);
    if (item.subscriptionId !== undefined || item.subscriptionDue !== undefined) {
      idValue(item.subscriptionId); dayValue(item.subscriptionDue, "账期"); if (item.type !== "expense") fail("订阅账目需要是支出。");
      const key = `${item.subscriptionId}:${item.subscriptionDue}`; if (item.cycleId !== undefined && item.cycleId !== key) fail("订阅账期标识无效。"); if (payments.has(key)) fail("同一订阅账期存在重复账目，原文件未被覆盖。"); payments.add(key);
    }
  }
  for (const item of state.subscriptions) {
    if (!object(item)) fail("订阅数据无效。"); idValue(item.id); if (subscriptionIds.has(item.id)) fail("订阅中存在重复标识，原文件未被覆盖。"); subscriptionIds.add(item.id);
    textValue(item.name, "订阅名称", 120, true); centsValue(item.amount); if (item.currency !== "CNY") fail("币种数据无效。"); dayValue(item.nextDue, "下次到期日"); archivedValue(item);
    if (!CYCLES.includes(item.cycle) || typeof item.active !== "boolean") fail("订阅周期或启用状态数据无效。");
    if (typeof item.remindDays !== "number") fail("提前提醒天数数据无效。"); remindValue(item.remindDays); urlValue(item.url); textValue(item.note, "备注", 10000);
    if (!Number.isSafeInteger(item.billingDay) || item.billingDay < 1 || item.billingDay > 31 || !Number.isSafeInteger(item.billingMonth) || item.billingMonth < 1 || item.billingMonth > 12) fail("订阅账期基准数据无效。");
  }
  for (const item of state.entries) if (item.subscriptionId && !subscriptionIds.has(item.subscriptionId)) fail("订阅账目关联的数据缺失，原文件未被覆盖。");
  return state;
}
function dayParts(value) { return value.split("-").map(Number); }
function daysUntil(from, to) { const [fy, fm, fd] = dayParts(from), [ty, tm, td] = dayParts(to); return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000); }
function dateString(year, month, day) { const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return dayValue(text, "下一账期"); }
function advance(subscription) {
  const [year, month, day] = dayParts(subscription.nextDue);
  if (subscription.cycle === "once") return subscription.nextDue;
  if (subscription.cycle === "weekly") { const next = new Date(Date.UTC(year, month - 1, day + 7)); return dateString(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()); }
  const increment = subscription.cycle === "monthly" ? 1 : subscription.cycle === "quarterly" ? 3 : 12;
  const next = new Date(Date.UTC(year, month - 1 + increment, 1));
  const nextYear = next.getUTCFullYear(), nextMonth = subscription.cycle === "yearly" ? subscription.billingMonth : next.getUTCMonth() + 1;
  const maxDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return dateString(nextYear, nextMonth, Math.min(subscription.billingDay, maxDay));
}
function enqueue(vault, path, operation) {
  if (!queues.has(vault)) queues.set(vault, new Map()); const queue = queues.get(vault);
  const next = (queue.get(path) || Promise.resolve()).catch(() => {}).then(operation); queue.set(path, next);
  next.finally(() => { if (queue.get(path) === next) queue.delete(path); }).catch(() => {}); return next;
}

class FinanceStore {
  constructor(store) { this.store = store; }
  get path() { return `${safeFolder(this.store.settings.legacyFolder)}/配置/finance.json`; }
  async load() {
    const file = this.store.vault.getAbstractFileByPath(this.path); if (!file) return initial();
    if (Array.isArray(file.children)) fail("finance.json 路径被同名文件夹占用。");
    return parse(await this.store.vault.read(file));
  }
  async change(mutate) {
    const path = this.path, vault = this.store.vault;
    return enqueue(vault, path, async () => {
      let file = vault.getAbstractFileByPath(path), result;
      const update = content => {
        const state = content === null ? initial() : parse(content); result = mutate(state);
        const serialized = JSON.stringify(state, null, 2) + "\n"; parse(serialized); return serialized;
      };
      if (!file) {
        const content = update(null); await this.store.ensureFolder(path.slice(0, path.lastIndexOf("/")));
        try { await vault.create(path, content); return clone(result); }
        catch (error) { file = vault.getAbstractFileByPath(path); if (!file) throw error; }
      }
      if (Array.isArray(file.children)) fail("finance.json 路径被同名文件夹占用。");
      await vault.process(file, update); return clone(result);
    });
  }
  async saveEntry(input) {
    if (!object(input)) fail("请填写账目信息。");
    const id = idValue(input.id || uid(), 240), type = input.type;
    if (!["expense", "income"].includes(type)) fail("请选择收入或支出。");
    const values = { id, type, amount: amountToCents(input.amount), currency: currency(input.currency), date: dayValue(input.date), category: textValue(input.category, "分类", 80) || "其他", note: textValue(input.note, "备注", 10000) };
    const now = new Date().toISOString();
    return this.change(state => {
      const index = state.entries.findIndex(item => item.id === id), existing = state.entries[index];
      if (existing?.archived) fail("这条账目已归档，请刷新后查看。");
      if (existing?.subscriptionId && type !== "expense") fail("订阅续费账目需要保留为支出。");
      const saved = { ...existing, ...values, archived: false, createdAt: existing?.createdAt || now, updatedAt: now };
      if (index < 0) state.entries.push(saved); else state.entries[index] = saved; return saved;
    });
  }
  async archiveEntry(id) {
    idValue(id, 240); return this.change(state => { const entry = state.entries.find(item => item.id === id); if (!entry) fail("账目不存在，请刷新后重试。"); if (!entry.archived) { entry.archived = true; entry.archivedAt = new Date().toISOString(); } return entry; });
  }
  async restoreEntry(id) {
    idValue(id,240);return this.change(state=>{const item=state.entries.find(v=>v.id===id);if(!item)fail("账目不存在。");item.archived=false;delete item.archivedAt;item.updatedAt=new Date().toISOString();return item;});
  }
  async restoreSubscription(id) {
    idValue(id);return this.change(state=>{const item=state.subscriptions.find(v=>v.id===id);if(!item)fail("订阅不存在。");if(item.archived){item.archived=false;item.active=false;delete item.archivedAt;item.updatedAt=new Date().toISOString();}return item;});
  }
  async saveSubscription(input) {
    if (!object(input)) fail("请填写订阅信息。");
    const id = idValue(input.id || uid()), cycle = input.cycle;
    if (!CYCLES.includes(cycle)) fail("请选择有效的订阅周期。");
    const active = input.active === undefined ? true : input.active; if (typeof active !== "boolean") fail("订阅启用状态无效。");
    const nextDue = dayValue(input.nextDue, "下次到期日"), [, month, day] = dayParts(nextDue);
    const values = { id, name: textValue(input.name, "订阅名称", 120, true), amount: amountToCents(input.amount), currency: currency(input.currency), cycle, nextDue, remindDays: remindValue(input.remindDays), url: urlValue(input.url), note: textValue(input.note, "备注", 10000), active };
    const now = new Date().toISOString();
    return this.change(state => {
      const index = state.subscriptions.findIndex(item => item.id === id), existing = state.subscriptions[index];
      if (existing?.archived) fail("这项订阅已归档，请刷新后查看。");
      const retainAnchor = existing && existing.nextDue === nextDue && existing.cycle === cycle;
      const saved = { ...existing, ...values, billingDay: retainAnchor ? existing.billingDay : day, billingMonth: retainAnchor ? existing.billingMonth : month, archived: false, createdAt: existing?.createdAt || now, updatedAt: now };
      if (index < 0) state.subscriptions.push(saved); else state.subscriptions[index] = saved; return saved;
    });
  }
  async archiveSubscription(id) {
    idValue(id); return this.change(state => { const item = state.subscriptions.find(subscription => subscription.id === id); if (!item) fail("订阅不存在，请刷新后重试。"); if (!item.archived) { item.archived = true; item.active = false; item.archivedAt = new Date().toISOString(); } return item; });
  }
  async paySubscription(id, dueDate) {
    idValue(id); dayValue(dueDate, "本次账期");
    return this.change(state => {
      const subscription = state.subscriptions.find(item => item.id === id); if (!subscription) fail("订阅不存在，请刷新后重试。");
      const existing = state.entries.find(item => item.subscriptionId === id && item.subscriptionDue === dueDate);
      if (existing) return { entry: existing, subscription, alreadyPaid: true };
      if (subscription.archived || !subscription.active) fail("订阅已停用或归档，不能记录续费。");
      if (subscription.nextDue !== dueDate) fail("这项订阅的账期已改变，请刷新后确认。");
      const nextDue = advance(subscription), now = new Date().toISOString();
      const entry = { id: `renewal-${id}-${dueDate}`, type: "expense", amount: subscription.amount, currency: subscription.currency, date: dateKey(), category: "订阅续费", note: `${subscription.name} · ${dueDate} 账期`, subscriptionId: id, subscriptionDue: dueDate, cycleId: `${id}:${dueDate}`, archived: false, createdAt: now, updatedAt: now };
      if (state.entries.some(item => item.id === entry.id)) fail("续费账目标识已被其他记录占用，请先检查原账目。");
      state.entries.push(entry); subscription.nextDue = nextDue; subscription.lastPaidDue = dueDate; subscription.lastPaidAt = now; subscription.updatedAt = now;
      if (subscription.cycle === "once") subscription.active = false;
      return { entry, subscription, alreadyPaid: false };
    });
  }
  async due(today = dateKey()) {
    dayValue(today); const { subscriptions } = await this.load();
    return subscriptions.filter(item => !item.archived && item.active).map(item => ({ ...item, daysUntil: daysUntil(today, item.nextDue), overdue: item.nextDue < today })).filter(item => item.daysUntil <= item.remindDays).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name));
  }
  async summary(month = dateKey().slice(0, 7)) {
    if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) fail("请选择有效月份。");
    const state = await this.load(), result = { income: 0, expense: 0, balance: 0 };
    for (const item of state.entries) if (!item.archived && item.date.startsWith(month + "-")) { result[item.type] += item.amount; if (!Number.isSafeInteger(result[item.type])) fail("汇总金额超出安全范围，请缩小统计范围。"); }
    result.balance = result.income - result.expense; return result;
  }
}
module.exports = { FinanceStore, amountToCents, CYCLES, MAX_CENTS, advance, daysUntil };
