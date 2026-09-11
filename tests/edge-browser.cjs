const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const XLSX = require("../vendor/xlsx.full.min.js");
const BASE = process.env.TEST_URL || "http://127.0.0.1:4173";
const OUT = process.env.TEST_OUTPUT || "/tmp/06counter-test";
fs.mkdirSync(OUT, { recursive: true });
const click = (p, a) => p.locator(`[data-action="${a}"]`).click();
const nav = (p, name) => p.locator(`.bottom-nav [data-page="${name}"]`).click();
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("06counter-checkout-v3")));
(async () => {
  const b = await chromium.launch({ headless: true });
  try {
    const c = await b.newContext({
        viewport: { width: 320, height: 740 },
        serviceWorkers: "block",
      }),
      p = await c.newPage();
    await p.goto(BASE);
    // A temporary-only order is reachable even without products.
    await click(p, "temporary");
    await p.locator('[name="price"]').fill("25");
    await p.getByRole("button", { name: "加入当前订单" }).click();
    assert.equal(await p.getByRole("heading", { name: "当前订单" }).count(), 1);
    await p.locator('[data-page="bill"]').click();
    await click(p, "complete");
    await p.locator('[data-page="cash"]').first().click();
    // 30 rows without headers and with non-leading mapped columns.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(
        Array.from({ length: 30 }, (_, i) => ["unused", "x", "商品" + i, 15]),
      ),
      "无表头",
    );
    const xlsx = path.join(OUT, "noheader.xlsx");
    fs.writeFileSync(
      xlsx,
      XLSX.write(wb, { bookType: "xlsx", type: "buffer" }),
    );
    await click(p, "start-import");
    await p.locator("#excelFile").setInputFiles(xlsx);
    await p.locator(".smart-preview").waitFor();
    await p.locator(".import-advanced summary").click();
    await p.locator("#headerSelect").selectOption("-1");
    assert.equal(await p.locator("#nameColumn option").count(), 4);
    await p.locator("#nameColumn").selectOption("2");
    await p.locator("#priceColumn").selectOption("3");
    await click(p, "import-confirm");
    assert.equal((await state(p)).products.length, 30);
    await nav(p, "cash");
    await click(p, "edit-grid");
    // Real long press and pointer movement swap cards without adding a product.
    let before = await state(p);
    let first = await p.locator(".product-card").nth(0).boundingBox(),
      second = await p.locator(".product-card").nth(1).boundingBox();
    await p.mouse.move(first.x + 25, first.y + 30);
    await p.mouse.down();
    await p.waitForTimeout(450);
    await p.mouse.move(second.x + 25, second.y + 30, { steps: 5 });
    await p.mouse.up();
    assert.equal((await state(p)).products[0].id, before.products[1].id);
    assert.equal((await state(p)).cart.length, 0);
    await p.waitForTimeout(400);
    const handle = await p.locator(".resize-handle").first().boundingBox();
    await p.mouse.move(handle.x + 15, handle.y + 15);
    await p.mouse.down();
    await p.mouse.move(handle.x + 120, handle.y + 125, { steps: 5 });
    await p.mouse.up();
    assert.ok((await state(p)).products[0].colSpan >= 2);
    assert.ok((await state(p)).products[0].rowSpan >= 2);
    await click(p, "edit-grid");
    // 51 orders span three PDF pages; yesterday is excluded from today's metrics.
    const seed = await state(p),
      today = new Date();
    seed.orders = Array.from({ length: 51 }, (_, i) => ({
      id: "receipt-" + i,
      createdAt: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        12,
        0,
        i,
      ).toISOString(),
      items: [
        {
          id: "item-" + i,
          productId: null,
          name: "测试中文商品",
          price: 1500,
          quantity: 2,
          subtotal: 3000,
        },
      ],
      totalAmount: 3000,
      totalQuantity: 2,
    }));
    seed.products[0].name = "最长商品名称".repeat(12);
    seed.products[0].price = 99999999;
    seed.cart = [
      {
        id: "large-cart",
        productId: null,
        name: seed.products[0].name,
        price: 99999999,
        quantity: 9999,
      },
    ];
    const backup = path.join(OUT, "edge-backup.json");
    fs.writeFileSync(backup, JSON.stringify(seed));
    await p.locator('[data-page="settings"]').click();
    await p.locator("#backupFile").setInputFiles(backup);
    await p.getByRole("button", { name: "确认恢复", exact: true }).click();
    await p.locator('[data-page="cash"]').click();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const barOverflow = await p
      .locator(".cart-bar")
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    assert.equal(barOverflow, false, "大金额订单栏不应横向溢出");
    assert.ok(
      (await p.locator(".cart-bar .btn").boundingBox()).width >= 90,
      "去结算按钮不能被挤成竖排",
    );
    await p.screenshot({ path: path.join(OUT, "large-cart.png") });
    await p.locator('.cart-bar [data-page="order"]').click();
    await p.locator('[data-page="bill"]').click();
    const billFit = await p
      .locator(".bill-value")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth);
    assert.equal(billFit, true);
    assert.ok(
      (await p.locator(".calculation").boundingBox()).height > 20,
      "计算过程不能被长明细挤没",
    );
    assert.ok(
      (await p.locator(".receipt-row span").first().boundingBox()).width >= 70,
      "商品名称不能被挤成单字竖排",
    );
    await p.screenshot({ path: path.join(OUT, "large-bill.png") });
    await p.locator('[data-page="order"]').click();
    await p.locator('[data-page="cash"]').first().click();
    await nav(p, "ledger");
    assert.equal(await p.locator(".ledger-table tbody tr").count(), 51);
    assert.match(await p.locator(".stat").first().innerText(), /1530/);
    const download = p.waitForEvent("download");
    await click(p, "export-pdf");
    await (await download).saveAs(path.join(OUT, "multipage.pdf"));
    await click(p, "date-prev");
    assert.equal(await p.locator(".ledger-table tbody tr").count(), 0);
    console.log(
      "PASS: temporary-only checkout, headerless mapping, actual drag/resize, large amounts, daily filter, 51-order PDF",
    );
    await c.close();
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
