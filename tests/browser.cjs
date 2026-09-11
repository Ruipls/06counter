const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const XLSX = require("../vendor/xlsx.full.min.js");
const BASE = process.env.TEST_URL || "http://127.0.0.1:4173";
const OUT = process.env.TEST_OUTPUT || "/tmp/06counter-test";
fs.mkdirSync(OUT, { recursive: true });
const sample = [
  ["商品名称", "价格"],
  ["贴纸套装", 15],
  ["手帐本 A", 56],
  ["手帐本 B", 68],
  ["明信片", 10],
  ["亚克力立牌", 35],
  ["帆布包", 45],
  ["胶带", 12],
  ["便签本", 18],
  ["钥匙扣", 25],
  ["文件夹", 20],
  ["笔记本", 28],
  ["徽章", 8],
  ["卡套", 22],
  ["便利贴", 16],
  ["书签", 14],
];
const fixture = (name, rows, bookType = "xlsx") => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(rows),
    "商品价格表",
  );
  const file = path.join(OUT, name);
  fs.writeFileSync(file, XLSX.write(book, { bookType, type: "buffer" }));
  return file;
};
const click = async (p, a) => p.locator(`[data-action="${a}"]`).click();
const nav = async (p, page) =>
  p.locator(`.bottom-nav [data-page="${page}"]`).click();
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("06counter-checkout-v3")));
async function importFile(p, file) {
  await click(p, "start-import");
  await p.locator("#excelFile").setInputFiles(file);
  await p.locator(".smart-preview").waitFor();
  await click(p, "import-confirm");
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: "block",
      }),
      p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(BASE);
    await p.getByRole("heading", { name: "把商品表变成收银台" }).waitFor();
    await p.screenshot({ path: path.join(OUT, "00-empty.png") });
    assert.equal(
      await p.locator('[data-action="temporary"]').count(),
      1,
      "空订单也应能添加临时金额",
    );
    await importFile(p, fixture("products.xlsx", sample));
    assert.equal((await state(p)).products.length, 15);
    await nav(p, "cash");
    assert.equal(await p.locator(".product-card").count(), 15);
    await p.screenshot({ path: path.join(OUT, "01-cash.png") });
    await p
      .getByRole("button", { name: "贴纸套装，¥15", exact: true })
      .click({ clickCount: 2 });
    await p.getByRole("button", { name: "手帐本 A，¥56", exact: true }).click();
    assert.match(await p.locator(".cart-bar").innerText(), /3件/);
    assert.match(await p.locator(".cart-bar").innerText(), /¥86/);
    await p.reload();
    await p.locator(".cart-bar").waitFor();
    assert.equal(
      (await state(p)).cart.reduce((s, i) => s + i.quantity, 0),
      3,
    );
    await p.locator('.cart-bar [data-page="order"]').click();
    await p.screenshot({ path: path.join(OUT, "02-order.png") });
    await click(p, "temporary");
    await p.locator('[name="price"]').fill("25");
    await p.getByRole("button", { name: "加入当前订单" }).click();
    assert.equal((await state(p)).cart.length, 3);
    await p.getByRole("button", { name: "减少 临时金额", exact: true }).click();
    assert.equal((await state(p)).cart.length, 2);
    await p.locator('[data-page="bill"]').click();
    assert.equal(await p.locator(".bill-value").innerText(), "86");
    assert.equal(await p.locator(".calculation").innerText(), "15 × 2 + 56");
    await p.screenshot({ path: path.join(OUT, "03-bill.png") });
    await p.locator('[data-action="complete"]').evaluate((el) => {
      el.click();
      el.click();
    });
    await p.getByRole("heading", { name: "收款完成！" }).waitFor();
    assert.equal((await state(p)).orders.length, 1);
    assert.equal((await state(p)).cart.length, 0);
    await p.screenshot({ path: path.join(OUT, "04-success.png") });
    await click(p, "success-ledger");
    assert.equal(await p.locator(".ledger-table tbody tr").count(), 1);
    await p.screenshot({ path: path.join(OUT, "05-ledger.png") });
    let download = p.waitForEvent("download");
    await click(p, "export-pdf");
    let file = await download;
    await file.saveAs(path.join(OUT, "sales.pdf"));
    assert.match(fs.readFileSync(path.join(OUT, "sales.pdf"), "utf8"), /^%PDF/);
    await nav(p, "products");
    await p.screenshot({ path: path.join(OUT, "06-products.png") });
    await importFile(
      p,
      fixture(
        "legacy.xls",
        [
          ["售价", "品名"],
          [0, "赠品"],
          [0.1, "小数商品"],
        ],
        "biff8",
      ),
    );
    assert.equal((await state(p)).products.length, 17);
    await click(p, "start-import");
    await p.locator("#excelFile").setInputFiles(
      fixture("bad.xlsx", [
        ["品名", "售价"],
        ["正常", 15],
        ["负值", -1],
        ["缺价", ""],
      ]),
    );
    await p.locator(".error-box").waitFor();
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isDisabled(),
      true,
    );
    await p.screenshot({ path: path.join(OUT, "07-import-error.png") });
    await click(p, "import-restart");
    await p
      .locator("#excelFile")
      .setInputFiles(fixture("preview.xlsx", sample));
    await p.locator(".smart-preview").waitFor();
    await p.screenshot({ path: path.join(OUT, "08-mapping.png") });
    await p.locator(".import-advanced summary").click();
    await p.locator("#priceColumn").selectOption("0");
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isDisabled(),
      true,
    );
    await p.locator("#priceColumn").selectOption("1");
    await p.screenshot({ path: path.join(OUT, "09-preview.png") });
    await p.locator('[data-page="products"]').click();
    await click(p, "add-product");
    await p.locator('[name="name"]').fill("手动商品");
    await p.locator('[name="price"]').fill("1.234");
    await p.getByRole("button", { name: "保存商品" }).click();
    assert.match(await p.locator(".form-error").innerText(), /两位/);
    await p.locator('[name="price"]').fill("0.20");
    await p.getByRole("button", { name: "保存商品" }).click();
    await p.locator("#productSearch").fill("手动商品");
    assert.equal(await p.locator(".product-list-row").count(), 1);
    await p.getByRole("button", { name: "编辑 手动商品" }).click();
    await p.locator('[name="name"]').fill("<img src=x onerror=alert(1)>");
    await p.getByRole("button", { name: "保存商品" }).click();
    await p.locator("#productSearch").fill("");
    assert.equal(await p.locator(".product-list img").count(), 0);
    await nav(p, "cash");
    await click(p, "edit-grid");
    await p.locator(".product-card").first().click();
    await p.locator('[name="cols"]').selectOption("2");
    await p.locator('[name="rows"]').selectOption("2");
    await p.getByRole("button", { name: "保存布局" }).click();
    assert.equal((await state(p)).products[0].colSpan, 2);
    assert.equal((await state(p)).cart.length, 0);
    await p.screenshot({ path: path.join(OUT, "10-layout.png") });
    await click(p, "edit-grid");
    await p.locator('[data-page="settings"]').click();
    download = p.waitForEvent("download");
    await click(p, "backup");
    file = await download;
    const backupPath = path.join(OUT, "backup.json");
    await file.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath));
    assert.equal(backup.products.length, 18);
    await p
      .locator('[data-action="clear-data"][data-scope="products"]')
      .click();
    await p.getByRole("button", { name: "确认清空", exact: true }).click();
    assert.equal((await state(p)).products.length, 0);
    await p.locator("#backupFile").setInputFiles(backupPath);
    await p.getByRole("button", { name: "确认恢复", exact: true }).click();
    assert.equal((await state(p)).products.length, 18);
    await p.screenshot({ path: path.join(OUT, "11-settings.png") });
    await p.locator('[data-page="cash"]').click();
    await p
      .getByRole("button", { name: "小数商品，¥0.1", exact: true })
      .click();
    const oddProduct = await p
      .locator(".product-card")
      .filter({ hasText: "<img" });
    await oddProduct.click();
    assert.match(await p.locator(".cart-bar").innerText(), /¥0.3/);
    await p.locator('.cart-bar [data-page="order"]').click();
    await p.locator('[data-page="bill"]').click();
    await p.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw Error("QuotaExceeded");
      };
    });
    await click(p, "complete");
    assert.equal(await p.locator(".bill-value").innerText(), "0.3");
    assert.equal((await state(p)).cart.length, 2);
    assert.equal((await state(p)).orders.length, 1);
    await p.reload();
    // Width stress includes the longest allowed name/price, quantity and amount.
    for (const width of [320, 390, 768]) {
      await p.setViewportSize({ width, height: 844 });
      await p.locator('[data-page="settings"]').click();
      await p.locator("#backupFile").setInputFiles(backupPath);
      await p.getByRole("button", { name: "确认恢复", exact: true }).click();
      await p.locator('[data-page="cash"]').click();
      await p
        .getByRole("button", { name: "贴纸套装，¥15", exact: true })
        .click();
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await p.screenshot({ path: path.join(OUT, `width-${width}.png`) });
      await p.reload();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: checkout, persistence, double receipt, XLSX/XLS, validation, CRUD, layout, backup, PDF, storage failure and responsive UI",
    );
    await context.close();
    // Verify old data is copied and retained, and old sales are not fabricated.
    const migration = await browser.newContext({ serviceWorkers: "block" });
    await migration.addInitScript(() => {
      localStorage.setItem(
        "counter-app-v1",
        JSON.stringify({
          products: [
            { id: "old", name: "旧版商品", price: 20, rowSpan: 2, colSpan: 2 },
          ],
          todayCounts: { old: 99 },
        }),
      );
      localStorage.setItem("counter-pro-activated", "true");
    });
    const mp = await migration.newPage();
    await mp.goto(BASE);
    await mp.locator(".product-card").waitFor();
    assert.equal((await state(mp)).products[0].price, 2000);
    assert.equal((await state(mp)).orders.length, 0);
    assert.equal(
      await mp.evaluate(() => localStorage.getItem("counter-pro-activated")),
      "true",
    );
    await migration.close();
    console.log("PASS: legacy migration");
    // Offline boot and both large dependencies must be cached before going offline.
    const offline = await browser.newContext();
    const op = await offline.newPage();
    await op.goto(BASE);
    await op.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await op.reload();
    await op.locator('[data-action="start-import"]').waitFor();
    await offline.setOffline(true);
    await op.reload();
    await op.locator('[data-action="start-import"]').waitFor();
    await importFile(op, fixture("offline.xlsx", sample));
    await nav(op, "ledger");
    download = op.waitForEvent("download");
    await click(op, "export-pdf");
    file = await download;
    await file.saveAs(path.join(OUT, "offline-empty.pdf"));
    await offline.close();
    console.log(
      "PASS: offline reload, offline Excel import, offline PDF export",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
