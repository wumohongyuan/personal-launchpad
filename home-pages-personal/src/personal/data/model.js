"use strict";

const VIEW_TYPE = "personal-launchpad-view"; // Preserve restored 1.x workspace tabs.
const DEFAULTS = Object.freeze({ autoOpen: true, dailyFolder: "个人成长系统/日记", knowledgeFolder: "个人成长系统/知识库", reviewFolder: "个人成长系统/复盘", legacyFolder: "个人成长系统" });
const KINDS = Object.freeze({ thought: "随手记", diary: "日记", task: "待办", focus: "今日重点", review: "复盘" });
function dateKey(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); }
function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T12:00:00`); return !Number.isNaN(d.valueOf()) && dateKey(d) === value; }
function shiftDate(value, days) { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); }
function weekStart(value = dateKey()) { const d = new Date(`${value}T12:00:00`); return shiftDate(value, -((d.getDay() + 6) % 7)); }
function clockTime() { return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function uid() { const bytes = new Uint8Array(12); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
function safeFolder(value) {
  const path = String(value ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.startsWith("/") || path.split("/").some(p => !p || p === "." || p === ".." || p.startsWith(".") || /[:*?"<>|\x00-\x1f]/.test(p))) throw new Error("请输入库内文件夹路径，不能包含隐藏目录、上级目录或特殊字符。");
  return path;
}
function settingsFrom(raw) {
  if (raw != null && (typeof raw !== "object" || Array.isArray(raw))) throw new Error("插件设置格式无效，请保留原 data.json 后检查内容。");
  const result = { ...DEFAULTS, autoOpen: raw?.autoOpen !== false };
  for (const key of ["dailyFolder", "knowledgeFolder", "reviewFolder", "legacyFolder"]) {
    if (raw?.[key] !== undefined) result[key] = safeFolder(raw[key]);
  }
  return result;
}
function fileTitle(title) {
  const result = String(title).trim().replace(/[\\/:*?"<>|\[\]#^\x00-\x1f]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/, "").slice(0, 100);
  if (!result || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result) || result.startsWith(".")) throw new Error("请换一个可用的笔记标题。");
  return result;
}
function blockFor(entry) {
  if (typeof entry.id !== "string" || !/^[a-z0-9-]+$/.test(entry.id) || !Object.hasOwn(KINDS, entry.kind) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.time) || typeof entry.text !== "string") throw new Error("记录格式无效。");
  if (/<!--\s*\/?pl-entry\b/.test(entry.text)) throw new Error("内容中包含插件记录边界，请移除 pl-entry 注释后重试。");
  const text = entry.text.replace(/\r\n/g, "\n").trim();
  const body = entry.kind === "task" ? `- [${entry.done ? "x" : " "}] ${text.replace(/\n/g, "\n  ")}` : text;
  return `> [!pl-${entry.kind}] ${entry.time} · ${KINDS[entry.kind]}\n>\n${body.split("\n").map(line => line ? `> ${line}` : ">").join("\n")}\n\n^pl-${entry.id}`;
}
function parseEntries(content, path, date) {
  const candidates = [];
  const pattern = /^<!-- pl-entry ([a-z0-9-]+) (thought|diary|task|focus|review) (\d{2}:\d{2}) -->\r?\n([\s\S]*?)^<!-- \/pl-entry \1 -->(?=\r?\n|$)/gm;
  for (const match of content.matchAll(pattern)) {
    const [, id, kind, time, inner] = match;
    let text = inner.replace(/^## [^\r\n]*\r?\n\r?\n/, "").replace(new RegExp(`\\s*\\^pl-${id}\\s*$`), "").replace(/\r\n/g, "\n").trim();
    const done = kind === "task" && /^- \[[xX]\]/.test(text);
    if (kind === "task") text = text.replace(/^- \[[ xX]\] /, "").replace(/\r?\n {2}/g, "\n");
    candidates.push({ id, kind, time, text, done, date, path, block: match[0], start: match.index });
  }
  const cards = /^> \[!pl-(thought|diary|task|focus|review)\] (\d{2}:\d{2}) · [^\r\n]+\r?\n((?:>[^\r\n]*(?:\r?\n|$))+)\r?\n\^pl-([a-z0-9-]+)(?=\r?\n|$)/gm;
  for (const match of content.matchAll(cards)) {
    const [, kind, time, inner, id] = match;
    let text = inner.replace(/^> ?/gm, "").replace(/\r\n/g, "\n").trim();
    const done = kind === "task" && /^- \[[xX]\]/.test(text);
    if (kind === "task") text = text.replace(/^- \[[ xX]\] /, "").replace(/\r?\n {2}/g, "\n");
    candidates.push({ id, kind, time, text, done, date, path, block: match[0], start: match.index });
  }
  // Markdown examples inside fenced code and quoted examples aren't records.
  // An accepted record is opaque, so an unfinished code fence in its body is safe.
  const result = [];
  let scanned = 0, acceptedEnd = 0, fence = null;
  for (const candidate of candidates.sort((a, b) => a.start - b.start)) {
    if (candidate.start < acceptedEnd) continue;
    for (const line of content.slice(scanned, candidate.start).split(/\r?\n/)) {
      const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) continue;
      if (fence) { if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null; }
      else if (match[1][0] !== "`" || !match[2].includes("`")) fence = match[1];
    }
    scanned = candidate.start;
    if (fence) continue;
    const { start, ...entry } = candidate;
    // Keep source location available for safe edits without treating it as note data.
    Object.defineProperty(entry, "offset", { value: start, enumerable: false });
    result.push(entry);
    acceptedEnd = start + entry.block.length;
    scanned = acceptedEnd;
  }
  return result;
}
function formatDaily(content, date) {
  if (!validDate(date)) throw new Error("日期无效。");
  const entries = parseEntries(content, "", date);
  let result = content;
  for (const entry of [...entries].reverse()) {
    if (entry.block.startsWith("<!-- pl-entry ")) result = result.slice(0, entry.offset) + blockFor(entry) + result.slice(entry.offset + entry.block.length);
  }
  // Only remove the duplicate date from notes consisting entirely of our records.
  const title = new RegExp(`^# ${date}(?:\\r?\\n|$)`);
  let other = content;
  for (const entry of [...entries].reverse()) other = other.slice(0, entry.offset) + other.slice(entry.offset + entry.block.length);
  other = other.replace(title, "");
  if (entries.length && !other.trim()) result = result.replace(title, "").replace(/^\s*\n/, "");
  return result;
}
function excerpt(text, limit = 130) { return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^[#>\s-]+/gm, "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$1").trim().slice(0, limit); }
function legacyEntries(content, path, date) {
  const sections = content.split(/(?=^## \d{2}:\d{2} · )/m).slice(1);
  return sections.map((section, i) => {
    const match = /^## (\d{2}:\d{2}) · ([^\r\n]+)\r?\n+([\s\S]*)$/.exec(section);
    if (!match) return null;
    return { id: `legacy-${i}`, kind: "thought", time: match[1], text: match[3].replace(/\n- 类型：[^\n]*\n- 状态：[^\n]*\s*$/, "").trim(), path, date, legacy: true };
  }).filter(Boolean);
}
module.exports = { VIEW_TYPE, DEFAULTS, KINDS, dateKey, validDate, shiftDate, weekStart, clockTime, uid, safeFolder, settingsFrom, fileTitle, blockFor, parseEntries, formatDaily, excerpt, legacyEntries };
