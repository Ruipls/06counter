const { chromium } = require("playwright");
const XLSX = require("../vendor/xlsx.full.min.js");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const OUT = "/tmp/06counter-smart-import";
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.TEST_URL || "http://127.0.0.1:4173";
const file = (name, sheets, type = "xlsx") => {
  const w = XLSX.utils.book_new();
  for (const [title, rows] of sheets)
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(rows), title);
  const f = path.join(OUT, name);
  fs.writeFileSync(f, XLSX.write(w, { bookType: type, type: "buffer" }));
  return f;
};
const action = (p, a) => p.locator(`[data-action="${a}"]`).click();
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("06counter-checkout-v3")));
async function load(p, f) {
  await action(p, "start-import");
  await p.locator("#excelFile").setInputFiles(f);
  await p.locator(".smart-preview").waitFor();
}
(async () => {
  const b = await chromium.launch({ headless: true });
  try {
    const c = await b.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      }),
      p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(BASE);
    const normal = file("产品价格.xlsx", [
      ["说明", [["导入指南"]]],
      [
        "商品表",
        [
          ["秋日市集价格表"],
          [],
          ["序号", "货品名称", "成本价", "零售价（元）"],
          [1, "贴纸套装", 5, "15元"],
          [2, "手帐本 A", 25, "￥56"],
          ["合计", "", "", 71],
          ["备注：现场价格", ""],
        ],
      ],
    ]);
    await load(p, normal);
    assert.equal(await p.locator(".smart-preview tbody tr").count(), 2);
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isEnabled(),
      true,
    );
    assert.equal(await p.locator("#nameColumn").isVisible(), false);
    await p.screenshot({ path: path.join(OUT, "auto-preview.png") });
    await action(p, "import-confirm");
    assert.equal((await state(p)).products.length, 2);
    assert.equal((await state(p)).products[1].price, 5600);
    const ambiguous = file(
      "价格选择.xls",
      [
        [
          "商品表",
          [
            ["品名", "零售价", "批发价"],
            ["贴纸", 15, 12],
            ["本子", 56, 45],
          ],
        ],
      ],
      "biff8",
    );
    await load(p, ambiguous);
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isDisabled(),
      true,
    );
    await p.getByRole("button", { name: "修改第 2 行", exact: true }).click();
    await p.locator('[name="name"]').fill("贴纸调整");
    await p.getByRole("button", { name: "保存修改", exact: true }).click();
    await p.getByRole("button", { name: "跳过第 3 行", exact: true }).click();
    await p.locator('[name="importPriceChoice"][value="2"]').check();
    assert.match(await p.locator(".smart-preview").innerText(), /贴纸调整/);
    assert.equal(await p.locator(".excluded").count(), 1);
    await p.getByRole("button", { name: "恢复第 3 行", exact: true }).click();
    assert.match(await p.locator(".smart-preview").innerText(), /¥12/);
    await p.screenshot({ path: path.join(OUT, "price-choice.png") });
    await action(p, "import-confirm");
    assert.equal((await state(p)).products.at(-1).price, 4500);
    const bad = file("修正价格.xlsx", [
      [
        "商品表",
        [
          ["品名", "售价"],
          ["正常", 15],
          ["缺价", ""],
          ["负价", -1],
          ["赠品", 0],
        ],
      ],
    ]);
    await load(p, bad);
    assert.equal(await p.locator(".invalid").count(), 2);
    await p.getByRole("button", { name: "修改第 3 行", exact: true }).click();
    await p.locator('[name="price"]').fill("25元");
    await p.getByRole("button", { name: "保存修改", exact: true }).click();
    await p.getByRole("button", { name: "跳过第 4 行", exact: true }).click();
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isEnabled(),
      true,
    );
    await p.screenshot({ path: path.join(OUT, "inline-fix.png") });
    await action(p, "import-confirm");
    assert.equal((await state(p)).products.at(-2).price, 2500);
    assert.equal((await state(p)).products.at(-1).price, 0);
    const multi = file("多张商品表.xlsx", [
      [
        "贴纸",
        [
          ["品名", "售价"],
          ["贴纸B", 20],
        ],
      ],
      [
        "本子",
        [
          ["品名", "售价"],
          ["本子B", 30],
        ],
      ],
    ]);
    await load(p, multi);
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isDisabled(),
      true,
    );
    await p.locator("#importSheet").selectOption("1");
    await action(p, "import-confirm");
    assert.equal((await state(p)).products.at(-1).name, "本子B");
    const nohead = file("无表头.xlsx", [
      [
        "产品",
        Array.from({ length: 60 }, (_, i) => [
          i + 1,
          "手帐",
          "单品" + i,
          15 + i,
        ]),
      ],
    ]);
    await load(p, nohead);
    assert.equal(await p.locator(".smart-preview tbody tr").count(), 50);
    await action(p, "import-next");
    assert.equal(await p.locator(".smart-preview tbody tr").count(), 10);
    await action(p, "import-confirm");
    assert.equal((await state(p)).products.length, 68);
    // Manual fallback validates same-column mapping, then permits correction without reupload.
    await load(p, normal);
    await p.locator(".import-advanced summary").click();
    await p.locator("#priceColumn").selectOption("1");
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isDisabled(),
      true,
    );
    await p.locator("#priceColumn").selectOption("3");
    assert.equal(
      await p.locator('[data-action="import-confirm"]').isEnabled(),
      true,
    );
    await p.setViewportSize({ width: 320, height: 700 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p.screenshot({ path: path.join(OUT, "narrow.png") });
    assert.deepEqual(errors, []);
    await c.close();
    const oc = await b.newContext(),
      op = await oc.newPage();
    await op.goto(BASE);
    await op.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await op.reload();
    await oc.setOffline(true);
    await op.reload();
    await load(op, normal);
    await action(op, "import-confirm");
    assert.equal((await state(op)).products.length, 2);
    await oc.close();
    console.log(
      "PASS smart import: automatic regions, XLSX/XLS, price ambiguity, inline edits, skipped errors, multi-sheet, 60 rows, manual fallback, 320px and offline",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
