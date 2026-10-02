"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { VaultStore } = require("../src/personal/data/store");
const { FinanceStore } = require("../src/personal/data/finance-store");
const { DEFAULTS } = require("../src/personal/data/model");

class MemoryVault {
  files = new Map();
  getAbstractFileByPath(path) { return this.files.get(path) || null; }
  async createFolder(path) { if (this.files.has(path)) throw Error("exists"); this.files.set(path, { path, children: [] }); }
  async create(path, content) { if (this.files.has(path)) throw Error("exists"); const file = { path, content }; this.files.set(path, file); return file; }
  async read(file) { return file.content; }
  async process(file, transform) { return file.content = transform(file.content); }
}

test("retrying a paid billing cycle on another day neither duplicates the expense nor advances twice", async () => {
  const OriginalDate = Date;
  let now = new OriginalDate(2026, 9, 3, 12).getTime();
  global.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  try {
    const vault = new MemoryVault(), finance = new FinanceStore(new VaultStore(vault, { ...DEFAULTS }));
    await finance.saveSubscription({ id: "synthetic-service", name: "合成测试订阅", amount: "30", currency: "CNY", cycle: "monthly", nextDue: "2026-10-03", remindDays: 3 });
    const first = await finance.paySubscription("synthetic-service", "2026-10-03");
    assert.equal(first.entry.date, "2026-10-03"); assert.equal(first.subscription.nextDue, "2026-11-03");
    now = new OriginalDate(2026, 9, 4, 12).getTime();
    const retry = await finance.paySubscription("synthetic-service", "2026-10-03");
    assert.equal(retry.alreadyPaid, true); assert.equal(retry.entry.id, first.entry.id); assert.equal(retry.entry.date, "2026-10-03");
    assert.equal(retry.subscription.nextDue, "2026-11-03"); assert.equal((await finance.load()).entries.length, 1);
    assert.deepEqual(await finance.summary("2026-10"), { income: 0, expense: 3000, balance: -3000 });
  } finally { global.Date = OriginalDate; }
});
