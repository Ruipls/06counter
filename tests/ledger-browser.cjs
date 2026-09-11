const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");
const XLSX = require("../vendor/xlsx.full.min.js");
const BASE = process.env.TEST_URL || "http://127.0.0.1:4173/";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      hasTouch: true,
      serviceWorkers: "block",
    });
    const p = await context.newPage();
    await p.goto(BASE);
    await p.evaluate(async () => {
      const { createStore } = await import("./src/model.mjs");
      const s = createStore(localStorage);
      s.addTemporary("15");
      s.complete();
      s.addTemporary("56");
      s.complete();
    });
    await p.reload();
    const nav = () => p.locator('.bottom-nav [data-page="ledger"]').click();
    await nav();
    const card = p.locator(".ledger-order").first();
    const box = await card.boundingBox();
    const hold = async () => {
      await p.mouse.move(box.x + 30, box.y + 30);
      await p.mouse.down();
      await p.waitForTimeout(750);
      await p.mouse.up();
    };
    await hold();
    assert.equal(
      await p.locator("#dialog").evaluate((d) => d.open),
      true,
      "长按必须打开删除确认",
    );
    await p.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await p.locator(".ledger-order").count(), 2);
    await card.click();
    await p.waitForTimeout(700);
    assert.equal(
      await p.locator("#dialog").evaluate((d) => d.open),
      false,
      "短按不删除",
    );
    await p.mouse.move(box.x + 30, box.y + 30);
    await p.mouse.down();
    await p.mouse.move(box.x + 30, box.y + 80);
    await p.waitForTimeout(750);
    await p.mouse.up();
    assert.equal(
      await p.locator("#dialog").evaluate((d) => d.open),
      false,
      "滑动取消长按",
    );
    await card.dispatchEvent("pointerdown", {
      pointerId: 9,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 30,
      clientY: 300,
    });
    await card.dispatchEvent("pointercancel", { pointerId: 9 });
    await p.waitForTimeout(750);
    assert.equal(
      await p.locator("#dialog").evaluate((d) => d.open),
      false,
      "系统取消触摸不弹窗",
    );
    const touch = await context.newCDPSession(p);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 30, y: box.y + 30 }],
    });
    await p.waitForTimeout(750);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await p.locator("#dialog").evaluate((d) => d.open),
      true,
      "触摸长按必须弹出确认",
    );
    await p.screenshot({ path: "/tmp/06counter-delete-confirm.png" });
    await p.getByRole("button", { name: "确认删除", exact: true }).click();
    assert.equal(await p.locator(".ledger-order").count(), 1);
    assert.match(await p.locator(".stats").innerText(), /¥15/);
    await p.reload();
    await nav();
    assert.equal(await p.locator(".ledger-order").count(), 1, "删除需持久化");
    const dl = p.waitForEvent("download");
    await p.locator('[data-action="export-excel"]').click();
    const file = await dl;
    const book = XLSX.read(fs.readFileSync(await file.path()), {
      type: "buffer",
    });
    const summary = XLSX.utils.sheet_to_json(book.Sheets["销售汇总"])[0];
    assert.equal(summary["销售总额（元）"], 15);
    assert.equal(summary["成交笔数"], 1);
    assert.equal(XLSX.utils.sheet_to_json(book.Sheets["订单流水"]).length, 1);
    const items = XLSX.utils.sheet_to_json(book.Sheets["商品明细"]);
    assert.equal(items.length, 1);
    assert.equal(items[0]["单价（元）"], 15);
    await p.locator(".ledger-order").focus();
    await p.keyboard.press("Delete");
    await p.getByRole("button", { name: "确认删除", exact: true }).click();
    assert.equal(await p.locator(".ledger-order").count(), 0);
    assert.match(await p.locator(".stats").innerText(), /¥0/);
    console.log(
      "PASS: long press confirmation, cancel, short tap, scroll/cancel, persistent deletion and Excel consistency",
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
