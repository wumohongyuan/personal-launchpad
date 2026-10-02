"use strict";
const { KINDS, dateKey, validDate, clockTime, uid, fileTitle, blockFor, parseEntries, excerpt, legacyEntries } = require("./model");

class VaultStore {
  constructor(vault, settings) { this.vault = vault; this.settings = settings; this.queues = new Map(); }
  enqueue(path, operation) {
    const previous = this.queues.get(path) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(path, next);
    next.finally(() => { if (this.queues.get(path) === next) this.queues.delete(path); }).catch(() => {});
    return next;
  }
  async ensureFolder(path) {
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      const existing = this.vault.getAbstractFileByPath(current);
      if (existing && !Array.isArray(existing.children)) throw new Error(`“${current}”是一个文件，请更换保存目录。`);
      if (!existing) {
        try { await this.vault.createFolder(current); }
        catch (error) { if (!Array.isArray(this.vault.getAbstractFileByPath(current)?.children)) throw error; }
      }
    }
  }
  dailyPath(date) { if (!validDate(date)) throw new Error("日期无效。"); return `${this.settings.dailyFolder}/${date}.md`; }
  async read(path) { const file = this.vault.getAbstractFileByPath(path); return file && !Array.isArray(file.children) ? this.vault.read(file) : ""; }
  async appendOnce(path, block, marker, heading) {
    const incoming = parseEntries(block, path, "");
    const alreadySaved = content => incoming.length === 1
      ? parseEntries(content, path, "").some(entry => entry.id === incoming[0].id)
      : content.includes(marker);
    return this.enqueue(path, async () => {
      await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
      let file = this.vault.getAbstractFileByPath(path);
      if (!file) {
        try { return await this.vault.create(path, `${heading ? heading + "\n\n" : ""}${block}\n`); }
        catch (error) { file = this.vault.getAbstractFileByPath(path); if (!file) throw error; }
      }
      // Obsidian's process reads the latest disk content before applying a change.
      await this.vault.process(file, content => alreadySaved(content) ? content : `${content.trimEnd()}\n\n${block}\n`);
      return file;
    });
  }
  async capture(text, kind = "thought", date = dateKey(), id = uid()) {
    if (!String(text).trim()) throw new Error("先写下一点内容吧。");
    if (!Object.hasOwn(KINDS, kind)) throw new Error("记录类型无效。");
    const entry = { id, text: String(text).trim(), kind, date, time: clockTime(), done: false };
    const path = this.dailyPath(date);
    await this.appendOnce(path, blockFor(entry), `^pl-${id}`, "");
    return { ...entry, path };
  }
  async day(date) {
    const path = this.dailyPath(date);
    const legacyPath = `${this.settings.legacyFolder}/闪念/${date}.md`;
    const [content, oldContent] = await Promise.all([this.read(path), this.read(legacyPath)]);
    const entries = parseEntries(content, path, date);
    let remaining = content;
    for (const entry of [...entries].reverse()) remaining = remaining.slice(0, entry.offset) + remaining.slice(entry.offset + entry.block.length);
    remaining = remaining.replace(new RegExp(`^# ${date}(?:\\r?\\n|$)`), "").trim();
    return { entries: [...entries.reverse(), ...legacyEntries(oldContent, legacyPath, date).reverse()].sort((a, b) => b.time.localeCompare(a.time)), path, exists: !!content, original: remaining };
  }
  async updateEntry(entry, changes) {
    if (entry.legacy) throw new Error("旧版记录请在原文中修改。");
    return this.enqueue(entry.path, async () => {
      const file = this.vault.getAbstractFileByPath(entry.path);
      if (!file) throw new Error("原文件已移动或删除，请刷新后重试。");
      await this.vault.process(file, content => {
        const fresh = parseEntries(content, entry.path, entry.date).filter(item => item.id === entry.id);
        if (fresh.length !== 1 || fresh[0].block !== entry.block) throw new Error("这条记录已在别处修改。输入已保留，请刷新后确认最新内容。");
        return content.slice(0, fresh[0].offset) + blockFor({ ...entry, ...changes }) + content.slice(fresh[0].offset + fresh[0].block.length);
      });
    });
  }
  async notes(query = "", folder = this.settings.knowledgeFolder, limit = 60) {
    const files = this.vault.getMarkdownFiles().filter(file => !folder || file.path.startsWith(`${folder}/`)).sort((a, b) => b.stat.mtime - a.stat.mtime);
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const result = [];
    // Only load full text for search; for the default view stop once the visible page is full.
    for (const file of files) {
      const content = await this.vault.cachedRead(file);
      const haystack = `${file.basename}\n${content}`.toLocaleLowerCase();
      if (words.every(word => haystack.includes(word))) result.push({ path: file.path, title: file.basename, preview: excerpt(content), mtime: file.stat.mtime });
      if (result.length >= limit) break;
    }
    return { items: result, totalFiles: files.length, limited: result.length >= limit };
  }
  async createKnowledge({ title, body, topic, source, id = uid() }) {
    const name = fileTitle(title);
    const safeTopic = String(topic || "未分类").trim().replace(/[\r\n]/g, " ");
    const path = `${this.settings.knowledgeFolder}/${name}.md`;
    if (!body.trim()) throw new Error("笔记内容不能为空。");
    return this.enqueue(path, async () => {
      await this.ensureFolder(this.settings.knowledgeFolder);
      if (this.vault.getAbstractFileByPath(path)) {
        if ((await this.read(path)).includes(`<!-- pl-knowledge ${id} -->`)) return path;
        throw new Error("已有同名笔记，请修改标题。原笔记不会被覆盖。");
      }
      const sourceLink = source ? `\n\n来源：[[${source.path}${source.legacy ? "" : `#^pl-${source.id}`}]]` : "";
      const content = `---\ntype: knowledge\ntopic: ${JSON.stringify(safeTopic)}\ncreated: ${dateKey()}\n---\n\n# ${name}\n\n${body.trim()}${sourceLink}\n\n<!-- pl-knowledge ${id} -->\n`;
      await this.vault.create(path, content);
      return path;
    });
  }
  async saveReview(date, answers, id = uid()) {
    const headings = ["这周值得记住的事", "我对自己多了解了一点什么", "下周想试的一个小改变"];
    const body = headings.map((heading, i) => `### ${heading}\n\n${answers[i]?.trim() || "（暂时留白）"}`).join("\n\n");
    const entry = { id, kind: "review", time: clockTime(), text: body };
    const path = `${this.settings.reviewFolder}/${date}-周回顾.md`;
    await this.appendOnce(path, blockFor(entry), `^pl-${id}`, `# ${date} 起的这一周`);
    return path;
  }
  async recoverLegacy() {
    const sourcePath = `${this.settings.legacyFolder}/配置/launchpad.json`;
    const raw = await this.read(sourcePath);
    if (!raw) throw new Error("没有找到旧版配置文件；已有 Markdown 笔记可直接从旧版资料打开。");
    const data = JSON.parse(raw); // Fail closed: never replace malformed legacy data with defaults.
    const sections = [`# 旧版启动台资料\n\n来源：[[${sourcePath}]]\n\n原始文件保留不变。以下为生成时的只读整理。`];
    for (const [key, label] of [["growth", "成长计划"], ["books", "书库"], ["health", "健康记录"], ["dashboard", "主页设置"], ["shortcuts", "快捷入口"], ["banner", "横幅"]]) {
      if (data[key]) sections.push(`## ${label}\n\n\`\`\`json\n${JSON.stringify(data[key], null, 2)}\n\`\`\``);
    }
    for (const [date, day] of Object.entries(data.days || {}).sort((a,b) => b[0].localeCompare(a[0]))) {
      sections.push(`## ${date}\n\n${day.focus ? `重点：${day.focus}\n\n` : ""}${(day.tasks || []).map(t => `- [${t.done ? "x" : " "}] ${t.text}`).join("\n")}\n\n${(day.flashes || []).map(f => `### ${f.time || ""} · ${f.type || "闪念"}\n\n${f.text || ""}`).join("\n\n")}`);
    }
    const path = `${this.settings.legacyFolder}/旧版资料/整理-${dateKey()}-${uid().slice(0,8)}.md`;
    await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
    await this.vault.create(path, sections.join("\n\n"));
    return path;
  }
}
module.exports = { VaultStore };
