const { Plugin, ItemView, Modal, Setting, Notice, TFile } = require("obsidian");

const VIEW_TYPE = "personal-launchpad-view";
const DATA_FOLDER = "个人成长系统/配置";
const DATA_PATH = `${DATA_FOLDER}/launchpad.json`;

const DAILY_MESSAGES = [
  { text: "行而不辍，未来可期。", source: "《荀子》" },
  { text: "纸上得来终觉浅，绝知此事要躬行。", source: "陆游《冬夜读书示子聿》" },
  { text: "不积跬步，无以至千里。", source: "《荀子·劝学》" },
  { text: "长风破浪会有时，直挂云帆济沧海。", source: "李白《行路难》" },
  { text: "真正的进步，来自你愿意面对现实的那一刻。", source: "成长提醒" },
  { text: "今天先完成一件小事，让行动替你说话。", source: "成长提醒" }
];

const GROWTH_PHASES = [
  { id: "foundation", name: "地基期", from: 1, to: 8, goal: "建立时间、能量和信息筛选习惯", tasks: ["记录时间或开销", "完成 30 分钟深度阅读", "照顾身体与能量", "完成一次外部接触"] },
  { id: "engine", name: "引擎期", from: 9, to: 16, goal: "在真实事件中训练复盘和意志力", tasks: ["完成睡前三问复盘", "做一件不想做但应该做的事", "记录一个真实事件", "完成复利领域投入"] },
  { id: "leverage", name: "杠杆期", from: 17, to: 24, goal: "选择主线，持续输出并获得可量化反馈", tasks: ["投入当前主线至少 1 小时", "完成一次对外输出或接触", "记录一个可复用的资产", "确认今天的关键指标"] }
];

const MILESTONES = [
  { id: "week-1", week: 1, title: "流水账与第一次外部接触", template: "## 本周流水账\n\n## 第一次外部接触\n- 对象：\n- 我做了什么：\n- 获得的反馈：\n- 下一步：" },
  { id: "week-2", week: 2, title: "第一份 AI 周核算报表", template: "## 时间、金钱、精力核算\n\n## 三个观察\n1. \n2. \n3. \n\n## 下周调整" },
  { id: "week-4", week: 4, title: "精力曲线原始数据与 3 次外部接触", template: "## 精力曲线\n\n## 外部反馈记录\n\n## 规律与调整" },
  { id: "week-8", week: 8, title: "地基三件套运行月报", template: "## 时间 / 能量 / 信息筛选\n\n## 做得最好的事\n\n## 最大阻力\n\n## 下一阶段建议" },
  { id: "week-10", week: 10, title: "第一份 AI 周复盘报告", template: "## 成功动作\n\n## 失败动作\n\n## 一条核心规律\n\n## 下周实验" },
  { id: "week-12", week: 12, title: "第一次准交易记录", template: "## 对象与场景\n\n## 提供的价值\n\n## 对方反馈 / 交换\n\n## 下次改进" },
  { id: "week-16", week: 16, title: "三棱镜分析与引擎双月报", template: "## 心理学层\n\n## 控制与博弈层\n\n## 领导力层\n\n## 我的行动" },
  { id: "week-17", week: 17, title: "选定主线与第一个月目标", template: "## 我选择的主线\n\n## 为什么是它\n\n## 第一个月目标\n\n## 不做什么" },
  { id: "week-18", week: 18, title: "徙木立信执行第一天", template: "## 公开承诺\n\n## 第一天动作\n\n## 链接 / 截图说明\n\n## 明日行动" },
  { id: "week-24", week: 24, title: "180 天系统首考报告", template: "## 外部反馈次数\n\n## 能力变化\n\n## 继续 / 切换的决定\n\n## 下一阶段" }
];

function todayKey() { return window.moment().format("YYYY-MM-DD"); }
function escapeHtml(text) {
  return String(text || "").replace(/[&<>'\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
function defaultTasks(stage) { return (GROWTH_PHASES.find(phase => phase.name === stage) || GROWTH_PHASES[0]).tasks; }
function freshData() {
  return {
    version: 1,
    banner: { mode: "daily", customText: "今天也要向前一点点。", customSource: "给未来的自己", image: "" },
    growth: { startDate: todayKey(), stage: "地基期", week: 1, goal: "建立时间、能量和信息筛选习惯", externalFeedback: [], completedMilestones: [] },
    shortcuts: [
      { label: "今日日记", icon: "✍", action: "daily" },
      { label: "新建待办", icon: "＋", action: "task" },
      { label: "外部反馈", icon: "◎", action: "feedback" },
      { label: "今日复盘", icon: "◐", action: "review" },
      { label: "全部闪念", icon: "✦", action: "flashes" },
      { label: "书库", icon: "▤", action: "library" },
      { label: "搜索笔记", icon: "⌕", action: "search" }
    ],
    books: [],
    days: {}
  };
}

class BannerModal extends Modal {
  constructor(app, plugin, onSave) { super(app); this.plugin = plugin; this.onSave = onSave; }
  onOpen() {
    const { contentEl } = this;
    const banner = this.plugin.data.banner;
    contentEl.createEl("h2", { text: "编辑主页横幅" });
    let text = banner.customText, source = banner.customSource, image = banner.image;
    new Setting(contentEl).setName("自定义话术").addTextArea(t => t.setValue(text).onChange(v => text = v));
    new Setting(contentEl).setName("署名 / 出处").addText(t => t.setValue(source).onChange(v => source = v));
    new Setting(contentEl).setName("背景图片").setDesc("填写 Vault 内图片路径或 https 图片地址；留空使用渐变背景。").addText(t => t.setValue(image).onChange(v => image = v));
    new Setting(contentEl).addButton(b => b.setButtonText("保存").setCta().onClick(async () => {
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
    const { contentEl } = this, growth = this.plugin.data.growth;
    contentEl.createEl("h2", { text: "成长系统设置" });
    let startDate = growth.startDate || todayKey();
    new Setting(contentEl)
      .setName("计划开始日期")
      .setDesc("插件根据该日期自动计算当前周数和阶段。")
      .addText(input => input.setValue(startDate).setPlaceholder("YYYY-MM-DD").onChange(value => startDate = value.trim()));
    new Setting(contentEl)
      .setName("阶段规则")
      .setDesc("第 1–8 周为地基期，第 9–16 周为引擎期，第 17–24 周为杠杆期。")
      .addButton(button => button.setButtonText("保存设置").setCta().onClick(async () => {
        if (!window.moment(startDate, "YYYY-MM-DD", true).isValid()) return new Notice("日期格式应为 YYYY-MM-DD");
        growth.startDate = startDate; await this.plugin.saveVaultData(); await this.plugin.refreshViews(); this.onSave(); this.close();
      }));
  }
}

class TextInputModal extends Modal {
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

class LaunchpadView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "个人启动台"; }
  getIcon() { return "layout-dashboard"; }
  async onOpen() { await this.render(); }
  async onClose() { this.contentEl.empty(); }
  day() {
    const key = todayKey();
    if (!this.plugin.data.days[key]) this.plugin.data.days[key] = { tasks: defaultTasks(this.plugin.getGrowthState().phase.name).map(text => ({ text, done: false })), flashes: [] };
    return this.plugin.data.days[key];
  }
  message() {
    const seed = Number(todayKey().replaceAll("-", ""));
    return DAILY_MESSAGES[seed % DAILY_MESSAGES.length];
  }
  bannerBackground(image) {
    if (!image) return "";
    if (/^https?:\/\//.test(image)) return `background-image: linear-gradient(90deg, rgba(20,30,35,.72), rgba(22,45,44,.30)), url('${image.replace(/'/g, "%27")}')`;
    const file = this.app.vault.getAbstractFileByPath(image);
    if (file instanceof TFile) return `background-image: linear-gradient(90deg, rgba(20,30,35,.72), rgba(22,45,44,.30)), url('${this.app.vault.getResourcePath(file)}')`;
    return "";
  }
  async render() {
    const root = this.contentEl;
    root.empty(); root.addClass("personal-launchpad");
    const data = this.plugin.data, day = this.day(), books = data.books || [], growthState = this.plugin.getGrowthState(), weekly = this.plugin.weeklyStats();
    const reading = books.filter(book => book.status === "在读");
    const custom = data.banner.mode === "custom";
    const message = custom ? { text: data.banner.customText, source: data.banner.customSource } : this.message();
    const background = this.bannerBackground(data.banner.image);
    const done = day.tasks.filter(t => t.done).length;
    const dateLabel = window.moment().format("YYYY 年 M 月 D 日 · dddd");
    root.innerHTML = `
      <section class="lp-banner" style="${background}">
        <div class="lp-banner-meta"><span>${dateLabel}</span><span>第 ${growthState.week} 周 · ${escapeHtml(growthState.phase.name)}</span></div>
        <blockquote>${escapeHtml(message.text)}</blockquote>
        <div class="lp-source">— ${escapeHtml(message.source || "每日推送")}</div>
        <div class="lp-plan-progress" aria-label="180 天计划进度"><i style="width:${growthState.planPercent}%"></i><span>180 天计划 · 第 ${growthState.day} 天 · ${growthState.planPercent}%</span></div>
        <div class="lp-banner-actions"><button data-action="daily-mode" class="${!custom ? "is-active" : ""}">每日推送</button><button data-action="custom-mode" class="${custom ? "is-active" : ""}">自定义</button><button data-action="edit-banner" aria-label="编辑横幅">⚙</button></div>
      </section>
      <main class="lp-grid">
        <section class="lp-card lp-capture-card">
          <div class="lp-heading"><span>✦ 闪念</span><small>先捕捉，后整理</small></div>
          <textarea data-role="flash" placeholder="现在想到什么？"></textarea>
          <div class="lp-capture-footer"><select data-role="flash-type"><option>闪念</option><option>待办</option><option>复盘</option><option>外部反馈</option><option>项目</option><option>AI问题</option></select><button data-action="save-flash" class="lp-primary">保存闪念</button></div>
        </section>
        <section class="lp-card lp-focus-card">
          <div class="lp-heading"><span>◎ 今天最重要的一件事</span><button data-action="edit-focus" class="lp-icon-button">编辑</button></div>
          <div class="lp-focus-text">${escapeHtml(day.focus || "还没有写下。先给今天一个清晰的方向。")}</div>
        </section>
        <section class="lp-card lp-tasks-card">
          <div class="lp-heading"><span>✓ 今日行动</span><small>${done} / ${day.tasks.length}</small></div>
          <div class="lp-progress"><i style="width:${day.tasks.length ? Math.round(done / day.tasks.length * 100) : 0}%"></i></div>
          <div class="lp-task-list">${day.tasks.map((task, index) => `<div class="lp-task ${task.done ? "is-done" : ""}"><label><input type="checkbox" data-task="${index}" ${task.done ? "checked" : ""}><span>${escapeHtml(task.text)}</span></label><span class="lp-task-actions"><button data-edit-task="${index}" aria-label="编辑任务">✎</button><button data-delete-task="${index}" aria-label="删除任务">×</button></span></div>`).join("")}</div>
          <button data-action="add-task" class="lp-text-button">＋ 添加临时任务</button>
        </section>
        <section class="lp-card lp-growth-card">
          <div class="lp-heading"><span>🧭 当前成长</span><button data-action="edit-growth" class="lp-icon-button">编辑</button></div>
          <strong>${escapeHtml(growthState.phase.name)} · 第 ${growthState.week} 周</strong>
          <p>${escapeHtml(growthState.phase.goal)}</p>
          <div class="lp-phase-progress"><i style="width:${growthState.phasePercent}%"></i></div>
          <small>本阶段第 ${growthState.phaseWeek} / ${growthState.phase.to - growthState.phase.from + 1} 周</small>
          <div class="lp-feedback"><span>本周外部反馈</span><b>${this.plugin.weekFeedbackCount()} / 1</b><button data-action="feedback">记录</button></div>
        </section>
        <section class="lp-card lp-milestone-card">
          <div class="lp-heading"><span>◈ 下一交付物</span><small>第 ${growthState.milestone.week} 周</small></div>
          <strong>${escapeHtml(growthState.milestone.title)}</strong>
          <p class="lp-alert ${growthState.alert.level}">${escapeHtml(growthState.alert.message)}</p>
          <div class="lp-inline-actions"><button data-action="milestone-template" class="lp-text-button">打开模板</button><button data-action="complete-milestone" class="lp-text-button">${growthState.milestoneDone ? "✓ 已完成" : "标记为完成"}</button></div>
        </section>
        <section class="lp-card lp-week-card">
          <div class="lp-heading"><span>◒ 本周复盘</span><small>${weekly.completed} / ${weekly.total} 项完成</small></div>
          <div class="lp-week-kpis"><span><b>${weekly.rate}%</b><small>行动完成率</small></span><span><b>${weekly.feedback}</b><small>外部反馈</small></span><span><b>${weekly.flashes}</b><small>闪念捕捉</small></span></div>
          <button data-action="weekly-review" class="lp-primary">打开本周复盘</button>
        </section>
        <section class="lp-card lp-shortcuts-card">
          <div class="lp-heading"><span>⚡ 快捷入口</span></div>
          <div class="lp-shortcuts">${data.shortcuts.map((item, index) => `<button data-shortcut="${index}"><i>${escapeHtml(item.icon)}</i><span>${escapeHtml(item.label)}</span></button>`).join("")}</div>
        </section>
        <section class="lp-card lp-library-card">
          <div class="lp-heading"><span>▤ 在读书库</span><button data-action="add-book" class="lp-icon-button">＋ 添加书籍</button></div>
          <div class="lp-library-list">${reading.length ? reading.slice(0, 3).map(book => {
            const actualIndex = books.indexOf(book), percent = book.total ? Math.min(100, Math.round(book.current / book.total * 100)) : 0;
            return `<button class="lp-book" data-book="${actualIndex}"><span class="lp-book-cover">${escapeHtml((book.title || "书").slice(0, 1))}</span><span class="lp-book-info"><b>${escapeHtml(book.title)}</b><small>${escapeHtml(book.author || "未填写作者")} · ${book.total ? `${book.current || 0}/${book.total} 页` : "记录阅读感受"}</small><i><em style="width:${percent}%"></em></i></span></button>`;
          }).join("") : "<div class=\"lp-empty-library\"><span>正在读的书会出现在这里</span><button data-action=\"add-book\">添加第一本书</button></div>"}</div>
        </section>
        <section class="lp-card lp-recent-card">
          <div class="lp-heading"><span>◷ 今日闪念</span><button data-action="open-flashes" class="lp-icon-button">查看全部</button></div>
          <div class="lp-recent-list">${day.flashes.length ? day.flashes.slice(-4).reverse().map((f, reverseIndex) => { const index = day.flashes.length - 1 - reverseIndex; return `<div><b>${escapeHtml(f.type)}</b><span>${escapeHtml(f.text)}</span>${f.type === "待办" ? `<button data-flash-to-task="${index}">加入行动</button>` : ""}</div>`; }).join("") : "<p>还没有记录。第一条闪念从这里开始。</p>"}</div>
        </section>
      </main>`;
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
  }
  async handleAction(action) {
    if (action === "daily-mode" || action === "custom-mode") { this.plugin.data.banner.mode = action === "daily-mode" ? "daily" : "custom"; await this.plugin.saveVaultData(); return this.render(); }
    if (action === "edit-banner") return new BannerModal(this.app, this.plugin, () => this.render()).open();
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
    this.data.days = this.data.days || {};
    this.data.growth = { ...freshData().growth, ...(this.data.growth || {}) };
    this.data.banner = { ...freshData().banner, ...(this.data.banner || {}) };
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
    const key = todayKey(); const day = this.data.days[key];
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
      if (!this.data.days[key]) this.data.days[key] = { tasks: defaultTasks(this.getGrowthState().phase.name).map(value => ({ text: value, done: false })), flashes: [] };
      await this.saveFlash(text, "闪念"); new Notice("闪念已保存"); await this.refreshViews();
    }).open();
  }
  weekFeedbackCount() {
    const start = window.moment().startOf("isoWeek"); return (this.data.growth.externalFeedback || []).filter(item => window.moment(item.date).isSameOrAfter(start, "day")).length;
  }
  getGrowthState() {
    const growth = this.data.growth;
    const start = window.moment(growth.startDate, "YYYY-MM-DD", true);
    const days = start.isValid() ? Math.max(0, window.moment().startOf("day").diff(start.startOf("day"), "days")) : 0;
    const week = Math.min(24, Math.floor(days / 7) + 1);
    const day = Math.min(180, days + 1);
    const phase = GROWTH_PHASES.find(item => week >= item.from && week <= item.to) || GROWTH_PHASES[GROWTH_PHASES.length - 1];
    const phaseWeek = week - phase.from + 1;
    const milestone = MILESTONES.find(item => !(growth.completedMilestones || []).includes(item.id)) || MILESTONES[MILESTONES.length - 1];
    const thisWeek = this.weekFeedbackCount();
    const previousWeeks = [1, 2, 3, 4].map(offset => (growth.externalFeedback || []).filter(item => window.moment(item.date).isSame(window.moment().subtract(offset, "weeks"), "isoWeek")).length);
    let alert = { level: "ok", message: "外部反馈正常推进中。" };
    if (previousWeeks.slice(0, 4).every(count => count === 0) && thisWeek === 0) alert = { level: "danger", message: "红灯：连续四周没有外部反馈，先完成一次真实接触。" };
    else if (previousWeeks.slice(0, 2).every(count => count === 0) && thisWeek === 0) alert = { level: "warn", message: "黄灯：连续两周没有外部反馈，本周优先完成一次接触。" };
    return { week, day, planPercent: Math.round(day / 180 * 100), phase, phaseWeek, phasePercent: Math.round(phaseWeek / (phase.to - phase.from + 1) * 100), milestone, milestoneDone: (growth.completedMilestones || []).includes(milestone.id), alert };
  }
  async toggleCurrentMilestone() {
    const state = this.getGrowthState(), completed = this.data.growth.completedMilestones || [];
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
    const milestone = this.getGrowthState().milestone;
    const safeTitle = milestone.title.replace(/[\\/:*?\"<>|]/g, "-");
    return this.openOrCreate(`个人成长系统/交付物/第${milestone.week}周-${safeTitle}.md`, `# 第 ${milestone.week} 周 · ${milestone.title}\n\n状态：进行中\n\n${milestone.template}\n`);
  }
  async openWeeklyReview() {
    const state = this.getGrowthState(), stats = this.weeklyStats(), start = window.moment().startOf("isoWeek").format("YYYY-MM-DD"), end = window.moment().endOf("isoWeek").format("YYYY-MM-DD");
    const content = `# 第 ${state.week} 周复盘\n\n周期：${start} 至 ${end}\n阶段：${state.phase.name}\n\n## 本周数据\n- 行动完成率：${stats.rate}%（${stats.completed}/${stats.total}）\n- 外部反馈：${stats.feedback} 次\n- 闪念捕捉：${stats.flashes} 条\n\n## 本周做对了什么？\n\n## 哪件事如果重来，会换一种方式？\n\n## 我从现实中收到的反馈\n\n## 下周最重要的一件事\n\n## AI 周报提示词\n> 请根据以上复盘，用“回顾目标—评估结果—分析原因—提炼规律”四步法，给我 3 个成功动作、2 个失败动作和 1 条下周最值得验证的规律。\n`;
    return this.openOrCreate(`个人成长系统/复盘/第${state.week}周复盘.md`, content);
  }
  async recordFeedback() {
    return new TextInputModal(this.app, "记录外部反馈", "对象、发生了什么、你得到什么反馈", "", async text => {
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
      await this.ensureFolder("个人成长系统/书库");
      const safeName = book.title.replace(/[\\/:*?\"<>|]/g, "-");
      await this.openOrCreate(`个人成长系统/书库/${safeName}.md`, `# ${book.title}\n\n- 作者：${book.author}\n- 状态：在读\n- 阅读进度：0${book.total ? ` / ${book.total}` : ""}\n\n## 摘录与感受\n`);
      await this.saveVaultData(); new Notice("已加入书库"); await this.refreshViews();
    }).open();
  }
  async updateBook(index) {
    const book = this.data.books[index]; if (!book) return;
    return new TextInputModal(this.app, `《${book.title}》阅读进度`, "当前读到第几页", String(book.current || 0), async value => {
      book.current = Math.max(0, Number(value) || 0);
      if (book.total && book.current >= book.total) book.status = "已读";
      await this.saveVaultData(); await this.refreshViews();
      new Notice(book.status === "已读" ? "恭喜读完这本书。" : "阅读进度已更新");
    }).open();
  }
  async refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof LaunchpadView) await leaf.view.render();
  }
  async runShortcut(item) {
    if (item.action === "daily") return this.openOrCreate(`个人成长系统/日记/${todayKey()}.md`, `# ${todayKey()}\n\n## 今天最重要的一件事\n\n## 三问复盘\n1. 今天哪件事做对了？\n2. 如果重来哪件事会换种方式？\n3. 明天最重要的一件事是什么？\n`);
    if (item.action === "task") return this.activateView();
    if (item.action === "feedback") return this.recordFeedback();
    if (item.action === "review") return this.openOrCreate(`个人成长系统/复盘/${todayKey()}.md`, `# ${todayKey()} 复盘\n\n## 今天哪件事做对了？\n\n## 如果重来哪件事会换种方式？\n\n## 明天最重要的一件事是什么？\n`);
    if (item.action === "flashes") return this.openOrCreate(`个人成长系统/闪念/${todayKey()}.md`, `# ${todayKey()} 闪念\n`);
    if (item.action === "library") return this.activateView();
    if (item.action === "search") return this.app.commands.executeCommandById("global-search:open");
  }
};
