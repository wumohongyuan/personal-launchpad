const { Plugin, ItemView, Modal, Setting, Notice, TFile } = require("obsidian");

const VIEW_TYPE = "personal-launchpad-view";
const DATA_FOLDER = "个人成长系统/配置";
const DATA_PATH = `${DATA_FOLDER}/launchpad.json`;
const DEFAULT_WIDGETS = ["capture", "focus", "tasks", "growth", "health", "milestone", "week", "shortcuts", "library", "recent"];
const WIDGET_NAMES = { capture: "闪念", focus: "今日重点", tasks: "今日行动", growth: "当前成长", health: "身体系统", milestone: "下一交付物", week: "本周复盘", shortcuts: "快捷入口", library: "在读书库", recent: "今日闪念" };

const DAILY_MESSAGES = [
  { text: "行而不辍，未来可期。", source: "《荀子》" },
  { text: "纸上得来终觉浅，绝知此事要躬行。", source: "陆游《冬夜读书示子聿》" },
  { text: "不积跬步，无以至千里。", source: "《荀子·劝学》" },
  { text: "长风破浪会有时，直挂云帆济沧海。", source: "李白《行路难》" },
  { text: "真正的进步，来自你愿意面对现实的那一刻。", source: "成长提醒" },
  { text: "今天先完成一件小事，让行动替你说话。", source: "成长提醒" }
];

const PLAN_PRESETS = {
  balanced: {
    name: "84 天行动计划", days: 84, goal: "建立可持续的行动、复盘与恢复节奏",
    phases: [
      { id: "start", name: "启动期", from: 1, to: 4, goal: "把目标变成每天能完成的小动作", healthFocus: "先规律出现：从轻量活动和稳定睡眠开始。", tasks: ["明确今天的一件重点", "完成一个 25 分钟专注块", "记录一条闪念或观察", "安排一点恢复时间"] },
      { id: "steady", name: "稳定期", from: 5, to: 8, goal: "减少波动，让行动成为默认选项", healthFocus: "稳定频率比偶尔冲量更重要。", tasks: ["推进本周主线 30 分钟", "完成今天的关键待办", "记录一个有效做法", "做一次身体活动"] },
      { id: "review", name: "迭代期", from: 9, to: 12, goal: "根据真实反馈调整方法，沉淀可复用经验", healthFocus: "观察训练、睡眠或精力的一项变化。", tasks: ["推进本周最重要的项目", "完成一次复盘", "向外获取或整理一条反馈", "维护身体与环境"] }
    ],
    milestones: [
      { id: "week-1", week: 1, title: "写下行动基线", template: "## 我想改善什么\n\n## 这一周的最小行动\n\n## 可能的阻力\n\n## 我如何开始" },
      { id: "week-4", week: 4, title: "第一月回顾", template: "## 我实际做了什么\n\n## 最有效的动作\n\n## 最大阻力\n\n## 下月保留与调整" },
      { id: "week-8", week: 8, title: "中期复盘", template: "## 目标进度\n\n## 我从数据或现实中学到了什么\n\n## 下阶段的一个调整" },
      { id: "week-12", week: 12, title: "84 天总结", template: "## 完成了什么\n\n## 形成了什么习惯或能力\n\n## 下一阶段要继续的事" }
    ]
  },
  focus: {
    name: "42 天专注计划", days: 42, goal: "用一个短周期推进最重要的项目",
    phases: [
      { id: "clarify", name: "聚焦期", from: 1, to: 2, goal: "定义边界和可交付结果", healthFocus: "给高强度专注预留恢复时间。", tasks: ["推进唯一主项目", "清理一个干扰源", "记录进展或卡点", "做一次短暂恢复"] },
      { id: "build", name: "推进期", from: 3, to: 4, goal: "持续产出可见版本", healthFocus: "保持活动，避免久坐与透支。", tasks: ["完成一个可见产出", "专注 45 分钟", "处理一个阻塞点", "记录明天的起点"] },
      { id: "finish", name: "收束期", from: 5, to: 6, goal: "完成交付，并整理经验", healthFocus: "优先恢复与复盘。", tasks: ["完成或完善交付物", "获得一次反馈", "记录可复用方法", "做一件恢复身体的事"] }
    ],
    milestones: [
      { id: "week-1", week: 1, title: "项目边界与完成定义", template: "## 我准备完成什么\n\n## 完成标准\n\n## 本周最小交付物\n\n## 不做什么" },
      { id: "week-3", week: 3, title: "中期可见版本", template: "## 已完成\n\n## 卡点\n\n## 收到的反馈\n\n## 下半程调整" },
      { id: "week-6", week: 6, title: "项目复盘", template: "## 最终结果\n\n## 有效做法\n\n## 下次会如何更早开始\n\n## 下一步" }
    ]
  },
  legacy180: {
    name: "180 天个人成长计划", days: 180, goal: "建立时间、能量和信息筛选习惯",
    phases: [
      { id: "foundation", name: "地基期", from: 1, to: 8, goal: "建立时间、能量和信息筛选习惯", healthFocus: "规律优先：每周完成 3 次轻量训练，并观察睡眠与精力。", tasks: ["记录时间或开销", "完成 30 分钟深度阅读", "照顾身体与能量", "完成一次外部接触"] },
      { id: "engine", name: "引擎期", from: 9, to: 16, goal: "在真实事件中训练复盘和意志力", healthFocus: "稳定训练结构：记录强度与时长，避免靠意志力硬撑。", tasks: ["完成睡前三问复盘", "做一件不想做但应该做的事", "记录一个真实事件", "完成复利领域投入"] },
      { id: "leverage", name: "杠杆期", from: 17, to: 26, goal: "选择主线，持续输出并获得可量化反馈", healthFocus: "数据化积累：追踪体重、力量或配速的一项长期指标。", tasks: ["投入当前主线至少 1 小时", "完成一次对外输出或接触", "记录一个可复用的资产", "确认今天的关键指标"] }
    ],
    milestones: [
      { id: "week-1", week: 1, title: "流水账与第一次外部接触", template: "## 本周流水账\n\n## 第一次外部接触\n- 对象：\n- 我做了什么：\n- 获得的反馈：\n- 下一步：" },
      { id: "week-2", week: 2, title: "第一份 AI 周核算报表", template: "## 时间、金钱、精力核算\n\n## 三个观察\n1. \n2. \n3. \n\n## 下周调整" },
      { id: "week-4", week: 4, title: "精力曲线原始数据与 3 次外部接触", template: "## 精力曲线\n\n## 外部反馈记录\n\n## 规律与调整" },
      { id: "week-8", week: 8, title: "地基三件套运行月报", template: "## 时间 / 能量 / 信息筛选\n\n## 做得最好的事\n\n## 最大阻力\n\n## 下一阶段建议" },
      { id: "week-12", week: 12, title: "第一次准交易记录", template: "## 对象与场景\n\n## 提供的价值\n\n## 对方反馈 / 交换\n\n## 下次改进" },
      { id: "week-16", week: 16, title: "双月复盘", template: "## 发生了什么\n\n## 我学到了什么\n\n## 下一阶段行动" },
      { id: "week-26", week: 26, title: "180 天系统首考报告", template: "## 外部反馈次数\n\n## 能力变化\n\n## 继续 / 切换的决定\n\n## 下一阶段" }
    ]
  }
};

function buildCustomPlan(growth) {
  const days = Math.min(1095, Math.max(7, Number(growth.totalDays) || 28));
  const weeks = Math.max(1, Math.ceil(days / 7));
  const midpoint = Math.min(weeks, Math.max(2, Math.ceil(weeks / 2)));
  return {
    id: "custom", name: String(growth.planName || "我的行动计划").trim() || "我的行动计划", days,
    goal: String(growth.goal || "围绕一个重要方向，持续做小而明确的行动").trim(),
    phases: [{ id: "custom", name: "推进期", from: 1, to: weeks, goal: String(growth.goal || "围绕一个重要方向，持续做小而明确的行动").trim(), healthFocus: "按自己的节奏安排活动、睡眠和恢复。", tasks: ["推进今天最重要的事", "完成一个最小动作", "记录一条观察或闪念", "安排恢复或整理"] }],
    milestones: [{ id: "week-1", week: 1, title: "计划起点", template: "## 我想完成什么\n\n## 为什么重要\n\n## 本周最小行动\n\n## 我会如何开始" }, { id: `week-${midpoint}`, week: midpoint, title: "中途回顾", template: "## 已经推进了什么\n\n## 遇到的阻力\n\n## 接下来要调整什么" }, { id: `week-${weeks}`, week: weeks, title: "阶段总结", template: "## 我完成了什么\n\n## 最有效的做法\n\n## 下一步" }].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
  };
}
function getPlanForGrowth(growth) {
  if (growth.planId === "custom") return buildCustomPlan(growth);
  const preset = PLAN_PRESETS[growth.planId] || PLAN_PRESETS.balanced;
  return { ...preset, name: String(growth.planName || preset.name).trim() || preset.name, goal: String(growth.goal || preset.goal).trim() || preset.goal };
}
function todayKey() { return window.moment().format("YYYY-MM-DD"); }
function escapeHtml(text) {
  return String(text || "").replace(/[&<>'\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
function defaultTasks(phase) { return Array.isArray(phase && phase.tasks) ? phase.tasks : ["明确今天的一件重点", "完成一个最小动作", "记录一条闪念", "安排一点恢复时间"]; }
function defaultDashboard() { return { order: [...DEFAULT_WIDGETS], hidden: [], sizes: {}, customWidgets: [] }; }
function freshData() {
  return {
    version: 5,
    banner: { mode: "daily", customText: "今天也要向前一点点。", customSource: "给未来的自己", image: "" },
    growth: { planId: "balanced", planName: "84 天行动计划", totalDays: 84, startDate: todayKey(), stage: "启动期", week: 1, goal: "建立可持续的行动、复盘与恢复节奏", externalFeedback: [], completedMilestones: [] },
    shortcuts: [
      { label: "今日日记", icon: "✍", action: "daily" },
      { label: "新建待办", icon: "＋", action: "task" },
      { label: "记录反馈", icon: "◎", action: "feedback" },
      { label: "今日复盘", icon: "◐", action: "review" },
      { label: "全部闪念", icon: "✦", action: "flashes" },
      { label: "书库", icon: "▤", action: "library" },
      { label: "搜索笔记", icon: "⌕", action: "search" }
    ],
    books: [],
    health: { weeklyGoal: 3, workouts: [] },
    dashboard: defaultDashboard(),
    days: {}
  };
}

class BannerModal extends Modal {
  constructor(app, plugin, onSave) { super(app); this.plugin = plugin; this.onSave = onSave; }
  onOpen() {
    const { contentEl } = this;
    const banner = this.plugin.data.banner;
    contentEl.createEl("h2", { text: "推送与横幅设置" });
    let mode = banner.mode, text = banner.customText, source = banner.customSource, image = banner.image;
    new Setting(contentEl).setName("推送模式").setDesc("每日推送会自动显示当天的名言或诗句。")
      .addDropdown(dropdown => dropdown.addOptions({ daily: "每日推送", custom: "自定义话术" }).setValue(mode).onChange(value => mode = value));
    new Setting(contentEl).setName("自定义话术").addTextArea(t => t.setValue(text).onChange(v => text = v));
    new Setting(contentEl).setName("署名 / 出处").addText(t => t.setValue(source).onChange(v => source = v));
    new Setting(contentEl).setName("背景图片").setDesc("填写 Vault 内图片路径或 https 图片地址；留空使用渐变背景。").addText(t => t.setValue(image).onChange(v => image = v));
    new Setting(contentEl).addButton(b => b.setButtonText("保存").setCta().onClick(async () => {
      this.plugin.data.banner.mode = mode;
      this.plugin.data.banner.customText = text.trim() || "今天也要向前一点点。";
      this.plugin.data.banner.customSource = source.trim();
      this.plugin.data.banner.image = image.trim();
      await this.plugin.saveVaultData(); this.onSave(); this.close();
    }));
  }
}

class GrowthSettingsModal extends Modal {
  constructor(app, plugin, onSave) { super(app); this.plugin = plugin; this.onSave = onSave; }
  onOpen() {
    const { contentEl } = this, growth = this.plugin.data.growth, currentPlan = this.plugin.getPlan();
    contentEl.createEl("h2", { text: "行动计划设置" });
    contentEl.createEl("p", { text: "选择一个通用预设，或创建自己的周期。修改计划不会删除既有闪念、训练和笔记。" });
    let planId = growth.planId || "legacy180", planName = currentPlan.name, totalDays = String(currentPlan.days), goal = growth.goal || currentPlan.goal, startDate = growth.startDate || todayKey();
    let nameInput, goalInput, daysInput;
    new Setting(contentEl).setName("计划类型").setDesc("84 天行动适合日常成长；42 天专注适合推进一个项目；180 天保留原有系统。")
      .addDropdown(dropdown => dropdown.addOptions({ balanced: "84 天行动计划", focus: "42 天专注计划", legacy180: "180 天个人成长计划", custom: "自定义周期" }).setValue(planId).onChange(value => {
        planId = value;
        if (value !== "custom") {
          const preset = PLAN_PRESETS[value];
          planName = preset.name; goal = preset.goal; totalDays = String(preset.days);
          nameInput?.setValue(planName); goalInput?.setValue(goal); daysInput?.setValue(totalDays);
        }
      }));
    new Setting(contentEl).setName("计划名称").setDesc("会显示在顶部进度条，可按你的用途命名。")
      .addText(input => { nameInput = input; input.setValue(planName).setPlaceholder("例如：秋季行动计划").onChange(value => planName = value); });
    new Setting(contentEl).setName("计划目标").setDesc("用一句话说明这一周期想推进的方向。")
      .addTextArea(input => { goalInput = input; input.setValue(goal).setPlaceholder("例如：稳定学习、工作与恢复节奏").onChange(value => goal = value); });
    new Setting(contentEl).setName("自定义周期天数").setDesc("仅“自定义周期”使用，支持 7 到 1095 天。")
      .addText(input => { daysInput = input; input.setValue(totalDays).setPlaceholder("例如：30").onChange(value => totalDays = value.trim()); });
    new Setting(contentEl).setName("计划开始日期").setDesc("插件根据该日期自动计算第几天和第几周。")
      .addText(input => input.setValue(startDate).setPlaceholder("YYYY-MM-DD").onChange(value => startDate = value.trim()));
    new Setting(contentEl).addButton(button => button.setButtonText("保存设置").setCta().onClick(async () => {
      if (!window.moment(startDate, "YYYY-MM-DD", true).isValid()) return new Notice("日期格式应为 YYYY-MM-DD");
      const preset = PLAN_PRESETS[planId] || PLAN_PRESETS.balanced;
      const isCustom = planId === "custom";
      const days = isCustom ? Math.min(1095, Math.max(7, Number(totalDays) || 28)) : preset.days;
      const planChanged = growth.planId !== (isCustom ? "custom" : planId) || Number(growth.totalDays) !== days;
      growth.planId = isCustom ? "custom" : planId;
      growth.planName = planName.trim() || preset.name;
      growth.totalDays = days;
      growth.goal = goal.trim() || preset.goal;
      growth.startDate = startDate;
      if (planChanged) growth.completedMilestones = [];
      await this.plugin.saveVaultData(); await this.plugin.refreshViews(); this.onSave(); this.close();
    }));
  }
}class TextInputModal extends Modal {
  constructor(app, title, placeholder, initialValue, onSubmit) { super(app); this.title = title; this.placeholder = placeholder; this.initialValue = initialValue; this.onSubmit = onSubmit; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });
    const input = contentEl.createEl("input", { type: "text", value: this.initialValue || "", placeholder: this.placeholder });
    input.addClass("lp-modal-input");
    const save = async () => { const value = input.value.trim(); if (!value) return new Notice("请输入内容后再保存。"); await this.onSubmit(value); this.close(); };
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); save(); } });
    new Setting(contentEl).addButton(button => button.setButtonText("保存").setCta().onClick(save));
    window.setTimeout(() => input.focus(), 0);
  }
}

class BookModal extends Modal {
  constructor(app, onSubmit) { super(app); this.onSubmit = onSubmit; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "添加到书库" });
    let title = "", author = "", total = "";
    new Setting(contentEl).setName("书名").addText(input => input.setPlaceholder("例如：认知觉醒").onChange(value => title = value));
    new Setting(contentEl).setName("作者").setDesc("可留空").addText(input => input.setPlaceholder("作者姓名").onChange(value => author = value));
    new Setting(contentEl).setName("总页数").setDesc("不知道可留空").addText(input => input.setPlaceholder("例如：320").onChange(value => total = value));
    new Setting(contentEl).addButton(button => button.setButtonText("加入书库").setCta().onClick(async () => {
      if (!title.trim()) return new Notice("请先填写书名。");
      await this.onSubmit({ title: title.trim(), author: author.trim(), total: Math.max(0, Number(total) || 0) }); this.close();
    }));
  }
}

class WorkoutModal extends Modal {
  constructor(app, onSubmit) { super(app); this.onSubmit = onSubmit; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "记录训练" });
    let type = "力量训练", duration = "", intensity = "中等", weight = "", note = "";
    new Setting(contentEl).setName("训练类型").addDropdown(dropdown => dropdown
      .addOptions({ "力量训练": "力量训练", "跑步": "跑步", "球类": "球类", "骑行": "骑行", "游泳": "游泳", "拉伸 / 恢复": "拉伸 / 恢复", "其他": "其他" })
      .setValue(type).onChange(value => type = value));
    new Setting(contentEl).setName("训练时长").setDesc("分钟，可留空").addText(input => input.setPlaceholder("例如：45").onChange(value => duration = value));
    new Setting(contentEl).setName("主观强度").addDropdown(dropdown => dropdown
      .addOptions({ "轻松": "轻松", "中等": "中等", "高强度": "高强度" }).setValue(intensity).onChange(value => intensity = value));
    new Setting(contentEl).setName("体重").setDesc("kg，可留空；用于长期趋势记录").addText(input => input.setPlaceholder("例如：68.5").onChange(value => weight = value));
    new Setting(contentEl).setName("备注").setDesc("如动作、距离、配速或身体感受").addTextArea(input => input.setPlaceholder("例如：深蹲 3 组；膝盖无不适").onChange(value => note = value));
    new Setting(contentEl).addButton(button => button.setButtonText("保存训练").setCta().onClick(async () => {
      await this.onSubmit({ type, duration: Math.max(0, Number(duration) || 0), intensity, weight: Math.max(0, Number(weight) || 0), note: note.trim() }); this.close();
    }));
  }
}

class CustomWidgetModal extends Modal {
  constructor(app, plugin, onSave) { super(app); this.plugin = plugin; this.onSave = onSave; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "添加自定义卡片" });
    let type = "note", title = "", content = "", value = "0", goal = "";
    new Setting(contentEl).setName("卡片类型").addDropdown(dropdown => dropdown
      .addOptions({ note: "文本 / 提醒", link: "链接入口", counter: "目标计数器" }).setValue(type).onChange(input => type = input));
    new Setting(contentEl).setName("标题").addText(input => input.setPlaceholder("例如：本月主题").onChange(input => title = input));
    new Setting(contentEl).setName("内容").setDesc("文本卡片填写内容；链接卡片填写网址；计数器填写说明。").addTextArea(input => input.setPlaceholder("例如：https://... 或写下提醒").onChange(input => content = input));
    new Setting(contentEl).setName("当前值").setDesc("仅计数器使用").addText(input => input.setValue(value).onChange(input => value = input));
    new Setting(contentEl).setName("目标值").setDesc("仅计数器使用，可留空").addText(input => input.setPlaceholder("例如：30").onChange(input => goal = input));
    new Setting(contentEl).addButton(button => button.setButtonText("添加到主页").setCta().onClick(async () => {
      if (!title.trim()) return new Notice("请先填写卡片标题。");
      if (type === "link" && !/^https?:\/\//.test(content.trim())) return new Notice("链接卡片需要以 http:// 或 https:// 开头。");
      await this.plugin.addCustomWidget({ type, title: title.trim(), content: content.trim(), value: Math.max(0, Number(value) || 0), goal: Math.max(0, Number(goal) || 0) });
      this.onSave(); this.close();
    }));
  }
}

class DashboardLayoutModal extends Modal {
  constructor(app, plugin, onSave) { super(app); this.plugin = plugin; this.onSave = onSave; }
  onOpen() { this.render(); }
  render() {
    const { contentEl } = this, dashboard = this.plugin.getDashboard();
    contentEl.empty(); contentEl.createEl("h2", { text: "定制主页" });
    contentEl.createEl("p", { text: "电脑端可直接拖动卡片排序。这里适合在平板和手机上调整显示、顺序和尺寸；不会删除你的笔记或记录。" });
    for (const id of dashboard.order) {
      const custom = dashboard.customWidgets.find(widget => widget.id === id);
      const title = custom ? custom.title : WIDGET_NAMES[id];
      if (!title) continue;
      new Setting(contentEl).setName(title).setDesc(custom ? "自定义卡片" : "系统卡片")
        .addToggle(toggle => toggle.setValue(!dashboard.hidden.includes(id)).onChange(async visible => { await this.plugin.setWidgetVisibility(id, visible); this.onSave(); }))
        .addDropdown(dropdown => dropdown.addOptions({ auto: "默认", compact: "紧凑", standard: "标准", wide: "宽幅", full: "全宽" }).setValue(this.plugin.getWidgetSize(id)).onChange(async size => { await this.plugin.setWidgetSize(id, size); this.onSave(); this.render(); }))
        .addExtraButton(button => button.setIcon("chevron-up").setTooltip("上移").onClick(async () => { await this.plugin.moveWidget(id, -1); this.onSave(); this.render(); }))
        .addExtraButton(button => button.setIcon("chevron-down").setTooltip("下移").onClick(async () => { await this.plugin.moveWidget(id, 1); this.onSave(); this.render(); }));
      if (custom) new Setting(contentEl).setName("移除「" + title + "」").setDesc("只移除这张卡片，不影响其它笔记。")
        .addButton(button => button.setButtonText("移除").setWarning().onClick(async () => { await this.plugin.removeCustomWidget(id); this.onSave(); this.render(); }));
    }
    new Setting(contentEl).setName("新卡片").setDesc("可以添加文本、链接入口或目标计数器。")
      .addButton(button => button.setButtonText("添加自定义卡片").setCta().onClick(() => new CustomWidgetModal(this.app, this.plugin, () => { this.onSave(); this.render(); }).open()));
  }
}
class LaunchpadView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "个人启动台"; }
  getIcon() { return "layout-dashboard"; }
  async onOpen() { await this.render(); }
  async onClose() { this.contentEl.empty(); }
  day() {
    const key = todayKey();
    if (!this.plugin.data.days[key]) this.plugin.data.days[key] = { tasks: defaultTasks(this.plugin.getGrowthState().phase).map(text => ({ text, done: false })), flashes: [] };
    const day = this.plugin.data.days[key];
    day.tasks = Array.isArray(day.tasks) ? day.tasks : [];
    day.flashes = Array.isArray(day.flashes) ? day.flashes : [];
    return day;
  }
  message() {
    const seed = Number(todayKey().replaceAll("-", ""));
    return DAILY_MESSAGES[seed % DAILY_MESSAGES.length];
  }
  bannerBackground(image) {
    if (!image) return "";
    if (/^https?:\/\//.test(image)) {
      const safeUrl = encodeURI(image.trim()).replace(/['"()\\]/g, "");
      return `background-image: linear-gradient(90deg, rgba(20,30,35,.72), rgba(22,45,44,.30)), url("${safeUrl}")`;
    }
    const file = this.app.vault.getAbstractFileByPath(image);
    if (file instanceof TFile) return `background-image: linear-gradient(90deg, rgba(20,30,35,.72), rgba(22,45,44,.30)), url('${this.app.vault.getResourcePath(file)}')`;
    return "";
  }
  async render() {
    const root = this.contentEl;
    root.empty(); root.addClass("personal-launchpad");
    const data = this.plugin.data, day = this.day(), books = data.books || [], growthState = this.plugin.getGrowthState(), weekly = this.plugin.weeklyStats(), health = this.plugin.healthStats();
    const reading = books.filter(book => book.status === "在读");
    const custom = data.banner.mode === "custom";
    const message = custom ? { text: data.banner.customText, source: data.banner.customSource } : this.message();
    const background = this.bannerBackground(data.banner.image);
    const done = day.tasks.filter(t => t.done).length;
    const dateLabel = window.moment().format("YYYY 年 M 月 D 日 · dddd");
    const planLabel = escapeHtml(growthState.plan.name);
    root.innerHTML = `
      <section class="lp-banner" style="${background}">
        <div class="lp-banner-meta"><span>${dateLabel}</span><span>${planLabel} · 第 ${growthState.week} 周</span></div>
        <blockquote>${escapeHtml(message.text)}</blockquote>
        <div class="lp-source">— ${escapeHtml(message.source || "每日推送")}</div>
        <div class="lp-plan-progress" aria-label="${planLabel}进度"><i style="width:${growthState.planPercent}%"></i><span>${planLabel} · 第 ${growthState.day} / ${growthState.plan.days} 天 · ${growthState.planPercent}%</span></div>
        <button data-action="edit-banner" class="lp-banner-settings" aria-label="推送与横幅设置">⚙</button>
      </section>
      <div class="lp-dashboard-toolbar"><span>今日工作台</span><button data-action="customize-dashboard">▦ 定制主页</button></div>
      <main class="lp-grid">
        <section class="lp-card lp-capture-card" data-widget="capture">
          <div class="lp-heading"><span>✦ 闪念</span><small>先捕捉，后整理</small></div>
          <textarea data-role="flash" placeholder="现在想到什么？"></textarea>
          <div class="lp-capture-footer"><select data-role="flash-type"><option>闪念</option><option>待办</option><option>复盘</option><option>外部反馈</option><option>项目</option><option>AI问题</option></select><button data-action="save-flash" class="lp-primary">保存闪念</button></div>
        </section>
        <section class="lp-card lp-focus-card" data-widget="focus">
          <div class="lp-heading"><span>◎ 今天最重要的一件事</span><button data-action="edit-focus" class="lp-icon-button">编辑</button></div>
          <div class="lp-focus-text">${escapeHtml(day.focus || "还没有写下。先给今天一个清晰的方向。")}</div>
        </section>
        <section class="lp-card lp-tasks-card" data-widget="tasks">
          <div class="lp-heading"><span>✓ 今日行动</span><small>${done} / ${day.tasks.length}</small></div>
          <div class="lp-progress"><i style="width:${day.tasks.length ? Math.round(done / day.tasks.length * 100) : 0}%"></i></div>
          <div class="lp-task-list">${day.tasks.map((task, index) => `<div class="lp-task ${task.done ? "is-done" : ""}"><label><input type="checkbox" data-task="${index}" ${task.done ? "checked" : ""}><span>${escapeHtml(task.text)}</span></label><span class="lp-task-actions"><button data-edit-task="${index}" aria-label="编辑任务">✎</button><button data-delete-task="${index}" aria-label="删除任务">×</button></span></div>`).join("")}</div>
          <button data-action="add-task" class="lp-text-button">＋ 添加临时任务</button>
        </section>
        <section class="lp-card lp-growth-card" data-widget="growth">
          <div class="lp-heading"><span>🧭 当前成长</span><button data-action="edit-growth" class="lp-icon-button">编辑</button></div>
          <strong>${escapeHtml(growthState.phase.name)} · 第 ${growthState.week} 周</strong>
          <p>${escapeHtml(growthState.phase.goal)}</p>
          <div class="lp-phase-progress"><i style="width:${growthState.phasePercent}%"></i></div>
          <small>本阶段第 ${growthState.phaseWeek} / ${growthState.phase.to - growthState.phase.from + 1} 周</small>
          <div class="lp-feedback"><span>本周反馈 / 观察</span><b>${this.plugin.weekFeedbackCount()} / 1</b><button data-action="feedback">记录</button></div>
        </section>
        <section class="lp-card lp-health-card" data-widget="health">
          <div class="lp-heading"><span>◉ 身体系统</span><button data-action="workout" class="lp-icon-button">＋ 记录训练</button></div>
          <strong>${health.today.length ? `今天已训练 ${health.today.length} 次` : "今天还没有训练记录"}</strong>
          <p>${escapeHtml(growthState.phase.healthFocus)}</p>
          <div class="lp-health-kpis"><span><b>${health.sessions}</b><small>本周训练 / ${health.goal}</small></span><span><b>${health.minutes}</b><small>训练分钟</small></span><span><b>${health.latestWeight ? `${health.latestWeight}kg` : "—"}</b><small>最近体重</small></span></div>
          <div class="lp-inline-actions"><button data-action="workout" class="lp-text-button">${health.today.length ? "补充训练" : "记录今天训练"}</button><button data-action="open-health" class="lp-text-button">查看记录</button></div>
        </section>
        <section class="lp-card lp-milestone-card" data-widget="milestone">
          <div class="lp-heading"><span>◈ 下一交付物</span><small>第 ${growthState.milestone.week} 周</small></div>
          <strong>${escapeHtml(growthState.milestone.title)}</strong>
          <p class="lp-alert ${growthState.alert.level}">${escapeHtml(growthState.alert.message)}</p>
          <div class="lp-inline-actions"><button data-action="milestone-template" class="lp-text-button">打开模板</button><button data-action="complete-milestone" class="lp-text-button">${growthState.milestoneDone ? "✓ 已完成" : "标记为完成"}</button></div>
        </section>
        <section class="lp-card lp-week-card" data-widget="week">
          <div class="lp-heading"><span>◒ 本周复盘</span><small>${weekly.completed} / ${weekly.total} 项完成</small></div>
          <div class="lp-week-kpis"><span><b>${weekly.rate}%</b><small>行动完成率</small></span><span><b>${weekly.feedback}</b><small>反馈 / 观察</small></span><span><b>${weekly.flashes}</b><small>闪念捕捉</small></span></div>
          <button data-action="weekly-review" class="lp-primary">打开本周复盘</button>
        </section>
        <section class="lp-card lp-shortcuts-card" data-widget="shortcuts">
          <div class="lp-heading"><span>⚡ 快捷入口</span></div>
          <div class="lp-shortcuts">${data.shortcuts.map((item, index) => `<button data-shortcut="${index}"><i>${escapeHtml(item.icon)}</i><span>${escapeHtml(item.label)}</span></button>`).join("")}</div>
        </section>
        <section class="lp-card lp-library-card" data-widget="library">
          <div class="lp-heading"><span>▤ 在读书库</span><button data-action="add-book" class="lp-icon-button">＋ 添加书籍</button></div>
          <div class="lp-library-list">${reading.length ? reading.slice(0, 3).map(book => {
            const actualIndex = books.indexOf(book), percent = book.total ? Math.min(100, Math.round(book.current / book.total * 100)) : 0;
            return `<button class="lp-book" data-book="${actualIndex}"><span class="lp-book-cover">${escapeHtml((book.title || "书").slice(0, 1))}</span><span class="lp-book-info"><b>${escapeHtml(book.title)}</b><small>${escapeHtml(book.author || "未填写作者")} · ${book.total ? `${book.current || 0}/${book.total} 页` : "记录阅读感受"}</small><i><em style="width:${percent}%"></em></i></span></button>`;
          }).join("") : "<div class=\"lp-empty-library\"><span>正在读的书会出现在这里</span><button data-action=\"add-book\">添加第一本书</button></div>"}</div>
        </section>
        <section class="lp-card lp-recent-card" data-widget="recent">
          <div class="lp-heading"><span>◷ 今日闪念</span><button data-action="open-flashes" class="lp-icon-button">查看全部</button></div>
          <div class="lp-recent-list">${day.flashes.length ? day.flashes.slice(-4).reverse().map((f, reverseIndex) => { const index = day.flashes.length - 1 - reverseIndex; return `<div><b>${escapeHtml(f.type)}</b><span>${escapeHtml(f.text)}</span>${f.type === "待办" ? `<button data-flash-to-task="${index}">加入行动</button>` : ""}</div>`; }).join("") : "<p>还没有记录。第一条闪念从这里开始。</p>"}</div>
        </section>
        ${this.plugin.renderCustomWidgets()}
      </main>`;
    this.plugin.applyDashboardLayout(root);
    this.bindEvents();
  }
  bindEvents() {
    this.contentEl.querySelectorAll("[data-task]").forEach(input => input.addEventListener("change", async e => {
      this.day().tasks[Number(e.target.dataset.task)].done = e.target.checked; await this.plugin.saveVaultData(); await this.render();
    }));
    this.contentEl.querySelectorAll("[data-delete-task]").forEach(button => button.addEventListener("click", async () => {
      this.day().tasks.splice(Number(button.dataset.deleteTask), 1); await this.plugin.saveVaultData(); await this.render();
    }));
    this.contentEl.querySelectorAll("[data-edit-task]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.editTask), task = this.day().tasks[index];
      new TextInputModal(this.app, "编辑任务", "任务内容", task.text, async text => { task.text = text; await this.plugin.saveVaultData(); await this.render(); }).open();
    }));
    this.contentEl.querySelectorAll("[data-flash-to-task]").forEach(button => button.addEventListener("click", async () => {
      const flash = this.day().flashes[Number(button.dataset.flashToTask)]; if (!flash) return;
      this.day().tasks.push({ text: flash.text, done: false }); flash.type = "待办（已加入行动）";
      await this.plugin.saveVaultData(); new Notice("已加入今日行动"); await this.render();
    }));
    this.contentEl.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => this.handleAction(button.dataset.action)));
    this.contentEl.querySelectorAll("[data-shortcut]").forEach(button => button.addEventListener("click", () => this.plugin.runShortcut(this.plugin.data.shortcuts[Number(button.dataset.shortcut)])));
    this.contentEl.querySelectorAll("[data-book]").forEach(button => button.addEventListener("click", () => this.plugin.updateBook(Number(button.dataset.book))));
    this.contentEl.querySelectorAll("[data-delete-widget]").forEach(button => button.addEventListener("click", async () => { await this.plugin.removeCustomWidget(button.dataset.deleteWidget); new Notice("卡片已移除"); await this.render(); }));
    this.contentEl.querySelectorAll("[data-open-widget-link]").forEach(button => button.addEventListener("click", () => window.open(button.dataset.openWidgetLink, "_blank", "noopener")));
    this.contentEl.querySelectorAll("[data-update-counter]").forEach(button => button.addEventListener("click", () => this.plugin.updateCustomCounter(button.dataset.updateCounter)));
    this.bindDashboardInteractions();
  }
  bindDashboardInteractions() {
    this.contentEl.querySelectorAll("[data-resize-widget]").forEach(button => button.addEventListener("click", () => this.plugin.cycleWidgetSize(button.dataset.resizeWidget)));
    if (!window.matchMedia("(min-width: 801px)").matches) return;
    let draggedId = "";
    const cards = [...this.contentEl.querySelectorAll(".lp-card[data-widget]")];
    const clearDragState = () => cards.forEach(card => card.classList.remove("is-dragging", "is-drop-target"));
    this.contentEl.querySelectorAll("[data-drag-handle]").forEach(handle => {
      handle.addEventListener("dragstart", event => {
        draggedId = handle.dataset.dragHandle;
        if (event.dataTransfer) {
          event.dataTransfer.setData("text/plain", draggedId);
          event.dataTransfer.effectAllowed = "move";
        }
        handle.closest("[data-widget]")?.classList.add("is-dragging");
      });
      handle.addEventListener("dragend", () => { draggedId = ""; clearDragState(); });
    });
    cards.forEach(card => {
      card.addEventListener("dragover", event => { if (draggedId && card.dataset.widget !== draggedId) { event.preventDefault(); card.classList.add("is-drop-target"); } });
      card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
      card.addEventListener("drop", async event => {
        event.preventDefault();
        const targetId = card.dataset.widget;
        clearDragState();
        if (draggedId && targetId) await this.plugin.moveWidgetBefore(draggedId, targetId);
        draggedId = "";
      });
    });
  }
  async handleAction(action) {
    if (action === "edit-banner") return new BannerModal(this.app, this.plugin, () => this.render()).open();
    if (action === "customize-dashboard") return new DashboardLayoutModal(this.app, this.plugin, () => this.render()).open();
    if (action === "save-flash") {
      const text = this.contentEl.querySelector("[data-role=flash]").value.trim();
      const type = this.contentEl.querySelector("[data-role=flash-type]").value;
      if (!text) return new Notice("先写下一点内容，再保存。", 2500);
      await this.plugin.saveFlash(text, type); new Notice("闪念已保存"); return this.render();
    }
    if (action === "edit-focus") {
      return new TextInputModal(this.app, "今天最重要的一件事", "例如：完成项目方案第一版", this.day().focus || "", async text => {
        this.day().focus = text; await this.plugin.saveVaultData(); await this.render();
      }).open();
    }
    if (action === "add-task") {
      return new TextInputModal(this.app, "添加临时任务", "例如：给客户回消息", "", async text => {
        this.day().tasks.push({ text, done: false }); await this.plugin.saveVaultData(); await this.render();
      }).open();
    }
    if (action === "feedback") return this.plugin.recordFeedback();
    if (action === "workout") return this.plugin.recordWorkout();
    if (action === "open-health") return this.plugin.openOrCreate(`个人成长系统/健身/${todayKey()}.md`, `# ${todayKey()} 健身记录\n`);
    if (action === "edit-growth") return this.plugin.editGrowth();
    if (action === "open-flashes") return this.plugin.openOrCreate(`个人成长系统/闪念/${todayKey()}.md`, `# ${todayKey()} 闪念\n`);
    if (action === "add-book") return this.plugin.addBook();
    if (action === "complete-milestone") return this.plugin.toggleCurrentMilestone();
    if (action === "milestone-template") return this.plugin.openCurrentMilestone();
    if (action === "weekly-review") return this.plugin.openWeeklyReview();
  }
}

module.exports = class PersonalLaunchpadPlugin extends Plugin {
  async onload() {
    await this.loadVaultData();
    this.registerView(VIEW_TYPE, leaf => new LaunchpadView(leaf, this));
    this.addRibbonIcon("layout-dashboard", "打开个人启动台", () => this.activateView());
    this.addCommand({ id: "open-personal-launchpad", name: "Open personal launchpad", callback: () => this.activateView() });
    this.addCommand({ id: "quick-capture", name: "Quick capture a flash", callback: () => this.openQuickCapture() });
    this.addCommand({ id: "quick-log-workout", name: "Quick log a workout", callback: () => this.recordWorkout() });
  }
  async onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }
  async ensureFolder(path) {
    const parts = path.split("/"); let current = "";
    for (const part of parts) { current = current ? `${current}/${part}` : part; if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current); }
  }
  async loadVaultData() {
    await this.ensureFolder(DATA_FOLDER);
    const file = this.app.vault.getAbstractFileByPath(DATA_PATH);
    if (file instanceof TFile) {
      try { this.data = { ...freshData(), ...JSON.parse(await this.app.vault.read(file)) }; }
      catch (_) { this.data = freshData(); }
    } else { this.data = freshData(); await this.saveVaultData(); }
    this.data.books = Array.isArray(this.data.books) ? this.data.books : [];
    this.data.days = this.data.days && typeof this.data.days === "object" ? this.data.days : {};
    const storedGrowth = this.data.growth || {};
    this.data.growth = { ...freshData().growth, ...storedGrowth };
    if (!storedGrowth.planId) {
      this.data.growth.planId = "legacy180";
      this.data.growth.planName = storedGrowth.planName || "180 天个人成长计划";
      this.data.growth.totalDays = 180;
    }
    this.data.growth.externalFeedback = Array.isArray(this.data.growth.externalFeedback) ? this.data.growth.externalFeedback : [];
    this.data.growth.completedMilestones = Array.isArray(this.data.growth.completedMilestones) ? this.data.growth.completedMilestones : [];
    this.data.banner = { ...freshData().banner, ...(this.data.banner || {}) };
    this.data.health = { ...freshData().health, ...(this.data.health || {}) };
    this.data.health.workouts = Array.isArray(this.data.health.workouts) ? this.data.health.workouts : [];
    this.data.dashboard = { ...defaultDashboard(), ...(this.data.dashboard || {}) };
    this.data.dashboard.order = Array.isArray(this.data.dashboard.order) ? this.data.dashboard.order : [...DEFAULT_WIDGETS];
    this.data.dashboard.hidden = Array.isArray(this.data.dashboard.hidden) ? this.data.dashboard.hidden : [];
    this.data.dashboard.customWidgets = Array.isArray(this.data.dashboard.customWidgets) ? this.data.dashboard.customWidgets : [];
    this.data.dashboard.sizes = this.data.dashboard.sizes && typeof this.data.dashboard.sizes === "object" ? this.data.dashboard.sizes : {};
    for (const id of DEFAULT_WIDGETS) if (!this.data.dashboard.order.includes(id)) this.data.dashboard.order.push(id);
    this.data.version = 5;
  }
  async saveVaultData() {
    const text = JSON.stringify(this.data, null, 2);
    const file = this.app.vault.getAbstractFileByPath(DATA_PATH);
    if (file instanceof TFile) await this.app.vault.modify(file, text); else await this.app.vault.create(DATA_PATH, text);
  }
  async activateView() {
    const { workspace } = this.app; let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true }); workspace.revealLeaf(leaf);
  }
  async openOrCreate(path, content) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return this.app.workspace.getLeaf("tab").openFile(existing);
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    const file = await this.app.vault.create(path, content); return this.app.workspace.getLeaf("tab").openFile(file);
  }
  async saveFlash(text, type) {
    const key = todayKey();
    if (!this.data.days[key]) this.data.days[key] = { tasks: defaultTasks(this.getGrowthState().phase).map(value => ({ text: value, done: false })), flashes: [] };
    const day = this.data.days[key];
    day.tasks = Array.isArray(day.tasks) ? day.tasks : [];
    day.flashes = Array.isArray(day.flashes) ? day.flashes : [];
    const entry = { text, type, time: window.moment().format("HH:mm") };
    day.flashes.push(entry); await this.ensureFolder("个人成长系统/闪念");
    const path = `个人成长系统/闪念/${key}.md`, block = `\n## ${entry.time} · ${entry.type}\n\n${text}\n\n- 类型：${entry.type}\n- 状态：待整理\n`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.append(file, block); else await this.app.vault.create(path, `# ${key} 闪念\n${block}`);
    await this.saveVaultData();
  }
  openQuickCapture() {
    return new TextInputModal(this.app, "闪念速记", "想到什么就先写下来", "", async text => {
      const key = todayKey();
      if (!this.data.days[key]) this.data.days[key] = { tasks: defaultTasks(this.getGrowthState().phase).map(value => ({ text: value, done: false })), flashes: [] };
      await this.saveFlash(text, "闪念"); new Notice("闪念已保存"); await this.refreshViews();
    }).open();
  }
  getDashboard() { return this.data.dashboard || defaultDashboard(); }
  getWidgetSize(id) {
    const size = this.getDashboard().sizes?.[id];
    return ["compact", "standard", "wide", "full"].includes(size) ? size : "auto";
  }
  async setWidgetSize(id, size) {
    const dashboard = this.getDashboard();
    if (!dashboard.sizes || typeof dashboard.sizes !== "object") dashboard.sizes = {};
    if (size === "auto") delete dashboard.sizes[id]; else dashboard.sizes[id] = size;
    await this.saveVaultData(); await this.refreshViews();
  }
  async cycleWidgetSize(id) {
    const sizes = ["auto", "compact", "standard", "wide", "full"];
    const next = sizes[(sizes.indexOf(this.getWidgetSize(id)) + 1) % sizes.length];
    await this.setWidgetSize(id, next);
    new Notice(`「${WIDGET_NAMES[id] || "卡片"}」尺寸：${{ auto: "默认", compact: "紧凑", standard: "标准", wide: "宽幅", full: "全宽" }[next]}`);
  }
  async moveWidgetBefore(id, targetId) {
    if (!id || id === targetId) return;
    const order = this.getDashboard().order, from = order.indexOf(id), target = order.indexOf(targetId);
    if (from < 0 || target < 0) return;
    order.splice(from, 1);
    order.splice(order.indexOf(targetId), 0, id);
    await this.saveVaultData(); await this.refreshViews();
  }
  async setWidgetVisibility(id, visible) {
    const dashboard = this.getDashboard();
    dashboard.hidden = visible ? dashboard.hidden.filter(item => item !== id) : [...new Set([...dashboard.hidden, id])];
    await this.saveVaultData(); await this.refreshViews();
  }
  async moveWidget(id, direction) {
    const order = this.getDashboard().order, current = order.indexOf(id), target = current + direction;
    if (current < 0 || target < 0 || target >= order.length) return;
    [order[current], order[target]] = [order[target], order[current]];
    await this.saveVaultData(); await this.refreshViews();
  }
  async addCustomWidget(widget) {
    const dashboard = this.getDashboard();
    const id = `custom-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    dashboard.customWidgets.push({ id, ...widget }); dashboard.order.push(id);
    await this.saveVaultData(); await this.refreshViews();
  }
  async removeCustomWidget(id) {
    const dashboard = this.getDashboard();
    dashboard.customWidgets = dashboard.customWidgets.filter(widget => widget.id !== id);
    dashboard.order = dashboard.order.filter(item => item !== id);
    dashboard.hidden = dashboard.hidden.filter(item => item !== id);
    if (dashboard.sizes) delete dashboard.sizes[id];
    await this.saveVaultData(); await this.refreshViews();
  }
  renderCustomWidgets() {
    const dashboard = this.getDashboard();
    return dashboard.customWidgets.map(widget => {
      const title = escapeHtml(widget.title), content = escapeHtml(widget.content);
      let body = `<p>${content || "还没有内容。"}</p>`;
      if (widget.type === "link") body = `<button class="lp-custom-link" data-open-widget-link="${escapeHtml(widget.content)}">打开链接 ↗</button>`;
      if (widget.type === "counter") body = `<div class="lp-custom-counter"><b>${Number(widget.value) || 0}${widget.goal ? ` <small>/ ${Number(widget.goal)}</small>` : ""}</b><span>${content || "当前进度"}</span><button data-update-counter="${widget.id}">更新数值</button></div>`;
      return `<section class="lp-card lp-custom-card" data-widget="${widget.id}"><div class="lp-heading"><span>${title}</span><button class="lp-icon-button" data-delete-widget="${widget.id}" aria-label="移除卡片">×</button></div>${body}</section>`;
    }).join("");
  }
  applyDashboardLayout(root) {
    const dashboard = this.getDashboard();
    root.querySelectorAll("[data-widget]").forEach(element => {
      const id = element.dataset.widget, index = dashboard.order.indexOf(id);
      if (dashboard.hidden.includes(id) || index < 0) { element.remove(); return; }
      element.style.order = String(index);
      element.dataset.size = this.getWidgetSize(id);
      const heading = element.querySelector(".lp-heading");
      if (!heading) return;
      const existingControls = [...heading.children].filter(child => child.tagName === "BUTTON");
      const tools = heading.createEl("span", { cls: "lp-layout-tools" });
      existingControls.forEach(button => tools.appendChild(button));
      const resize = tools.createEl("button", { text: "↔", cls: "lp-layout-button", attr: { "data-resize-widget": id, "aria-label": "改变卡片尺寸", title: "改变卡片尺寸" } });
      resize.type = "button";
      const drag = tools.createEl("button", { text: "⠿", cls: "lp-drag-handle", attr: { "data-drag-handle": id, "aria-label": "拖动卡片排序", title: "拖动卡片排序", draggable: "true" } });
      drag.type = "button";
    });
  }
  updateCustomCounter(id) {
    const widget = this.getDashboard().customWidgets.find(item => item.id === id); if (!widget) return;
    return new TextInputModal(this.app, `更新「${widget.title}」`, "输入当前数值", String(widget.value || 0), async value => {
      widget.value = Math.max(0, Number(value) || 0); await this.saveVaultData(); await this.refreshViews();
    }).open();
  }
  healthStats() {
    const workouts = this.data.health.workouts || [];
    const begin = window.moment().startOf("isoWeek"), end = window.moment().endOf("isoWeek");
    const week = workouts.filter(item => window.moment(item.date, "YYYY-MM-DD", true).isBetween(begin, end, "day", "[]"));
    const today = workouts.filter(item => item.date === todayKey());
    const latestWithWeight = [...workouts].reverse().find(item => item.weight > 0);
    return { goal: this.data.health.weeklyGoal || 3, sessions: week.length, minutes: week.reduce((total, item) => total + (Number(item.duration) || 0), 0), today, latestWeight: latestWithWeight?.weight || 0 };
  }
  recordWorkout() {
    return new WorkoutModal(this.app, async workout => {
      const entry = { ...workout, date: todayKey(), time: window.moment().format("HH:mm") };
      this.data.health.workouts.push(entry);
      await this.ensureFolder("个人成长系统/健身");
      const path = `个人成长系统/健身/${todayKey()}.md`;
      const details = [`- 类型：${entry.type}`, `- 时长：${entry.duration ? `${entry.duration} 分钟` : "未记录"}`, `- 强度：${entry.intensity}`, entry.weight ? `- 体重：${entry.weight} kg` : "", entry.note ? `- 备注：${entry.note}` : ""].filter(Boolean).join("\n");
      const block = `\n## ${entry.time} · ${entry.type}\n\n${details}\n`;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.append(file, block); else await this.app.vault.create(path, `# ${todayKey()} 健身记录\n${block}`);
      await this.saveVaultData(); new Notice("训练已记录"); await this.refreshViews();
    }).open();
  }
  weekFeedbackCount() {
    const start = window.moment().startOf("isoWeek"); return (this.data.growth.externalFeedback || []).filter(item => window.moment(item.date).isSameOrAfter(start, "day")).length;
  }
  getPlan() { return getPlanForGrowth(this.data.growth || freshData().growth); }
  getGrowthState() {
    const growth = this.data.growth, plan = this.getPlan();
    const start = window.moment(growth.startDate, "YYYY-MM-DD", true);
    const elapsed = start.isValid() ? Math.max(0, window.moment().startOf("day").diff(start.startOf("day"), "days")) : 0;
    const totalWeeks = Math.max(1, Math.ceil(plan.days / 7));
    const week = Math.min(totalWeeks, Math.floor(elapsed / 7) + 1);
    const day = Math.min(plan.days, elapsed + 1);
    const phase = plan.phases.find(item => week >= item.from && week <= item.to) || plan.phases[plan.phases.length - 1];
    const phaseWeek = Math.max(1, week - phase.from + 1);
    const completedMilestones = Array.isArray(growth.completedMilestones) ? growth.completedMilestones : [];
    const pendingMilestones = plan.milestones.filter(item => !completedMilestones.includes(item.id));
    const milestone = pendingMilestones.find(item => item.week >= week) || pendingMilestones[0] || plan.milestones[plan.milestones.length - 1];
    const thisWeek = this.weekFeedbackCount();
    const previousWeeks = [1, 2, 3, 4].map(offset => (growth.externalFeedback || []).filter(item => window.moment(item.date).isSame(window.moment().subtract(offset, "weeks"), "isoWeek")).length);
    let alert = { level: "ok", message: "本周可以记录一次来自现实的反馈。" };
    if (previousWeeks.slice(0, 4).every(count => count === 0) && thisWeek === 0) alert = { level: "danger", message: "连续四周没有记录反馈。若适用，安排一次真实交流或收集一次结果。" };
    else if (previousWeeks.slice(0, 2).every(count => count === 0) && thisWeek === 0) alert = { level: "warn", message: "连续两周没有记录反馈。可在本周补一条外部观察。" };
    return { plan, week, day, planPercent: Math.min(100, Math.round(day / plan.days * 100)), phase, phaseWeek, phasePercent: Math.min(100, Math.round(phaseWeek / (phase.to - phase.from + 1) * 100)), milestone, milestoneDone: milestone ? completedMilestones.includes(milestone.id) : false, alert };
  }
  async toggleCurrentMilestone() {
    const state = this.getGrowthState(), completed = this.data.growth.completedMilestones || [];
    if (!state.milestone) return new Notice("当前计划没有交付物。");
    this.data.growth.completedMilestones = completed.includes(state.milestone.id) ? completed.filter(id => id !== state.milestone.id) : [...completed, state.milestone.id];
    await this.saveVaultData(); await this.refreshViews();
    new Notice(completed.includes(state.milestone.id) ? "已取消交付物完成状态" : "交付物已标记完成");
  }
  weeklyStats() {
    const begin = window.moment().startOf("isoWeek"), end = window.moment().endOf("isoWeek");
    let total = 0, completed = 0, flashes = 0;
    for (const [date, day] of Object.entries(this.data.days || {})) {
      if (!window.moment(date, "YYYY-MM-DD", true).isBetween(begin, end, "day", "[]")) continue;
      total += (day.tasks || []).length;
      completed += (day.tasks || []).filter(task => task.done).length;
      flashes += (day.flashes || []).length;
    }
    return { total, completed, flashes, feedback: this.weekFeedbackCount(), rate: total ? Math.round(completed / total * 100) : 0 };
  }
  async openCurrentMilestone() {
    const state = this.getGrowthState(), milestone = state.milestone;
    if (!milestone) return new Notice("当前计划没有交付物。");
    const safeTitle = milestone.title.replace(/[\\/:*?"<>|]/g, "-");
    return this.openOrCreate(`个人成长系统/交付物/第${milestone.week}周-${safeTitle}.md`, `# 第 ${milestone.week} 周 · ${milestone.title}\n\n计划：${state.plan.name}\n状态：进行中\n\n${milestone.template}\n`);
  }
  async openWeeklyReview() {
    const state = this.getGrowthState(), stats = this.weeklyStats(), start = window.moment().startOf("isoWeek").format("YYYY-MM-DD"), end = window.moment().endOf("isoWeek").format("YYYY-MM-DD");
    const content = `# 第 ${state.week} 周复盘\n\n周期：${start} 至 ${end}\n阶段：${state.phase.name}\n\n## 本周数据\n- 行动完成率：${stats.rate}%（${stats.completed}/${stats.total}）\n- 反馈 / 观察：${stats.feedback} 条\n- 闪念捕捉：${stats.flashes} 条\n\n## 本周做对了什么？\n\n## 哪件事如果重来，会换一种方式？\n\n## 我观察到的反馈或事实\n\n## 下周最重要的一件事\n\n## AI 周报提示词\n> 请根据以上复盘，用“回顾目标—评估结果—分析原因—提炼规律”四步法，给我 3 个成功动作、2 个失败动作和 1 条下周最值得验证的规律。\n`;
    return this.openOrCreate(`个人成长系统/复盘/第${state.week}周复盘.md`, content);
  }
  async recordFeedback() {
    return new TextInputModal(this.app, "记录反馈 / 观察", "发生了什么，你观察到什么或得到什么反馈", "", async text => {
      const entry = { date: todayKey(), text }; this.data.growth.externalFeedback.push(entry);
      await this.ensureFolder("个人成长系统/外部反馈");
      const path = `个人成长系统/外部反馈/${todayKey()}.md`, line = `- ${window.moment().format("HH:mm")} ${entry.text}\n`;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.append(file, line); else await this.app.vault.create(path, `# ${todayKey()} 外部反馈\n\n${line}`);
      await this.saveVaultData(); new Notice("外部反馈已记录"); await this.refreshViews();
    }).open();
  }
  async editGrowth() {
    return new GrowthSettingsModal(this.app, this, () => this.refreshViews()).open();
  }
  async addBook() {
    return new BookModal(this.app, async ({ title, author, total }) => {
      const book = { title, author, total, current: 0, status: "在读", addedAt: todayKey() };
      this.data.books.push(book);
      await this.syncBookFile(book);
      await this.saveVaultData(); new Notice("已加入书库"); await this.refreshViews();
    }).open();
  }
  async syncBookFile(book) {
    await this.ensureFolder("个人成长系统/书库");
    const safeName = book.title.replace(/[\\/:*?"<>|]/g, "-");
    const path = `个人成长系统/书库/${safeName}.md`;
    const progress = `${book.current || 0}${book.total ? ` / ${book.total}` : ""}`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return this.app.vault.create(path, `# ${book.title}\n\n- 作者：${book.author || "未填写"}\n- 状态：${book.status}\n- 阅读进度：${progress}\n\n## 摘录与感受\n`);
    let content = await this.app.vault.read(file);
    if (!/^# /m.test(content)) content = `# ${book.title}\n\n${content}`;
    if (/^- 状态：.*$/m.test(content)) content = content.replace(/^- 状态：.*$/m, `- 状态：${book.status}`);
    else content = content.replace(/^(# .*\r?\n?)/, `$1\n- 状态：${book.status}\n`);
    if (/^- 阅读进度：.*$/m.test(content)) content = content.replace(/^- 阅读进度：.*$/m, `- 阅读进度：${progress}`);
    else content = content.replace(/^- 状态：.*$(\r?\n)?/m, match => `${match}- 阅读进度：${progress}\n`);
    await this.app.vault.modify(file, content);
  }
  async updateBook(index) {
    const book = this.data.books[index]; if (!book) return;
    return new TextInputModal(this.app, `《${book.title}》阅读进度`, "当前读到第几页", String(book.current || 0), async value => {
      book.current = Math.max(0, Number(value) || 0);
      book.status = book.total && book.current >= book.total ? "已读" : "在读";
      await this.syncBookFile(book);
      await this.saveVaultData(); await this.refreshViews();
      new Notice(book.status === "已读" ? "恭喜读完这本书。" : "阅读进度已更新");
    }).open();
  }
  async refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof LaunchpadView) await leaf.view.render();
  }
  async runShortcut(item) {
    if (!item || !item.action) return;
    if (item.action === "daily") return this.openOrCreate(`个人成长系统/日记/${todayKey()}.md`, `# ${todayKey()}\n\n## 今天最重要的一件事\n\n## 三问复盘\n1. 今天哪件事做对了？\n2. 如果重来哪件事会换种方式？\n3. 明天最重要的一件事是什么？\n`);
    if (item.action === "task") return this.activateView();
    if (item.action === "feedback") return this.recordFeedback();
    if (item.action === "review") return this.openOrCreate(`个人成长系统/复盘/${todayKey()}.md`, `# ${todayKey()} 复盘\n\n## 今天哪件事做对了？\n\n## 如果重来哪件事会换种方式？\n\n## 明天最重要的一件事是什么？\n`);
    if (item.action === "flashes") return this.openOrCreate(`个人成长系统/闪念/${todayKey()}.md`, `# ${todayKey()} 闪念\n`);
    if (item.action === "library") return this.activateView();
    if (item.action === "search") return this.app.commands.executeCommandById("global-search:open");
  }
};
