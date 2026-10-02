"use strict";
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
  const requestedDays = Math.min(1095, Math.max(7, Number(growth.totalDays) || 28));
  const saved = growth.customPlan || {};
  const savedPhases = Array.isArray(saved.phases) ? saved.phases : [];
  let cursor = 1;
  const phases = savedPhases.map((phase, index) => {
    const weeks = Math.min(52, Math.max(1, Number(phase.weeks) || 1));
    const from = cursor, to = cursor + weeks - 1;
    cursor = to + 1;
    return { id: `custom-phase-${index + 1}`, name: String(phase.name || `阶段 ${index + 1}`).trim(), from, to, goal: String(phase.goal || growth.goal || "持续推进重要方向").trim(), healthFocus: String(phase.healthFocus || "按自己的节奏安排活动、睡眠和恢复。").trim(), tasks: Array.isArray(phase.tasks) && phase.tasks.length ? phase.tasks.map(task => String(task).trim()).filter(Boolean).slice(0, 6) : ["推进今天最重要的事", "完成一个最小动作", "记录一条观察或闪念", "安排恢复或整理"] };
  });
  if (!phases.length) phases.push({ id: "custom-phase-1", name: "推进期", from: 1, to: Math.ceil(requestedDays / 7), goal: String(growth.goal || "围绕一个重要方向，持续做小而明确的行动").trim(), healthFocus: "按自己的节奏安排活动、睡眠和恢复。", tasks: ["推进今天最重要的事", "完成一个最小动作", "记录一条观察或闪念", "安排恢复或整理"] });
  const days = Math.max(requestedDays, phases[phases.length - 1].to * 7);
  const totalWeeks = Math.ceil(days / 7);
  const savedMilestones = Array.isArray(saved.milestones) ? saved.milestones : [];
  const milestones = savedMilestones.map((item, index) => ({ id: `custom-week-${Math.min(totalWeeks, Math.max(1, Number(item.week) || 1))}-${index + 1}`, week: Math.min(totalWeeks, Math.max(1, Number(item.week) || 1)), title: String(item.title || `第 ${index + 1} 个交付物`).trim(), template: String(item.template || "## 本周成果\n\n## 我学到了什么\n\n## 下一步").trim() })).filter(item => item.title);
  if (!milestones.length) {
    const middle = Math.min(totalWeeks, Math.max(2, Math.ceil(totalWeeks / 2)));
    milestones.push({ id: "custom-week-1", week: 1, title: "计划起点", template: "## 我想完成什么\n\n## 为什么重要\n\n## 本周最小行动\n\n## 我会如何开始" }, { id: `custom-week-${middle}`, week: middle, title: "中途回顾", template: "## 已经推进了什么\n\n## 遇到的阻力\n\n## 接下来要调整什么" }, { id: `custom-week-${totalWeeks}`, week: totalWeeks, title: "阶段总结", template: "## 我完成了什么\n\n## 最有效的做法\n\n## 下一步" });
  }
  return { id: "custom", name: String(growth.planName || "我的行动计划").trim() || "我的行动计划", days, goal: String(growth.goal || "围绕一个重要方向，持续做小而明确的行动").trim(), phases, milestones };
}function getPlanForGrowth(growth) {
  if (growth.planId === "custom") return buildCustomPlan(growth);
  const preset = PLAN_PRESETS[growth.planId] || PLAN_PRESETS.balanced;
  return { ...preset, name: String(growth.planName || preset.name).trim() || preset.name, goal: String(growth.goal || preset.goal).trim() || preset.goal };
}

module.exports = { PLAN_PRESETS, getPlanForGrowth };
