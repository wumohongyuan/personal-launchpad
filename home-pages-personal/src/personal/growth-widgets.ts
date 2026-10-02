import { Notice, Setting } from "obsidian";
import type { WidgetContext, WidgetDefinition } from "../widgets/types";
import { clampInt } from "../widgets/types";
import { addNumberSetting, addPathSetting } from "../ui/settingHelpers";
import { renderEmpty, renderKpi } from "../ui/dom";
import * as modelData from "./data/model.js";
import * as planData from "./data/plans.js";

type Config = Record<string, unknown>;
type Context = WidgetContext<Config>;
type FormValues = Record<string, string>;
interface FormField { key: string; label: string; value?: string; type?: string; multiline?: boolean; hint?: string; options?: string[][]; }
interface Entry { id: string; kind: string; text: string; time: string; date: string; path: string; done?: boolean; legacy?: boolean; }
interface Day { entries: Entry[]; original: string; path: string; }
interface Phase { id: string; name: string; from: number; to: number; goal: string; healthFocus: string; tasks: string[]; }
interface Milestone { id: string; week: number; title: string; template: string; }
interface Plan { name: string; days: number; goal: string; phases: Phase[]; milestones: Milestone[]; }
interface Feedback { id?: string; date: string; text: string; }
interface Growth extends Record<string, unknown> { planId: string; startDate: string; planName?: string; goal?: string; totalDays?: number; completedMilestones: string[]; externalFeedback: Feedback[]; }
interface Workout extends Record<string, unknown> { id: string; date: string; type?: string; name?: string; duration?: number; weight?: number | null; intensity?: string; note?: string; }
interface WorkbenchState { growth: Growth; health: { weeklyGoal: number; workouts: Workout[] }; days: Record<string, { tasks?: { text: string; done?: boolean }[]; flashes?: unknown[] }>; }
interface GrowthState { plan: Plan; phase: Phase; milestone?: Milestone; day: number; week: number; percent: number; future: boolean; }
interface Note { title: string; path: string; preview: string; mtime: number; }
interface PersonalServices {
  store: {
    settings: { dailyFolder: string; legacyFolder: string; reviewFolder: string; knowledgeFolder: string };
    day(date: string): Promise<Day>;
    capture(text: string, kind: string, date?: string, id?: string): Promise<unknown>;
    saveReview(date: string, answers: string[], id?: string): Promise<string>;
    notes(query?: string, folder?: string | null, limit?: number): Promise<{ items: Note[]; totalFiles: number; limited: boolean }>;
  };
  workbench: {
    load(): Promise<WorkbenchState>;
    growth(state: WorkbenchState): GrowthState;
    change(mutate: (state: WorkbenchState) => void): Promise<unknown>;
    setItem(collection: string, item: Workout, original?: Workout): Promise<unknown>;
  };
  form(title: string, fields: FormField[], commit: (values: FormValues) => Promise<unknown>): Promise<FormValues | null>;
  openFile(path: string, content?: string, subpath?: string): Promise<unknown>;
  promote(entry?: Entry): Promise<unknown>;
  readDraft(key: string): string;
  writeDraft(key: string, value: string): void;
}
const { dateKey, weekStart, shiftDate, validDate, uid, fileTitle } = modelData as {
  dateKey: () => string; weekStart: (date?: string) => string; shiftDate: (date: string, amount: number) => string;
  validDate: (value: unknown) => boolean; uid: () => string; fileTitle: (value: string) => string;
};
const { PLAN_PRESETS } = planData as { PLAN_PRESETS: Record<string, Plan> };
const REVIEW_QUESTIONS = ["这周值得记住的事", "我对自己多了解了一点什么", "下周想试的一个小改变"];

function personal(ctx: Context): PersonalServices { return (ctx.plugin as typeof ctx.plugin & { personal: PersonalServices }).personal; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function configText(value: unknown): string { return typeof value === "string" ? value : ""; }
function refresh(ctx: Context, ...kinds: string[]): void { for (const kind of kinds) ctx.plugin.refreshViews({ kind }); }
function paragraph(parent: HTMLElement, text: string, cls = "hp-personal-muted"): HTMLElement { return parent.createEl("p", { cls, text }); }
function button(parent: HTMLElement, text: string, ctx: Context, operation: () => Promise<unknown> | void, primary = false): HTMLButtonElement {
  const element = parent.createEl("button", { cls: `hp-pill${primary ? " mod-cta" : ""}`, text, attr: { type: "button" } });
  element.addEventListener("click", () => {
    if (element.disabled || !ctx.isAlive()) return;
    element.disabled = true;
    void Promise.resolve().then(operation).catch(error => { new Notice(message(error), 7000); }).finally(() => { if (ctx.isAlive()) element.disabled = false; });
  });
  return element;
}
function headerAction(ctx: Context, icon: string, label: string, operation: () => Promise<unknown> | void): void {
  let busy = false;
  ctx.addHeaderAction(icon, label, () => {
    if (busy || !ctx.isAlive()) return;
    busy = true;
    void Promise.resolve().then(operation).catch(error => { new Notice(message(error), 7000); }).finally(() => { busy = false; });
  });
}
function progress(parent: HTMLElement, value: number, label: string): void {
  const bar = parent.createEl("progress", { cls: "hp-personal-progress", attr: { max: "100", "aria-label": label } });
  bar.value = Math.max(0, Math.min(100, value));
}
function draftRead(service: PersonalServices, key: string): string {
  try { return service.readDraft(key) || ""; } catch { return ""; }
}
function draftWrite(service: PersonalServices, key: string, value: string): void {
  try { service.writeDraft(key, value); } catch { new Notice("草稿暂时无法持久保存，请尽快保存这次记录。", 6000); }
}

/** Stable across retries, but a changed phase action can be added independently. */
export function phaseTaskId(plan: string, phase: string, index: number, text: string): string {
  let hash = 2166136261;
  for (const char of `${plan}|${phase}|${index}|${text}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `phase-${hash.toString(16)}`;
}

export function parsePlanFields(values: FormValues, current: GrowthState): { days: number; phases: Config[]; milestones: Config[] } {
  if (!validDate(values.startDate)) throw new Error("请选择有效的开始日期。");
  if (!["balanced", "focus", "legacy180", "custom"].includes(values.planId)) throw new Error("请选择有效的计划模板。");
  const days = Number(values.totalDays);
  if (!Number.isInteger(days) || days < 7 || days > 1095) throw new Error("计划周期应为 7～1095 天。");
  const phases = (values.phases || "").split("\n").filter(line => line.trim()).map(line => {
    const [name, weeksText, goal, tasks] = line.split("|").map(part => part.trim());
    const weeks = Number(weeksText);
    if (!name || !Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new Error("每个阶段请填写名称和 1～52 的整数周数。");
    return { name, weeks, goal: goal || "", tasks: (tasks || "").split(/[；;]/).map(task => task.trim()).filter(Boolean) };
  });
  if (phases.reduce((sum, phase) => sum + phase.weeks, 0) > 157) throw new Error("全部阶段合计不能超过 157 周。");
  const milestones = (values.milestones || "").split("\n").filter(line => line.trim()).map((line, index) => {
    const [weekText, title] = line.split("|").map(part => part.trim());
    const week = Number(weekText);
    if (!title || !Number.isInteger(week) || week < 1 || week > 157) throw new Error("交付物请填写 1～157 的整数周数和名称。");
    return { week, title, template: current.plan.milestones[index]?.template || "## 我的成果\n\n## 学到的事\n\n## 下一步" };
  });
  return { days, phases, milestones };
}

async function editGrowth(ctx: Context, state: WorkbenchState, current: GrowthState): Promise<void> {
  const service = personal(ctx), before = state.growth;
  const saved = await service.form("我的成长计划", [
    { key: "planId", label: "计划模板", value: before.planId, options: [["balanced", "84 天行动计划"], ["focus", "42 天专注计划"], ["legacy180", "180 天个人成长计划"], ["custom", "自己设计计划"]] },
    { key: "planName", label: "计划名称", value: current.plan.name },
    { key: "goal", label: "这一轮最想完成什么", value: current.plan.goal, multiline: true },
    { key: "startDate", label: "开始日期", type: "date", value: before.startDate },
    { key: "totalDays", label: "自定义计划天数", type: "number", value: String(current.plan.days) },
    { key: "phases", label: "自定义阶段", multiline: true, hint: "每行：阶段名称 | 周数 | 阶段目标 | 每日行动（用；分隔）", value: current.plan.phases.map(phase => `${phase.name} | ${phase.to - phase.from + 1} | ${phase.goal} | ${phase.tasks.join("；")}`).join("\n") },
    { key: "milestones", label: "自定义交付物", multiline: true, hint: "每行：第几周 | 想完成的交付物", value: current.plan.milestones.map(item => `${item.week} | ${item.title}`).join("\n") }
  ], async values => {
    const parsed = parsePlanFields(values, current);
    await service.workbench.change(latest => {
      if (JSON.stringify(latest.growth) !== JSON.stringify(before)) throw new Error("成长计划已在别处修改。输入已保留，请刷新后确认。");
      const switched = values.planId !== before.planId, preset = PLAN_PRESETS[values.planId];
      Object.assign(latest.growth, {
        planId: values.planId, startDate: values.startDate,
        planName: switched && preset && values.planName === current.plan.name ? preset.name : values.planName.trim(),
        goal: switched && preset && values.goal === current.plan.goal ? preset.goal : values.goal.trim(),
        totalDays: values.planId === "custom" ? parsed.days : preset.days
      });
      if (values.planId === "custom") latest.growth.customPlan = { phases: parsed.phases, milestones: parsed.milestones };
      // Keep the previous completion state available when switching templates.
      if (switched) {
        const history = Array.isArray(latest.growth.planHistory) ? latest.growth.planHistory as Growth[] : [];
        const previous: Growth = { ...before, externalFeedback: [], completedMilestones: [...before.completedMilestones] };
        delete previous.planHistory;
        latest.growth.planHistory = [...history, previous];
        const returning = [...history].reverse().find(item => item.planId === values.planId && item.startDate === values.startDate);
        latest.growth.completedMilestones = returning ? [...returning.completedMilestones] : [];
      }
    });
  });
  if (saved) refresh(ctx, "personal-growth");
}

async function recordFeedback(ctx: Context): Promise<void> {
  const service = personal(ctx), id = uid(), date = dateKey();
  const result = await service.form("记录一次反馈或观察", [{ key: "text", label: "发生了什么，你从中看见了什么", multiline: true, value: "" }], async values => {
    const text = values.text.trim(); if (!text) throw new Error("先写下一点真实的观察。");
    await service.store.capture(text, "diary", date, id);
    await service.workbench.change(state => { if (!state.growth.externalFeedback.some(item => item.id === id)) state.growth.externalFeedback.push({ id, date, text }); });
  });
  if (result) { new Notice("反馈已保存，也留在今天的日记中。"); refresh(ctx, "personal-growth"); }
}

export const personalGrowthWidget: WidgetDefinition<Record<string, unknown>> = {
  kind: "personal-growth", name: "成长计划", description: "延续你的成长计划，按阶段行动，积累交付物和真实反馈。", icon: "sprout", accent: "#38725b",
  defaultSize: { w: 6, h: 8 }, defaultConfig: () => ({ showMilestones: true, showFeedback: true }),
  normalizeConfig: raw => ({ showMilestones: raw.showMilestones !== false, showFeedback: raw.showFeedback !== false }),
  async render(body, ctx) {
    const service = personal(ctx), state = await service.workbench.load(); if (!ctx.isAlive()) return;
    const current = service.workbench.growth(state);
    ctx.setSubtitle(current.future ? `开始于 ${state.growth.startDate}` : `第 ${current.week} 周`);
    headerAction(ctx, "settings-2", "调整成长计划", () => editGrowth(ctx, state, current));
    const wrap = body.createDiv({ cls: "hp-personal-growth hp-personal-flow" });
    wrap.createEl("h3", { cls: "hp-personal-title", text: current.plan.name });
    paragraph(wrap, current.plan.goal);
    progress(wrap, current.percent, "成长计划进度");
    paragraph(wrap, current.future ? "先想好开始的一小步。" : `第 ${current.day} / ${current.plan.days} 天 · ${current.percent}%`, "hp-personal-caption");
    const phase = wrap.createDiv({ cls: "hp-personal-section" });
    phase.createEl("h4", { text: `${current.phase.name} · 第 ${current.phase.from}～${current.phase.to} 周` });
    paragraph(phase, current.phase.goal);
    const tasks = phase.createEl("ul", { cls: "hp-personal-actions-list" });
    for (const action of current.phase.tasks) tasks.createEl("li", { text: action });
    button(phase, "把阶段行动加入今天", ctx, async () => {
      const date = dateKey();
      for (const [index, text] of current.phase.tasks.entries()) await service.store.capture(text, "task", date, phaseTaskId(state.growth.planId, current.phase.id, index, text));
      new Notice("阶段行动已加入今日日记，重复点击不会重复添加。"); refresh(ctx, "personal-tasks", "personal-journal");
    });
    if (ctx.config.showMilestones) {
      const milestones = wrap.createDiv({ cls: "hp-personal-section" }); milestones.createEl("h4", { text: "阶段交付物" });
      for (const item of current.plan.milestones) {
        const row = milestones.createDiv({ cls: "hp-personal-milestone" });
        const label = row.createEl("label"), check = label.createEl("input", { attr: { type: "checkbox", "aria-label": `完成：${item.title}` } });
        check.checked = state.growth.completedMilestones.includes(item.id); label.createSpan({ text: `第 ${item.week} 周 · ${item.title}` });
        check.addEventListener("change", () => {
          const done = check.checked; check.disabled = true;
          void service.workbench.change(latest => {
            if (latest.growth.planId !== state.growth.planId || latest.growth.startDate !== state.growth.startDate) throw new Error("计划已切换，请刷新后再标记。");
            latest.growth.completedMilestones = done ? [...new Set([...latest.growth.completedMilestones, item.id])] : latest.growth.completedMilestones.filter(id => id !== item.id);
          }).then(() => { refresh(ctx, "personal-growth"); }).catch(error => { check.checked = !done; new Notice(message(error)); }).finally(() => { if (ctx.isAlive()) check.disabled = false; });
        });
        button(row, "打开模板", ctx, async () => {
          const legacyName = item.title.replace(/[\\/:*?"<>|]/g, "-");
          const oldPath = `${service.store.settings.legacyFolder}/交付物/第${item.week}周-${legacyName}.md`;
          const path = ctx.app.vault.getAbstractFileByPath(oldPath) ? oldPath : `${service.store.settings.legacyFolder}/交付物/第${item.week}周-${fileTitle(item.title)}.md`;
          await service.openFile(path, `计划：${current.plan.name}\n\n${item.template}\n`);
        });
      }
    }
    if (ctx.config.showFeedback) {
      const feedback = wrap.createDiv({ cls: "hp-personal-section" });
      const heading = feedback.createDiv({ cls: "hp-personal-toolbar" }); heading.createEl("h4", { text: "来自生活的反馈" }); button(heading, "记一条", ctx, () => recordFeedback(ctx));
      for (const item of state.growth.externalFeedback.slice(-3).reverse()) { const row = feedback.createDiv({ cls: "hp-personal-feedback" }); paragraph(row, item.date, "hp-personal-caption"); paragraph(row, item.text, "hp-personal-prose"); }
      if (!state.growth.externalFeedback.length) paragraph(feedback, "一次尝试、一条建议、一个发现，都值得留下。");
    }
  },
  renderSettings(container, ctx) {
    new Setting(container).setName("显示阶段交付物").addToggle(toggle => toggle.setValue(ctx.config.showMilestones !== false).onChange(value => ctx.update({ showMilestones: value })));
    new Setting(container).setName("显示最近反馈").addToggle(toggle => toggle.setValue(ctx.config.showFeedback !== false).onChange(value => ctx.update({ showFeedback: value })));
    paragraph(container, "计划名称、起点、阶段和每日行动，可从卡片右上角「调整成长计划」修改。");
  }
};

async function editWorkout(ctx: Context, item?: Workout): Promise<void> {
  const service = personal(ctx), id = item?.id || uid();
  const result = await service.form(item ? "修改运动记录" : "记录一次运动", [
    { key: "date", label: "日期", type: "date", value: item?.date || dateKey() },
    { key: "type", label: "做了什么", value: item?.type || item?.name || "", hint: "例如：散步、力量训练、跑步。" },
    { key: "duration", label: "时长（分钟）", type: "number", value: String(item?.duration ?? 30) },
    { key: "intensity", label: "感受强度", value: item?.intensity || "轻松", options: [["轻松", "轻松"], ["适中", "适中"], ["较累", "较累"]] },
    { key: "weight", label: "体重 kg（可留空）", type: "number", value: item?.weight ? String(item.weight) : "" },
    { key: "note", label: "备注或身体感受", multiline: true, value: item?.note || "" }
  ], async values => {
    const duration = Number(values.duration), weight = values.weight.trim() ? Number(values.weight) : null;
    if (!validDate(values.date) || !values.type.trim() || !Number.isFinite(duration) || duration <= 0 || duration > 1440) throw new Error("请填写有效日期、运动内容和 1～1440 分钟的时长。");
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 1000)) throw new Error("请检查体重数值，或留空。");
    await service.workbench.setItem("workouts", { ...item, id, date: values.date, type: values.type.trim(), duration, weight, intensity: values.intensity, note: values.note.trim() }, item);
  });
  if (result) refresh(ctx, "personal-health");
}

export const personalHealthWidget: WidgetDefinition<Record<string, unknown>> = {
  kind: "personal-health", name: "运动与恢复", description: "记录自己的运动节奏、身体感受与每周目标。", icon: "activity", accent: "#38725b",
  defaultSize: { w: 6, h: 8 }, defaultConfig: () => ({ limit: 5, showWeight: true }), normalizeConfig: raw => ({ limit: clampInt(raw.limit, 1, 20, 5), showWeight: raw.showWeight !== false }),
  async render(body, ctx) {
    const service = personal(ctx), state = await service.workbench.load(); if (!ctx.isAlive()) return;
    const start = weekStart(), today = dateKey(), week = state.health.workouts.filter(item => item.date >= start && item.date <= today);
    ctx.setSubtitle(`${start.slice(5)} 至 ${shiftDate(start, 6).slice(5)}`);
    headerAction(ctx, "plus", "记录一次运动", () => editWorkout(ctx));
    const wrap = body.createDiv({ cls: "hp-personal-health hp-personal-flow" }), stats = wrap.createDiv({ cls: "hp-personal-kpis" });
    renderKpi(stats, { value: `${week.length} / ${state.health.weeklyGoal}`, label: "本周运动 / 目标", tone: 1 });
    renderKpi(stats, { value: week.reduce((sum, item) => sum + (Number(item.duration) || 0), 0), label: "累计分钟", tone: 1 });
    const weight = [...state.health.workouts].sort((a, b) => b.date.localeCompare(a.date)).find(item => Number(item.weight) > 0);
    if (ctx.config.showWeight && weight) paragraph(wrap, `最近体重 ${weight.weight} kg · ${weight.date}`, "hp-personal-caption");
    const actions = wrap.createDiv({ cls: "hp-personal-toolbar" }); button(actions, "记录运动", ctx, () => editWorkout(ctx), true);
    button(actions, "调整每周目标", ctx, async () => {
      const result = await service.form("自己的运动节奏", [{ key: "goal", label: "每周希望运动几次", type: "number", value: String(state.health.weeklyGoal), hint: "0 表示暂时不设置目标。" }], async values => {
        const goal = Number(values.goal); if (!Number.isInteger(goal) || goal < 0 || goal > 30) throw new Error("请输入 0～30 的整数。");
        await service.workbench.change(latest => { if (latest.health.weeklyGoal !== state.health.weeklyGoal) throw new Error("目标已在别处更新，请刷新后重试。"); latest.health.weeklyGoal = goal; });
      });
      if (result) refresh(ctx, "personal-health");
    });
    const list = wrap.createDiv({ cls: "hp-list" });
    const workouts = [...state.health.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, Number(ctx.config.limit));
    for (const item of workouts) {
      const row = button(list, "", ctx, () => editWorkout(ctx, item)); row.addClass("hp-personal-record-row");
      const copy = row.createSpan({ cls: "hp-list-text" }); copy.createSpan({ cls: "hp-list-title", text: item.type || item.name || "运动" });
      copy.createSpan({ cls: "hp-list-sub", text: `${item.date}${item.note ? ` · ${item.note}` : ""}` }); row.createSpan({ cls: "hp-list-meta", text: `${item.duration || 0} 分钟` });
    }
    if (!workouts.length) renderEmpty(list, { icon: "footprints", text: "从一次散步开始，也给身体留些恢复的时间。" });
  },
  renderSettings(container, ctx) {
    addNumberSetting(container, { name: "显示最近记录", value: Number(ctx.config.limit), min: 1, max: 20, onChange: value => ctx.update({ limit: value }) });
    new Setting(container).setName("显示最近体重").addToggle(toggle => toggle.setValue(ctx.config.showWeight !== false).onChange(value => ctx.update({ showWeight: value })));
  }
};

export function reviewDraft(value: string): string[] {
  try { const items: unknown = JSON.parse(value || "[]"); return REVIEW_QUESTIONS.map((_, index) => { const item: unknown = Array.isArray(items) ? items[index] : undefined; return typeof item === "string" ? item : ""; }); }
  catch { return REVIEW_QUESTIONS.map(() => ""); }
}

export const personalReviewWidget: WidgetDefinition<Record<string, unknown>> = {
  kind: "personal-review", name: "一周回顾", description: "回看真实记录，用三句话留下这一周的收获。草稿会自动保留。", icon: "notebook-pen", accent: "#38725b",
  defaultSize: { w: 12, h: 10 }, liveRefresh: false, defaultConfig: () => ({ showSummary: true }), normalizeConfig: raw => ({ showSummary: raw.showSummary !== false }),
  async render(body, ctx) {
    const service = personal(ctx), wrap = body.createDiv({ cls: "hp-personal-review hp-personal-flow" });
    let start = weekStart(), busy = false, sequence = 0;
    const toolbar = wrap.createDiv({ cls: "hp-personal-toolbar" });
    const previous = button(toolbar, "上一周", ctx, () => selectWeek(shiftDate(start, -7)));
    const date = toolbar.createEl("input", { attr: { type: "date", "aria-label": "选择回顾日期" } }); date.value = start;
    const next = button(toolbar, "下一周", ctx, () => selectWeek(shiftDate(start, 7)));
    const period = paragraph(wrap, "", "hp-personal-caption");
    const summary = wrap.createDiv({ cls: "hp-personal-kpis" }); summary.hidden = !ctx.config.showSummary;
    const fields = wrap.createDiv({ cls: "hp-personal-review-fields" }), inputs: HTMLTextAreaElement[] = [];
    const status = wrap.createDiv({ cls: "hp-personal-caption", attr: { role: "status", "aria-live": "polite" } });
    for (const [index, question] of REVIEW_QUESTIONS.entries()) {
      const field = fields.createEl("label", { cls: "hp-personal-field" }); field.createSpan({ text: question });
      const input = field.createEl("textarea", { attr: { rows: "3", "aria-label": question } }); inputs.push(input);
      input.addEventListener("input", () => { draftWrite(service, `review:${start}`, JSON.stringify(inputs.map(area => area.value))); status.setText("草稿已保留"); });
      input.dataset.question = String(index);
    }
    async function updateSummary(): Promise<void> {
      const token = ++sequence, current = start;
      try {
        const [state, days] = await Promise.all([service.workbench.load(), Promise.all(Array.from({ length: 7 }, (_, index) => service.store.day(shiftDate(current, index))))]);
        if (!ctx.isAlive() || token !== sequence) return;
        summary.empty(); const entries = days.flatMap(day => day.entries);
        const old = Object.entries(state.days).filter(([key]) => key >= current && key <= shiftDate(current, 6)).flatMap(([, day]) => day.tasks || []);
        renderKpi(summary, { value: days.filter(day => day.entries.length || day.original).length, label: "天留下记录", tone: 1 });
        renderKpi(summary, { value: entries.filter(entry => entry.kind === "task" && entry.done).length + old.filter(task => task.done).length, label: "件行动已完成", tone: 1 });
        renderKpi(summary, { value: state.growth.externalFeedback.filter(item => item.date >= current && item.date <= shiftDate(current, 6)).length, label: "条反馈与观察", tone: 1 });
      } catch (error) { if (ctx.isAlive() && token === sequence) status.setText(`统计暂时未更新：${message(error)}`); }
    }
    function selectWeek(value: string): void {
      if (busy) return;
      start = weekStart(value); date.value = start; period.setText(`${start} 至 ${shiftDate(start, 6)} · 只回答其中一题也可以`); ctx.setSubtitle(start);
      const saved = reviewDraft(draftRead(service, `review:${start}`)); inputs.forEach((input, index) => { input.value = saved[index]; }); status.setText(saved.some(Boolean) ? "已恢复这周的草稿" : "");
      void updateSummary();
    }
    date.addEventListener("change", () => { if (validDate(date.value)) selectWeek(date.value); else date.value = start; });
    const actions = wrap.createDiv({ cls: "hp-personal-toolbar" });
    const save = button(actions, "保存这周的回顾", ctx, async () => {
      const answers = inputs.map(input => input.value), content = JSON.stringify(answers), current = start;
      if (!answers.some(answer => answer.trim())) throw new Error("先写下这一周的一点感受吧。");
      let submission: { id: string; content: string } | undefined;
      try { const saved = JSON.parse(draftRead(service, `review-submit:${current}`)) as { id?: unknown; content?: unknown }; if (typeof saved.id === "string" && saved.content === content) submission = { id: saved.id, content }; } catch { /* new submission */ }
      submission = submission || { id: uid(), content }; draftWrite(service, `review-submit:${current}`, JSON.stringify(submission));
      busy = true; inputs.forEach(input => { input.readOnly = true; }); previous.disabled = next.disabled = date.disabled = true;
      try {
        await service.store.saveReview(current, answers, submission.id);
        if (ctx.isAlive()) { inputs.forEach(input => { input.value = ""; }); status.setText("回顾已保存，可以随时回来补充。"); }
        draftWrite(service, `review:${current}`, ""); draftWrite(service, `review-submit:${current}`, ""); await updateSummary();
      } finally { busy = false; if (ctx.isAlive()) { inputs.forEach(input => { input.readOnly = false; }); previous.disabled = next.disabled = date.disabled = false; } }
    }, true);
    button(actions, "打开这周的原文", ctx, () => service.openFile(`${service.store.settings.reviewFolder}/${start}-周回顾.md`));
    wrap.addEventListener("keydown", event => { if (!event.isComposing && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); save.click(); } });
    headerAction(ctx, "refresh-cw", "刷新本周统计", updateSummary);
    ctx.registerInterval(() => { if (ctx.isAlive()) void updateSummary(); }, 60000);
    ctx.registerCleanup(() => { sequence += 1; }); selectWeek(start);
  },
  renderSettings(container, ctx) { new Setting(container).setName("显示一周统计").addToggle(toggle => toggle.setValue(ctx.config.showSummary !== false).onChange(value => ctx.update({ showSummary: value }))); }
};

export const personalKnowledgeWidget: WidgetDefinition<Record<string, unknown>> = {
  kind: "personal-knowledge", name: "知识与收藏", description: "找到自己的笔记和理解，可限定文件夹、关键词或查看全库最近内容。", icon: "book-open", accent: "#38725b",
  defaultSize: { w: 12, h: 10 }, liveRefresh: false,
  defaultConfig: () => ({ scope: "knowledge", folder: "", query: "", limit: 8 }),
  normalizeConfig: raw => ({ scope: ["knowledge", "folder", "all"].includes(configText(raw.scope)) ? configText(raw.scope) : "knowledge", folder: configText(raw.folder).trim(), query: configText(raw.query), limit: clampInt(raw.limit, 1, 50, 8) }),
  async render(body, ctx) {
    const service = personal(ctx), wrap = body.createDiv({ cls: "hp-personal-knowledge hp-personal-flow" });
    const toolbar = wrap.createDiv({ cls: "hp-personal-toolbar" }), search = toolbar.createEl("input", { cls: "hp-personal-search", attr: { type: "search", placeholder: "找回一个主题、一句想法…", "aria-label": "搜索知识笔记" } });
    let initial = configText(ctx.config.query);
    try { const draft = JSON.parse(draftRead(service, `knowledge-search:${ctx.widget.id}`)) as { query?: unknown }; if (typeof draft.query === "string") initial = draft.query; } catch { /* use configured search */ }
    search.value = initial;
    const status = wrap.createDiv({ cls: "hp-personal-caption", attr: { role: "status", "aria-live": "polite" } }), list = wrap.createDiv({ cls: "hp-list" });
    const owner = body.ownerDocument.defaultView || window;
    let sequence = 0, timer: number | undefined;
    async function load(): Promise<void> {
      const token = ++sequence, query = search.value.trim(); status.setText("正在查找…");
      const folder = ctx.config.scope === "all" ? null : ctx.config.scope === "folder" ? configText(ctx.config.folder) : service.store.settings.knowledgeFolder;
      try {
        const result = await service.store.notes(query, folder, Number(ctx.config.limit));
        if (!ctx.isAlive() || token !== sequence) return;
        list.empty(); ctx.setSubtitle(ctx.config.scope === "all" ? "全库最近笔记" : folder || "全库");
        status.setText(`${result.items.length} 篇${result.limited ? " · 当前显示前一部分，可加关键词缩小范围" : ""}`);
        for (const note of result.items) {
          const row = button(list, "", ctx, () => service.openFile(note.path)); row.addClass("hp-personal-note-row");
          row.createSpan({ cls: "hp-list-title", text: note.title }); row.createSpan({ cls: "hp-list-sub", text: note.preview || note.path });
        }
        if (!result.items.length) renderEmpty(list, { icon: "search", text: query ? "还没找到匹配的笔记，换个词试试。" : "把随手记里的理解留下来，知识会慢慢积累。" });
      } catch (error) { if (ctx.isAlive() && token === sequence) status.setText(`读取失败：${message(error)}`); }
    }
    button(toolbar, "新建知识笔记", ctx, async () => { await service.promote(); if (ctx.isAlive()) await load(); });
    search.addEventListener("input", () => { draftWrite(service, `knowledge-search:${ctx.widget.id}`, JSON.stringify({ query: search.value })); if (timer) owner.clearTimeout(timer); sequence += 1; timer = owner.setTimeout(() => { if (ctx.isAlive()) void load(); }, 220); });
    search.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { if (timer) owner.clearTimeout(timer); void load(); } });
    headerAction(ctx, "refresh-cw", "刷新知识列表", load); ctx.registerCleanup(() => { sequence += 1; if (timer) owner.clearTimeout(timer); });
    ctx.registerInterval(() => { if (ctx.isAlive()) void load(); }, 60000); await load();
  },
  renderSettings(container, ctx) {
    new Setting(container).setName("笔记范围").addDropdown(dropdown => dropdown.addOptions({ knowledge: "我的知识库", folder: "指定文件夹", all: "全库最近笔记" }).setValue(String(ctx.config.scope)).onChange(value => { ctx.update({ scope: value }); ctx.refresh(); }));
    if (ctx.config.scope === "folder") addPathSetting(container, ctx.app, { name: "文件夹", desc: "留空可搜索全库。", value: configText(ctx.config.folder), suggest: { files: false, folders: true }, onChange: value => ctx.update({ folder: value }) });
    new Setting(container).setName("初始关键词").setDesc("卡片里的搜索框可随时修改，不会打断当前输入。").addText(input => input.setValue(configText(ctx.config.query)).onChange(value => ctx.update({ query: value })));
    addNumberSetting(container, { name: "显示条数", value: Number(ctx.config.limit), min: 1, max: 50, onChange: value => ctx.update({ limit: value }) });
  }
};
