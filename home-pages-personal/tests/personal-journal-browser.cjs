"use strict";
// Actual HomeView + PersonalServices, with only the Obsidian host replaced for a browser.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const esbuild = require("esbuild"), { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), out = path.join(root, "test-results"); fs.mkdirSync(out, { recursive: true });
const base = `:root{--background-primary:#fff;--background-primary-alt:#f7f8fa;--background-secondary:#f0f1f4;--background-modifier-border:#dfe2e8;--background-modifier-hover:#edf0f5;--text-normal:#263146;--text-muted:#6e788a;--text-faint:#98a0ad;--text-accent:#5d54b8;--text-error:#b72e41;--interactive-normal:#f5f6f8;--interactive-hover:#e9edf3;--interactive-accent:#6b5fc5;font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--background-primary-alt);color:var(--text-normal)}button,input,textarea,select{font:inherit}button,select{border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer;border-radius:6px;padding:5px 9px}button:disabled{opacity:.55;cursor:default}input,textarea{color:var(--text-normal);background:var(--background-primary);border:1px solid var(--background-modifier-border);padding:7px;border-radius:6px}input[type=checkbox]{accent-color:var(--interactive-accent)}.mod-cta{background:var(--interactive-accent);color:#fff}.modal{border:1px solid var(--background-modifier-border);border-radius:14px;padding:24px;width:min(680px,calc(100vw - 24px));max-height:90vh;overflow:auto;background:var(--background-primary);color:var(--text-normal)}.modal::backdrop{background:#20263866}.modal h2{margin:0 0 20px;font-size:21px}.setting-item{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--background-modifier-border)}.setting-item-info{flex:1}.setting-item-description{font-size:12px;color:var(--text-muted)}.setting-item-control{display:flex;gap:8px;align-items:center;max-width:60%}.setting-item-control input:not([type=checkbox]),.setting-item-control textarea,.setting-item-control select{max-width:100%;min-width:0}.notice{position:fixed;right:18px;bottom:18px;z-index:1000;padding:12px 18px;background:var(--background-secondary);box-shadow:0 6px 28px #0002;border:1px solid var(--background-modifier-border);border-radius:8px}.menu{padding:5px;background:var(--background-primary);box-shadow:0 6px 26px #0003}.menu button{display:block;width:100%;text-align:left}.theme-dark{--background-primary:#242935;--background-primary-alt:#1a1e27;--background-secondary:#202530;--background-modifier-border:#394252;--background-modifier-hover:#333d4c;--text-normal:#e4e9f2;--text-muted:#a9b4c7;--interactive-normal:#303846;--interactive-hover:#3c4555;--text-accent:#b1a4ef;--interactive-accent:#7d6ed3}`;
(async () => {
  const bundle = await esbuild.build({ entryPoints: [path.join(root, "tests/personal-preview.ts")], bundle: true, platform: "browser", format: "iife", alias: { obsidian: path.join(root, "tests/personal-obsidian-stub.ts") }, write: false });
  const css = ["styles.css", "src/personal/personal.css", "src/personal/journal-widgets.css", "src/personal/library.css", "src/personal/growth-widgets.css"].filter(name => fs.existsSync(path.join(root, name))).map(name => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${base}\n${css}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`;
  const server = http.createServer((req, res) => { res.setHeader("Content-Type", req.url === "/app.js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8"); res.end(req.url === "/app.js" ? bundle.outputFiles[0].text : html); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: "msedge" }); const checks = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, timezoneId: "Asia/Shanghai" });
    page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(url); await page.waitForFunction(() => !!window.__hpPreview); await page.locator(".hp-personal-capture textarea").waitFor();
    const capture = () => page.locator(".hp-personal-capture"), input = () => capture().locator("textarea"), tabs = () => page.locator(".hp-tabs");
    const taskRows = () => page.locator(".hp-personal-task");
    const toWorkbench = async () => { await tabs().getByRole("button", { name: "工作台", exact: true }).click(); await input().waitFor(); };
    const daily = async () => page.evaluate(async () => { const d = new Date(), date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; return window.__hpPreview.personal.store.day(date); });
    const draft = "脑子里突然想到的一件事，还不急着整理。";
    await input().fill(draft); await page.evaluate(() => { window.__hpPreview.personal.refresh(); window.__hpPreview.view.applyLayout(); });
    assert.equal(await input().inputValue(), draft);
    await tabs().getByRole("button", { name: "编辑工作台", exact: true }).click();
    const card = page.locator(".hp-card-personal-capture"); const beforeWidth = await card.getAttribute("data-w");
    await card.getByRole("button", { name: "减小宽度", exact: true }).click();
    assert.equal(Number(await card.getAttribute("data-w")), Number(beforeWidth)-1); assert.equal(await input().inputValue(), draft);
    await tabs().getByRole("button", { name: "完成编辑", exact: true }).click();
    await page.reload(); await page.waitForFunction(() => !!window.__hpPreview); assert.equal(await input().inputValue(), draft); checks.push("自动草稿跨刷新、布局编辑和重载保持");
    await capture().getByRole("button", { name: "日记", exact: true }).click(); await input().fill("日记模式中的另一份草稿");
    await capture().getByRole("button", { name: "随手记", exact: true }).click(); assert.equal(await input().inputValue(), draft); checks.push("每个记录类型独立草稿");
    await input().evaluate(el => { el.dispatchEvent(new CompositionEvent("compositionstart")); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true, bubbles: true })); });
    assert.equal((await daily()).entries.filter(entry => entry.text === draft).length, 0);
    await input().evaluate(el => el.dispatchEvent(new CompositionEvent("compositionend"))); checks.push("中文输入法确认不触发保存");
    await page.evaluate(() => window.__hpPreview.vault.failWrites = true); await capture().getByRole("button", { name: "保存记录", exact: true }).click();
    await capture().getByRole("status").filter({ hasText: "保存失败" }).waitFor(); assert.equal(await input().inputValue(), draft);
    await page.evaluate(() => window.__hpPreview.vault.failWrites = false); await input().press("Control+Enter");
    await capture().getByRole("status").filter({ hasText: "已保存到" }).waitFor(); assert.equal(await input().inputValue(), ""); assert.equal((await daily()).entries.filter(entry => entry.text === draft).length, 1); checks.push("写入失败保留、重试恰好一条");
    // Simulate write completion followed by a lost acknowledgement, requiring a retry of the same ID.
    const once = "保存确认丢失时也不会重复记录。"; await input().fill(once);
    await page.evaluate(() => { const p = window.__hpPreview.personal; p.store.__capture = p.store.capture; let first = true; p.store.capture = async function(...args) { const result = await this.__capture(...args); if(first) {first = false; throw new Error("测试确认丢失");} return result; }; });
    await capture().getByRole("button", { name: "保存记录", exact: true }).click(); await capture().getByRole("status").filter({ hasText: "确认丢失" }).waitFor(); await capture().getByRole("button", { name: "保存记录", exact: true }).click(); await capture().getByRole("status").filter({ hasText: "已保存到" }).waitFor();
    assert.equal((await daily()).entries.filter(entry => entry.text === once).length, 1); await page.evaluate(() => { const p = window.__hpPreview.personal; p.store.capture = p.store.__capture; }); checks.push("写后确认丢失重试幂等");
    await tabs().getByRole("button", { name: "日记", exact: true }).click(); await page.locator(".hp-personal-journal").waitFor();
    const journal = () => page.locator(".hp-personal-journal");
    const original = journal().locator("article").filter({ hasText: draft }); await original.waitFor(); await original.getByRole("button", { name: "编辑", exact: true }).click();
    let modal = page.getByRole("dialog"); await modal.getByLabel("内容", { exact: true }).fill(draft + "\n\n补上一点自己的理解。"); await modal.getByRole("button", { name: "保存", exact: true }).click();
    await journal().locator("article").filter({ hasText: "补上一点自己的理解" }).waitFor();
    await journal().getByLabel("记录筛选").selectOption("task"); assert.equal(await journal().locator("article").count(), 1); await journal().getByLabel("记录筛选").selectOption("all");
    await journal().getByRole("button", { name: "前一天", exact: true }).click(); await journal().getByText("这一天还没有这样的记录。", { exact: true }).waitFor(); await journal().getByRole("button", { name: "今天", exact: true }).click(); await journal().locator("article").filter({ hasText: "补上一点自己的理解" }).waitFor();
    await journal().locator("article").filter({ hasText: "补上一点自己的理解" }).getByRole("button", { name: "原文", exact: true }).click(); modal = page.getByRole("dialog"); const markdown = await modal.getByRole("textbox").inputValue(); assert.match(markdown, /> \[!pl-thought\]/); assert.doesNotMatch(markdown, /<!-- pl-entry/); assert.doesNotMatch(markdown, /^# \d{4}-\d\d-\d\d/m); await modal.getByRole("button", { name: "取消", exact: true }).click(); checks.push("日记编辑、日期、类型筛选、干净callout原文");
    await toWorkbench(); await input().fill("移动页面时还在写的草稿");
    const inbox = page.locator(".hp-personal-journal"), target = inbox.locator("article").filter({ hasText: once });
    await page.evaluate(() => { const wb = window.__hpPreview.personal.workbench; wb.__change = wb.change; wb.change = async function() { throw new Error("测试整理状态暂存失败"); }; });
    await target.getByRole("button", { name: "转为待办", exact: true }).click(); await inbox.getByRole("status").filter({ hasText: "整理状态暂存失败" }).waitFor();
    await page.evaluate(() => { const wb = window.__hpPreview.personal.workbench; wb.change = wb.__change; });
    await target.getByRole("button", { name: "转为待办", exact: true }).click(); await target.waitFor({ state: "detached" }); await taskRows().filter({ hasText: once }).waitFor();
    assert.equal((await daily()).entries.filter(entry => entry.kind === "task" && entry.text === once).length, 1);
    assert.equal(await input().inputValue(), "移动页面时还在写的草稿"); checks.push("想法转行动部分失败后重试幂等、关联刷新保留输入");
    await page.evaluate(async () => { const p = window.__hpPreview.personal; await p.store.capture("早些时候留下的行动", "task", "2025-01-04", "historical-action"); p.refresh("personal-tasks"); });
    const oldTask = taskRows().filter({ hasText: "早些时候留下的行动" }); await oldTask.waitFor();
    await page.evaluate(() => window.__hpPreview.vault.failWrites = true); await oldTask.getByRole("checkbox").click(); await page.locator(".hp-personal-tasks").getByRole("status").filter({ hasText: "写入失败" }).waitFor(); assert.equal(await oldTask.getByRole("checkbox").isChecked(), false);
    await page.evaluate(() => window.__hpPreview.vault.failWrites = false); await oldTask.getByRole("checkbox").click(); await oldTask.waitFor({ state: "detached" }); checks.push("历史未完成行动聚合、失败回退、完成保存");
    await page.evaluate(async () => { const p = window.__hpPreview.personal; await p.workbench.change(state => { state.days["2024-12-20"] = { tasks: [{ text: "从旧版带过来的行动", done: false }] }; }); p.refresh("personal-tasks"); });
    const legacyTask = taskRows().filter({ hasText: "从旧版带过来的行动" }); await legacyTask.waitFor(); await legacyTask.getByRole("checkbox").click(); await legacyTask.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(async () => (await window.__hpPreview.personal.workbench.load()).days["2024-12-20"].tasks[0].done), true); checks.push("旧版任务聚合与完成回写");
    await page.locator(".hp-personal-tasks").getByRole("button", { name: "添加行动", exact: true }).click(); modal = page.getByRole("dialog"); await modal.getByLabel("准备做什么", { exact: true }).fill("通过行动清单新增的一件事"); await modal.getByRole("button", { name: "保存", exact: true }).click(); await taskRows().filter({ hasText: "通过行动清单新增的一件事" }).waitFor(); checks.push("实际PersonalForm行动创建");
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 1024 }); await page.waitForTimeout(250);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}px viewport overflow`);
      assert.ok(await capture().evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}px capture overflow`);
      if (width === 375) assert.ok(await page.locator(".hp-grid").evaluate(grid => [...grid.children].every(card => card.getBoundingClientRect().width >= grid.clientWidth - 1)), "phone: every card fills the grid, no hidden implicit columns");
      await page.screenshot({ path: path.join(out, `native-journal-workbench-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1024 }); await page.evaluate(() => document.body.classList.add("theme-dark")); await page.screenshot({ path: path.join(out, "native-journal-dark.png"), fullPage: true }); checks.push("1440/768/375布局无横向溢出、暗色截图");
    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: checks.length, checks }, null, 2)); fs.writeFileSync(path.join(out, "native-journal-results.json"), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
