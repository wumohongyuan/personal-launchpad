import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import esbuild from "esbuild";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME_PAGES_PLAYWRIGHT_MODULE || "playwright");
const bundle = await esbuild.build({ entryPoints: ["tests/personal-lifecycle-fixture.ts"], bundle: true, platform: "browser", format: "iife", write: false, alias: { obsidian: resolve("tests/personal-lifecycle-stub.ts") }, logLevel: "warning" });
const browser = await chromium.launch({ headless: true, channel: process.env.HOME_PAGES_TEST_BROWSER || "msedge" });
const page = await browser.newPage(), errors = [], failures = [];
page.on("pageerror", error => errors.push(error.message));
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ content: bundle.outputFiles[0].text });
let passed = 0;
async function test(name, run) { try { await run(); passed++; console.log(`PASS ${name}`); } catch (error) { failures.push({ name, message: error.message }); console.error(`FAIL ${name}\n${error.message}`); } }
try {
  await test("workspace restoration registers synchronously and waits for saved settings", async () => {
    await page.evaluate(() => window.lifecycleFixture.reset({ pending: true }));
    assert.equal(await page.evaluate(() => window.lifecycleFixture.registered()), true);
    assert.equal(await page.evaluate(() => window.lifecycleFixture.viewType()), "personal-launchpad-view");
    await page.evaluate(() => window.lifecycleFixture.beginOpenTwice());
    assert.equal(await page.evaluate(() => window.lifecycleFixture.roots()), 0);
    await page.evaluate(async () => { await window.lifecycleFixture.resolveLoad(); await window.lifecycleFixture.finishOpen(); });
    assert.equal(await page.evaluate(() => window.lifecycleFixture.leaves()), 1);
    assert.equal(await page.evaluate(() => window.lifecycleFixture.roots()), 1);
    assert.equal(await page.locator(".hp-tab.is-active").textContent(), "保存的工作台");
  });
  await test("a view closed before settings arrive never mounts afterward", async () => {
    await page.evaluate(async () => { await window.lifecycleFixture.reset({ pending: true }); window.lifecycleFixture.beginOpen(); await window.lifecycleFixture.close(); await window.lifecycleFixture.resolveLoad(); await window.lifecycleFixture.finishOpen(); });
    assert.equal(await page.evaluate(() => window.lifecycleFixture.roots()), 0);
  });
  await test("read errors preserve registration and display a recovery view without writing", async () => {
    await page.evaluate(async () => { await window.lifecycleFixture.reset({ pending: true }); window.lifecycleFixture.beginOpen(); await window.lifecycleFixture.rejectLoad(); await window.lifecycleFixture.finishOpen(); });
    assert.equal(await page.evaluate(() => window.lifecycleFixture.registered()), true);
    assert.equal(await page.locator(".hp-personal-recovery").count(), 1);
    assert.deepEqual(await page.evaluate(() => window.lifecycleFixture.writes()), []);
  });
  await test("save queue serializes immutable snapshots, rejects errors, recovers and flushes on unload", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.queueScenario());
    assert.equal(result.inFlightCount, 1); assert.deepEqual(result.gaps, [12, 24, 30, 32, 36]); assert.equal(result.rejection, "rejected");
  });
  await test("API pins wait for saved pages before mutating or persisting", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.pendingPin());
    assert.equal(result.writesBeforeReady, 0); assert.deepEqual(result.ids, ["p1", "p2"]); assert.deepEqual(result.kinds, ["lifecycle-missing", "lifecycle-new"]); assert.deepEqual(result.persisted, result.kinds);
  });
  await test("saving a duplicate after switching pages does not insert into the wrong page", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.delayedDuplicate());
    assert.equal(result.cards, 0); assert.equal(result.firstPageItems, 2); assert.equal(result.active, "p2");
  });
  await test("disposed async widgets invalidate callbacks and dispose resources registered late", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.disposedHost());
    assert.equal(result.aliveAfterClose, false, "isAlive after close"); assert.equal(result.cleanupsBeforeStaleRender, 1, "late cleanup runs immediately"); assert.equal(result.renders, 1, "stale rerender must be inert"); assert.equal(result.lateCleanups, 1);
  });
  await test("unloading a busy form closes it and prevents retries after a failed write", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.busyForm());
    assert.equal(result.connectedAfterUnload, false); assert.equal(result.commits, 1); assert.equal(result.settled, true);
  });
  await test("malformed nested layouts and duplicate IDs fail closed", async () => {
    assert.deepEqual(await page.evaluate(() => window.lifecycleFixture.invalidSettings()), [true, true, true]);
  });
  await test("ready notification waits for load and refreshes during restoration are safe", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.readyNotification());
    assert.deepEqual(result.before, []); assert.deepEqual(result.after, ["home-pages:ready"]); assert.equal(result.roots, 1);
  });
  await test("a slow custom script cannot register or write after plugin unload", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.unloadedCustomScript());
    assert.equal(result.loaded, 0); assert.equal(result.added, false); assert.equal(result.writes, 0);
  });
  await test("custom script generations ignore stale reads and respect unload/delete while active", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.staleCustomScripts());
    assert.deepEqual(result.newest, ["lifecycle-new-script"]); assert.equal(result.afterUnload, 0); assert.equal(result.afterDelete, 0); assert.equal(result.stillActive, true); assert.equal(result.writes, 0);
  });
  await test("renewal reminders show once per day, resume next day, and respect visibility/settings", async () => {
    const result = await page.evaluate(() => window.lifecycleFixture.reminders());
    assert.equal(result.sameDay, 1); assert.equal(result.nextDay, 2); assert.deepEqual(result.hidden, { notices: 2, read: false }); assert.equal(result.disabled, 2); assert.equal(result.hiddenWhileReading, 2); assert.equal(result.writes, 0);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(`ALL ${passed} PERSONAL LIFECYCLE CHECKS PASSED`);
} finally { await browser.close(); }
