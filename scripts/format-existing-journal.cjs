"use strict";
// One explicitly selected daily note; no directory scans and no bulk migration.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { formatDaily, parseEntries, validDate } = require("../home-pages-personal/src/personal/data/model");
function entriesOf(content, date) {
  return parseEntries(content, "", date).map(({ block, ...entry }) => entry);
}
function main() {
  const [input, ...extra] = process.argv.slice(2);
  if (!input || extra.length || !path.isAbsolute(input) || path.extname(input).toLowerCase() !== ".md") throw Error("用法：node scripts/format-existing-journal.cjs <日记文件的绝对路径>");
  const target = path.resolve(input), date = path.basename(target, ".md");
  if (!validDate(date)) throw Error("只接受文件名为 YYYY-MM-DD.md 的日记。");
  if (!fs.lstatSync(target).isFile()) throw Error("目标必须是普通文件。");
  const original = fs.readFileSync(target), text = original.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(original)) throw Error("源文件不是有效 UTF-8；已停止，未做修改。");
  const beforeEntries = entriesOf(text, date);
  if (!beforeEntries.length) throw Error("没有可确认的插件记录；已停止，未做修改。");
  if (new Set(beforeEntries.map(entry => entry.id)).size !== beforeEntries.length) throw Error("记录编号重复；已停止，未做修改。");
  const formatted = formatDaily(text, date);
  assert.deepEqual(entriesOf(formatted, date), beforeEntries, "转换前后记录不一致，已停止。");
  assert.equal(formatDaily(formatted, date), formatted, "转换不是幂等的，已停止。");
  if (formatted === text) { console.log(JSON.stringify({ changed: false, path: target, entries: beforeEntries.length })); return; }
  const backupDir = path.resolve(__dirname, "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"), token = crypto.randomBytes(5).toString("hex");
  const backup = path.join(backupDir, `journal-before-format-${date}-${stamp}-${token}.md`);
  fs.writeFileSync(backup, original, { flag: "wx" });
  if (!fs.readFileSync(backup).equals(original)) throw Error("备份校验失败；源文件未修改。");
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.format-${token}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx");
    fs.writeFileSync(descriptor, formatted, "utf8"); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    // Do not replace a note edited after this conversion began.
    if (!fs.readFileSync(target).equals(original)) throw Error("源文件刚刚被修改；已停止，请重新运行。");
    fs.renameSync(temporary, target);
    console.log(JSON.stringify({ changed: true, path: target, backup, entries: beforeEntries.length }));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
