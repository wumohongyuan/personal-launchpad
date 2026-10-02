import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import esbuild from "esbuild";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME_PAGES_PLAYWRIGHT_MODULE || "playwright");
const bundle = await esbuild.build({ entryPoints: ["tests/personal-growth-fixture.ts"], bundle: true, platform: "browser", format: "iife", write: false, alias: { obsidian: resolve("tests/obsidian-stub.ts") }, logLevel: "warning" });
const browser = await chromium.launch({ headless: true, channel: process.env.HOME_PAGES_TEST_BROWSER || "msedge" });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } }), errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.setContent("<html><head></head><body></body></html>");
await page.addStyleTag({ content: await readFile("styles.css", "utf8") + await readFile("src/personal/growth-widgets.css", "utf8") + "\nbody{margin:16px;--text-normal:#26342d;--text-muted:#62736a;--background-primary:#fff;--background-modifier-border:#dfe6df}.hp-card{height:850px;max-width:900px}.hp-card-body{overflow:hidden}" });
await page.addScriptTag({ content: bundle.outputFiles[0].text });
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
try {
  await test("legacy180 phase actions are retry-safe and milestone opens the original template", async () => {
    await page.evaluate(() => window.growthFixture.reset("growth"));
    assert.ok((await page.locator("body").innerText()).includes("180 天个人成长计划"));
    await page.getByRole("button", { name: "把阶段行动加入今天", exact: true }).click();
    await page.waitForFunction(async () => (await window.growthFixture.today()).entries.length === 4);
    await page.getByRole("button", { name: "把阶段行动加入今天", exact: true }).click();
    assert.equal(await page.evaluate(async () => (await window.growthFixture.today()).entries.length), 4);
    await page.getByRole("button", { name: "打开模板", exact: true }).first().click();
    const file = await page.evaluate(() => window.growthFixture.files().find(file => file.path.includes("交付物")));
    assert.ok(file.path.includes("第1周")); assert.ok(file.content.includes("第一次外部接触"));
    assert.equal(await page.evaluate(() => window.growthFixture.refreshes().includes("personal-capture")), false);
  });
  await test("custom plan validation rejects invalid dates/durations and keeps real templates", async () => {
    const result = await page.evaluate(async () => {
      const plan = await window.growthFixture.plan();
      const values = { planId: "custom", startDate: "2026-10-03", totalDays: "28", phases: "启动 | 2 | 养成习惯 | 看书；散步\n产出 | 2 | 写总结 | 写一段", milestones: "4 | 第一份总结" };
      const parsed = window.growthFixture.parsePlanFields(values, plan);
      let invalidDate = false, invalidWeeks = false;
      try { window.growthFixture.parsePlanFields({ ...values, startDate: "2026-02-30" }, plan); } catch { invalidDate = true; }
      try { window.growthFixture.parsePlanFields({ ...values, phases: "阶段 | -1 | 目标" }, plan); } catch { invalidWeeks = true; }
      return { parsed, invalidDate, invalidWeeks, same: window.growthFixture.phaseTaskId("a", "b", 0, "正文") === window.growthFixture.phaseTaskId("a", "b", 0, "正文"), changed: window.growthFixture.phaseTaskId("a", "b", 0, "正文") !== window.growthFixture.phaseTaskId("a", "b", 0, "新正文") };
    });
    assert.equal(result.invalidDate, true); assert.equal(result.invalidWeeks, true); assert.equal(result.same, true); assert.equal(result.changed, true);
    assert.deepEqual(result.parsed.phases[0].tasks, ["看书", "散步"]); assert.ok(result.parsed.milestones[0].template.includes("第一次外部接触"));
  });
  await test("health saves an editable real workout and accepts a paused weekly goal", async () => {
    await page.evaluate(() => window.growthFixture.reset("health"));
    await page.evaluate(() => window.growthFixture.queueForm({ date: "2026-10-03", type: "散步", duration: "35", intensity: "轻松", weight: "", note: "脑子清楚了一点" }));
    await page.getByRole("button", { name: "记录运动", exact: true }).click();
    await page.waitForFunction(async () => (await window.growthFixture.state()).health.workouts.length === 1);
    const item = await page.evaluate(async () => (await window.growthFixture.state()).health.workouts[0]); assert.equal(item.duration, 35); assert.equal(item.note, "脑子清楚了一点");
    await page.evaluate(() => window.growthFixture.queueForm({ goal: "0" })); await page.getByRole("button", { name: "调整每周目标", exact: true }).click();
    await page.waitForFunction(async () => (await window.growthFixture.state()).health.weeklyGoal === 0);
  });
  await test("review survives summary refresh and failed save, then appends one snapshot", async () => {
    await page.evaluate(() => window.growthFixture.reset("review"));
    const input = page.getByRole("textbox", { name: "这周值得记住的事", exact: true }); await input.fill("真实的一周\n第二段心得");
    await page.evaluate(() => window.growthFixture.tick()); assert.equal(await input.inputValue(), "真实的一周\n第二段心得");
    await page.evaluate(() => window.growthFixture.fail(true)); await page.getByRole("button", { name: "保存这周的回顾", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("textarea").readOnly); assert.equal(await input.inputValue(), "真实的一周\n第二段心得");
    assert.equal(await page.evaluate(() => window.growthFixture.files().filter(file => file.path.includes("周回顾")).length), 0);
    await page.evaluate(() => window.growthFixture.fail(false)); await page.getByRole("button", { name: "保存这周的回顾", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("textarea").value === "");
    const file = await page.evaluate(() => window.growthFixture.files().find(file => file.path.includes("周回顾"))); assert.equal((file.content.match(/\[!pl-review\]/g) || []).length, 1); assert.ok(file.content.includes("真实的一周"));
  });
  await test("week navigation and remount restore the right review draft", async () => {
    const input = page.getByRole("textbox", { name: "这周值得记住的事", exact: true }); await input.fill("这周的草稿");
    await page.getByRole("button", { name: "上一周", exact: true }).click(); await input.fill("上周的草稿"); await page.getByRole("button", { name: "下一周", exact: true }).click(); assert.equal(await input.inputValue(), "这周的草稿");
    await page.evaluate(() => window.growthFixture.mount("review")); assert.equal(await input.inputValue(), "这周的草稿");
  });
  await test("knowledge search rejects stale results and never replaces the input element", async () => {
    await page.evaluate(async () => { await window.growthFixture.reset("knowledge"); await window.growthFixture.addNote("旧结果", "慢查询"); await window.growthFixture.addNote("正确结果", "快查询"); });
    const search = page.getByRole("searchbox", { name: "搜索知识笔记" });
    await page.evaluate(() => { window.searchNode = document.querySelector("input[type=search]"); });
    await search.fill("慢查询"); await search.press("Enter"); await search.fill("快查询"); await search.press("Enter");
    await page.waitForFunction(() => document.querySelector(".hp-list-title")?.textContent === "正确结果");
    await page.waitForTimeout(950); assert.equal(await page.locator(".hp-list-title").innerText(), "正确结果"); assert.equal(await search.inputValue(), "快查询");
    assert.equal(await page.evaluate(() => window.searchNode === document.querySelector("input[type=search]")), true);
    await page.evaluate(() => window.growthFixture.mount("knowledge")); assert.equal(await search.inputValue(), "快查询");
  });
  await test("all four widgets fit a narrow card without horizontal overflow", async () => {
    await page.setViewportSize({ width: 375, height: 900 });
    for (const kind of ["growth", "health", "review", "knowledge"]) { await page.evaluate(kind => window.growthFixture.reset(kind), kind); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, kind); }
  });
  assert.deepEqual(errors, []); console.log(`ALL ${passed} PERSONAL GROWTH CHECKS PASSED`);
} finally { await browser.close(); }
