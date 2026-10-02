"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { blockFor, parseEntries, formatDaily, DEFAULTS } = require("../home-pages-personal/src/personal/data/model");
const { VaultStore } = require("../home-pages-personal/src/personal/data/store");
const date = "2026-10-02", path = `${DEFAULTS.dailyFolder}/${date}.md`;
function oldBlock({ id = "original", kind = "thought", time = "17:53", text = "保留原来的想法。", done = false } = {}) {
  const label = { thought: "随手记", diary: "日记", task: "待办" }[kind];
  const body = kind === "task" ? `- [${done ? "x" : " "}] ${text.replace(/\n/g, "\n  ")}` : text;
  return `<!-- pl-entry ${id} ${kind} ${time} -->\n## ${time} · ${label}\n\n${body}\n\n^pl-${id}\n<!-- /pl-entry ${id} -->`;
}
function values(content) { return parseEntries(content, path, date).map(({ block, ...entry }) => entry); }
test("native cards retain Markdown, paragraphs, task state and stable block IDs", () => {
  for (const kind of ["thought", "diary", "task", "focus", "review"]) {
    const entry = { id: `kind-${kind}`, kind, time: "17:53", done: kind === "task", text: "正文 $& $$\n\n- 项目\n  子项\n> 引用\n\n```js\nconst x = 1;\n```" };
    const block = blockFor(entry), parsed = parseEntries(block, path, date);
    assert.equal(parsed.length, 1); assert.equal(parsed[0].text, entry.text); assert.equal(parsed[0].done, entry.done);
    assert.equal(parsed[0].id, entry.id); assert.equal(parsed[0].kind, kind);
    assert.equal(parsed[0].block, block); assert.ok(block.endsWith(`\n\n^pl-${entry.id}`)); assert.doesNotMatch(block, /<!--/);
  }
});
test("old entries migrate once without duplicate date title or changing any record", () => {
  const before = `# ${date}\n\n${oldBlock()}\n\n${oldBlock({ id: "task", kind: "task", done: true, text: "已完成\n更多说明" })}\n`;
  const after = formatDaily(before, date);
  assert.deepEqual(values(after), values(before)); assert.doesNotMatch(after, /^# /); assert.doesNotMatch(after, /<!-- pl-entry/);
  assert.equal(formatDaily(after, date), after);
});
test("migration preserves handwritten frontmatter, headings, prose and surrounding spacing", () => {
  const prefix = `---\ntags: [日记]\n---\n\n# ${date}\n\n自己写下的文字 $&。\n\n`;
  const suffix = "\n\n## 夜晚\n\n  保留原有缩进。\n\n";
  const before = prefix + oldBlock() + suffix;
  const after = formatDaily(before, date);
  assert.ok(after.startsWith(prefix)); assert.ok(after.endsWith(suffix)); assert.deepEqual(values(after), values(before));
});
test("date headings are removed only when the entire note consists of plugin records", () => {
  const noEntries = `# ${date}\n\n自己写的日记。\n`;
  assert.equal(formatDaily(noEntries, date), noEntries);
  const mixed = `# ${date}\n\n${oldBlock()}\n\n今天的补记。\n`;
  assert.ok(formatDaily(mixed, date).startsWith(`# ${date}\n`));
  const differentTitle = `# 当天的想法\n\n${oldBlock()}\n`;
  assert.ok(formatDaily(differentTitle, date).startsWith("# 当天的想法\n"));
  assert.throws(() => formatDaily(noEntries, "2026-10-02.*"), /日期/);
});
test("CRLF and mixed old/new entries keep record order and body meaning", () => {
  const old = oldBlock({ text: "第一行\n第二行\n\n第三段" }).replace(/\n/g, "\r\n");
  const card = blockFor({ id: "new", kind: "thought", time: "18:00", text: "后来写下的" });
  const before = `# ${date}\r\n\r\n${old}\r\n\r\n${card}\n`;
  const after = formatDaily(before, date);
  assert.deepEqual(values(after), values(before)); assert.deepEqual(values(after).map(entry => entry.id), ["original", "new"]);
  assert.equal(values(after)[0].text, "第一行\n第二行\n\n第三段"); assert.equal(formatDaily(after, date), after);
});
test("fenced and nested quoted examples are not mistaken for records", () => {
  const card = blockFor({ id: "example", kind: "thought", time: "12:00", text: "例子" });
  const before = `\`\`\`markdown\n${oldBlock()}\n${card}\n\`\`\`\n\n${card.split("\n").map(line => `> ${line}`).join("\n")}\n`;
  assert.deepEqual(values(before), []); assert.equal(formatDaily(before, date), before);
  const outside = oldBlock({ id: "outside" });
  assert.deepEqual(values(before + "\n" + outside).map(entry => entry.id), ["outside"]);
});
test("a code fence inside a real old record may be unfinished without losing that record", () => {
  const before = oldBlock({ text: "```js\n开始写一点代码" }) + "\n\n" + oldBlock({ id: "after", text: "接着记录" });
  assert.equal(values(before).length, 2); assert.deepEqual(values(formatDaily(before, date)), values(before));
});
test("migration and edits target real records when an identical code sample appears first", async () => {
  const block = oldBlock(), example = `\`\`\`markdown\n${block}\n\`\`\`\n\n`;
  let content = example + block + "\n";
  assert.ok(formatDaily(content, date).startsWith(example));
  const file = { path }, vault = {
    getAbstractFileByPath: p => p === path ? file : null,
    read: async () => content,
    process: async (_, fn) => { content = fn(content); },
  };
  const store = new VaultStore(vault, DEFAULTS), day = await store.day(date);
  assert.equal(day.original, example.trim());
  await store.updateEntry(day.entries[0], { text: "真正的修改" });
  assert.ok(content.startsWith(example)); assert.equal(values(content)[0].text, "真正的修改");
});
test("card-like user input stays inside its own quoted body", () => {
  const text = blockFor({ id: "fake", kind: "diary", time: "12:00", text: "嵌套示例" });
  const block = blockFor({ id: "outer", kind: "thought", time: "18:00", text });
  const entries = values(block); assert.equal(entries.length, 1); assert.equal(entries[0].text, text); assert.equal(entries[0].id, "outer");
  for (const change of [{ id: undefined }, { id: "x\ny" }, { kind: "__proto__" }, { time: "25:99" }]) assert.throws(() => blockFor({ id: "valid", kind: "diary", time: "12:00", text: "正文", ...change }), /格式/);
});
test("idempotent append compares full parsed IDs rather than body text or prefix", async () => {
  let content = blockFor({ id: "one-long", kind: "thought", time: "12:00", text: "正文里提到 ^pl-one" }) + "\n";
  const file = { path }, vault = {
    getAbstractFileByPath: candidate => candidate === path ? file : { children: [] },
    process: async (_, fn) => { content = fn(content); },
    read: async () => content,
  };
  const store = new VaultStore(vault, DEFAULTS);
  await store.capture("真正的新记录", "thought", date, "one");
  await store.capture("真正的新记录", "thought", date, "one");
  assert.deepEqual(values(content).map(entry => entry.id), ["one-long", "one"]);
});
test("retry also recognizes records saved in the old format", async () => {
  let content = oldBlock({ id: "retry" }) + "\n";
  const file = { path }, vault = { getAbstractFileByPath: p => p === path ? file : { children: [] }, process: async (_, fn) => { content = fn(content); } };
  const store = new VaultStore(vault, DEFAULTS), before = content;
  await store.capture("保留原来的想法。", "thought", date, "retry");
  assert.equal(content, before); assert.equal(values(content).length, 1);
});
